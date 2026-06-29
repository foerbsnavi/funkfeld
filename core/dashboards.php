<?php
declare(strict_types=1);

/**
 * Mehrere Dashboards je Konto (Plattform) bzw. Instanz (Standalone).
 *
 * Datenmodell:
 *   <basis>/dashboards.json   = {"items":[{"id","name","share_token"?}]}
 *   <basis>/d/<id>/           = ein Dashboard (dashboard.json, blocks/, files/, cache/, chat.json, config.json)
 * Plattform-Basis: app_daten/<konto-uid>   ·   Standalone-Basis: data/
 * Beigetretene (geteilte) Dashboards stehen platform in benutzer.json.joined = [{o,d,name}].
 */

function pult_dash_id_ok($id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,32}$/', $id) === 1;
}

function pult_dash_gen_id(): string
{
    return 'd' . bin2hex(random_bytes(5));
}

/** Eigner-Kennung des aktuellen Nutzers (Plattform: Konto-UID, Standalone: 'self'). */
function pult_dash_eigner(): string
{
    return (defined('PULT_PLATFORM') && PULT_PLATFORM) ? PULT_ACCOUNT_UID : 'self';
}

/** Basisverzeichnis der Dashboards eines Eigners (oder null bei ungültiger Eigner-Kennung). */
function pult_dash_basis_von(string $eigner): ?string
{
    if (defined('PULT_PLATFORM') && PULT_PLATFORM) {
        if (preg_match('/^u_[a-f0-9]{24}$/', $eigner) !== 1) {
            return null;
        }
        return PULT_APPDATA . '/' . $eigner;
    }
    return PULT_ROOT . '/data';   // Standalone: ein einziger Eigner ('self')
}

function pult_dash_index_pfad(string $basis): string { return $basis . '/dashboards.json'; }
function pult_dash_dir(string $basis, string $id): string { return $basis . '/d/' . $id; }

/** Liste der EIGENEN Dashboards (mit Einmal-Migration eines alten Einzel-Dashboards). */
function pult_dash_liste(string $basis): array
{
    $idx = store_read(pult_dash_index_pfad($basis), null);
    if (is_array($idx) && isset($idx['items']) && is_array($idx['items'])) {
        return $idx['items'];
    }

    // --- Einmal-Migration ---
    $items = [];
    if (defined('PULT_PLATFORM') && PULT_PLATFORM) {
        // Altes Einzel-Dashboard: <basis>/funkfeld → d/d0
        if (is_dir($basis . '/funkfeld')) {
            @mkdir($basis . '/d', 0775, true);
            if (@rename($basis . '/funkfeld', $basis . '/d/d0')) {
                $items[] = ['id' => 'd0', 'name' => 'Mein Dashboard'];
            }
        }
    } else {
        // Standalone: altes Dashboard lag direkt in data/ → Inhalt nach d/d0.
        // Der Login-Hash bleibt instanzweit in data/config.json (PULT_INSTALL_CONFIG);
        // die Widget-Einstellungen (config.json) und der Krypto-Schlüssel (key.bin) sind
        // dagegen pro Dashboard und müssen mitwandern, sonst gehen Einstellungen verloren
        // bzw. lassen sich gespeicherte Mail-Passwörter nicht mehr entschlüsseln.
        if (is_file($basis . '/dashboard.json')) {
            $ziel = $basis . '/d/d0';
            @mkdir($ziel, 0775, true);
            foreach (['dashboard.json', 'chat.json', 'chat.json.lock', 'blocks', 'files', 'cache', 'key.bin'] as $f) {
                if (file_exists($basis . '/' . $f)) {
                    @rename($basis . '/' . $f, $ziel . '/' . $f);
                }
            }
            // Einstellungen aus der alten (instanzweiten) config.json ins erste Dashboard übernehmen.
            $altCfg = store_read($basis . '/config.json', []);
            if (isset($altCfg['einstellungen']) && is_array($altCfg['einstellungen'])) {
                store_write($ziel . '/config.json', ['einstellungen' => $altCfg['einstellungen']]);
            }
            $items[] = ['id' => 'd0', 'name' => 'Mein Dashboard'];
        }
    }
    store_write(pult_dash_index_pfad($basis), ['items' => $items]);
    return $items;
}

function pult_dash_speichern(string $basis, array $items): bool
{
    return store_write(pult_dash_index_pfad($basis), ['items' => array_values($items)]);
}

/** Beigetretene (geteilte) Dashboards des aktuellen Kontos (nur Plattform). */
function pult_dash_joined(): array
{
    if (!defined('PULT_PLATFORM') || !PULT_PLATFORM) {
        return [];
    }
    $bu = store_read(PULT_APPDATA . '/' . PULT_ACCOUNT_UID . '/benutzer.json', []);
    $j = is_array($bu['joined'] ?? null) ? $bu['joined'] : [];
    $aus = [];
    foreach ($j as $e) {
        if (is_array($e) && isset($e['o'], $e['d']) && pult_dash_id_ok($e['d'])) {
            $aus[] = $e;
        }
    }
    return $aus;
}

/** Darf der aktuelle Nutzer auf das Dashboard (eigner $o, id $d) zugreifen? */
function pult_dash_zugriff(string $o, string $d): bool
{
    if (!pult_dash_id_ok($d)) {
        return false;
    }
    $eigner = pult_dash_eigner();
    if ($o === $eigner) {
        foreach (pult_dash_liste(pult_dash_basis_von($eigner)) as $it) {
            if (($it['id'] ?? '') === $d) {
                return true;
            }
        }
        return false;
    }
    // fremdes (beigetretenes) Dashboard
    foreach (pult_dash_joined() as $e) {
        if (($e['o'] ?? '') === $o && ($e['d'] ?? '') === $d) {
            return true;
        }
    }
    return false;
}

/**
 * Aktuell gewähltes Dashboard ermitteln: ?d= (+ optional ?o=) übernimmt und merkt sich in
 * der Session; sonst aus der Session. Liefert ['o'=>, 'd'=>] oder null.
 */
function pult_dash_aktuelle(): ?array
{
    // Ausdrücklich die Übersicht anzeigen (Topbar „Dashboards") — Auswahl aufheben.
    if (isset($_GET['uebersicht'])) {
        unset($_SESSION['ff_dash']);
        return null;
    }
    $eigner = pult_dash_eigner();
    if (isset($_GET['d'])) {
        $d = (string) $_GET['d'];
        $o = (string) ($_GET['o'] ?? $eigner);
        if (pult_dash_zugriff($o, $d)) {
            $_SESSION['ff_dash'] = $o . '/' . $d;
            return ['o' => $o, 'd' => $d];
        }
    }
    $sel = (string) ($_SESSION['ff_dash'] ?? '');
    if ($sel !== '' && strpos($sel, '/') !== false) {
        [$o, $d] = explode('/', $sel, 2);
        if (pult_dash_zugriff($o, $d)) {
            return ['o' => $o, 'd' => $d];
        }
        unset($_SESSION['ff_dash']);
    }
    return null;
}

/** Anzeigename eines Dashboards (für Topbar/Übersicht). */
function pult_dash_name(string $o, string $d): string
{
    $basis = pult_dash_basis_von($o);
    if ($basis !== null) {
        foreach (pult_dash_liste($basis) as $it) {
            if (($it['id'] ?? '') === $d) {
                return (string) ($it['name'] ?? 'Dashboard');
            }
        }
    }
    foreach (pult_dash_joined() as $e) {
        if (($e['o'] ?? '') === $o && ($e['d'] ?? '') === $d) {
            return (string) ($e['name'] ?? 'Dashboard');
        }
    }
    return 'Dashboard';
}
