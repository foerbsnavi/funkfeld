<?php
declare(strict_types=1);

/**
 * Login/Logout und Installations-Status von Funkfeld.
 * Es gibt genau einen Nutzer; das gehashte Passwort liegt in config.json.
 */

/** Ist Funkfeld bereits installiert (config.json vorhanden und mit gültigem Hash)? */
function pult_installed(): bool
{
    // Plattform-Modus: keine eigene Einrichtung — die Account-App regelt den Zugang.
    if (defined('PULT_PLATFORM') && PULT_PLATFORM) {
        return true;
    }
    // Standalone: Passwort-Hash liegt instanzweit in data/config.json (PULT_INSTALL_CONFIG).
    $cfg  = store_read(PULT_INSTALL_CONFIG, []);
    $hash = $cfg['auth']['hash'] ?? null;
    return is_string($hash) && $hash !== '';
}

/**
 * Liefert die Konfiguration als Array (einmal pro Request gecacht).
 * Nach jedem Schreiben von config.json mit pult_config(true) den Cache erneuern.
 */
function pult_config(bool $neu_laden = false): array
{
    static $cache = null;
    if ($neu_laden) {
        $cache = null;
    }
    if ($cache !== null) {
        return $cache;
    }
    $cfg = store_read(PULT_CONFIG, []);
    $cache = is_array($cfg) ? $cfg : [];
    return $cache;
}

/** Ist die aktuelle Session angemeldet? */
function is_logged_in(): bool
{
    // Plattform-Modus: bootstrap.php hat das Konto bereits geprüft (sonst Redirect).
    if (defined('PULT_PLATFORM') && PULT_PLATFORM) {
        return true;
    }
    return !empty($_SESSION['auth']) && $_SESSION['auth'] === true;
}

/** Versucht die Anmeldung mit dem gegebenen Passwort (Standalone). */
function attempt_login(string $password): bool
{
    $cfg  = store_read(PULT_INSTALL_CONFIG, []);
    $hash = $cfg['auth']['hash'] ?? '';
    if (!is_string($hash) || $hash === '' || !password_verify($password, $hash)) {
        return false;
    }
    session_regenerate_id(true);
    // Frisches CSRF-Token nach dem Login (falls vorher eines ausgespäht wurde).
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
    $_SESSION['auth'] = true;
    return true;
}

/** Meldet die aktuelle Session vollständig ab und löscht das Session-Cookie. */
function logout(): void
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', [
            'expires'  => time() - 42000,
            'path'     => $p['path'],
            'domain'   => $p['domain'],
            'secure'   => $p['secure'],
            'httponly' => $p['httponly'],
            'samesite' => $p['samesite'] ?? 'Lax',
        ]);
    }
    session_destroy();
}

/** Für Seiten: bei fehlender Anmeldung zur Startseite (Login) umleiten. */
function require_login_redirect(): void
{
    if (!is_logged_in()) {
        header('Location: index.php');
        exit;
    }
}

/** Für die API: bei fehlender Anmeldung mit 401 JSON abbrechen. */
function require_login_api(): void
{
    if (!is_logged_in()) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'fehler' => 'nicht angemeldet']);
        exit;
    }
}

/* --- Brute-Force-Bremse fürs Login (datei-basiert pro IP) --- */

function pult_login_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return is_string($ip) ? $ip : '';
}

/** Wie viele Sekunden ist die aktuelle IP noch gesperrt (0 = nicht gesperrt)? */
function pult_login_gesperrt(): int
{
    if (!defined('PULT_LOGIN_FILE')) {
        return 0;   // Plattform-Modus kennt keine eigene Login-Bremse
    }
    $d = store_read(PULT_LOGIN_FILE, []);
    $e = $d[pult_login_ip()] ?? null;
    if (!is_array($e)) {
        return 0;
    }
    $bis = (int) ($e['gesperrt_bis'] ?? 0);
    return $bis > time() ? $bis - time() : 0;
}

/** Einen Fehlversuch verbuchen; ab 8 Versuchen in 15 Min folgt 15 Min Sperre. */
function pult_login_misserfolg(): void
{
    if (!defined('PULT_LOGIN_FILE')) {
        return;
    }
    $ip = pult_login_ip();
    if ($ip === '') {
        return;
    }
    $jetzt = time();
    $d = store_read(PULT_LOGIN_FILE, []);
    // alte/abgelaufene Einträge aufräumen
    foreach ($d as $k => $v) {
        if ((int) ($v['gesperrt_bis'] ?? 0) < $jetzt && (int) ($v['fenster_bis'] ?? 0) < $jetzt) {
            unset($d[$k]);
        }
    }
    $e = $d[$ip] ?? ['anzahl' => 0, 'fenster_bis' => 0, 'gesperrt_bis' => 0];
    if ($jetzt > (int) ($e['fenster_bis'] ?? 0)) {
        $e['anzahl'] = 0;
        $e['fenster_bis'] = $jetzt + 900;
    }
    $e['anzahl'] = (int) $e['anzahl'] + 1;
    if ($e['anzahl'] >= 8) {
        $e['gesperrt_bis'] = $jetzt + 900;
        $e['anzahl'] = 0;
    }
    $d[$ip] = $e;
    store_write(PULT_LOGIN_FILE, $d);
}

/** Nach erfolgreichem Login die Fehlversuche der IP zurücksetzen. */
function pult_login_erfolg(): void
{
    if (!defined('PULT_LOGIN_FILE')) {
        return;
    }
    $ip = pult_login_ip();
    $d = store_read(PULT_LOGIN_FILE, []);
    if (isset($d[$ip])) {
        unset($d[$ip]);
        store_write(PULT_LOGIN_FILE, $d);
    }
}
