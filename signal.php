<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function respond(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function readJsonBody(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : [];
}

function validateCode(string $code): string {
    $code = strtoupper(trim($code));
    if (!preg_match('/^[A-Z0-9]{4,10}$/', $code)) {
        respond(400, ['ok' => false, 'error' => 'Invalid room code']);
    }
    return $code;
}

function validatePeerId(string $peerId): string {
    $peerId = trim($peerId);
    if (!preg_match('/^[a-zA-Z0-9_-]{4,24}$/', $peerId)) {
        respond(400, ['ok' => false, 'error' => 'Invalid peerId']);
    }
    return $peerId;
}

function sanitizeName(string $name, string $fallback = 'PILOT'): string {
    $clean = preg_replace('/[^\w \-]/u', '', trim($name));
    if ($clean === null || $clean === '') {
        return $fallback;
    }
    return substr($clean, 0, 12);
}

$roomDir = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'sunset_striker_p2p';
if (!is_dir($roomDir) && !@mkdir($roomDir, 0777, true) && !is_dir($roomDir)) {
    respond(500, ['ok' => false, 'error' => 'Unable to initialize signaling directory']);
}

// Garbage-collect stale rooms older than 1800 seconds
$now = time();
$files = @glob($roomDir . DIRECTORY_SEPARATOR . '*.json');
if (is_array($files)) {
    foreach ($files as $f) {
        $mtime = @filemtime($f);
        if ($mtime !== false && ($now - $mtime) > 1800) {
            @unlink($f);
        }
    }
}

$body = readJsonBody();
$action = (string)($_GET['action'] ?? ($body['action'] ?? ''));

if ($action === 'ping') {
    respond(200, ['ok' => true, 'transport' => 'php', 'time' => $now]);
}

$rawCode = (string)($_GET['code'] ?? ($body['code'] ?? ''));
$code = validateCode($rawCode);
$roomFile = $roomDir . DIRECTORY_SEPARATOR . $code . '.json';

if ($action === 'create') {
    $hostId = validatePeerId((string)($body['hostId'] ?? ($_GET['hostId'] ?? '')));
    $hostName = sanitizeName((string)($body['hostName'] ?? 'HOST'), 'HOST');

    $fp = @fopen($roomFile, 'c+');
    if (!$fp) {
        respond(500, ['ok' => false, 'error' => 'Cannot open room file']);
    }
    flock($fp, LOCK_EX);
    clearstatcache(true, $roomFile);
    $existing = stream_get_contents($fp);
    if ($existing !== false && trim($existing) !== '') {
        $parsed = json_decode($existing, true);
        if (is_array($parsed) && ($now - (int)($parsed['updatedAt'] ?? 0)) < 1800) {
            flock($fp, LOCK_UN);
            fclose($fp);
            respond(409, ['ok' => false, 'error' => 'Room code already exists']);
        }
    }

    $room = [
        'code' => $code,
        'hostId' => $hostId,
        'hostName' => $hostName,
        'createdAt' => $now,
        'updatedAt' => $now,
        'peers' => new stdClass(),
    ];

    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($room, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    respond(200, ['ok' => true, 'code' => $code, 'hostId' => $hostId]);
}

if (!file_exists($roomFile)) {
    respond(404, ['ok' => false, 'error' => 'Room not found or closed']);
}

$fp = @fopen($roomFile, 'c+');
if (!$fp) {
    respond(500, ['ok' => false, 'error' => 'Cannot access room']);
}
flock($fp, LOCK_EX);
$rawRoom = stream_get_contents($fp);
$room = is_string($rawRoom) ? json_decode($rawRoom, true) : null;

if (!is_array($room) || !isset($room['hostId'])) {
    flock($fp, LOCK_UN);
    fclose($fp);
    @unlink($roomFile);
    respond(404, ['ok' => false, 'error' => 'Room expired']);
}
if (!isset($room['peers']) || !is_array($room['peers'])) {
    $room['peers'] = [];
}

$saveAndRespond = function (int $status, array $payload) use ($fp, &$room, $now): void {
    $room['updatedAt'] = $now;
    $out = $room;
    if (empty($out['peers'])) {
        $out['peers'] = new stdClass();
    }
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    respond($status, $payload);
};

if ($action === 'join') {
    $peerId = validatePeerId((string)($body['peerId'] ?? ($_GET['peerId'] ?? '')));
    $name = sanitizeName((string)($body['name'] ?? 'PILOT'), 'PILOT');

    if (!isset($room['peers'][$peerId]) && count($room['peers']) >= 7) {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(409, ['ok' => false, 'error' => 'Room is full (max 8 pilots)']);
    }

    // Assign next available color index 1..7 (0 reserved for host)
    $usedColors = [0 => true];
    foreach ($room['peers'] as $pid => $pData) {
        if ($pid !== $peerId && isset($pData['colorIndex'])) {
            $usedColors[(int)$pData['colorIndex']] = true;
        }
    }
    $colorIndex = 1;
    for ($ci = 1; $ci <= 7; $ci++) {
        if (!isset($usedColors[$ci])) {
            $colorIndex = $ci;
            break;
        }
    }

    $room['peers'][$peerId] = [
        'id' => $peerId,
        'name' => $name,
        'colorIndex' => $colorIndex,
        'offer' => null,
        'answer' => null,
        'hostIce' => [],
        'guestIce' => [],
        'joinedAt' => $now,
    ];

    $saveAndRespond(200, [
        'ok' => true,
        'code' => $code,
        'hostId' => $room['hostId'],
        'hostName' => $room['hostName'],
        'peerId' => $peerId,
        'colorIndex' => $colorIndex,
    ]);
}

if ($action === 'signal') {
    $role = (string)($body['role'] ?? ($_GET['role'] ?? ''));
    $peerId = validatePeerId((string)($body['peerId'] ?? ($_GET['peerId'] ?? '')));

    if (!isset($room['peers'][$peerId])) {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(404, ['ok' => false, 'error' => 'Peer not in room']);
    }

    if ($role === 'host') {
        if (isset($body['offer']) && is_array($body['offer'])) {
            $room['peers'][$peerId]['offer'] = $body['offer'];
        }
        if (isset($body['ice']) && is_array($body['ice'])) {
            foreach ($body['ice'] as $cand) {
                if (is_array($cand)) {
                    $room['peers'][$peerId]['hostIce'][] = $cand;
                }
            }
        }
    } elseif ($role === 'guest') {
        if (isset($body['answer']) && is_array($body['answer'])) {
            $room['peers'][$peerId]['answer'] = $body['answer'];
        }
        if (isset($body['ice']) && is_array($body['ice'])) {
            foreach ($body['ice'] as $cand) {
                if (is_array($cand)) {
                    $room['peers'][$peerId]['guestIce'][] = $cand;
                }
            }
        }
    } else {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(400, ['ok' => false, 'error' => 'Invalid role']);
    }

    $saveAndRespond(200, ['ok' => true]);
}

if ($action === 'poll') {
    $role = (string)($_GET['role'] ?? ($body['role'] ?? ''));

    if ($role === 'host') {
        $peersOut = empty($room['peers']) ? new stdClass() : $room['peers'];
        $saveAndRespond(200, [
            'ok' => true,
            'code' => $code,
            'peers' => $peersOut,
        ]);
    } elseif ($role === 'guest') {
        $peerId = validatePeerId((string)($_GET['peerId'] ?? ($body['peerId'] ?? '')));
        if (!isset($room['peers'][$peerId])) {
            flock($fp, LOCK_UN);
            fclose($fp);
            respond(404, ['ok' => false, 'error' => 'Removed from room']);
        }
        $p = $room['peers'][$peerId];
        $saveAndRespond(200, [
            'ok' => true,
            'code' => $code,
            'hostId' => $room['hostId'],
            'hostName' => $room['hostName'],
            'offer' => $p['offer'] ?? null,
            'hostIce' => $p['hostIce'] ?? [],
        ]);
    } else {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(400, ['ok' => false, 'error' => 'Invalid role']);
    }
}

if ($action === 'leave') {
    $role = (string)($body['role'] ?? ($_GET['role'] ?? ''));
    if ($role === 'host') {
        flock($fp, LOCK_UN);
        fclose($fp);
        @unlink($roomFile);
        respond(200, ['ok' => true, 'closed' => true]);
    } elseif ($role === 'guest') {
        $peerId = validatePeerId((string)($body['peerId'] ?? ($_GET['peerId'] ?? '')));
        unset($room['peers'][$peerId]);
        $saveAndRespond(200, ['ok' => true, 'left' => $peerId]);
    } else {
        flock($fp, LOCK_UN);
        fclose($fp);
        respond(400, ['ok' => false, 'error' => 'Invalid role']);
    }
}

flock($fp, LOCK_UN);
fclose($fp);
respond(400, ['ok' => false, 'error' => 'Unknown action']);
