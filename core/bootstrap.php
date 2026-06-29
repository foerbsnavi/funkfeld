<?php
declare(strict_types=1);

/**
 * Gemeinsame Initialisierung für alle Einstiegspunkte von Funkfeld.
 * Definiert Pfade, startet eine sichere Session und stellt CSRF-Schutz bereit.
 * (Interne Bezeichner heißen weiterhin PULT_* aus Kompatibilitätsgründen.)
 */

define('PULT_ROOT', dirname(__DIR__));

// Plattform-Modus: liegt die Engine unter der Account-App (web/public/app/funkfeld/),
// existiert eine Ebene höher deren core.php. Dann kommen Login und Datenverzeichnis
// aus der Account-Sitzung; sonst läuft Funkfeld eigenständig (eigenes Passwort-Login).
define('PULT_PLATFORM', is_file(PULT_ROOT . '/../core.php'));

/** Inhalt für programmatisch angelegte Schutz-.htaccess (Apache 2.2 + 2.4). */
define('PULT_HTACCESS_DENY',
    "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n"
    . "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n");

require_once __DIR__ . '/store.php';
require_once __DIR__ . '/auth.php';

// Sichere Session-Cookies
$pult_https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['SERVER_PORT'] ?? '') === '443')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

if (PULT_PLATFORM) {
    // Dieselbe Sitzung wie die Account-App mitbenutzen (gemeinsamer Login-Status).
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => $pult_https,
    ]);
    session_name('ff_app');
    session_start();

    // Konto aus der Sitzung prüfen (ohne core.php einzubinden → keine Funktions-Kollision).
    $pult_appdata = dirname(PULT_ROOT, 3) . '/app_daten';   // web/app_daten (außerhalb Docroot)
    $pult_uid = (string) ($_SESSION['app_uid'] ?? '');
    $pult_user = preg_match('/^u_[a-f0-9]{24}$/', $pult_uid) === 1
        ? store_read($pult_appdata . '/' . $pult_uid . '/benutzer.json', null)
        : null;
    if (!is_array($pult_user)) {
        header('Location: /app/?p=login');
        exit;
    }
    if ((string) ($pult_user['status'] ?? '') !== 'ok') {
        header('Location: /app/?p=verify');
        exit;
    }
    if (empty($pult_user['admin']) && empty($pult_user['freigeschaltet'])) {
        header('Location: /app/?p=warten');
        exit;
    }
    // Konto-Kontext (für Dashboard-Verwaltung, Freigabe, Topbar)
    define('PULT_APPDATA', $pult_appdata);     // web/app_daten
    define('PULT_ACCOUNT_UID', $pult_uid);     // eingeloggtes Konto
    define('PULT_ACCOUNT_ADMIN', !empty($pult_user['admin']));
    define('PULT_ACCOUNT_NAME', (string) ($pult_user['name'] ?? ''));

    require_once __DIR__ . '/dashboards.php';
    $pult_sel = pult_dash_aktuelle();
    if ($pult_sel !== null) {
        define('PULT_HAS_DASH', true);
        define('PULT_DASH_OWNER', (string) $pult_sel['o']);
        define('PULT_DASH_ID', (string) $pult_sel['d']);
        define('PULT_DATA', pult_dash_basis_von($pult_sel['o']) . '/d/' . $pult_sel['d']);
        if (!is_dir(PULT_DATA)) { @mkdir(PULT_DATA, 0775, true); }
    } else {
        define('PULT_HAS_DASH', false);
        define('PULT_DATA', $pult_appdata . '/' . $pult_uid . '/d/_keins');
    }
} else {
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => $pult_https,
    ]);
    session_name('PULTSESS');
    session_start();
    // Standalone: Passwort/Login-Bremse instanzweit (data/), Dashboards darunter (data/d/<id>/).
    define('PULT_INSTALL_CONFIG', PULT_ROOT . '/data/config.json');
    define('PULT_LOGIN_FILE', PULT_ROOT . '/data/login.json');
    require_once __DIR__ . '/dashboards.php';
    $pult_sel = pult_dash_aktuelle();
    if ($pult_sel !== null) {
        define('PULT_HAS_DASH', true);
        define('PULT_DASH_OWNER', 'self');
        define('PULT_DASH_ID', (string) $pult_sel['d']);
        define('PULT_DATA', PULT_ROOT . '/data/d/' . $pult_sel['d']);
        if (!is_dir(PULT_DATA)) { @mkdir(PULT_DATA, 0775, true); }
    } else {
        define('PULT_HAS_DASH', false);
        define('PULT_DATA', PULT_ROOT . '/data/d/_keins');
    }
}

define('PULT_CONFIG', PULT_DATA . '/config.json');
define('PULT_DASHBOARD', PULT_DATA . '/dashboard.json');
define('PULT_BLOCKS', PULT_DATA . '/blocks');
define('PULT_FILES', PULT_DATA . '/files');
define('PULT_CHAT', PULT_DATA . '/chat.json');

// CSRF-Token einmal pro Session erzeugen
if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}

/** Aktuelles CSRF-Token. */
function csrf_token(): string
{
    return $_SESSION['csrf'] ?? '';
}

/** Prüft ein übergebenes CSRF-Token zeitkonstant. */
function csrf_valid(?string $token): bool
{
    return is_string($token) && hash_equals($_SESSION['csrf'] ?? '', $token);
}

/** Kurzschreibweise für HTML-sicheres Ausgeben. */
function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
}
