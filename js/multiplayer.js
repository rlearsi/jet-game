import { MqttRelayClient, RELAY_BROKERS } from './relay.js?v=36';

export const PILOT_COLORS = [
  '#e55238',
  '#36d6ff',
  '#7cff6b',
  '#ff5cc8',
  '#ffd84a',
  '#a87dff',
  '#ff8c42',
  '#52f2c8',
];

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const RTC_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
};

let cachedTurnServers = null;
let cachedTurnFetchedAt = 0;

async function getRtcConfig() {
  let extraServers = [];
  try {
    const raw = (localStorage.getItem('sunsetStriker_turnUrl') || '').trim();
    if (raw) {
      if (raw.startsWith('[')) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) extraServers = parsed;
      } else if (raw.startsWith('http://') || raw.startsWith('https://')) {
        const now = Date.now();
        if (cachedTurnServers && now - cachedTurnFetchedAt < 300000) {
          extraServers = cachedTurnServers;
        } else {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 3500);
          try {
            const res = await fetch(raw, { cache: 'no-store', signal: ctrl.signal });
            clearTimeout(t);
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                extraServers = data;
                cachedTurnServers = data;
                cachedTurnFetchedAt = now;
              }
            }
          } catch (_) {
            clearTimeout(t);
          }
        }
      }
    }
  } catch (_) { }

  if (!extraServers.length) return RTC_CONFIG;
  return {
    iceServers: [...ICE_SERVERS, ...extraServers],
    iceCandidatePoolSize: 10,
  };
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateRoomCode(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

function makePeerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function relayTopicC2H(code) {
  return `ssjet/r1/${code}/c2h`;
}

function relayTopicH2C(code) {
  return `ssjet/r1/${code}/h2c`;
}

function relayTopicTo(code, peerId) {
  return `ssjet/r1/${code}/to/${peerId}`;
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

let peerJsLoadingPromise = null;
function loadPeerJS() {
  if (typeof window !== 'undefined' && window.Peer) {
    return Promise.resolve(window.Peer);
  }
  if (peerJsLoadingPromise) return peerJsLoadingPromise;
  peerJsLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Peer) resolve(window.Peer);
      else reject(new Error('PeerJS failed to initialize'));
    };
    script.onerror = () => reject(new Error('Could not load PeerJS library'));
    document.head.appendChild(script);
  });
  return peerJsLoadingPromise;
}

function sanitizeTerrainConfig(cfg) {
  const validThemes = ['sunset', 'tropical', 'volcanic', 'alpine'];
  const validDeform = ['normal', 'deep', 'off'];
  const validClouds = ['full', 'light', 'clear'];
  const src = cfg && typeof cfg === 'object' ? cfg : {};
  const cleanSeed = String(src.seed ?? 'SUNSET-2026')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 16) || 'SUNSET-2026';
  return {
    theme: validThemes.includes(src.theme) ? src.theme : 'sunset',
    deformMode: validDeform.includes(src.deformMode) ? src.deformMode : 'normal',
    clouds: validClouds.includes(src.clouds) ? src.clouds : 'full',
    seed: cleanSeed,
  };
}

export class MultiplayerManager {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.localId = makePeerId();
    this.localName = 'ACE-1';
    this.localColor = PILOT_COLORS[0];
    this.localShip = 'striker';

    this.role = null; // 'host' | 'guest' | null
    this.transport = null; // 'php' | 'peerjs' | null
    this.roomCode = '';
    this.status = 'OFFLINE'; // 'OFFLINE' | 'CONNECTING' | 'HOSTING' | 'CONNECTED'

    // Active peer sessions keyed by peerId
    this.peers = new Map();
    // Roster entries keyed by id -> { id, name, color, isHost, ping, colorIndex }
    this.roster = new Map();

    this.hostTerrainConfig = null;
    this.deformHistory = [];
    this.damageHistory = [];

    this.pollTimer = null;
    this.pingTimer = null;
    this.lastStateSentAt = 0;
    this.peerJsInstance = null;

    this.relayClient = null;
    this.relayActive = false;
    this.hostLastSeenAt = 0;
    this.relayBrokerIndex = 0;
    this._relayJoinPending = null;

    this._onBeforeUnload = () => this.leaveRoom(true);
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this._onBeforeUnload);
    }
  }

  setStatus(status, message = '') {
    this.status = status;
    this.cb.onStatusChange?.({
      status,
      role: this.role,
      transport: this.transport,
      relayActive: this.relayActive,
      roomCode: this.roomCode,
      message,
    });
  }

  emitRoster() {
    this.cb.onRosterChange?.(Array.from(this.roster.values()));
  }

  async detectTransport(pref = 'auto') {
    if (pref === 'relay') return 'relay';
    if (pref === 'local') return 'php';
    if (pref === 'cloud') return 'peerjs';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch('signal.php?action=ping', {
        cache: 'no-store',
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) return 'php';
      }
    } catch (_) {
      clearTimeout(timer);
    }
    return 'peerjs';
  }

  async createRoom({ name = 'HOST', transportPref = 'auto', ship = 'striker', terrainConfig = null } = {}) {
    this.leaveRoom();
    this.localName = (name || 'HOST').trim().slice(0, 12) || 'HOST';
    this.localShip = ship || 'striker';
    this.localId = makePeerId();
    this.localColor = PILOT_COLORS[0];
    this.role = 'host';
    this.hostTerrainConfig = sanitizeTerrainConfig(terrainConfig);
    this.deformHistory = [];
    this.damageHistory = [];

    this.setStatus('CONNECTING', 'Detecting P2P transport...');
    this.transport = await this.detectTransport(transportPref);

    this.roster.clear();
    this.roster.set(this.localId, {
      id: this.localId,
      name: this.localName,
      color: this.localColor,
      colorIndex: 0,
      ship: this.localShip,
      isHost: true,
      ping: 0,
    });

    if (this.transport === 'php') {
      let created = false;
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateRoomCode();
        const res = await fetch(`signal.php?action=create&code=${encodeURIComponent(code)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            hostId: this.localId,
            hostName: this.localName,
          }),
        });
        if (res.status === 409) continue;
        const data = await res.json();
        if (!res.ok || !data.ok) {
          this.leaveRoom();
          throw new Error(data?.error || 'Failed to create room');
        }
        this.roomCode = code;
        created = true;
        break;
      }
      if (!created) {
        this.leaveRoom();
        throw new Error('Could not allocate unique room code');
      }
      this.startPhpHostPolling();
    } else if (this.transport === 'relay') {
      this.roomCode = generateRoomCode();
      try {
        await this.startRelayHost(this.roomCode);
      } catch (err) {
        this.leaveRoom();
        throw err;
      }
    } else {
      let p2pOk = false;
      try {
        await this.startPeerJsHost();
        p2pOk = true;
      } catch (err) {
        if (transportPref !== 'auto') {
          this.leaveRoom();
          throw err;
        }
      }

      if (p2pOk) {
        try {
          await this.startRelayHost(this.roomCode);
        } catch (_) {
          this.relayActive = false;
        }
      } else {
        this.roomCode = generateRoomCode();
        this.transport = 'relay';
        try {
          await this.startRelayHost(this.roomCode);
        } catch (err) {
          this.leaveRoom();
          throw err;
        }
      }
    }

    this.startPingLoop();
    this.setStatus('HOSTING', `Room ${this.roomCode} ready`);
    this.emitRoster();
    return this.roomCode;
  }

  async joinRoom({ code, name = 'PILOT', transportPref = 'auto', ship = 'striker' } = {}) {
    const cleanCode = String(code || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 10);
    if (cleanCode.length < 4) {
      throw new Error('Enter a valid room code');
    }

    this.leaveRoom();
    this.localName = (name || 'PILOT').trim().slice(0, 12) || 'PILOT';
    this.localShip = ship || 'striker';
    this.localId = makePeerId();
    this.role = 'guest';
    this.roomCode = cleanCode;

    this.setStatus('CONNECTING', `Connecting to ${cleanCode}...`);
    this.transport = await this.detectTransport(transportPref);

    try {
      if (this.transport === 'php') {
        const res = await fetch(`signal.php?action=join&code=${encodeURIComponent(cleanCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: cleanCode,
            peerId: this.localId,
            name: this.localName,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data?.error || 'Room not found');
        }
        const cIdx = typeof data.colorIndex === 'number' ? data.colorIndex : 1;
        this.localColor = PILOT_COLORS[cIdx % PILOT_COLORS.length];
        this.startPhpGuestPolling(data.hostId, data.hostName);
      } else if (this.transport === 'relay') {
        await this.startRelayGuest();
      } else if (transportPref === 'auto') {
        try {
          await this.startPeerJsGuest(7500);
        } catch (_) {
          if (this.peerJsInstance) {
            try {
              this.peerJsInstance.destroy();
            } catch (_) {}
            this.peerJsInstance = null;
          }
          this.peers.clear();
          this.setStatus('CONNECTING', 'P2P bloqueado pelo NAT — conectando via Relay WSS...');
          this.transport = 'relay';
          await this.startRelayGuest();
        }
      } else {
        await this.startPeerJsGuest(18000);
      }
      return cleanCode;
    } catch (err) {
      this.leaveRoom();
      throw err;
    }
  }

  // =========================================================================
  // PHP Signaling + Native RTCPeerConnection
  // =========================================================================

  startPhpHostPolling() {
    const poll = async () => {
      if (this.role !== 'host' || this.transport !== 'php') return;
      try {
        const res = await fetch(
          `signal.php?action=poll&role=host&code=${encodeURIComponent(this.roomCode)}`,
          { cache: 'no-store' }
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok || !data.peers) return;

        for (const [peerId, pData] of Object.entries(data.peers)) {
          let session = this.peers.get(peerId);
          if (!session) {
            const cIdx = pData.colorIndex ?? 1;
            const color = PILOT_COLORS[cIdx % PILOT_COLORS.length];
            session = await this.createPhpHostPeer(peerId, pData.name || 'PILOT', color, cIdx);
          }

          if (pData.answer && !session.remoteSet && session.pc) {
            session.remoteSet = true;
            await session.pc.setRemoteDescription(new RTCSessionDescription(pData.answer));
            for (const cand of session.pendingIce) {
              try {
                await session.pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (_) { }
            }
            session.pendingIce.length = 0;
          }

          if (Array.isArray(pData.guestIce)) {
            while (session.iceCursor < pData.guestIce.length) {
              const cand = pData.guestIce[session.iceCursor++];
              if (session.remoteSet) {
                try {
                  await session.pc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (_) { }
              } else {
                session.pendingIce.push(cand);
              }
            }
          }
        }
      } catch (_) {
        // Ignore transient network poll hiccups
      }
    };

    poll();
    this.pollTimer = setInterval(poll, 700);
  }

  async createPhpHostPeer(peerId, name, color, colorIndex) {
    const rtcCfg = await getRtcConfig();
    const pc = new RTCPeerConnection(rtcCfg);
    const session = {
      id: peerId,
      name,
      color,
      colorIndex,
      via: 'php',
      pc,
      stateChannel: null,
      eventsChannel: null,
      remoteSet: false,
      pendingIce: [],
      iceCursor: 0,
      opened: false,
      iceBuffer: [],
      iceFlushTimer: null,
      disconnectTimer: null,
    };
    this.peers.set(peerId, session);

    const flushIce = async () => {
      if (!session.iceBuffer.length || this.role !== 'host') return;
      const batch = session.iceBuffer.splice(0, session.iceBuffer.length);
      try {
        await fetch(`signal.php?action=signal&code=${encodeURIComponent(this.roomCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: this.roomCode,
            role: 'host',
            peerId,
            ice: batch,
          }),
        });
      } catch (_) { }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        session.iceBuffer.push(e.candidate.toJSON());
        clearTimeout(session.iceFlushTimer);
        session.iceFlushTimer = setTimeout(flushIce, 60);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
      } else if (pc.connectionState === 'disconnected') {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            this.handlePeerDisconnected(peerId);
          }
        }, 4500);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        clearTimeout(session.disconnectTimer);
        this.handlePeerDisconnected(peerId);
      }
    };

    const stateCh = pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 });
    const eventsCh = pc.createDataChannel('events', { ordered: true });
    this.wireDataChannel(session, stateCh, 'state');
    this.wireDataChannel(session, eventsCh, 'events');

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await fetch(`signal.php?action=signal&code=${encodeURIComponent(this.roomCode)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: this.roomCode,
        role: 'host',
        peerId,
        offer: pc.localDescription.toJSON(),
      }),
    });

    return session;
  }

  async startPhpGuestPolling(hostId, hostName) {
    const rtcCfg = await getRtcConfig();
    const pc = new RTCPeerConnection(rtcCfg);
    const session = {
      id: hostId,
      name: hostName || 'HOST',
      color: PILOT_COLORS[0],
      colorIndex: 0,
      via: 'php',
      pc,
      stateChannel: null,
      eventsChannel: null,
      remoteSet: false,
      pendingIce: [],
      iceCursor: 0,
      opened: false,
      iceBuffer: [],
      iceFlushTimer: null,
      disconnectTimer: null,
    };
    this.peers.set(hostId, session);

    const flushIce = async () => {
      if (!session.iceBuffer.length || this.role !== 'guest') return;
      const batch = session.iceBuffer.splice(0, session.iceBuffer.length);
      try {
        await fetch(`signal.php?action=signal&code=${encodeURIComponent(this.roomCode)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: this.roomCode,
            role: 'guest',
            peerId: this.localId,
            ice: batch,
          }),
        });
      } catch (_) { }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        session.iceBuffer.push(e.candidate.toJSON());
        clearTimeout(session.iceFlushTimer);
        session.iceFlushTimer = setTimeout(flushIce, 60);
      }
    };

    pc.ondatachannel = (e) => {
      const ch = e.channel;
      if (ch.label === 'state' || ch.label === 'events') {
        this.wireDataChannel(session, ch, ch.label);
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = null;
      } else if (pc.connectionState === 'disconnected') {
        clearTimeout(session.disconnectTimer);
        session.disconnectTimer = setTimeout(() => {
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            this.setStatus('OFFLINE', 'Host disconnected');
            this.leaveRoom();
          }
        }, 4500);
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        clearTimeout(session.disconnectTimer);
        this.setStatus('OFFLINE', 'Host disconnected');
        this.leaveRoom();
      }
    };

    const poll = async () => {
      if (this.role !== 'guest' || this.transport !== 'php') return;
      try {
        const res = await fetch(
          `signal.php?action=poll&role=guest&code=${encodeURIComponent(this.roomCode)}&peerId=${encodeURIComponent(this.localId)}`,
          { cache: 'no-store' }
        );
        if (res.status === 404) {
          this.setStatus('OFFLINE', 'Room closed by host');
          this.leaveRoom();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!data.ok) return;

        if (data.offer && !session.remoteSet) {
          session.remoteSet = true;
          await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
          if (Array.isArray(data.hostIce)) {
            while (session.iceCursor < data.hostIce.length) {
              const cand = data.hostIce[session.iceCursor++];
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (_) { }
            }
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await fetch(`signal.php?action=signal&code=${encodeURIComponent(this.roomCode)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code: this.roomCode,
              role: 'guest',
              peerId: this.localId,
              answer: pc.localDescription.toJSON(),
            }),
          });
        } else if (session.remoteSet && Array.isArray(data.hostIce)) {
          while (session.iceCursor < data.hostIce.length) {
            const cand = data.hostIce[session.iceCursor++];
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch (_) { }
          }
        }
      } catch (_) { }
    };

    poll();
    this.pollTimer = setInterval(poll, 700);
  }

  wireDataChannel(session, ch, kind) {
    if (kind === 'state') session.stateChannel = ch;
    else session.eventsChannel = ch;

    ch.onopen = () => {
      const sOpen = session.stateChannel && session.stateChannel.readyState === 'open';
      const eOpen = session.eventsChannel && session.eventsChannel.readyState === 'open';
      if (sOpen && eOpen && !session.opened) {
        session.opened = true;
        if (this.role === 'guest') {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
          this.onGuestConnectedToHost(session);
        } else if (this.role === 'host') {
          this.onHostPeerChannelReady(session);
        }
      }
    };

    ch.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        this.handleIncomingMessage(session.id, kind, msg);
      } catch (_) { }
    };

    ch.onclose = () => {
      if (this.role === 'guest') {
        this.setStatus('OFFLINE', 'Connection closed');
        this.leaveRoom();
      } else if (this.role === 'host') {
        this.handlePeerDisconnected(session.id);
      }
    };
  }

  // =========================================================================
  // Cloud PeerJS Transport (fallback or explicit CLOUD mode)
  // =========================================================================

  async startPeerJsHost() {
    const [PeerCtor, rtcCfg] = await Promise.all([loadPeerJS(), getRtcConfig()]);
    let bound = false;

    for (let attempt = 0; attempt < 4 && !bound; attempt++) {
      const code = generateRoomCode();
      const peerId = `ssjet-${code}`;
      try {
        await new Promise((resolve, reject) => {
          const peer = new PeerCtor(peerId, { config: rtcCfg });
          let settled = false;

          peer.on('open', () => {
            settled = true;
            this.peerJsInstance = peer;
            this.roomCode = code;
            bound = true;
            resolve();
          });

          peer.on('disconnected', () => {
            if (this.role === 'host' && this.peerJsInstance === peer && !peer.destroyed) {
              try {
                peer.reconnect();
              } catch (_) { }
            }
          });

          peer.on('error', (err) => {
            if (!settled) {
              settled = true;
              try {
                peer.destroy();
              } catch (_) { }
              reject(err);
            }
          });

          peer.on('connection', (conn) => this.handlePeerJsHostIncoming(conn));
        });
      } catch (_) {
        // Retry with another code if ID taken
      }
    }

    if (!bound) {
      this.leaveRoom();
      throw new Error('Could not open cloud PeerJS room');
    }
  }

  handlePeerJsHostIncoming(conn) {
    const remotePeerId = conn.metadata?.pilotId || conn.peer;
    const name = (conn.metadata?.name || 'PILOT').slice(0, 12);
    const kind = conn.label === 'main' ? 'main' : conn.label === 'state' ? 'state' : 'events';

    let session = this.peers.get(remotePeerId);
    if (!session) {
      const used = new Set(Array.from(this.roster.values()).map((r) => r.colorIndex));
      let cIdx = 1;
      for (let i = 1; i <= 7; i++) {
        if (!used.has(i)) {
          cIdx = i;
          break;
        }
      }
      session = {
        id: remotePeerId,
        name,
        color: PILOT_COLORS[cIdx % PILOT_COLORS.length],
        colorIndex: cIdx,
        via: 'peerjs',
        mainConn: null,
        stateConn: null,
        eventsConn: null,
        opened: false,
      };
      this.peers.set(remotePeerId, session);
    }

    if (kind === 'main') session.mainConn = conn;
    else if (kind === 'state') session.stateConn = conn;
    else session.eventsConn = conn;

    conn.on('open', () => {
      const ready = session.mainConn
        ? session.mainConn.open
        : Boolean(session.stateConn?.open && session.eventsConn?.open);
      if (ready && !session.opened) {
        session.opened = true;
        this.onHostPeerChannelReady(session);
      }
    });

    conn.on('data', (raw) => {
      try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const msgKind = msg?.t === 's' ? 'state' : kind;
        this.handleIncomingMessage(session.id, msgKind, msg);
      } catch (_) { }
    });

    conn.on('close', () => this.handlePeerDisconnected(remotePeerId));
    conn.on('error', () => this.handlePeerDisconnected(remotePeerId));
  }

  async startPeerJsGuest(timeoutMs = 18000) {
    this.setStatus('CONNECTING', 'Conectando ao servidor P2P...');
    const [PeerCtor, rtcCfg] = await Promise.all([loadPeerJS(), getRtcConfig()]);
    const targetPeerId = `ssjet-${this.roomCode}`;
    const hasTurn = Array.isArray(rtcCfg.iceServers) && rtcCfg.iceServers.some((s) => {
      const u = Array.isArray(s.urls) ? s.urls.join(',') : String(s.urls || '');
      return u.startsWith('turn:') || u.startsWith('turns:');
    });

    await new Promise((resolve, reject) => {
      const peer = new PeerCtor(undefined, { config: rtcCfg });
      let settled = false;

      const failTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            peer.destroy();
          } catch (_) { }
          const hint = hasTurn
            ? 'Tempo esgotado (timeout) na conexão P2P/TURN.'
            : 'Timeout P2P: a rede/CGNAT bloqueou a conexão direta sem TURN.';
          reject(new Error(hint));
        }
      }, timeoutMs);

      const failEarly = (err) => {
        clearTimeout(failTimeout);
        if (!settled) {
          settled = true;
          try {
            peer.destroy();
          } catch (_) { }
          let msg = err?.message || 'Erro de conexão PeerJS';
          if (err?.type === 'peer-unavailable') {
            msg = `Sala ${this.roomCode} não encontrada (verifique o código ou se o Host está online).`;
          } else if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error') {
            msg = 'Falha no servidor de sinalização P2P. Tente novamente.';
          }
          reject(new Error(msg));
        }
      };

      peer.on('open', () => {
        if (settled) return;
        this.peerJsInstance = peer;
        const meta = { pilotId: this.localId, name: this.localName };
        // Single multiplexed reliable DataConnection avoids dual-RTCPeerConnection ICE/SDP races
        const mainConn = peer.connect(targetPeerId, { label: 'main', reliable: true, metadata: meta });

        const session = {
          id: targetPeerId,
          name: 'HOST',
          color: PILOT_COLORS[0],
          colorIndex: 0,
          via: 'peerjs',
          mainConn,
          stateConn: null,
          eventsConn: null,
          opened: false,
        };
        this.peers.set(targetPeerId, session);

        mainConn.on('open', () => {
          if (session.opened) return;
          session.opened = true;
          clearTimeout(failTimeout);
          if (!settled) {
            settled = true;
            this.onGuestConnectedToHost(session);
            resolve();
          }
        });

        mainConn.on('data', (raw) => {
          try {
            const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const kind = msg?.t === 's' ? 'state' : 'events';
            this.handleIncomingMessage(session.id, kind, msg);
          } catch (_) { }
        });

        mainConn.on('error', (err) => {
          if (!session.opened) {
            failEarly(err);
          }
        });

        mainConn.on('close', () => {
          if (!session.opened) {
            failEarly(new Error('Conexão encerrada antes de abrir o canal P2P.'));
          } else {
            this.setStatus('OFFLINE', 'Host disconnected');
            this.leaveRoom();
          }
        });
      });

      peer.on('error', failEarly);
    });
  }

  // =========================================================================
  // WSS Relay Transport (MQTT 3.1.1 over WSS — bypasses symmetric NAT / CGNAT)
  // =========================================================================

  async startRelayHost(code) {
    const client = new MqttRelayClient({
      onMessage: (topic, text) => this.handleRelayHostMessage(topic, text),
    });
    const { brokerIndex } = await client.connect(0, { timeoutMs: 4500 });
    if (this.role !== 'host' || this.roomCode !== code) {
      client.close();
      return;
    }
    await client.subscribe(relayTopicC2H(code), 4000);
    if (this.role !== 'host' || this.roomCode !== code) {
      client.close();
      return;
    }
    this.relayClient = client;
    this.relayActive = true;
    this.relayBrokerIndex = brokerIndex;
  }

  handleRelayHostMessage(_topic, text) {
    if (this.role !== 'host') return;
    let env;
    try {
      env = JSON.parse(text);
    } catch (_) {
      return;
    }
    if (!env || !env.from || env.from === this.localId || !env.d || !env.d.t) return;

    const from = String(env.from);
    const msg = env.d;

    if (msg.t === 'rjoin') {
      this.handleRelayHostJoin(from, msg.name, msg.ship);
      return;
    }

    const session = this.peers.get(from);
    if (!session) return;
    session.lastSeenAt = Date.now();
    const kind = env.k === 's' ? 'state' : 'events';
    this.handleIncomingMessage(from, kind, msg);
  }

  handleRelayHostJoin(peerId, rawName, rawShip) {
    const cleanName = String(rawName || 'PILOT').trim().slice(0, 12) || 'PILOT';
    const cleanShip = String(rawShip || 'striker');
    const existing = this.peers.get(peerId);

    if (existing) {
      existing.lastSeenAt = Date.now();
      existing.name = cleanName;
      existing.ship = cleanShip;
      const r = this.roster.get(peerId);
      if (r) {
        r.name = cleanName;
        r.ship = cleanShip;
      }
      this.sendViaSession(existing, 'events', {
        t: 'welcome',
        assignedId: existing.id,
        color: existing.color,
        colorIndex: existing.colorIndex,
        hostId: this.localId,
        terrainConfig: this.hostTerrainConfig,
        roster: Array.from(this.roster.values()),
      });
      if (this.deformHistory.length || this.damageHistory.length) {
        this.sendViaSession(existing, 'events', {
          t: 'sync',
          terrainConfig: this.hostTerrainConfig,
          deforms: this.deformHistory,
          damages: this.damageHistory,
        });
      }
      return;
    }

    if (this.roster.size >= 8) {
      this.relayClient?.publish(
        relayTopicTo(this.roomCode, peerId),
        JSON.stringify({ k: 'e', d: { t: 'full' } })
      );
      return;
    }

    const used = new Set(Array.from(this.roster.values()).map((r) => r.colorIndex));
    let cIdx = 1;
    for (let i = 1; i <= 7; i++) {
      if (!used.has(i)) {
        cIdx = i;
        break;
      }
    }

    const session = {
      id: peerId,
      name: cleanName,
      color: PILOT_COLORS[cIdx % PILOT_COLORS.length],
      colorIndex: cIdx,
      ship: cleanShip,
      via: 'relay',
      opened: true,
      lastSeenAt: Date.now(),
    };
    this.peers.set(peerId, session);
    this.onHostPeerChannelReady(session);
  }

  async startRelayGuest() {
    this.setStatus('CONNECTING', `Conectando via Relay WSS à sala ${this.roomCode}...`);
    const code = this.roomCode;
    let lastErr = null;

    for (let i = 0; i < RELAY_BROKERS.length; i++) {
      if (this.role !== 'guest' || this.roomCode !== code) {
        throw new Error('Conexão cancelada.');
      }

      const client = new MqttRelayClient({
        onMessage: (topic, text) => this.handleRelayGuestMessage(topic, text),
      });

      try {
        await client.connect(i, { timeoutMs: 4500, singleBroker: true });
      } catch (err) {
        client.close();
        lastErr = err;
        continue;
      }

      try {
        await client.subscribe(relayTopicTo(code, this.localId), 4000);
        await client.subscribe(relayTopicH2C(code), 4000);
      } catch (err) {
        client.close();
        lastErr = err;
        continue;
      }

      let welcomeMsg = null;
      try {
        welcomeMsg = await new Promise((resolve, reject) => {
          let settled = false;
          let retryTimer = null;
          let waitTimer = null;

          const cleanup = () => {
            clearInterval(retryTimer);
            clearTimeout(waitTimer);
            if (this._relayJoinPending?.abort === abortHandler) {
              this._relayJoinPending = null;
            }
          };

          const abortHandler = (reason) => {
            if (!settled) {
              settled = true;
              cleanup();
              reject(new Error(reason || 'Conexão cancelada.'));
            }
          };

          this._relayJoinPending = {
            resolve: (msg) => {
              if (!settled) {
                settled = true;
                cleanup();
                resolve(msg);
              }
            },
            reject: (err) => {
              if (!settled) {
                settled = true;
                cleanup();
                reject(err);
              }
            },
            abort: abortHandler,
          };

          const sendJoin = () => {
            client.publish(
              relayTopicC2H(code),
              JSON.stringify({
                from: this.localId,
                k: 'e',
                d: {
                  t: 'rjoin',
                  id: this.localId,
                  name: this.localName,
                  ship: this.localShip,
                },
              })
            );
          };

          sendJoin();
          retryTimer = setInterval(sendJoin, 1200);
          waitTimer = setTimeout(() => {
            if (!settled) {
              settled = true;
              cleanup();
              reject(new Error('No host welcome on this broker'));
            }
          }, 5500);
        });
      } catch (err) {
        client.close();
        if (err && err.message && err.message.includes('Sala cheia')) {
          throw err;
        }
        lastErr = err;
        continue;
      }

      if (this.role !== 'guest' || this.roomCode !== code) {
        client.close();
        throw new Error('Conexão cancelada.');
      }

      this.relayClient = client;
      this.relayActive = true;
      this.relayBrokerIndex = i;
      this.hostLastSeenAt = Date.now();

      const session = {
        id: 'relay-host',
        hostId: welcomeMsg.hostId || 'HOST',
        name: 'HOST',
        color: PILOT_COLORS[0],
        colorIndex: 0,
        via: 'relay',
        opened: true,
        lastSeenAt: Date.now(),
      };
      this.peers.set('relay-host', session);
      this.handleIncomingMessage('relay-host', 'events', welcomeMsg);
      this.onGuestConnectedToHost(session);
      return;
    }

    throw new Error(
      lastErr?.message?.includes('Sala')
        ? lastErr.message
        : `Sala ${this.roomCode} não encontrada no Relay (verifique o código ou se o Host está online).`
    );
  }

  handleRelayGuestMessage(_topic, text) {
    if (this.role !== 'guest') return;
    let env;
    try {
      env = JSON.parse(text);
    } catch (_) {
      return;
    }
    if (!env || !env.d || !env.d.t) return;
    if (env.skip && env.skip === this.localId) return;

    this.hostLastSeenAt = Date.now();
    const msg = env.d;

    if (msg.t === 'full' && this._relayJoinPending) {
      this._relayJoinPending.reject(new Error('Sala cheia (máximo 8 pilotos).'));
      return;
    }

    if (msg.t === 'host_closed') {
      if (this._relayJoinPending) {
        this._relayJoinPending.reject(new Error('Sala encerrada pelo Host.'));
        return;
      }
      this.setStatus('OFFLINE', 'Sala encerrada pelo Host');
      this.leaveRoom();
      return;
    }

    if (this._relayJoinPending) {
      if (msg.t === 'welcome') {
        this._relayJoinPending.resolve(msg);
      }
      return;
    }

    const kind = env.k === 's' ? 'state' : 'events';
    this.handleIncomingMessage('relay-host', kind, msg);
  }

  // =========================================================================
  // Session Handshake, Channel Sending & Star Relay
  // =========================================================================

  sendViaSession(session, kind, obj) {
    if (!session) return;
    const via = session.via || this.transport;
    if (via === 'relay') {
      if (!this.relayClient?.isOpen()) return;
      const k = kind === 'state' ? 's' : 'e';
      if (this.role === 'host') {
        this.relayClient.publish(relayTopicTo(this.roomCode, session.id), JSON.stringify({ k, d: obj }));
      } else if (this.role === 'guest') {
        this.relayClient.publish(relayTopicC2H(this.roomCode), JSON.stringify({ from: this.localId, k, d: obj }));
      }
      return;
    }

    const payload = JSON.stringify(obj);
    if (via === 'php') {
      const ch = kind === 'state' ? session.stateChannel : session.eventsChannel;
      if (ch && ch.readyState === 'open') {
        try {
          ch.send(payload);
        } catch (_) {}
      }
    } else if (via === 'peerjs') {
      const conn = session.mainConn || (kind === 'state' ? session.stateConn : session.eventsConn);
      if (conn && conn.open) {
        try {
          conn.send(payload);
        } catch (_) {}
      }
    }
  }

  broadcast(kind, obj, exceptPeerId = null) {
    if (this.role === 'guest' && this.transport === 'relay') {
      if (!this.relayClient?.isOpen()) return;
      this.relayClient.publish(
        relayTopicC2H(this.roomCode),
        JSON.stringify({ from: this.localId, k: kind === 'state' ? 's' : 'e', d: obj })
      );
      return;
    }

    let hasRelayTargets = false;
    for (const [pid, session] of this.peers.entries()) {
      if (pid === exceptPeerId || !session.opened) continue;
      if (session.via === 'relay') {
        hasRelayTargets = true;
      } else {
        this.sendViaSession(session, kind, obj);
      }
    }

    if (hasRelayTargets && this.relayClient?.isOpen()) {
      this.relayClient.publish(
        relayTopicH2C(this.roomCode),
        JSON.stringify({
          k: kind === 'state' ? 's' : 'e',
          skip: exceptPeerId || null,
          d: obj,
        })
      );
    }
  }

  onHostPeerChannelReady(session) {
    this.roster.set(session.id, {
      id: session.id,
      name: session.name,
      color: session.color,
      colorIndex: session.colorIndex,
      ship: session.ship || 'striker',
      isHost: false,
      ping: 0,
    });

    // Send welcome + assigned color + host terrain config + full roster + world craters/damage sync snapshot
    this.sendViaSession(session, 'events', {
      t: 'welcome',
      assignedId: session.id,
      color: session.color,
      colorIndex: session.colorIndex,
      hostId: this.localId,
      terrainConfig: this.hostTerrainConfig,
      roster: Array.from(this.roster.values()),
    });

    if (this.deformHistory.length || this.damageHistory.length) {
      this.sendViaSession(session, 'events', {
        t: 'sync',
        terrainConfig: this.hostTerrainConfig,
        deforms: this.deformHistory,
        damages: this.damageHistory,
      });
    }

    // Broadcast updated roster to everyone
    this.broadcast('events', { t: 'roster', list: Array.from(this.roster.values()) });
    this.emitRoster();
    this.cb.onPeerJoined?.({ id: session.id, name: session.name, color: session.color, ship: session.ship || 'striker' });
  }

  onGuestConnectedToHost(session) {
    this.sendViaSession(session, 'events', {
      t: 'hello',
      id: this.localId,
      name: this.localName,
      ship: this.localShip,
    });
    this.startPingLoop();
    this.setStatus('CONNECTED', `Connected to room ${this.roomCode}`);
  }

  startPingLoop() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const ts = performance.now();
      this.broadcast('events', { t: 'ping', ts, from: this.localId });

      const nowMs = Date.now();
      if (this.role === 'host') {
        for (const [pid, session] of Array.from(this.peers.entries())) {
          if (session.via === 'relay' && nowMs - (session.lastSeenAt || nowMs) > 12000) {
            this.handlePeerDisconnected(pid);
          }
        }
      } else if (this.role === 'guest' && this.transport === 'relay') {
        if (this.hostLastSeenAt > 0 && nowMs - this.hostLastSeenAt > 15000) {
          this.setStatus('OFFLINE', 'Conexão com o Host perdida (Relay)');
          this.leaveRoom();
        }
      }
    }, 2000);
  }

  handleIncomingMessage(fromPeerId, _kind, msg) {
    if (!msg || !msg.t) return;

    // 1. High-frequency flight state
    if (msg.t === 's') {
      const senderId = msg.id || fromPeerId;
      if (senderId === this.localId) return;
      if (this.role === 'host') {
        this.broadcast('state', msg, fromPeerId);
      }
      this.cb.onRemoteState?.(senderId, msg);
      return;
    }

    // 2. Reliable events & handshake
    if (msg.t === 'hello' && this.role === 'host') {
      const session = this.peers.get(fromPeerId);
      if (session) {
        if (msg.name) session.name = String(msg.name).slice(0, 12);
        if (msg.ship) session.ship = String(msg.ship);
        const r = this.roster.get(fromPeerId);
        if (r) {
          r.name = session.name;
          if (msg.ship) r.ship = String(msg.ship);
          this.broadcast('events', { t: 'roster', list: Array.from(this.roster.values()) });
          this.emitRoster();
        }
        if (msg.ship) {
          this.cb.onRemoteEvent?.({ t: 'ship', id: fromPeerId, sh: msg.ship, from: fromPeerId });
        }
      }
      return;
    }

    if (msg.t === 'ship') {
      const pid = msg.id || fromPeerId;
      const r = this.roster.get(pid);
      if (r && msg.sh) {
        r.ship = String(msg.sh);
        this.emitRoster();
      }
      if (this.role === 'host') {
        this.broadcast('events', msg, fromPeerId);
      }
      if (pid !== this.localId) {
        this.cb.onRemoteEvent?.(msg);
      }
      return;
    }

    if (msg.t === 'welcome' && this.role === 'guest') {
      this.localColor = msg.color || this.localColor;
      if (msg.terrainConfig) {
        this.hostTerrainConfig = sanitizeTerrainConfig(msg.terrainConfig);
        this.cb.onTerrainConfig?.(this.hostTerrainConfig);
      }
      this.syncRosterFromList(msg.roster || []);
      return;
    }

    if (msg.t === 'roster' && this.role === 'guest') {
      this.syncRosterFromList(msg.list || []);
      return;
    }

    if (msg.t === 'sync' && this.role === 'guest') {
      if (msg.terrainConfig && !this.hostTerrainConfig) {
        this.hostTerrainConfig = sanitizeTerrainConfig(msg.terrainConfig);
        this.cb.onTerrainConfig?.(this.hostTerrainConfig);
      }
      this.cb.onSyncSnapshot?.(msg.deforms || [], msg.damages || []);
      return;
    }

    if (msg.t === 'ping') {
      const session = this.peers.get(fromPeerId);
      if (session) {
        this.sendViaSession(session, 'events', { t: 'pong', ts: msg.ts, from: this.localId });
      }
      return;
    }

    if (msg.t === 'pong') {
      const rtt = Math.max(1, Math.round(performance.now() - msg.ts));
      const entry = this.roster.get(msg.from || fromPeerId);
      if (entry) {
        entry.ping = rtt;
        if (this.role === 'host') {
          this.broadcast('events', { t: 'roster', list: Array.from(this.roster.values()) });
        }
        this.emitRoster();
      }
      return;
    }

    if (msg.t === 'leave') {
      this.handlePeerDisconnected(msg.id || fromPeerId);
      return;
    }

    // Gameplay events: record history on host & relay to other guests
    if (this.role === 'host') {
      if (msg.t === 'rst') {
        // Guests cannot reset or alter terrain in multiplayer mode
        return;
      }
      if (msg.t === 'def') this.recordDeform(msg);
      else if (msg.t === 'dmg') this.recordDamage(msg);
      this.broadcast('events', msg, fromPeerId);
    }

    if (msg.from !== this.localId) {
      this.cb.onRemoteEvent?.(msg);
    }
  }

  syncRosterFromList(list) {
    const nextIds = new Set();
    for (const item of list) {
      nextIds.add(item.id);
      const existed = this.roster.has(item.id);
      this.roster.set(item.id, item);
      if (!existed && item.id !== this.localId) {
        this.cb.onPeerJoined?.(item);
      }
    }
    for (const oldId of Array.from(this.roster.keys())) {
      if (!nextIds.has(oldId) && oldId !== this.localId) {
        this.roster.delete(oldId);
        this.cb.onPeerLeft?.(oldId);
      }
    }
    this.emitRoster();
  }

  handlePeerDisconnected(peerId) {
    const session = this.peers.get(peerId);
    if (session) {
      clearTimeout(session.iceFlushTimer);
      clearTimeout(session.disconnectTimer);
      try {
        session.pc?.close();
      } catch (_) { }
      try {
        session.mainConn?.close();
      } catch (_) { }
      try {
        session.stateConn?.close();
      } catch (_) { }
      try {
        session.eventsConn?.close();
      } catch (_) { }
      this.peers.delete(peerId);
    }
    if (this.roster.has(peerId)) {
      this.roster.delete(peerId);
      this.cb.onPeerLeft?.(peerId);
      if (this.role === 'host') {
        this.broadcast('events', { t: 'roster', list: Array.from(this.roster.values()) });
      }
      this.emitRoster();
    }
  }

  recordDeform(msg) {
    this.deformHistory.push(msg);
    if (this.deformHistory.length > 240) this.deformHistory.shift();
  }

  recordDamage(msg) {
    this.damageHistory.push(msg);
    if (this.damageHistory.length > 160) this.damageHistory.shift();
  }

  isActive() {
    return this.role !== null && (this.status === 'HOSTING' || this.status === 'CONNECTED');
  }

  setLocalShip(shipId) {
    this.localShip = shipId || 'striker';
    const selfEntry = this.roster.get(this.localId);
    if (selfEntry) {
      selfEntry.ship = this.localShip;
      this.emitRoster();
    }
    if (this.isActive()) {
      this.sendEvent({ t: 'ship', id: this.localId, sh: this.localShip });
    }
  }

  sendLocalState(jet, shipsDestroyed = 0) {
    if (!this.isActive() || this.peers.size === 0) return;
    let usesRelay = this.transport === 'relay';
    if (!usesRelay) {
      for (const session of this.peers.values()) {
        if (session.via === 'relay') {
          usesRelay = true;
          break;
        }
      }
    }
    const minInterval = usesRelay ? 60 : 50;
    const now = performance.now();
    if (now - this.lastStateSentAt < minInterval) return;
    this.lastStateSentAt = now;

    const pkt = {
      t: 's',
      id: this.localId,
      x: round1(jet.position.x),
      y: round1(jet.position.y),
      z: round1(jet.position.z),
      vx: round1(jet.velocity.x),
      vy: round1(jet.velocity.y),
      vz: round1(jet.velocity.z),
      yw: round2(jet.yaw),
      pt: round2(jet.pitch),
      bk: round2(jet.bank),
      rl: round2(jet.rollExtra || 0),
      ab: jet.afterburner ? 1 : 0,
      hp: Math.round(jet.hp),
      al: jet.alive ? 1 : 0,
      sh: jet.shipId || this.localShip,
      sc: shipsDestroyed | 0,
    };
    this.broadcast('state', pkt);
  }

  sendEvent(obj) {
    if (!this.isActive()) return;
    const pkt = { ...obj, from: this.localId };
    if (this.role === 'host') {
      if (pkt.t === 'def') this.recordDeform(pkt);
      else if (pkt.t === 'dmg') this.recordDamage(pkt);
      else if (pkt.t === 'rst') {
        this.deformHistory.length = 0;
        this.damageHistory.length = 0;
      }
    }
    this.broadcast('events', pkt);
  }

  leaveRoom(isUnload = false) {
    const prevRole = this.role;
    const prevTransport = this.transport;
    const prevCode = this.roomCode;

    if (this._relayJoinPending) {
      this._relayJoinPending.abort('Saiu da sala.');
      this._relayJoinPending = null;
    }

    if (this.isActive()) {
      this.broadcast('events', { t: 'leave', id: this.localId });
    }

    if (prevRole === 'host' && prevCode && this.relayClient?.isOpen()) {
      this.relayClient.publish(
        relayTopicH2C(prevCode),
        JSON.stringify({ k: 'e', d: { t: 'host_closed' } })
      );
    }

    if (prevTransport === 'php' && prevCode) {
      const url = `signal.php?action=leave&code=${encodeURIComponent(prevCode)}&role=${encodeURIComponent(prevRole || 'guest')}&peerId=${encodeURIComponent(this.localId)}`;
      if (isUnload && typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else if (!isUnload && typeof fetch !== 'undefined') {
        fetch(url, { method: 'POST' }).catch(() => { });
      }
    }

    clearInterval(this.pollTimer);
    this.pollTimer = null;
    clearInterval(this.pingTimer);
    this.pingTimer = null;

    for (const [pid, session] of this.peers.entries()) {
      clearTimeout(session.iceFlushTimer);
      clearTimeout(session.disconnectTimer);
      try {
        session.pc?.close();
      } catch (_) { }
      try {
        session.mainConn?.close();
      } catch (_) { }
      try {
        session.stateConn?.close();
      } catch (_) { }
      try {
        session.eventsConn?.close();
      } catch (_) { }
      this.peers.delete(pid);
    }

    if (this.peerJsInstance) {
      try {
        this.peerJsInstance.destroy();
      } catch (_) { }
      this.peerJsInstance = null;
    }

    if (this.relayClient) {
      this.relayClient.close();
      this.relayClient = null;
    }
    this.relayActive = false;
    this.hostLastSeenAt = 0;

    for (const id of Array.from(this.roster.keys())) {
      if (id !== this.localId) {
        this.cb.onPeerLeft?.(id);
      }
    }
    this.roster.clear();
    this.hostTerrainConfig = null;
    this.deformHistory = [];
    this.damageHistory = [];
    this.role = null;
    this.transport = null;
    this.roomCode = '';

    if (!isUnload) {
      this.setStatus('OFFLINE', '');
      this.emitRoster();
    }
  }
}
