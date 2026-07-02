<?php
require_once __DIR__ . '/core/bootstrap.php';
require_once __DIR__ . '/core/blocks.php';
require_once __DIR__ . '/core/files.php';
require_once __DIR__ . '/core/feeds.php';
require_once __DIR__ . '/core/parse.php';
require_once __DIR__ . '/core/crypto.php';
require_once __DIR__ . '/core/mail.php';

header('Content-Type: application/json; charset=utf-8');

/** Erfolgsantwort senden und beenden. */
function pult_json_ok(array $data = []): void
{
    echo json_encode(['ok' => true] + $data);
    exit;
}

/** Fehlerantwort senden und beenden. */
function pult_json_fehler(string $msg, int $code = 400): void
{
    http_response_code($code);
    echo json_encode(['ok' => false, 'fehler' => $msg]);
    exit;
}

/** Liest den JSON-Body größenbegrenzt (max 512 KB) und gibt ihn als Array zurück (oder null). */
function pult_body(): ?array
{
    if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > 524288) {
        pult_json_fehler('Datenmenge zu groß', 413);
    }
    $raw = (string) file_get_contents('php://input', false, null, 0, 524289);
    if (strlen($raw) > 524288) {
        pult_json_fehler('Datenmenge zu groß', 413);
    }
    $body = json_decode($raw, true);
    return is_array($body) ? $body : null;
}

/** Liste der Mail-Konten (mit Migration eines früheren Einzelkontos). */
function pult_mailkonten(): array
{
    $e = pult_config()['einstellungen'] ?? [];
    if (isset($e['mailkonten']) && is_array($e['mailkonten'])) {
        return $e['mailkonten'];
    }
    // Migration: altes Einzelkonto → ein Listeneintrag
    if (isset($e['mail']) && is_array($e['mail']) && ((string) ($e['mail']['host'] ?? '')) !== '') {
        return [[
            'id'     => 'a0a0a0a0',   // hex-gültig, damit das Passwort beim Speichern erhalten bleibt
            'name'   => 'Postfach',
            'host'   => (string) ($e['mail']['host'] ?? ''),
            'port'   => (int) ($e['mail']['port'] ?? 993),
            'user'   => (string) ($e['mail']['user'] ?? ''),
            'pw_enc' => (string) ($e['mail']['pw_enc'] ?? ''),
        ]];
    }
    return [];
}

/** Erzeugt eine zufällige Konto-ID (8 Hex-Zeichen). */
function pult_mailkonto_id(): string
{
    return bin2hex(random_bytes(4));
}

/** Liste der Kalender (mit Migration einer früheren Einzel-URL). */
function pult_kalender(): array
{
    $e = pult_config()['einstellungen'] ?? [];
    if (isset($e['kalender']) && is_array($e['kalender'])) {
        return $e['kalender'];
    }
    // Migration: alte Einzel-URL → ein Listeneintrag
    $alt = trim((string) ($e['kalender_url'] ?? ''));
    if ($alt !== '') {
        return [[
            'id'   => 'k0000000',
            'name' => 'Kalender',
            'url'  => $alt,
        ]];
    }
    return [];
}

/** Erzeugt eine zufällige Kalender-ID (8 Hex-Zeichen). */
function pult_kalender_id(): string
{
    return bin2hex(random_bytes(4));
}

/**
 * Hängt eine Chat-Nachricht race-frei an chat.json an (exklusives Lock über den
 * gesamten Lese-Ändern-Schreib-Zyklus → kein Nachrichtenverlust bei gleichzeitigen Sendern).
 */
function pult_chat_anhaengen(array $eintrag): bool
{
    // Exklusives Lock über eine Sperrdatei serialisiert die Schreiber (kein verlorenes
    // Update); der eigentliche Schreibvorgang bleibt über store_write atomar (temp+rename),
    // sodass gleichzeitige Leser nie eine halbe Datei sehen.
    $lock = @fopen(PULT_CHAT . '.lock', 'c');
    if (!$lock) {
        return false;
    }
    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        return false;
    }
    $chat  = store_read(PULT_CHAT, ['nachrichten' => []]);
    $liste = is_array($chat['nachrichten'] ?? null) ? $chat['nachrichten'] : [];
    $liste[] = $eintrag;
    if (count($liste) > 200) {
        $liste = array_slice($liste, -200);
    }
    $ok = store_write(PULT_CHAT, ['nachrichten' => $liste]);
    flock($lock, LOCK_UN);
    fclose($lock);
    return $ok;
}

/** Liste der erlaubten Chat-Namen (bereinigt, gedeckelt). */
function pult_chatnamen(): array
{
    $roh = pult_config()['einstellungen']['chatnamen'] ?? [];
    if (!is_array($roh)) {
        return [];
    }
    $namen = [];
    foreach ($roh as $n) {
        $n = trim((string) $n);
        if ($n === '') {
            continue;
        }
        $n = mb_substr($n, 0, 40);
        if (!in_array($n, $namen, true)) {
            $namen[] = $n;
        }
        if (count($namen) >= 30) {
            break;
        }
    }
    return $namen;
}

/**
 * Öffnet die IMAP-Verbindung zum gewählten Konto (per ID) oder antwortet
 * selbst mit {nichtEingerichtet:true} bzw. einem Fehler (+exit).
 */
function pult_mail_handle($id)
{
    $id    = (string) $id;
    $konto = null;
    foreach (pult_mailkonten() as $k) {
        if ((string) ($k['id'] ?? '') === $id && $id !== '') {
            $konto = $k;
            break;
        }
    }
    $host = (string) ($konto['host'] ?? '');
    $port = (int) ($konto['port'] ?? 993);
    $user = (string) ($konto['user'] ?? '');
    $pw   = $konto ? pult_decrypt((string) ($konto['pw_enc'] ?? '')) : '';
    if ($host === '' || $user === '' || $pw === '') {
        echo json_encode(['ok' => false, 'nichtEingerichtet' => true]);
        exit;
    }
    $imap = pult_mail_oeffnen($host, $port, $user, $pw);
    if (!$imap) {
        @imap_errors();
        echo json_encode(['ok' => false, 'fehler' => 'Anmeldung fehlgeschlagen (Zugangsdaten in den Einstellungen prüfen)']);
        exit;
    }
    return $imap;
}

/** Klemmt einen Wert auf einen ganzzahligen Bereich (Pixel). */
function pult_klemm($v, int $min, int $max): int
{
    if (!is_numeric($v)) {
        $v = $min;
    }
    $v = (int) round((float) $v);
    return max($min, min($max, $v));
}

/** Säubert eine einzelne Geometrie {x,y,b,h} (oder null). */
function pult_clean_geo($g): ?array
{
    if (!is_array($g)) {
        return null;
    }
    return [
        'x' => pult_klemm($g['x'] ?? 0,   -20000, 20000),
        'y' => pult_klemm($g['y'] ?? 0,   -20000, 20000),
        'b' => pult_klemm($g['b'] ?? 280,    120,  4000),
        'h' => pult_klemm($g['h'] ?? 200,     60,  4000),
    ];
}

/** Säubert eine Geometrie-Map id→{x,y,b,h}, nur für bekannte IDs. */
function pult_clean_geomap($map, array $idSet): array
{
    $out = [];
    if (is_array($map)) {
        foreach ($map as $id => $g) {
            $id = (string) $id;
            if (!isset($idSet[$id])) {
                continue;
            }
            $cg = pult_clean_geo($g);
            if ($cg !== null) {
                $out[$id] = $cg;
            }
            if (count($out) >= 200) {
                break;
            }
        }
    }
    return $out;
}

/**
 * Validiert und säubert ein eingehendes Layout.
 * Es werden ausschließlich bekannte Felder mit geprüften Typen/Bereichen übernommen.
 * Gibt das saubere Layout zurück oder null bei grundsätzlich ungültiger Struktur.
 */
function pult_clean_layout($layout): ?array
{
    if (!is_array($layout) || !isset($layout['flaechen']) || !is_array($layout['flaechen'])) {
        return null;
    }

    $erlaubteTypen = array_merge(['leer'], PULT_WIDGET_TYPEN);
    $sauber = [];

    foreach ($layout['flaechen'] as $f) {
        if (!is_array($f)) {
            continue;
        }
        $id = (string) ($f['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            continue; // ungültige ID → Fläche verwerfen
        }
        $typ = (string) ($f['typ'] ?? 'leer');
        if (!in_array($typ, $erlaubteTypen, true)) {
            $typ = 'leer';
        }
        $titel = (string) ($f['titel'] ?? '');
        if (mb_strlen($titel) > 200) {
            $titel = mb_substr($titel, 0, 200);
        }

        $sauber[] = [
            'id'          => $id,
            'typ'         => $typ,
            'titel'       => $titel,
            'x'           => pult_klemm($f['x'] ?? 0,   -20000, 20000),
            'y'           => pult_klemm($f['y'] ?? 0,   -20000, 20000),
            'b'           => pult_klemm($f['b'] ?? 280,    120,  4000),
            'h'           => pult_klemm($f['h'] ?? 200,     60,  4000),
            'z'           => pult_klemm($f['z'] ?? 1,        0, 1000000),
            'eingeklappt' => !empty($f['eingeklappt']),
        ];

        if (count($sauber) >= 200) {
            break; // Obergrenze gegen Missbrauch
        }
    }

    $ansicht = in_array($layout['ansicht'] ?? 'frei', ['frei', 'raster', 'clips'], true)
        ? $layout['ansicht'] : 'frei';

    // Menge der gültigen Flächen-IDs (für Clips-/Bank-Geometrien)
    $idSet = [];
    foreach ($sauber as $f) {
        $idSet[$f['id']] = true;
    }

    // Drei Anordnungsbänke (Snapshots: Modus + Frei-/Clips-Geometrie)
    $baenke = [];
    $rohB = is_array($layout['baenke'] ?? null) ? $layout['baenke'] : [];
    for ($i = 0; $i < 3; $i++) {
        $b = $rohB[$i] ?? null;
        if (!is_array($b)) {
            $baenke[] = null;
            continue;
        }
        $baenke[] = [
            'ansicht' => in_array($b['ansicht'] ?? '', ['frei', 'raster', 'clips'], true) ? $b['ansicht'] : 'frei',
            'frei'    => pult_clean_geomap($b['frei'] ?? null, $idSet),
            'clips'   => pult_clean_geomap($b['clips'] ?? null, $idSet),
        ];
    }

    return [
        'flaechen'  => $sauber,
        'naechsteZ' => pult_klemm($layout['naechsteZ'] ?? 1, 1, 1000000),
        'ansicht'   => $ansicht,
        'gesperrt'  => !empty($layout['gesperrt']),
        'clips'     => pult_clean_geomap($layout['clips'] ?? null, $idSet),
        'baenke'    => $baenke,
    ];
}

$action = $_GET['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {

    // Abmelden (POST, CSRF über Header)
    case 'logout':
        require_login_api();
        if ($method !== 'POST' || !csrf_valid($_SERVER['HTTP_X_PULT_CSRF'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        logout();
        pult_json_ok();
        break;

    // Layout (Dashboard) laden
    case 'layout_get':
        require_login_api();
        $dash = store_read(PULT_DASHBOARD, ['flaechen' => [], 'naechsteZ' => 1, 'ansicht' => 'frei']);
        // Inhalte aller Flächen mitliefern (eine Antwort, ein Rendern).
        $bloecke = [];
        foreach ((array) ($dash['flaechen'] ?? []) as $f) {
            $id  = $f['id'] ?? '';
            $typ = (string) ($f['typ'] ?? 'leer');
            if (!pult_block_id_ok($id)) {
                continue;
            }
            $b = pult_block_read($id);
            if ($b !== null) {
                $bloecke[$id] = pult_clean_block($typ, $b);
            }
        }
        pult_json_ok(['layout' => $dash, 'bloecke' => $bloecke]);
        break;

    // Layout speichern (POST, JSON-Body mit csrf + layout)
    case 'layout_save':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $layout = pult_clean_layout($body['layout'] ?? null);
        if ($layout === null) {
            pult_json_fehler('ungültiges Layout');
        }
        if (!store_write(PULT_DASHBOARD, $layout)) {
            pult_json_fehler('Speichern fehlgeschlagen', 500);
        }
        pult_json_ok();
        break;

    // Inhalt einer Fläche speichern
    case 'block_save':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $id  = $body['id'] ?? '';
        $typ = (string) ($body['typ'] ?? '');
        if (!pult_block_id_ok($id)) {
            pult_json_fehler('ungültige ID');
        }
        if (!in_array($typ, PULT_WIDGET_TYPEN, true)) {
            pult_json_fehler('ungültiger Typ');
        }
        $content = pult_clean_block($typ, $body['content'] ?? []);
        if (!pult_block_write($id, $content)) {
            pult_json_fehler('Speichern fehlgeschlagen', 500);
        }
        pult_json_ok();
        break;

    // Inhalt einer Fläche löschen (beim Schließen)
    case 'block_delete':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $id = $body['id'] ?? '';
        if (!pult_block_id_ok($id)) {
            pult_json_fehler('ungültige ID');
        }
        // Zugehörige Dateien (Datei-Zwischenlager) mit entfernen
        $inhalt = pult_block_read($id);
        if (is_array($inhalt) && isset($inhalt['items']) && is_array($inhalt['items'])) {
            foreach ($inhalt['items'] as $it) {
                $fid = is_array($it) ? (string) ($it['id'] ?? '') : '';
                if (pult_block_id_ok($fid) && is_file(pult_file_pfad($fid))) {
                    pult_file_delete($fid);
                }
            }
        }
        pult_block_delete($id);
        pult_json_ok();
        break;

    // Live-Sync: günstige Änderungs-Stempel (Datei-Zeitstempel) von Layout + Blöcken + Chat.
    // Der Chat-Stempel versorgt die Chat-Flächen über den zentralen Sync-Poll —
    // sie laden die Nachrichtenliste nur noch bei tatsächlicher Änderung nach.
    case 'zustand':
        require_login_api();
        clearstatcache();
        $layoutMtime = is_file(PULT_DASHBOARD) ? (int) filemtime(PULT_DASHBOARD) : 0;
        $bstempel = [];
        foreach (glob(PULT_BLOCKS . '/*.json') ?: [] as $f) {
            $bid = basename($f, '.json');
            if (pult_block_id_ok($bid)) {
                $bstempel[$bid] = (int) filemtime($f);
            }
        }
        $chatMtime = is_file(PULT_CHAT) ? (int) filemtime(PULT_CHAT) : 0;
        pult_json_ok(['layout' => $layoutMtime, 'bloecke' => $bstempel, 'chat' => $chatMtime]);
        break;

    // Einzelnen Block-Inhalt + Zeitstempel lesen (für die Live-Karte: schneller, gezielter Poll)
    case 'block_get':
        require_login_api();
        $id = (string) ($_GET['id'] ?? '');
        if (!pult_block_id_ok($id)) {
            pult_json_fehler('ungültige ID');
        }
        clearstatcache();
        $pfad  = pult_block_pfad($id);
        $mtime = is_file($pfad) ? (int) filemtime($pfad) : 0;
        pult_json_ok(['mtime' => $mtime, 'content' => pult_block_read($id)]);
        break;

    // Custom-Fläche: gespeichertes Roh-HTML/JS ausliefern — wird NUR in einem Sandbox-iframe
    // angezeigt. Per CSP `sandbox` läuft das Dokument in einem opaken Ursprung (kein Zugriff auf
    // Session/Cookies der App), auch bei direktem Aufruf. Der Block ist zugriffsgeschützt
    // (gehört zum aktuell gewählten, freigegebenen Dashboard).
    case 'custom_render':
        require_login_api();
        $id = (string) ($_GET['id'] ?? '');
        if (!pult_block_id_ok($id)) {
            http_response_code(404);
            exit;
        }
        $block = pult_block_read($id);
        $html  = (is_array($block) && isset($block['html']) && is_string($block['html'])) ? $block['html'] : '';
        header_remove('Content-Security-Policy');
        header('Content-Security-Policy: sandbox allow-scripts allow-forms; default-src * data: blob: \'unsafe-inline\' \'unsafe-eval\';');
        header('Content-Type: text/html; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo $html !== '' ? $html : '<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px sans-serif;color:#888;padding:8px">Noch kein Inhalt.</body>';
        exit;

    // Dashboard als XML exportieren (Layout + Block-Inhalte; ohne hochgeladene Dateien).
    case 'dash_export':
        require_login_api();
        $id = (string) ($_GET['id'] ?? '');
        if (!pult_dash_id_ok($id)) {
            http_response_code(404);
            exit;
        }
        $basis = pult_dash_basis_von(pult_dash_eigner());
        $name  = '';
        foreach (pult_dash_liste($basis) as $it) {
            if (($it['id'] ?? '') === $id) { $name = (string) ($it['name'] ?? ''); break; }
        }
        if ($name === '') {
            http_response_code(404);
            exit;
        }
        $dir     = pult_dash_dir($basis, $id);
        $layout  = store_read($dir . '/dashboard.json', ['flaechen' => [], 'naechsteZ' => 1, 'ansicht' => 'frei']);
        $bloecke = [];
        foreach (glob($dir . '/blocks/*.json') ?: [] as $bf) {
            $bid = basename($bf, '.json');
            if (pult_block_id_ok($bid)) {
                $bloecke[$bid] = store_read($bf, null);
            }
        }
        $cdata = function ($arr) { return str_replace(']]>', ']]]]><![CDATA[>', json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)); };
        $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n"
            . '<funkfeld-dashboard version="1" name="' . htmlspecialchars($name, ENT_QUOTES) . '">' . "\n"
            . '  <layout><![CDATA[' . $cdata($layout) . ']]></layout>' . "\n"
            . '  <bloecke><![CDATA[' . $cdata($bloecke) . ']]></bloecke>' . "\n"
            . '</funkfeld-dashboard>' . "\n";
        $dn = preg_replace('/[^A-Za-z0-9_-]+/', '_', $name);
        if ($dn === '' || $dn === null) { $dn = 'dashboard'; }
        header('Content-Type: application/xml; charset=utf-8');
        header('Content-Disposition: attachment; filename="funkfeld_' . $dn . '.xml"');
        echo $xml;
        exit;

    // Dashboard aus hochgeladenem XML importieren → neues Dashboard.
    case 'dash_import':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $xmlText = (string) ($body['xml'] ?? '');
        if ($xmlText === '' || strlen($xmlText) > 5242880) {
            pult_json_fehler('XML fehlt oder zu groß');
        }
        if (\PHP_VERSION_ID < 80000 && function_exists('libxml_disable_entity_loader')) {
            libxml_disable_entity_loader(true);   // XXE-Schutz für PHP 7.x
        }
        $sx = @simplexml_load_string($xmlText, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
        if ($sx === false || !isset($sx->layout) || !isset($sx->bloecke)) {
            pult_json_fehler('Kein gültiges Funkfeld-XML');
        }
        $layoutRoh = json_decode((string) $sx->layout, true);
        $bloeckeRoh = json_decode((string) $sx->bloecke, true);
        $layout = pult_clean_layout(is_array($layoutRoh) ? $layoutRoh : []);
        if ($layout === null) {
            pult_json_fehler('Layout im XML ungültig');
        }
        $name = trim((string) ($sx['name'] ?? ''));
        if ($name === '') { $name = 'Importiert'; }
        if (mb_strlen($name) > 60) { $name = mb_substr($name, 0, 60); }

        $basis = pult_dash_basis_von(pult_dash_eigner());
        $items = pult_dash_liste($basis);
        if (count($items) >= 50) {
            pult_json_fehler('Maximale Anzahl Dashboards erreicht');
        }
        // Namens-Kollision vermeiden: existiert der Name schon, „ (Import)“ anhängen
        foreach ($items as $it) {
            if ((string) ($it['name'] ?? '') === $name) {
                $name = mb_substr($name, 0, 51) . ' (Import)';
                break;
            }
        }
        $neuId = pult_dash_gen_id();
        $dir   = pult_dash_dir($basis, $neuId);
        if (!@mkdir($dir . '/blocks', 0775, true) && !is_dir($dir . '/blocks')) {
            pult_json_fehler('Konnte Dashboard nicht anlegen', 500);
        }
        // typ je Fläche aus dem bereinigten Layout
        $typVon = [];
        foreach ($layout['flaechen'] as $f) { $typVon[$f['id']] = $f['typ']; }
        if (is_array($bloeckeRoh)) {
            foreach ($bloeckeRoh as $bid => $inhalt) {
                $bid = (string) $bid;
                if (!pult_block_id_ok($bid) || !isset($typVon[$bid])) {
                    continue;
                }
                store_write($dir . '/blocks/' . $bid . '.json', pult_clean_block($typVon[$bid], $inhalt));
            }
        }
        store_write($dir . '/dashboard.json', $layout);
        $items[] = ['id' => $neuId, 'name' => $name];
        pult_dash_speichern($basis, $items);
        pult_json_ok(['id' => $neuId, 'name' => $name]);
        break;

    // Update: installierte gegen veröffentlichte Version prüfen (nur Standalone).
    case 'update_check':
        require_login_api();
        if (defined('PULT_PLATFORM') && PULT_PLATFORM) {
            pult_json_fehler('Updates werden zentral verwaltet');
        }
        $lokal  = (string) (store_read(PULT_ROOT . '/version.json', [])['version'] ?? '0');
        // maxHops=0: keine Weiterleitungen — der Abruf bleibt fest an die Update-Domain gebunden
        $roh    = pult_fetch('https://funkfeld.brosemedien.de/files/funkfeld_version.json', 262144, 10, true, 0);
        $remote = $roh !== null ? json_decode($roh, true) : null;
        if (!is_array($remote) || !isset($remote['version'])) {
            pult_json_fehler('Update-Server nicht erreichbar', 502);
        }
        $aktuell = (string) $remote['version'];
        pult_json_ok([
            'installiert' => $lokal,
            'aktuell'     => $aktuell,
            'neuer'       => version_compare($aktuell, $lokal, '>'),
        ]);
        break;

    // Update einspielen: ZIP laden, entpacken, NUR Code überschreiben (data/ bleibt). Nur Standalone.
    case 'update_apply':
        require_login_api();
        if (defined('PULT_PLATFORM') && PULT_PLATFORM) {
            pult_json_fehler('Updates werden zentral verwaltet');
        }
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        if (!class_exists('ZipArchive')) {
            pult_json_fehler('PHP-Erweiterung ZipArchive fehlt auf diesem Server');
        }
        // maxHops=0: keine Weiterleitungen — die Host-Prüfung unten darf nicht per Redirect
        // umgangen werden (das ZIP überschreibt Programmcode → sonst wäre RCE möglich).
        $roh    = pult_fetch('https://funkfeld.brosemedien.de/files/funkfeld_version.json', 262144, 10, true, 0);
        $remote = $roh !== null ? json_decode($roh, true) : null;
        $url    = is_array($remote) ? (string) ($remote['download_url'] ?? '') : '';
        if ($url === '' || parse_url($url, PHP_URL_SCHEME) !== 'https' || parse_url($url, PHP_URL_HOST) !== 'funkfeld.brosemedien.de') {
            pult_json_fehler('Ungültige Download-Adresse', 502);
        }
        $zipRoh = pult_fetch($url, 25165824, 30, true, 0);   // bis 24 MB, keine Weiterleitungen
        if ($zipRoh === null) {
            pult_json_fehler('Download fehlgeschlagen', 502);
        }
        $tmpZip = PULT_ROOT . '/data/cache/_update.zip';
        $tmpDir = PULT_ROOT . '/data/cache/_update';
        pult_rrmdir($tmpDir);
        @mkdir($tmpDir, 0775, true);
        if (file_put_contents($tmpZip, $zipRoh) === false) {
            pult_json_fehler('Konnte ZIP nicht speichern (Schreibrechte für data/?)', 500);
        }
        $zip = new ZipArchive();
        if ($zip->open($tmpZip) !== true) {
            @unlink($tmpZip);
            pult_json_fehler('ZIP konnte nicht geöffnet werden', 500);
        }
        // Zip-Slip-Schutz: keine Einträge mit Pfad-Traversal / absoluten Pfaden zulassen.
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $eintragName = (string) $zip->getNameIndex($i);
            if ($eintragName === '' || strpos($eintragName, '..') !== false || strpos($eintragName, ':') !== false || $eintragName[0] === '/' || $eintragName[0] === '\\') {
                $zip->close();
                @unlink($tmpZip);
                pult_rrmdir($tmpDir);
                pult_json_fehler('Update-Paket abgelehnt (ungültiger Pfad im ZIP)', 500);
            }
        }
        $zip->extractTo($tmpDir);
        $zip->close();
        @unlink($tmpZip);
        // Falls das ZIP einen einzelnen Wrapper-Ordner enthält, dort hineinwechseln.
        $quelle = $tmpDir;
        if (!is_dir($quelle . '/core')) {
            $unter = array_values(array_filter(glob($tmpDir . '/*') ?: [], 'is_dir'));
            if (count($unter) === 1 && is_dir($unter[0] . '/core')) {
                $quelle = $unter[0];
            }
        }
        if (!is_dir($quelle . '/core')) {
            pult_rrmdir($tmpDir);
            pult_json_fehler('Update-Paket unvollständig (kein core/ gefunden)', 500);
        }
        // Nur Code übernehmen — data/ bleibt unangetastet.
        $codeDirs  = ['core', 'assets', 'views'];
        $codeFiles = ['index.php', 'api.php', 'install.php', 'version.json', 'README.txt', 'README.md', 'CHANGELOG.md', 'LICENSE', '.htaccess', 'robots.txt'];
        foreach ($codeDirs as $d) {
            if (is_dir($quelle . '/' . $d)) {
                pult_rrmdir(PULT_ROOT . '/' . $d);
                pult_copy_rekursiv($quelle . '/' . $d, PULT_ROOT . '/' . $d);
            }
        }
        foreach ($codeFiles as $f) {
            if (is_file($quelle . '/' . $f)) {
                @copy($quelle . '/' . $f, PULT_ROOT . '/' . $f);
            }
        }
        pult_rrmdir($tmpDir);
        $neu = (string) (store_read(PULT_ROOT . '/version.json', [])['version'] ?? '');
        pult_json_ok(['version' => $neu]);
        break;

    // Datei hochladen (multipart/form-data: csrf, datei)
    case 'file_upload':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        if (!csrf_valid($_POST['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        if (!isset($_FILES['datei']) || ($_FILES['datei']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            pult_json_fehler('Upload fehlgeschlagen');
        }
        $groesse = (int) $_FILES['datei']['size'];
        if ($groesse <= 0 || $groesse > 26214400) {   // 25 MB
            pult_json_fehler('Datei zu groß (max 25 MB)', 413);
        }
        if (!is_dir(PULT_FILES) && !@mkdir(PULT_FILES, 0775, true) && !is_dir(PULT_FILES)) {
            pult_json_fehler('Speicherort fehlt', 500);
        }
        if (!is_file(PULT_FILES . '/.htaccess')) {
            @file_put_contents(PULT_FILES . '/.htaccess', PULT_HTACCESS_DENY);
        }
        $fid = bin2hex(random_bytes(16));
        if (!is_uploaded_file($_FILES['datei']['tmp_name'])
            || !move_uploaded_file($_FILES['datei']['tmp_name'], pult_file_pfad($fid))) {
            pult_json_fehler('Speichern fehlgeschlagen', 500);
        }
        // Nachprüfung der tatsächlichen Dateigröße
        if (filesize(pult_file_pfad($fid)) > 26214400) {
            @unlink(pult_file_pfad($fid));
            pult_json_fehler('Datei zu groß (max 25 MB)', 413);
        }
        $name = pult_kurz(str_replace(["\r", "\n"], '', (string) ($_FILES['datei']['name'] ?? 'Datei')), 255);
        store_write(pult_file_meta_pfad($fid), ['name' => $name, 'size' => $groesse]);
        pult_json_ok(['datei' => ['id' => $fid, 'name' => $name, 'size' => $groesse]]);
        break;

    // Datei herunterladen (immer als Anhang, nie inline ausgeführt)
    case 'file_get':
        require_login_api();
        $fid = $_GET['file'] ?? '';
        if (!pult_block_id_ok($fid) || !is_file(pult_file_pfad($fid))) {
            pult_json_fehler('nicht gefunden', 404);
        }
        $meta = store_read(pult_file_meta_pfad($fid), []);
        $name = (string) ($meta['name'] ?? 'datei');
        // ASCII-Fallback (nur Druckbares, ohne Header-Sonderzeichen) + UTF-8-Variante (RFC 5987)
        $ascii = preg_replace('/[^\x20-\x7E]/', '_', $name);
        $ascii = str_replace(['\\', '"', ';'], '_', $ascii);
        if ($ascii === '') {
            $ascii = 'datei';
        }
        $pfad = pult_file_pfad($fid);
        header('Content-Type: application/octet-stream');     // überschreibt den JSON-Header
        header('Content-Disposition: attachment; filename="' . $ascii . '"; filename*=UTF-8\'\'' . rawurlencode($name));
        header('Content-Length: ' . filesize($pfad));
        header('X-Content-Type-Options: nosniff');
        readfile($pfad);
        exit;

    // Datei löschen (POST JSON: csrf, file)
    case 'file_delete':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $fid = $body['file'] ?? '';
        if (!pult_block_id_ok($fid)) {
            pult_json_fehler('ungültige ID');
        }
        pult_file_delete($fid);
        pult_json_ok();
        break;

    // Einstellungen lesen — NIE Geheimnisse (Schlüssel/Passwort) zurückgeben, nur „gesetzt?"
    case 'einstellung_get':
        require_login_api();
        $e = pult_config()['einstellungen'] ?? [];
        $konten = array_map(function ($k) {
            return [
                'id'          => (string) ($k['id'] ?? ''),
                'name'        => (string) ($k['name'] ?? ''),
                'host'        => (string) ($k['host'] ?? ''),
                'port'        => (int) ($k['port'] ?? 993),
                'user'        => (string) ($k['user'] ?? ''),
                'pw_gesetzt'  => ((string) ($k['pw_enc'] ?? '')) !== '',
                // SMTP-Versand (keine Geheimnisse — Passwort ist dasselbe wie IMAP)
                'smtp_host'   => (string) ($k['smtp_host'] ?? ''),
                'smtp_port'   => (int) ($k['smtp_port'] ?? 465),
                'smtp_secure' => (string) ($k['smtp_secure'] ?? 'ssl'),
                'absender'    => (string) ($k['absender'] ?? ''),
            ];
        }, pult_mailkonten());
        $kalender = array_map(function ($k) {
            return [
                'id'   => (string) ($k['id'] ?? ''),
                'name' => (string) ($k['name'] ?? ''),
                'url'  => pult_klartext((string) ($k['url'] ?? '')),   // für die Anzeige im Bearbeiten-Popup entschlüsseln
            ];
        }, pult_kalender());
        pult_json_ok(['einstellungen' => [
            'owm_key_gesetzt' => ((string) ($e['owm_key'] ?? '')) !== '',
            'kalender'        => array_values($kalender),
            'mailkonten'      => array_values($konten),
            'chatnamen'       => pult_chatnamen(),
        ]]);
        break;

    // Einstellungen speichern (zentral). Geheimnisse nur überschreiben, wenn ein Wert kommt.
    case 'einstellung_save':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $cfg = pult_config();
        if (!isset($cfg['einstellungen']) || !is_array($cfg['einstellungen'])) {
            $cfg['einstellungen'] = [];
        }
        $e = &$cfg['einstellungen'];
        if (isset($body['owm_key']) && (string) $body['owm_key'] !== '') {
            $e['owm_key'] = pult_geheim(pult_kurz((string) $body['owm_key'], 100));
        } elseif (isset($e['owm_key']) && (string) $e['owm_key'] !== '' && !pult_ist_geheim((string) $e['owm_key'])) {
            $e['owm_key'] = pult_geheim((string) $e['owm_key']);   // Altbestand (Klartext) migrieren
        }
        if (isset($body['kalender']) && is_array($body['kalender'])) {
            // bestehende IDs merken (damit die Block-Auswahl der Flächen erhalten bleibt)
            $altIds = [];
            foreach (pult_kalender() as $k) {
                $altIds[(string) ($k['id'] ?? '')] = true;
            }
            $neu = [];
            $verwendet = [];
            foreach ($body['kalender'] as $k) {
                if (!is_array($k) || count($neu) >= 20) {
                    continue;
                }
                $name = pult_kurz((string) ($k['name'] ?? ''), 60);
                // nur http/https zulassen (pult_clean_url leert ungültige Schemata)
                $url = pult_clean_url(pult_kurz((string) ($k['url'] ?? ''), 2000));
                if ($url === '') {
                    continue;   // ohne gültige Adresse kein Eintrag
                }
                // ID nur übernehmen, wenn sie zu einem bestehenden Kalender gehört und noch frei ist
                $id = (string) ($k['id'] ?? '');
                if (!isset($altIds[$id]) || isset($verwendet[$id]) || $id === '') {
                    $id = pult_kalender_id();
                }
                $verwendet[$id] = true;
                $neu[] = [
                    'id'   => $id,
                    'name' => $name !== '' ? $name : 'Kalender',
                    'url'  => pult_geheim($url),   // Kalender-Adresse verschlüsselt ablegen (Token im Pfad)
                ];
            }
            $e['kalender'] = $neu;
            unset($e['kalender_url']);   // altes Einzel-URL-Format ablösen
        }
        if (isset($body['mailkonten']) && is_array($body['mailkonten'])) {
            // bestehende verschlüsselte Passwörter nach ID merken (wenn unverändert)
            $alt = [];
            foreach (pult_mailkonten() as $k) {
                $alt[(string) ($k['id'] ?? '')] = $k;
            }
            $neu = [];
            $verwendet = [];
            foreach ($body['mailkonten'] as $k) {
                if (!is_array($k) || count($neu) >= 20) {
                    continue;
                }
                $name = pult_kurz((string) ($k['name'] ?? ''), 60);
                $host = pult_kurz((string) ($k['host'] ?? ''), 255);
                $user = pult_kurz((string) ($k['user'] ?? ''), 255);
                if ($name === '' && $host === '' && $user === '') {
                    continue;   // komplett leere Zeile überspringen
                }
                // ID nur übernehmen, wenn sie zu einem bestehenden Konto gehört und noch frei ist
                $id = (string) ($k['id'] ?? '');
                if (!isset($alt[$id]) || isset($verwendet[$id])) {
                    $id = pult_mailkonto_id();
                }
                $verwendet[$id] = true;
                $konto = [
                    'id'   => $id,
                    'name' => $name !== '' ? $name : 'Postfach',
                    'host' => $host,
                    'port' => max(1, min(65535, (int) ($k['port'] ?? 993))),
                    'user' => $user,
                    // SMTP-Versand (optional): Host + Port 465/587 + Verschlüsselung + Absenderadresse.
                    // Passwort = dasselbe wie IMAP (pw_enc), kein zweites Geheimnis.
                    'smtp_host'   => pult_kurz((string) ($k['smtp_host'] ?? ''), 255),
                    'smtp_port'   => in_array((int) ($k['smtp_port'] ?? 465), [465, 587], true) ? (int) $k['smtp_port'] : 465,
                    'smtp_secure' => (((string) ($k['smtp_secure'] ?? 'ssl')) === 'starttls') ? 'starttls' : 'ssl',
                    'absender'    => pult_kurz((string) ($k['absender'] ?? ''), 255),
                ];
                $pwNeu = (string) ($k['passwort'] ?? '');
                if ($pwNeu !== '') {
                    $konto['pw_enc'] = pult_encrypt($pwNeu);
                } else {
                    $konto['pw_enc'] = (string) ($alt[$id]['pw_enc'] ?? '');
                }
                $neu[] = $konto;
            }
            $e['mailkonten'] = $neu;
            unset($e['mail']);   // altes Einzelkonto-Format ablösen
        }
        if (isset($body['chatnamen']) && is_array($body['chatnamen'])) {
            $namen = [];
            foreach ($body['chatnamen'] as $n) {
                $n = mb_substr(trim((string) $n), 0, 40);
                if ($n !== '' && !in_array($n, $namen, true)) {
                    $namen[] = $n;
                }
                if (count($namen) >= 30) {
                    break;
                }
            }
            $e['chatnamen'] = $namen;
        }
        unset($e);
        if (!store_write(PULT_CONFIG, $cfg)) {
            pult_json_fehler('Speichern fehlgeschlagen', 500);
        }
        pult_config(true);
        pult_json_ok();
        break;

    // Wetter (OpenWeatherMap) — Schlüssel kommt aus config.json, nie vom Client
    case 'wetter':
        require_login_api();
        $ort = trim((string) ($_GET['ort'] ?? ''));
        if ($ort === '' || mb_strlen($ort) > 120) {
            pult_json_fehler('Ort fehlt');
        }
        $key = pult_klartext((string) (pult_config()['einstellungen']['owm_key'] ?? ''));
        if ($key === '') {
            http_response_code(400);
            echo json_encode(['ok' => false, 'fehler' => 'API-Schlüssel fehlt', 'brauchtSchluessel' => true]);
            exit;
        }
        $ckey  = 'wetter_' . md5(mb_strtolower($ort));
        $cache = pult_cache_get($ckey, 900);   // 15 Minuten
        if ($cache !== null) {
            pult_json_ok(['wetter' => $cache, 'cache' => true]);
        }
        $url = 'https://api.openweathermap.org/data/2.5/weather?units=metric&lang=de&q='
            . rawurlencode($ort) . '&appid=' . rawurlencode($key);
        $rohbody = pult_fetch($url, 262144, 8, true);   // strikt: ohne cURL kein unsicherer Fallback
        if ($rohbody === null) {
            pult_json_fehler('Wetterdienst nicht erreichbar', 502);
        }
        $d = json_decode($rohbody, true);
        if (!is_array($d) || (int) ($d['cod'] ?? 0) !== 200) {
            pult_json_fehler('Ort nicht gefunden', 404);
        }
        $wetter = [
            'ort'          => (string) ($d['name'] ?? $ort),
            'temp'         => isset($d['main']['temp']) ? (int) round((float) $d['main']['temp']) : null,
            'gefuehlt'     => isset($d['main']['feels_like']) ? (int) round((float) $d['main']['feels_like']) : null,
            'beschreibung' => (string) ($d['weather'][0]['description'] ?? ''),
            'icon'         => (string) ($d['weather'][0]['icon'] ?? ''),
            'feuchte'      => isset($d['main']['humidity']) ? (int) $d['main']['humidity'] : null,
            'wind'         => isset($d['wind']['speed']) ? (int) round((float) $d['wind']['speed'] * 3.6) : null,
        ];
        // 3-Tage-Vorschau aus dem 5-Tage/3-Stunden-Forecast (gleiche Free-API, gleicher Schlüssel).
        // Fehlschlag ist unkritisch: dann bleibt vorschau leer und nur das aktuelle Wetter erscheint.
        $vorschau = [];
        $furl = 'https://api.openweathermap.org/data/2.5/forecast?units=metric&lang=de&q='
            . rawurlencode($ort) . '&appid=' . rawurlencode($key);
        $froh = pult_fetch($furl, 524288, 8, true);
        if ($froh !== null) {
            $fd = json_decode($froh, true);
            if (is_array($fd) && isset($fd['list']) && is_array($fd['list'])) {
                $heute = date('Y-m-d');
                $tage  = [];   // datum => [min, max, icon, besch, naehe12]
                foreach ($fd['list'] as $eintrag) {
                    $txt = (string) ($eintrag['dt_txt'] ?? '');
                    if (strlen($txt) < 13) {
                        continue;
                    }
                    $datum = substr($txt, 0, 10);
                    if ($datum <= $heute) {
                        continue;   // nur kommende Tage
                    }
                    $stunde = (int) substr($txt, 11, 2);
                    $temp   = isset($eintrag['main']['temp']) ? (float) $eintrag['main']['temp'] : null;
                    if (!isset($tage[$datum])) {
                        $tage[$datum] = ['min' => $temp, 'max' => $temp, 'icon' => '', 'besch' => '', 'naehe12' => 99];
                    }
                    if ($temp !== null) {
                        if ($tage[$datum]['min'] === null || $temp < $tage[$datum]['min']) {
                            $tage[$datum]['min'] = $temp;
                        }
                        if ($tage[$datum]['max'] === null || $temp > $tage[$datum]['max']) {
                            $tage[$datum]['max'] = $temp;
                        }
                    }
                    // repräsentatives Symbol: Eintrag am nächsten zu 12:00 Uhr
                    $dist = abs($stunde - 12);
                    if ($dist < $tage[$datum]['naehe12']) {
                        $tage[$datum]['naehe12'] = $dist;
                        $tage[$datum]['icon']    = (string) ($eintrag['weather'][0]['icon'] ?? '');
                        $tage[$datum]['besch']   = (string) ($eintrag['weather'][0]['description'] ?? '');
                    }
                }
                foreach ($tage as $datum => $t) {
                    if (count($vorschau) >= 3) {
                        break;
                    }
                    $vorschau[] = [
                        'datum'        => $datum,
                        'min'          => $t['min'] !== null ? (int) round((float) $t['min']) : null,
                        'max'          => $t['max'] !== null ? (int) round((float) $t['max']) : null,
                        'icon'         => $t['icon'],
                        'beschreibung' => $t['besch'],
                    ];
                }
            }
        }
        $wetter['vorschau'] = $vorschau;
        pult_cache_set($ckey, $wetter);
        pult_json_ok(['wetter' => $wetter]);
        break;

    // Wirtschaft: vier Jahres-Verläufe (Gold, Bitcoin, Euro/USD, US-Dollar-Index), auf 100% normiert.
    // Schlüssellose Quellen: CoinGecko (Bitcoin, PAX-Gold ≈ Gold/Unze) + Frankfurter (EUR/USD + Dollar-Korb).
    case 'wirtschaft':
        require_login_api();
        $spannen = ['1w' => 7, '1m' => 30, '3m' => 90, '1y' => 365, '2y' => 730, '5y' => 1825];
        $sp = (string) ($_GET['spanne'] ?? '1y');
        if (!isset($spannen[$sp])) {
            $sp = '1y';
        }
        $tage = $spannen[$sp];
        $cache = pult_cache_get('wirtschaft_' . $sp, 21600);   // 6 Stunden je Spanne
        if ($cache !== null) {
            pult_json_ok(['reihen' => $cache, 'spanne' => $sp, 'cache' => true]);
        }
        $startTs = time() - $tage * 86400;
        $reihen = [];

        // CoinGecko: Bitcoin + Gold (PAX-Gold) in USD.
        // Die kostenlose API liefert höchstens die letzten 365 Tage — längere Anfragen
        // werden abgewiesen. Deshalb bei 2/5 Jahren auf 365 Tage kappen und die Reihe
        // als Teilverlauf kennzeichnen (statt sie kommentarlos wegzulassen).
        $cgTage = min($tage, 365);
        foreach ([['bitcoin', 'Bitcoin', '#f7931a'], ['pax-gold', 'Gold', '#e0b100']] as $cg) {
            $roh = pult_fetch('https://api.coingecko.com/api/v3/coins/' . $cg[0] . '/market_chart?vs_currency=usd&days=' . $cgTage, 2097152, 8, true);
            $d   = $roh !== null ? json_decode($roh, true) : null;
            $pts = (is_array($d) && isset($d['prices']) && is_array($d['prices'])) ? $d['prices'] : [];
            $werte = [];
            foreach ($pts as $p) {
                if (!is_array($p) || count($p) < 2) {
                    continue;
                }
                $werte[] = ['t' => round(((float) $p[0] / 1000.0 - $startTs) / 86400.0, 3), 'v' => (float) $p[1]];
            }
            if ($werte) {
                $reihe = ['key' => $cg[0], 'name' => $cg[1], 'farbe' => $cg[2], 'werte' => $werte];
                if ($cgTage < $tage) {
                    $reihe['teil'] = 'nur letzte 12 Monate';   // Datenquelle deckt die Spanne nicht ab
                }
                $reihen[] = $reihe;
            }
        }

        // Frankfurter: EUR/USD + US-Dollar-Index (ICE-Formel) aus dem Währungskorb
        $roh = pult_fetch('https://api.frankfurter.dev/v1/' . date('Y-m-d', $startTs) . '..' . date('Y-m-d')
            . '?base=USD&symbols=EUR,JPY,GBP,CAD,SEK,CHF', 2097152, 8, true);
        $d     = $roh !== null ? json_decode($roh, true) : null;
        $rates = (is_array($d) && isset($d['rates']) && is_array($d['rates'])) ? $d['rates'] : [];
        ksort($rates);
        $eur = [];
        $dxy = [];
        foreach ($rates as $tag => $r) {
            if (!is_array($r)) {
                continue;
            }
            $ts = strtotime($tag . ' 00:00:00 UTC');
            if ($ts === false) {
                continue;
            }
            $off = round(($ts - $startTs) / 86400.0, 3);
            $e = (float) ($r['EUR'] ?? 0); $j = (float) ($r['JPY'] ?? 0); $g = (float) ($r['GBP'] ?? 0);
            $c = (float) ($r['CAD'] ?? 0); $s = (float) ($r['SEK'] ?? 0); $f = (float) ($r['CHF'] ?? 0);
            if ($e > 0) {
                $eur[] = ['t' => $off, 'v' => 1.0 / $e];   // EUR/USD = 1 / (USD→EUR)
            }
            if ($e > 0 && $j > 0 && $g > 0 && $c > 0 && $s > 0 && $f > 0) {
                $idx = 50.14348112 * pow($e, 0.576) * pow($j, 0.136) * pow($g, 0.119)
                    * pow($c, 0.091) * pow($s, 0.042) * pow($f, 0.036);
                $dxy[] = ['t' => $off, 'v' => $idx];
            }
        }
        if ($eur) {
            $reihen[] = ['key' => 'eurusd', 'name' => 'Euro (EUR/USD)', 'farbe' => '#3b6fd4', 'werte' => $eur];
        }
        if ($dxy) {
            $reihen[] = ['key' => 'dxy', 'name' => 'US-Dollar (Index)', 'farbe' => '#2e9e5b', 'werte' => $dxy];
        }

        if (!$reihen) {
            pult_json_fehler('Wirtschaftsdaten gerade nicht erreichbar', 502);
        }
        // Jede Reihe auf 100% normieren (erster Wert = 100) und Jahresänderung berechnen.
        foreach ($reihen as &$reihe) {
            $basis = (float) ($reihe['werte'][0]['v'] ?? 0);
            if ($basis == 0.0) {
                $basis = 1.0;
            }
            foreach ($reihe['werte'] as &$w) {
                $w['v'] = round($w['v'] / $basis * 100.0, 2);
            }
            unset($w);
            $letzte = end($reihe['werte']);
            $reihe['aenderung'] = round(((float) $letzte['v']) - 100.0, 1);
        }
        unset($reihe);
        pult_cache_set('wirtschaft_' . $sp, $reihen);
        pult_json_ok(['reihen' => $reihen, 'spanne' => $sp]);
        break;

    // Kalender (ICS-Feed) — Adresse aus den zentralen Einstellungen, SSRF-geschützt + strikt
    case 'kalender':
        require_login_api();
        $kid   = (string) ($_GET['kalender'] ?? '');
        $url   = '';
        $liste = pult_kalender();
        foreach ($liste as $k) {
            if ((string) ($k['id'] ?? '') === $kid && $kid !== '') {
                $url = trim(pult_klartext((string) ($k['url'] ?? '')));   // Adresse entschlüsseln
                break;
            }
        }
        // Fallback: ohne (oder mit unbekannter) ID den ersten Kalender nehmen
        if ($url === '' && $liste) {
            $url = trim(pult_klartext((string) ($liste[0]['url'] ?? '')));
        }
        if ($url === '') {
            pult_json_fehler('Kein Kalender in den Einstellungen hinterlegt');
        }
        // Cache zuerst prüfen — spart bei einem Treffer den DNS-Lookup der SSRF-Prüfung
        $ckey  = 'kal_' . md5($url);
        $cache = pult_cache_get($ckey, 900);
        if ($cache !== null) {
            pult_json_ok(['termine' => $cache, 'cache' => true]);
        }
        // SSRF-Prüfung nur auf dem echten Abruf-Pfad (DNS-Auflösung + IP-Whitelist)
        if (!pult_url_erlaubt($url)) {
            pult_json_fehler('Kalender-Adresse nicht erlaubt (nur http/https, keine internen Server)');
        }
        $erg = pult_fetch_info($url, 1048576, 8, true);   // strikt: ohne cURL kein Fallback
        $roh = $erg['body'];
        if ($roh === null) {
            pult_json_fehler('Kalender nicht erreichbar (' . ($erg['fehler'] ?? 'unbekannt') . ')', 502);
        }
        $jetzt   = time();
        $kommend = [];
        foreach (pult_ics_parse($roh) as $e) {
            if (empty($e['start'])) {
                continue;
            }
            $ende = $e['end'] ?? $e['start'];
            if ($ende < $jetzt - 86400) {
                continue;   // vorbei (älter als gestern)
            }
            $kommend[] = [
                'start' => (int) $e['start'],
                'titel' => mb_substr((string) ($e['summary'] ?? '(ohne Titel)'), 0, 200),
                'ort'   => mb_substr((string) ($e['ort'] ?? ''), 0, 200),
            ];
            if (count($kommend) >= 200) {
                break;
            }
        }
        usort($kommend, function ($a, $b) { return $a['start'] <=> $b['start']; });
        $kommend = array_slice($kommend, 0, 12);
        pult_cache_set($ckey, $kommend);
        pult_json_ok(['termine' => $kommend]);
        break;

    // RSS/Atom-Feed — nutzerdefinierte URL, daher SSRF-geschützt + strikt
    case 'rss':
        require_login_api();
        $url = trim((string) ($_GET['url'] ?? ''));
        if ($url === '' || mb_strlen($url) > 2000) {
            pult_json_fehler('Adresse fehlt');
        }
        // Cache zuerst prüfen — spart bei einem Treffer den DNS-Lookup der SSRF-Prüfung
        $ckey  = 'rss_' . md5($url);
        $cache = pult_cache_get($ckey, 900);
        if ($cache !== null) {
            pult_json_ok(['eintraege' => $cache, 'cache' => true]);
        }
        // SSRF-Prüfung nur auf dem echten Abruf-Pfad (DNS-Auflösung + IP-Whitelist)
        if (!pult_url_erlaubt($url)) {
            pult_json_fehler('Adresse nicht erlaubt (nur http/https, keine internen Server)');
        }
        $ergRss = pult_fetch_info($url, 1048576, 8, true);
        $rohrss = $ergRss['body'];
        if ($rohrss === null) {
            pult_json_fehler('Feed nicht erreichbar (' . ($ergRss['fehler'] ?? 'unbekannt') . ')', 502);
        }
        $eintraege = pult_rss_parse($rohrss);
        pult_cache_set($ckey, $eintraege);
        pult_json_ok(['eintraege' => $eintraege]);
        break;

    // Mail: Posteingang (neueste Kopfzeilen) — gewähltes Konto
    case 'mail_liste':
        require_login_api();
        if (!pult_mail_verfuegbar()) {
            pult_json_fehler('imap-fehlt', 501);
        }
        $imap = pult_mail_handle($_GET['konto'] ?? '');
        $nachrichten = pult_mail_liste($imap, 15);
        @imap_close($imap);
        @imap_errors();
        pult_json_ok(['nachrichten' => $nachrichten]);
        break;

    // Mail: Klartext einer Nachricht — gewähltes Konto
    case 'mail_text':
        require_login_api();
        if (!pult_mail_verfuegbar()) {
            pult_json_fehler('imap-fehlt', 501);
        }
        $uid = (int) ($_GET['uid'] ?? 0);
        if ($uid <= 0) {
            pult_json_fehler('ungültige Nachricht');
        }
        $imap = pult_mail_handle($_GET['konto'] ?? '');
        $text = pult_mail_text($imap, $uid);
        @imap_close($imap);
        @imap_errors();
        pult_json_ok(['text' => $text]);
        break;

    // Mail senden (SMTP) — genau ein Empfänger, nur Text. Absender fest aus dem Konto.
    case 'mail_senden':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        // Nur im EIGENEN Dashboard senden — beigetretene Kollaboratoren dürfen nicht
        // über die SMTP-Zugangsdaten des Eigentümers Mails im dessen Namen verschicken.
        if (defined('PULT_PLATFORM') && PULT_PLATFORM
            && defined('PULT_DASH_OWNER') && PULT_DASH_OWNER !== pult_dash_eigner()) {
            pult_json_fehler('Senden ist nur in eigenen Dashboards möglich.', 403);
        }
        $kontoId = (string) ($body['konto'] ?? '');
        $an      = trim((string) ($body['an'] ?? ''));
        $betreff = trim((string) ($body['betreff'] ?? ''));
        $text    = (string) ($body['text'] ?? '');
        if (!filter_var($an, FILTER_VALIDATE_EMAIL)) {
            pult_json_fehler('Empfängeradresse ungültig');
        }
        if (trim($text) === '' && $betreff === '') {
            pult_json_fehler('Leere Nachricht');
        }
        $konto = null;
        foreach (pult_mailkonten() as $k) {
            if ((string) ($k['id'] ?? '') === $kontoId) { $konto = $k; break; }
        }
        if ($konto === null) {
            pult_json_fehler('Konto nicht gefunden', 404);
        }
        if ((string) ($konto['smtp_host'] ?? '') === '') {
            pult_json_fehler('Für dieses Konto ist kein SMTP-Versand eingerichtet.');
        }
        // Einfache Missbrauchsbremse: max. 30 gesendete Mails pro Stunde je Instanz
        if (!pult_ratelimit('mail_senden', 30, 3600)) {
            pult_json_fehler('Zu viele gesendete Mails — bitte später erneut versuchen.', 429);
        }
        $fehler = pult_smtp_senden($konto, $an, $betreff, $text);
        if ($fehler !== '') {
            pult_json_fehler($fehler, 502);
        }
        pult_json_ok();
        break;

    // Chat: letzte Nachrichten lesen
    case 'chat_liste':
        require_login_api();
        $chat  = store_read(PULT_CHAT, ['nachrichten' => []]);
        $liste = is_array($chat['nachrichten'] ?? null) ? $chat['nachrichten'] : [];
        pult_json_ok(['nachrichten' => array_slice($liste, -100)]);
        break;

    // Chat: Nachricht senden — Name muss aus der erlaubten Liste stammen
    case 'chat_senden':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $name   = trim((string) ($body['name'] ?? ''));
        $text   = trim((string) ($body['text'] ?? ''));
        $namen  = pult_chatnamen();
        $treffer = array_search($name, $namen, true);
        if ($treffer === false) {
            pult_json_fehler('unbekannter Name');
        }
        if ($text === '') {
            pult_json_fehler('leere Nachricht');
        }
        // kanonischen (bereits gekürzten) Namen aus der Liste verwenden
        $eintrag = ['name' => $namen[$treffer], 'text' => mb_substr($text, 0, 1000), 'zeit' => time()];
        if (!pult_chat_anhaengen($eintrag)) {
            pult_json_fehler('Speichern fehlgeschlagen', 500);
        }
        pult_json_ok();
        break;

    // ---- Dashboards verwalten (eigene) ----

    case 'dash_create':
    case 'dash_rename':
    case 'dash_delete':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        $basis = pult_dash_basis_von(pult_dash_eigner());
        if ($basis === null) {
            pult_json_fehler('nicht verfügbar');
        }
        $items = pult_dash_liste($basis);
        if ($action === 'dash_create') {
            if (count($items) >= 50) {
                pult_json_fehler('Zu viele Dashboards (max. 50)');
            }
            $name = pult_kurz((string) ($body['name'] ?? ''), 60);
            if ($name === '') { $name = 'Neues Dashboard'; }
            $id = pult_dash_gen_id();
            $items[] = ['id' => $id, 'name' => $name];
            @mkdir(pult_dash_dir($basis, $id), 0775, true);
            if (!pult_dash_speichern($basis, $items)) {
                pult_json_fehler('Speichern fehlgeschlagen', 500);
            }
            pult_json_ok(['id' => $id]);
        }
        $id = (string) ($body['id'] ?? '');
        if (!pult_dash_id_ok($id)) {
            pult_json_fehler('ungültige ID');
        }
        $pos = -1;
        foreach ($items as $i => $it) {
            if (($it['id'] ?? '') === $id) { $pos = $i; break; }
        }
        if ($pos < 0) {
            pult_json_fehler('Dashboard nicht gefunden', 404);
        }
        if ($action === 'dash_rename') {
            $name = pult_kurz((string) ($body['name'] ?? ''), 60);
            if ($name === '') {
                pult_json_fehler('Name fehlt');
            }
            $items[$pos]['name'] = $name;
            if (!pult_dash_speichern($basis, $items)) {
                pult_json_fehler('Speichern fehlgeschlagen', 500);
            }
        } else { // dash_delete
            array_splice($items, $pos, 1);
            pult_dash_speichern($basis, $items);
            pult_rrmdir(pult_dash_dir($basis, $id));
            if (($_SESSION['ff_dash'] ?? '') === pult_dash_eigner() . '/' . $id) {
                unset($_SESSION['ff_dash']);
            }
        }
        pult_json_ok();
        break;

    // ---- Geteiltes Dashboard verlassen (aus benutzer.json.joined entfernen) ----
    case 'dash_leave':
        require_login_api();
        if ($method !== 'POST') {
            pult_json_fehler('nur POST', 405);
        }
        $body = pult_body();
        if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
            pult_json_fehler('CSRF', 403);
        }
        if (!defined('PULT_PLATFORM') || !PULT_PLATFORM) {
            pult_json_fehler('nicht verfügbar');
        }
        $o = (string) ($body['o'] ?? '');
        $d = (string) ($body['d'] ?? '');
        $bfDatei = PULT_APPDATA . '/' . PULT_ACCOUNT_UID . '/benutzer.json';
        $bu = store_read($bfDatei, []);
        if (is_array($bu['joined'] ?? null)) {
            $bu['joined'] = array_values(array_filter($bu['joined'], function ($e) use ($o, $d) {
                return !(is_array($e) && ($e['o'] ?? '') === $o && ($e['d'] ?? '') === $d);
            }));
            store_write($bfDatei, $bu);
        }
        if (($_SESSION['ff_dash'] ?? '') === $o . '/' . $d) {
            unset($_SESSION['ff_dash']);
        }
        pult_json_ok();
        break;

    // ---- Freigabe pro (eigenem) Dashboard — nur Plattform ----

    case 'freigabe_get':
    case 'freigabe_create':
    case 'freigabe_revoke':
        require_login_api();
        $istPost = $action !== 'freigabe_get';
        if ($istPost) {
            if ($method !== 'POST') {
                pult_json_fehler('nur POST', 405);
            }
            $body = pult_body();
            if ($body === null || !csrf_valid($body['csrf'] ?? null)) {
                pult_json_fehler('CSRF', 403);
            }
        }
        if (!defined('PULT_PLATFORM') || !PULT_PLATFORM) {
            pult_json_ok(['verfuegbar' => false]);
        }
        $eigner = pult_dash_eigner();
        $fremd  = defined('PULT_DASH_OWNER') && PULT_DASH_OWNER !== $eigner;
        $did    = $istPost ? (string) ($body['id'] ?? '') : (string) ($_GET['id'] ?? '');
        if ($did === '' && defined('PULT_DASH_ID') && !$fremd) {
            $did = PULT_DASH_ID;   // das gerade offene eigene Dashboard
        }
        if (!pult_dash_id_ok($did)) {
            pult_json_ok([
                'verfuegbar' => true, 'eigen' => false, 'fremd' => $fremd,
                'ownerName' => $fremd ? pult_dash_name(PULT_DASH_OWNER, PULT_DASH_ID) : '',
            ]);
        }
        $basis = pult_dash_basis_von($eigner);
        $items = pult_dash_liste($basis);
        $pos = -1;
        foreach ($items as $i => $it) {
            if (($it['id'] ?? '') === $did) { $pos = $i; break; }
        }
        if ($pos < 0) {
            pult_json_fehler('Dashboard nicht gefunden', 404);
        }
        if ($action === 'freigabe_create') {
            $items[$pos]['share_token'] = bin2hex(random_bytes(16));
        } elseif ($action === 'freigabe_revoke') {
            unset($items[$pos]['share_token']);
        }
        if ($istPost && !pult_dash_speichern($basis, $items)) {
            pult_json_fehler('Speichern fehlgeschlagen', 500);
        }
        if ($action === 'freigabe_revoke') {
            // Rückwirkend (erst NACH erfolgreich persistiertem Token-Entzug): bereits
            // beigetretene Konten verlieren den Zugriff sofort — ihre joined-Einträge
            // für dieses Dashboard werden aus allen benutzer.json entfernt.
            foreach (glob(PULT_APPDATA . '/u_*', GLOB_ONLYDIR) ?: [] as $kontoDir) {
                if (!preg_match('/^u_[a-f0-9]{24}$/', basename($kontoDir))) {
                    continue;
                }
                $bfDatei = $kontoDir . '/benutzer.json';
                if (!is_file($bfDatei)) {
                    continue;
                }
                $bu = store_read($bfDatei, []);
                if (!is_array($bu['joined'] ?? null)) {
                    continue;
                }
                $vorher = count($bu['joined']);
                $bu['joined'] = array_values(array_filter($bu['joined'], function ($e) use ($eigner, $did) {
                    return !(is_array($e) && ($e['o'] ?? '') === $eigner && ($e['d'] ?? '') === $did);
                }));
                if (count($bu['joined']) !== $vorher) {
                    store_write($bfDatei, $bu);
                }
            }
        }
        $token = (string) ($items[$pos]['share_token'] ?? '');
        // Freigabelink auf der aktuellen Instanz aufbauen (nicht fest auf eine Domain)
        $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
        $host   = (string) ($_SERVER['HTTP_HOST'] ?? '');
        $basisUrl = $host !== '' ? ($scheme . '://' . $host) : '';
        pult_json_ok([
            'verfuegbar' => true,
            'eigen'      => true,
            'fremd'      => $fremd,
            'geteilt'    => $token !== '',
            'name'       => (string) ($items[$pos]['name'] ?? ''),
            'link'       => ($token !== '' && $basisUrl !== '') ? ($basisUrl . '/app/?p=join&o=' . $eigner . '&d=' . $did . '&t=' . $token) : '',
        ]);
        break;

    default:
        pult_json_fehler('unbekannte Aktion', 404);
}
