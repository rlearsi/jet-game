import { getTerrainHeight } from './world.js?v=26';

export class FighterCockpit {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;

    this.grainPattern = this.createGrainPattern();
    this.radarCanvas = document.createElement('canvas');
    this.radarCanvas.width = 56;
    this.radarCanvas.height = 56;
    this.radarCtx = this.radarCanvas.getContext('2d');
    this.radarTimer = 0;
    this.sweepAngle = 0;
    this.blinkTimer = 0;
  }

  createGrainPattern() {
    const p = document.createElement('canvas');
    p.width = 48;
    p.height = 48;
    const c = p.getContext('2d');
    c.fillStyle = '#254046';
    c.fillRect(0, 0, 48, 48);
    // Textured stipple grain matching the matte teal instrument panels in screenshots 1, 3, 4
    let seed = 1337;
    const nextRand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 48; x++) {
        const r = nextRand();
        if (r < 0.14) {
          c.fillStyle = '#1b3136';
          c.fillRect(x, y, 1, 1);
        } else if (r > 0.86) {
          c.fillStyle = '#345860';
          c.fillRect(x, y, 1, 1);
        }
      }
    }
    return this.ctx.createPattern(p, 'repeat');
  }

  setVisible(visible) {
    this.canvas.classList.toggle('active', visible);
  }

  updateRadar(jet, remoteJets = null, pickups = null, weapons = null, ships = null) {
    const rc = this.radarCtx;
    const size = 56;
    const half = size / 2;
    const r = 26;

    rc.clearRect(0, 0, size, size);
    rc.save();
    rc.beginPath();
    rc.arc(half, half, r, 0, Math.PI * 2);
    rc.clip();

    // Deep dark amber-brown radar sea background
    rc.fillStyle = '#231308';
    rc.fillRect(0, 0, size, size);

    // Sample terrain height grid rotated by jet heading (north-up relative to nose = track-up!)
    const cosY = Math.cos(jet.yaw);
    const sinY = Math.sin(jet.yaw);
    const step = 2;
    const rangeScale = 18.0; // world units per radar pixel (wide archipelago sweep)

    for (let py = 2; py < size - 2; py += step) {
      for (let px = 2; px < size - 2; px += step) {
        const dx = px - half;
        const dy = py - half;
        if (dx * dx + dy * dy > r * r) continue;

        // Forward on screen is -dy; right is +dx
        const localRight = dx * rangeScale;
        const localFwd = -dy * rangeScale;
        const wx = jet.position.x + localRight * cosY - localFwd * sinY;
        const wz = jet.position.z - localRight * sinY - localFwd * cosY;

        const h = getTerrainHeight(wx, wz);
        if (h > 0.2) {
          if (h > 85) rc.fillStyle = '#f0a63e';
          else if (h > 36) rc.fillStyle = '#c87324';
          else if (h > 10) rc.fillStyle = '#8f4b18';
          else rc.fillStyle = '#5c3012';
          rc.fillRect(px, py, step, step);
        }
      }
    }

    // Subtle radar scan cone wedge pointing forward (matches amber glowing wedge in screenshots 1, 3, 4!)
    const coneAngle = -Math.PI / 2 + Math.sin(this.sweepAngle) * 0.55;
    rc.fillStyle = 'rgba(240, 152, 54, 0.16)';
    rc.beginPath();
    rc.moveTo(half, half);
    rc.arc(half, half, r, coneAngle - 0.55, coneAngle + 0.55);
    rc.closePath();
    rc.fill();

    // Fine range rings & sweep line
    rc.strokeStyle = 'rgba(245, 165, 66, 0.28)';
    rc.lineWidth = 1;
    rc.beginPath();
    rc.arc(half, half, 13, 0, Math.PI * 2);
    rc.stroke();

    rc.strokeStyle = 'rgba(255, 198, 96, 0.65)';
    rc.beginPath();
    rc.moveTo(half, half);
    rc.lineTo(half + Math.cos(coneAngle) * r, half + Math.sin(coneAngle) * r);
    rc.stroke();

    // Naval ships on radar (subtle orange dots for 20-ship objective)
    if (ships) {
      rc.fillStyle = '#ff9652';
      for (const sh of ships) {
        if (!sh.alive) continue;
        const dwx = sh.x - jet.position.x;
        const dwz = sh.z - jet.position.z;
        const localRight = dwx * cosY - dwz * sinY;
        const localFwd = -dwx * sinY - dwz * cosY;
        const px = localRight / rangeScale;
        const py = -localFwd / rangeScale;
        if (px * px + py * py <= (r - 2) * (r - 2)) {
          rc.fillRect(Math.round(half + px) - 1, Math.round(half + py) - 1, 2, 2);
        }
      }
    }

    // World dropped pickups on radar (pink '+' for full-heal medkit, amber square for missile crates)
    if (pickups) {
      for (const pk of pickups) {
        if (!pk.active) continue;
        const dwx = pk.x - jet.position.x;
        const dwz = pk.z - jet.position.z;
        const localRight = dwx * cosY - dwz * sinY;
        const localFwd = -dwx * sinY - dwz * cosY;
        const px = localRight / rangeScale;
        const py = -localFwd / rangeScale;
        if (px * px + py * py <= (r - 2) * (r - 2)) {
          const bx = Math.round(half + px);
          const by = Math.round(half + py);
          if (pk.type === 'health') {
            rc.fillStyle = '#ff5ca8';
            rc.fillRect(bx - 1, by, 3, 1);
            rc.fillRect(bx, by - 1, 1, 3);
          } else {
            rc.fillStyle = '#ffba42';
            rc.fillRect(bx - 1, by - 1, 2, 2);
          }
        }
      }
    }

    // Remote multiplayer pilot blips on radar
    if (remoteJets) {
      for (const rj of remoteJets.values()) {
        if (!rj.alive) continue;
        const dwx = rj.position.x - jet.position.x;
        const dwz = rj.position.z - jet.position.z;
        const localRight = dwx * cosY - dwz * sinY;
        const localFwd = -dwx * sinY - dwz * cosY;
        const px = localRight / rangeScale;
        const py = -localFwd / rangeScale;
        if (px * px + py * py <= (r - 2) * (r - 2)) {
          const bx = Math.round(half + px);
          const by = Math.round(half + py);
          rc.fillStyle = '#0e0a06';
          rc.fillRect(bx - 2, by - 2, 5, 5);
          rc.fillStyle = rj.colorHex || '#36d6ff';
          rc.fillRect(bx - 1, by - 1, 3, 3);
        }
      }
    }

    // Incoming homing missile blip (blinking red!)
    if (weapons?.incomingMissile && Math.floor(this.blinkTimer * 10) % 2 === 0) {
      const mPos = weapons.incomingMissile.pos;
      const dwx = mPos.x - jet.position.x;
      const dwz = mPos.z - jet.position.z;
      const localRight = dwx * cosY - dwz * sinY;
      const localFwd = -dwx * sinY - dwz * cosY;
      const px = localRight / rangeScale;
      const py = -localFwd / rangeScale;
      if (px * px + py * py <= (r - 2) * (r - 2)) {
        const bx = Math.round(half + px);
        const by = Math.round(half + py);
        rc.fillStyle = '#ff3828';
        rc.fillRect(bx - 2, by - 2, 4, 4);
      }
    }

    // Crisp white center '+' aircraft symbol
    rc.fillStyle = '#ffffff';
    rc.fillRect(half - 2, half, 5, 1);
    rc.fillRect(half, half - 2, 1, 5);

    rc.restore();
  }

  drawBezel(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#10151d';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.strokeStyle = '#586e78';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#12151e';
    ctx.fill();
  }

  drawPanelPlate(ctx, x, y, w, h) {
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(x, y, w, h);

    // Beveled rim
    ctx.strokeStyle = '#4c6d75';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h - 0.5);
    ctx.lineTo(x + 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + 0.5);
    ctx.stroke();

    ctx.strokeStyle = '#112024';
    ctx.beginPath();
    ctx.moveTo(x + w - 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + h - 0.5);
    ctx.lineTo(x + 0.5, y + h - 0.5);
    ctx.stroke();

    // 4 corner screws/rivets
    const rivets = [
      [x + 3, y + 3],
      [x + w - 4, y + 3],
      [x + 3, y + h - 4],
      [x + w - 4, y + h - 4],
    ];
    for (const [rx, ry] of rivets) {
      ctx.fillStyle = '#142429';
      ctx.fillRect(rx, ry, 2, 2);
      ctx.fillStyle = '#6c8b94';
      ctx.fillRect(rx, ry, 1, 1);
    }
  }

  render(dt, jet, weapons, remoteJets = null, pickups = null, ships = null) {
    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    const cx = Math.floor(w / 2);

    ctx.clearRect(0, 0, w, h);

    this.sweepAngle += dt * 1.4;
    this.blinkTimer += dt;
    this.radarTimer += dt;
    if (this.radarTimer >= 0.08) {
      this.radarTimer = 0;
      this.updateRadar(jet, remoteJets, pickups, weapons, ships);
    }

    // Subtle cockpit inertia sway on high-G turns & afterburner vibration
    const vib = jet.afterburner ? (Math.random() - 0.5) * 0.9 : 0;
    const swayX = Math.round(-jet.bank * 3.0 + vib);
    const swayY = Math.round(jet.pitch * 3.5 + vib);

    // =========================================================================
    // 1. WINDSHIELD GLARE & CANOPY ARCH FRAME (matches screenshots 1, 3, 4!)
    // =========================================================================
    // Subtle diagonal glass reflection streak on left canopy glass during turns
    ctx.save();
    ctx.fillStyle = 'rgba(255, 240, 224, 0.07)';
    ctx.beginPath();
    ctx.moveTo(28, 12);
    ctx.lineTo(54, 12);
    ctx.lineTo(14, h - 92);
    ctx.lineTo(-4, h - 92);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Curved top canopy bow
    ctx.fillStyle = '#1f2533';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(w, 0);
    ctx.lineTo(w, 22);
    ctx.quadraticCurveTo(cx, 2, 0, 22);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#3c475c';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.quadraticCurveTo(cx, 2, w, 22);
    ctx.stroke();

    // Left & right slanted canopy struts
    ctx.fillStyle = '#1f2533';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(7, 14);
    ctx.lineTo(25, h - 95);
    ctx.lineTo(0, h - 95);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(w, 14);
    ctx.lineTo(w - 7, 14);
    ctx.lineTo(w - 25, h - 95);
    ctx.lineTo(w, h - 95);
    ctx.closePath();
    ctx.fill();

    // Inner strut specular rim
    ctx.strokeStyle = '#445066';
    ctx.beginPath();
    ctx.moveTo(7, 15);
    ctx.lineTo(25, h - 95);
    ctx.moveTo(w - 7, 15);
    ctx.lineTo(w - 25, h - 95);
    ctx.stroke();

    // =========================================================================
    // 2. HOLOGRAPHIC GREEN HUD COMBINER GLASS (center windshield)
    // =========================================================================
    const hudW = 96;
    const hudLeft = cx - Math.floor(hudW / 2);
    const hudRight = cx + Math.floor(hudW / 2);
    const hudTop = 50;
    const hudBot = h - 108;
    const hudMidY = Math.floor((hudTop + hudBot) / 2);

    // Subtle green-tinted glass sheen
    ctx.fillStyle = 'rgba(130, 255, 175, 0.045)';
    ctx.fillRect(hudLeft, hudTop, hudW, hudBot - hudTop);

    // Vertical dark metal combiner posts (signature look in screenshots 1, 3, 4!)
    ctx.fillStyle = '#1a202c';
    ctx.fillRect(hudLeft - 1, hudTop, 2, hudBot - hudTop + 4);
    ctx.fillRect(hudRight - 1, hudTop, 2, hudBot - hudTop + 4);

    // Clip holographic elements inside HUD combiner glass
    ctx.save();
    ctx.beginPath();
    ctx.rect(hudLeft + 1, hudTop, hudW - 2, hudBot - hudTop);
    ctx.clip();

    const hudGreen = '#88ffa8';
    ctx.strokeStyle = hudGreen;
    ctx.fillStyle = hudGreen;
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';

    // Top Heading Tape (03, 06, E, 12...)
    const headingDeg = (((-jet.yaw * 180) / Math.PI) % 360 + 360) % 360;
    const pxPerDeg = 1.1;
    for (let d = -60; d <= 60; d += 30) {
      const snapped = Math.round(headingDeg / 30) * 30 + d;
      const offsetPx = (snapped - headingDeg) * pxPerDeg;
      const hx = Math.round(cx + offsetPx);
      const normDeg = ((snapped % 360) + 360) % 360;
      let label = String(Math.round(normDeg / 10)).padStart(2, '0');
      if (normDeg === 0) label = 'N';
      else if (normDeg === 90) label = 'E';
      else if (normDeg === 180) label = 'S';
      else if (normDeg === 270) label = 'W';
      ctx.fillText(label, hx, hudTop + 9);
      ctx.fillRect(hx, hudTop + 11, 1, 3);
    }
    // Center caret
    ctx.fillRect(cx - 2, hudTop + 15, 5, 1);
    ctx.fillRect(cx, hudTop + 14, 1, 2);

    // Rotating Pitch Ladder & Artificial Horizon line
    ctx.save();
    ctx.translate(cx, hudMidY);
    ctx.rotate(-jet.bank * 0.95);
    const pitchShift = jet.pitch * 95;
    ctx.strokeStyle = 'rgba(136, 255, 168, 0.72)';
    ctx.lineWidth = 1;
    // Main horizon line with center gap
    ctx.beginPath();
    ctx.moveTo(-36, pitchShift);
    ctx.lineTo(-10, pitchShift);
    ctx.moveTo(10, pitchShift);
    ctx.lineTo(36, pitchShift);
    ctx.stroke();

    // Pitch rungs above & below horizon
    for (const rung of [-22, 22]) {
      const ry = pitchShift + rung;
      ctx.beginPath();
      ctx.moveTo(-20, ry);
      ctx.lineTo(-10, ry);
      ctx.moveTo(10, ry);
      ctx.lineTo(20, ry);
      ctx.stroke();
    }
    ctx.restore();

    // Center Flight Path Marker (-o-)
    ctx.strokeStyle = hudGreen;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, hudMidY, 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 9, hudMidY);
    ctx.lineTo(cx - 3, hudMidY);
    ctx.moveTo(cx + 3, hudMidY);
    ctx.lineTo(cx + 9, hudMidY);
    ctx.moveTo(cx, hudMidY - 3);
    ctx.lineTo(cx, hudMidY - 6);
    ctx.stroke();

    // Left SPD Box (e.g. 580, 593, 603)
    const knots = Math.round(jet.speed * 9.6);
    const altFt = Math.max(0, Math.round(jet.position.y * 3.6));
    const radarFt = Math.max(0, Math.round(jet.radarAlt * 3.6));

    ctx.textAlign = 'left';
    ctx.fillStyle = hudGreen;
    ctx.fillText('SPD', hudLeft + 5, hudMidY - 3);
    ctx.strokeRect(hudLeft + 4.5, hudMidY - 0.5, 22, 10);
    ctx.textAlign = 'center';
    ctx.fillText(String(knots), hudLeft + 15, hudMidY + 7);

    // Right ALT Box (e.g. 270, 250)
    ctx.textAlign = 'right';
    ctx.fillText('ALT', hudRight - 5, hudMidY - 3);
    ctx.strokeRect(hudRight - 26.5, hudMidY - 0.5, 22, 10);
    ctx.textAlign = 'center';
    ctx.fillText(String(altFt), hudRight - 15, hudMidY + 7);

    // Priority HUD callout: "! MISSILE !" > "FOX 2" > "GUN" > "PULL UP"
    if (weapons.incomingMissile) {
      if (Math.floor(this.blinkTimer * 10) % 2 === 0) {
        ctx.fillStyle = '#ff4232';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('! MISSILE !', cx, hudMidY + 26);
      }
    } else if (weapons.fox2Timer > 0) {
      ctx.fillStyle = '#ffe56b';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FOX 2', cx, hudMidY + 26);
    } else if (weapons.muzzleTimer > 0) {
      ctx.fillStyle = '#ffd966';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GUN', cx, hudMidY + 26);
    } else if (jet.lowAltWarning && Math.floor(this.blinkTimer * 6) % 2 === 0) {
      ctx.fillStyle = '#ff6b52';
      ctx.font = 'bold 7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PULL UP', cx, hudMidY + 26);
    }

    // Subtle warm muzzle flash glow along bottom corners when firing autocannon
    if (weapons.muzzleTimer > 0) {
      ctx.fillStyle = 'rgba(255, 224, 120, 0.14)';
      ctx.fillRect(hudLeft + 1, hudBot - 16, hudW - 2, 16);
    }

    // Bottom HUD telemetry row: HP | MSL | R (radar altitude)
    ctx.fillStyle = jet.hp <= 35 ? '#ff5a44' : hudGreen;
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`HP ${Math.round(jet.hp)}`, hudLeft + 4, hudBot - 4);
    ctx.fillStyle = weapons.ammo === 0 && Math.floor(this.blinkTimer * 5) % 2 === 0 ? '#ff5a44' : hudGreen;
    ctx.textAlign = 'center';
    ctx.fillText(`MSL ${weapons.ammo}`, cx, hudBot - 4);
    ctx.fillStyle = hudGreen;
    ctx.textAlign = 'right';
    ctx.fillText(`R ${radarFt}`, hudRight - 4, hudBot - 4);

    ctx.restore();

    // =========================================================================
    // 3. INSTRUMENT DASHBOARD & GLARE SHIELD (matte textured teal + 3 riveted plates)
    // =========================================================================
    ctx.save();
    ctx.translate(swayX, swayY);

    const dashTop = h - 98;
    const humpTop = dashTop - 13;

    // Dark matte glare shield hood rising cleanly beneath the HUD glass
    ctx.fillStyle = '#181e28';
    ctx.beginPath();
    ctx.moveTo(-12, h + 12);
    ctx.lineTo(-12, dashTop + 4);
    ctx.lineTo(cx - 72, dashTop);
    ctx.lineTo(cx - 52, humpTop);
    ctx.lineTo(cx + 52, humpTop);
    ctx.lineTo(cx + 72, dashTop);
    ctx.lineTo(w + 12, dashTop + 4);
    ctx.lineTo(w + 12, h + 12);
    ctx.closePath();
    ctx.fill();

    // Glare shield highlight rim
    ctx.strokeStyle = '#384654';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-12, dashTop + 4);
    ctx.lineTo(cx - 72, dashTop);
    ctx.lineTo(cx - 52, humpTop);
    ctx.lineTo(cx + 52, humpTop);
    ctx.lineTo(cx + 72, dashTop);
    ctx.lineTo(w + 12, dashTop + 4);
    ctx.stroke();

    // Base dark teal cockpit console bulk
    ctx.fillStyle = '#1d3238';
    ctx.beginPath();
    ctx.moveTo(-12, h + 12);
    ctx.lineTo(-12, dashTop + 10);
    ctx.lineTo(cx - 68, dashTop + 6);
    ctx.lineTo(cx - 50, humpTop + 6);
    ctx.lineTo(cx + 50, humpTop + 6);
    ctx.lineTo(cx + 68, dashTop + 6);
    ctx.lineTo(w + 12, dashTop + 10);
    ctx.lineTo(w + 12, h + 12);
    ctx.closePath();
    ctx.fill();

    // Three modular instrument plates matching screenshots 1, 3, 4
    const centerW = 136;
    const centerX = cx - Math.floor(centerW / 2);
    const plateY = dashTop + 10;
    const plateH = h - plateY + 4;

    const leftW = 70;
    const leftX = centerX - leftW - 6;

    const rightW = 70;
    const rightX = centerX + centerW + 6;

    this.drawPanelPlate(ctx, leftX, plateY + 4, leftW, plateH);
    this.drawPanelPlate(ctx, centerX, plateY, centerW, plateH + 4);
    this.drawPanelPlate(ctx, rightX, plateY + 4, rightW, plateH);

    // -------------------------------------------------------------------------
    // LEFT PLATE: Circular Amber Terrain Radar + Digital Radar-Alt Readout
    // -------------------------------------------------------------------------
    const radCx = leftX + Math.floor(leftW / 2);
    const radCy = plateY + 37;
    this.drawBezel(ctx, radCx, radCy, 26);
    ctx.drawImage(this.radarCanvas, radCx - 28, radCy - 28);

    // Knobs & orange digital readout below radar (e.g. 0270)
    const digY = radCy + 34;
    ctx.fillStyle = '#4c5c70';
    ctx.beginPath();
    ctx.arc(radCx - 20, digY + 4, 3.5, 0, Math.PI * 2);
    ctx.arc(radCx + 20, digY + 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#111820';
    ctx.stroke();

    ctx.fillStyle = '#121216';
    ctx.fillRect(radCx - 12, digY, 24, 9);
    ctx.fillStyle = '#f59836';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(radarFt).padStart(4, '0'), radCx, digY + 7);

    // -------------------------------------------------------------------------
    // CENTER PLATE: 6 Classic Flight Gauges (exact 3x2 arrangement!)
    // -------------------------------------------------------------------------
    const row1Y = plateY + 26;
    const row2Y = plateY + 67;
    const col1X = centerX + 24;
    const col2X = cx;
    const col3X = centerX + centerW - 24;

    // 1. TOP-LEFT: Airspeed / Mach Dial (0 - 4 - 8 - 12)
    this.drawBezel(ctx, col1X, row1Y, 17);
    // Colored arc
    ctx.strokeStyle = '#4ad470';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(col1X, row1Y, 14, -Math.PI * 0.85, Math.PI * 0.15);
    ctx.stroke();
    ctx.strokeStyle = '#e89832';
    ctx.beginPath();
    ctx.arc(col1X, row1Y, 14, Math.PI * 0.15, Math.PI * 0.45);
    ctx.stroke();

    // Ticks & labels
    ctx.fillStyle = '#e6e8ec';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('4', col1X - 6, row1Y - 4);
    ctx.fillText('8', col1X + 6, row1Y - 4);
    ctx.fillText('0', col1X - 6, row1Y + 9);
    ctx.fillText('12', col1X + 6, row1Y + 9);
    const spdNorm = Math.min(1, knots / 1000);
    const spdAng = Math.PI * 0.72 + spdNorm * Math.PI * 1.55;
    ctx.strokeStyle = '#ff9836';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(col1X, row1Y);
    ctx.lineTo(col1X + Math.cos(spdAng) * 13, row1Y + Math.sin(spdAng) * 13);
    ctx.stroke();

    // 2. TOP-CENTER: Large Artificial Horizon (Sky Blue + Earth Brown sphere!)
    const ahR = 20;
    this.drawBezel(ctx, col2X, row1Y, ahR);
    ctx.save();
    ctx.beginPath();
    ctx.arc(col2X, row1Y, ahR - 1, 0, Math.PI * 2);
    ctx.clip();

    ctx.translate(col2X, row1Y);
    ctx.rotate(-jet.bank);
    const ahPitchPx = jet.pitch * 26;
    // Bright sky blue top
    ctx.fillStyle = '#4496e8';
    ctx.fillRect(-30, -35 + ahPitchPx, 60, 35);
    // Warm earth brown bottom
    ctx.fillStyle = '#9e6032';
    ctx.fillRect(-30, ahPitchPx, 60, 35);
    // Crisp white horizon & pitch bars
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-30, ahPitchPx - 0.5, 60, 1.5);
    ctx.fillRect(-8, ahPitchPx - 7, 16, 1);
    ctx.fillRect(-5, ahPitchPx - 13, 10, 1);
    ctx.fillRect(-8, ahPitchPx + 7, 16, 1);
    ctx.restore();

    // Bank angle tick marks on outer top bezel
    ctx.strokeStyle = '#dce4ec';
    ctx.lineWidth = 1;
    for (let a = -60; a <= 60; a += 30) {
      const rad = ((a - 90) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(col2X + Math.cos(rad) * (ahR - 3), row1Y + Math.sin(rad) * (ahR - 3));
      ctx.lineTo(col2X + Math.cos(rad) * ahR, row1Y + Math.sin(rad) * ahR);
      ctx.stroke();
    }
    // Fixed yellow center aircraft reference wings
    ctx.fillStyle = '#ffd644';
    ctx.fillRect(col2X - 9, row1Y - 1, 6, 2);
    ctx.fillRect(col2X + 3, row1Y - 1, 6, 2);
    ctx.fillRect(col2X - 1, row1Y - 1, 2, 2);

    // 3. TOP-RIGHT: Altimeter Dial (0..9 + orange digital window!)
    this.drawBezel(ctx, col3X, row1Y, 17);
    ctx.strokeStyle = '#cfd6de';
    ctx.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(col3X + Math.cos(a) * 12, row1Y + Math.sin(a) * 12);
      ctx.lineTo(col3X + Math.cos(a) * 15.5, row1Y + Math.sin(a) * 15.5);
      ctx.stroke();
    }
    // Orange digital alt readout window
    ctx.fillStyle = '#0d0e12';
    ctx.fillRect(col3X - 10, row1Y + 2, 20, 8);
    ctx.fillStyle = '#f59836';
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(altFt).padStart(4, '0'), col3X, row1Y + 8);
    // Altimeter needles
    const altAng = ((altFt % 1000) / 1000) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(col3X, row1Y);
    ctx.lineTo(col3X + Math.cos(altAng) * 13, row1Y + Math.sin(altAng) * 13);
    ctx.stroke();

    // 4. BOTTOM-LEFT: Turn Coordinator
    this.drawBezel(ctx, col1X + 4, row2Y, 13);
    ctx.save();
    ctx.translate(col1X + 4, row2Y);
    ctx.rotate(-jet.bank * 0.65);
    ctx.strokeStyle = '#e8eef5';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(9, 0);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -4);
    ctx.stroke();
    ctx.restore();
    // Slip indicator bar at bottom
    ctx.fillStyle = '#7c8899';
    ctx.fillRect(col1X, row2Y + 7, 8, 2);

    // 5. BOTTOM-CENTER: Compass / HSI (N E S W rotating!)
    this.drawBezel(ctx, col2X, row2Y, 15);
    const compDirs = [
      { l: 'N', deg: 0, col: '#ff5244' },
      { l: 'E', deg: 90, col: '#e6eaef' },
      { l: 'S', deg: 180, col: '#e6eaef' },
      { l: 'W', deg: 270, col: '#e6eaef' },
    ];
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    for (const d of compDirs) {
      const a = ((d.deg - headingDeg - 90) * Math.PI) / 180;
      const lx = col2X + Math.cos(a) * 10;
      const ly = row2Y + Math.sin(a) * 10 + 2;
      ctx.fillStyle = d.col;
      ctx.fillText(d.l, lx, ly);
    }
    // Center yellow airplane glyph
    ctx.fillStyle = '#ffd644';
    ctx.fillRect(col2X - 4, row2Y, 9, 1);
    ctx.fillRect(col2X, row2Y - 4, 1, 8);
    ctx.fillRect(col2X - 2, row2Y + 3, 5, 1);

    // 6. BOTTOM-RIGHT: VSI (Vertical Speed Indicator)
    this.drawBezel(ctx, col3X - 4, row2Y, 13);
    ctx.strokeStyle = '#48c868';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(col3X - 4, row2Y, 10, -Math.PI * 0.7, -Math.PI * 0.15);
    ctx.stroke();
    ctx.strokeStyle = '#e8a238';
    ctx.beginPath();
    ctx.arc(col3X - 4, row2Y, 10, Math.PI * 0.15, Math.PI * 0.7);
    ctx.stroke();
    const vsiNorm = Math.max(-1, Math.min(1, jet.vsi / 38));
    const vsiAng = Math.PI + vsiNorm * 1.45;
    ctx.strokeStyle = '#ff7238';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(col3X - 4, row2Y);
    ctx.lineTo(col3X - 4 + Math.cos(vsiAng) * 10, row2Y + Math.sin(vsiAng) * 10);
    ctx.stroke();

    // -------------------------------------------------------------------------
    // RIGHT PLATE: 2 Engine Gauges, Cream Pressure Dial, 3 LEDs & Throttle Lever
    // -------------------------------------------------------------------------
    const rGauge1X = rightX + 19;
    const rGauge2X = rightX + 49;
    const rTopY = plateY + 23;

    // Engine Gauge 1 (EGT)
    this.drawBezel(ctx, rGauge1X, rTopY, 11);
    const egtAng = -Math.PI * 0.75 + jet.throttle * Math.PI * 1.35;
    ctx.strokeStyle = '#ff6b38';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rGauge1X, rTopY);
    ctx.lineTo(rGauge1X + Math.cos(egtAng) * 8.5, rTopY + Math.sin(egtAng) * 8.5);
    ctx.stroke();

    // Engine Gauge 2 (Thrust / Fuel)
    this.drawBezel(ctx, rGauge2X, rTopY, 11);
    ctx.strokeStyle = '#e8a836';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(rGauge2X, rTopY, 8.5, -Math.PI * 0.3, Math.PI * 0.35);
    ctx.stroke();
    const thrAng = -Math.PI * 0.8 + (jet.afterburner ? 0.96 : 0.62) * Math.PI * 1.35;
    ctx.strokeStyle = '#ff9836';
    ctx.beginPath();
    ctx.moveTo(rGauge2X, rTopY);
    ctx.lineTo(rGauge2X + Math.cos(thrAng) * 8.5, rTopY + Math.sin(thrAng) * 8.5);
    ctx.stroke();

    // Iconic Cream/White Dial below left (screenshots 1, 3, 4!)
    const creamY = plateY + 51;
    this.drawBezel(ctx, rGauge1X, creamY, 9);
    ctx.beginPath();
    ctx.arc(rGauge1X, creamY, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ece6cf';
    ctx.fill();
    ctx.strokeStyle = '#242830';
    ctx.lineWidth = 1;
    const clkAng = this.blinkTimer * 0.6 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(rGauge1X, creamY);
    ctx.lineTo(rGauge1X + Math.cos(clkAng) * 6, creamY + Math.sin(clkAng) * 6);
    ctx.stroke();

    // 3 Status Indicator Lights (Green, Amber, Red)
    const ledY = plateY + 71;
    const leds = [
      { x: rightX + 25, on: true, onCol: '#69f584', offCol: '#1f3d28' },
      { x: rightX + 34, on: jet.afterburner, onCol: '#ffb842', offCol: '#45321e' },
      { x: rightX + 43, on: Boolean(weapons.incomingMissile) || jet.lowAltWarning || weapons.ammo === 0, onCol: '#ff4838', offCol: '#421d1f' },
    ];
    for (const l of leds) {
      ctx.beginPath();
      ctx.arc(l.x, ledY, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#10151c';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(l.x, ledY, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = l.on ? l.onCol : l.offCol;
      ctx.fill();
    }

    // Vertical Throttle Lever Slider with Red-Orange Knob (right side!)
    const slotX = rightX + 51;
    const slotTop = plateY + 50;
    const slotH = 34;
    ctx.fillStyle = '#10151d';
    ctx.fillRect(slotX, slotTop, 6, slotH);
    ctx.strokeStyle = '#4d6770';
    ctx.strokeRect(slotX - 0.5, slotTop - 0.5, 7, slotH + 1);

    // Knob moves smoothly up for afterburner
    const knobY = Math.round(slotTop + (1.0 - jet.throttle) * (slotH - 8) + 2);
    ctx.fillStyle = '#e8482e';
    ctx.fillRect(slotX - 2, knobY, 10, 5);
    ctx.fillStyle = '#ff966b';
    ctx.fillRect(slotX - 2, knobY, 10, 1);

    ctx.restore();
  }
}
