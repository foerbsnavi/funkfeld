<?php
declare(strict_types=1);

/**
 * Aktivitäts-/Neuigkeiten-Log eines Dashboards — speist die „Neuigkeiten"-Fläche.
 *
 * Datenmodell (PULT_AKTIVITAET = <dashboard>/aktivitaet.json):
 *   {
 *     "eintraege": [ {"typ","aktion","ziel","zeit"[,"n"]}, … ],   // Ringpuffer, neueste zuletzt
 *     "stand":     { … }                                          // Wasserzeichen (Mail/Feeds), siehe pult_akt_extern()
 *   }
 *
 * Einträge sind bewusst NEUTRAL (keine Nutzer-Namen, kein Inhalts-Auszug): nur die
 * Tatsache + der Kartenname. Rasch aufeinanderfolgende gleiche Ereignisse (z. B.
 * Tippen in einer Notiz) werden gebündelt — höchstens ein Eintrag je Zeitfenster.
 */

const PULT_AKT_MAX     = 100;   // Ringpuffer: so viele Einträge werden aufbewahrt
const PULT_AKT_BUENDEL = 300;   // gleiche Aktivität innerhalb 5 min → kein neuer Eintrag

// Nur diese (inhaltlich editierbaren) Typen erzeugen ein „geändert"-Ereignis. Bei
// Ansichts-Widgets (mail, kalender, wetter, rss, uhr, wirtschaft, chat, dateien)
// entsteht schon beim Anlegen ein Auto-Speichern — deren Neuigkeiten kommen aus
// eigenen Quellen (Datei-Upload, Chat, Mail-/Feed-Abgleich), nicht aus block_save.
const PULT_AKT_INHALT_TYPEN = ['notiz', 'checkliste', 'links', 'tabelle', 'telefonbuch', 'karte', 'custom'];

/** Kartentitel einer Fläche aus dem Layout holen (leer, wenn nicht gefunden). */
function pult_akt_titel(string $blockId): string
{
    $dash = store_read(PULT_DASHBOARD, null);
    if (is_array($dash) && isset($dash['flaechen']) && is_array($dash['flaechen'])) {
        foreach ($dash['flaechen'] as $f) {
            if (is_array($f) && (string) ($f['id'] ?? '') === $blockId) {
                return mb_substr(trim((string) ($f['titel'] ?? '')), 0, 120);
            }
        }
    }
    return '';
}

/**
 * Ein Ereignis anhängen. Serialisiert über ein Lock (kein verlorenes Update),
 * mit Bündelung gleicher aufeinanderfolgender Ereignisse.
 *
 * @param string $typ    Widget-/Ereignistyp (z. B. 'notiz', 'dateien', 'chat', 'mail')
 * @param string $aktion 'geaendert' | 'hinzugefuegt' | 'entfernt' | 'datei' | 'chat' | 'mail' | 'feed'
 * @param string $ziel   Kartenname/Dateiname/Postfach (neutral, ohne Inhalt)
 * @param int    $n      optionale Anzahl (z. B. „2 neue Mails")
 */
function pult_akt(string $typ, string $aktion, string $ziel = '', int $n = 0): void
{
    $ziel  = mb_substr(trim($ziel), 0, 120);
    $jetzt = time();

    // Günstiger Vorab-Check ohne Lock: identische Aktivität gerade eben schon geloggt?
    // (Best-effort-Bündelung; ein seltener Wettlauf ergäbe höchstens einen Doppel-Eintrag.)
    if ($n === 0) {
        $vorab = store_read(PULT_AKTIVITAET, null);
        $letzter = (is_array($vorab) && !empty($vorab['eintraege']) && is_array($vorab['eintraege']))
            ? end($vorab['eintraege']) : null;
        if (pult_akt_gleich($letzter, $typ, $aktion, $ziel, $jetzt)) {
            return;
        }
    }

    $lock = @fopen(PULT_AKTIVITAET . '.lock', 'c');
    if (!$lock) {
        return;   // Log ist unkritisch — kein Abbruch der eigentlichen Aktion
    }
    if (!flock($lock, LOCK_EX)) {
        fclose($lock);
        return;
    }
    $data = store_read(PULT_AKTIVITAET, null);
    $eintraege = (is_array($data) && isset($data['eintraege']) && is_array($data['eintraege'])) ? $data['eintraege'] : [];
    $stand     = (is_array($data) && isset($data['stand']) && is_array($data['stand'])) ? $data['stand'] : [];

    $letzter = !empty($eintraege) ? end($eintraege) : null;
    if (!($n === 0 && pult_akt_gleich($letzter, $typ, $aktion, $ziel, $jetzt))) {
        $eintrag = ['typ' => $typ, 'aktion' => $aktion, 'ziel' => $ziel, 'zeit' => $jetzt];
        if ($n > 0) {
            $eintrag['n'] = $n;
        }
        $eintraege[] = $eintrag;
        if (count($eintraege) > PULT_AKT_MAX) {
            $eintraege = array_slice($eintraege, -PULT_AKT_MAX);
        }
        store_write(PULT_AKTIVITAET, ['eintraege' => array_values($eintraege), 'stand' => $stand]);
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}

/** Ist $letzter dasselbe Ereignis wie ($typ,$aktion,$ziel) und noch innerhalb des Bündel-Fensters? */
function pult_akt_gleich($letzter, string $typ, string $aktion, string $ziel, int $jetzt): bool
{
    return is_array($letzter)
        && (string) ($letzter['typ'] ?? '') === $typ
        && (string) ($letzter['aktion'] ?? '') === $aktion
        && (string) ($letzter['ziel'] ?? '') === $ziel
        && !isset($letzter['n'])
        && ($jetzt - (int) ($letzter['zeit'] ?? 0)) < PULT_AKT_BUENDEL;
}

/**
 * Layout-Vergleich: nur hinzugefügte/entfernte Flächen loggen (kein Verschieben/Umbenennen).
 * $alt/$neu sind rohe bzw. gesäuberte Layouts mit ['flaechen'] = [{id,typ,titel}, …].
 */
function pult_akt_layout_diff($alt, array $neu): void
{
    $vorher = pult_akt_flaechen_map($alt);
    $nachher = pult_akt_flaechen_map($neu);
    foreach ($nachher as $id => $f) {
        if (!isset($vorher[$id]) && $f['typ'] !== 'leer') {
            pult_akt($f['typ'], 'hinzugefuegt', $f['titel']);
        }
    }
    foreach ($vorher as $id => $f) {
        if (!isset($nachher[$id]) && $f['typ'] !== 'leer') {
            pult_akt($f['typ'], 'entfernt', $f['titel']);
        }
    }
}

/** id → {typ,titel} aus einem Layout (leer, wenn keine gültige Struktur). */
function pult_akt_flaechen_map($layout): array
{
    $map = [];
    if (is_array($layout) && isset($layout['flaechen']) && is_array($layout['flaechen'])) {
        foreach ($layout['flaechen'] as $f) {
            if (!is_array($f)) {
                continue;
            }
            $id = (string) ($f['id'] ?? '');
            if ($id === '') {
                continue;
            }
            $map[$id] = [
                'typ'   => (string) ($f['typ'] ?? 'leer'),
                'titel' => mb_substr(trim((string) ($f['titel'] ?? '')), 0, 120),
            ];
        }
    }
    return $map;
}

/** Die letzten Einträge lesen (neueste zuletzt). */
function pult_akt_liste(int $max = 60): array
{
    $data = store_read(PULT_AKTIVITAET, null);
    $eintraege = (is_array($data) && isset($data['eintraege']) && is_array($data['eintraege'])) ? $data['eintraege'] : [];
    return array_slice($eintraege, -$max);
}

/* ---------------------------------------------------------------------------
   Externer Abgleich (Mail/Feeds) — „X neue Mails" / „X neue Beiträge".
   Läuft nur, solange ein Dashboard offen ist (die Neuigkeiten-Fläche ruft
   aktivitaet_pruefen im Minutentakt), gedrosselt über die Stand-Datei.
   Wasserzeichen liegen in PULT_AKT_STAND (NICHT im Live-Sync-Stempel), damit
   ein reiner „geprüft, nichts Neues"-Lauf kein Nachladen aller Karten auslöst.
   --------------------------------------------------------------------------- */

const PULT_AKT_PRUEF_INTERVALL = 150;   // frühestens alle 2,5 min extern abfragen
const PULT_AKT_FEED_MAX        = 10;    // höchstens so viele RSS-Feeds je Lauf prüfen
const PULT_AKT_ZEITBUDGET      = 12;    // Sekunden-Gesamtbudget je Lauf (unter dem Shared-Hosting-Limit)
const PULT_AKT_EXT_TIMEOUT     = 4;     // Einzel-Timeout je IMAP-/Feed-Abruf (langsame Quellen bremsen nicht)

/**
 * Gedrosselter externer Abgleich. $mailkonten leer → keine Mail-Prüfung
 * (der Aufrufer übergibt sie nur im eigenen Dashboard — Posteingang ist privat).
 * Feeds (RSS-Karten des Boards) werden immer geprüft (öffentlicher Board-Inhalt).
 *
 * Robust gegen Shared-Hosting-Timeouts: Der Drossel-Stempel wird SOFORT gesichert,
 * die Wasserzeichen nach JEDEM Postfach/Feed inkrementell — bricht PHP mitten im Lauf
 * ab, geht kein Fortschritt verloren, und der nächste Lauf setzt dort fort. Ein
 * Zeitbudget stoppt den Lauf, bevor er ins Ausführungslimit läuft.
 */
function pult_akt_pruefen(array $mailkonten): void
{
    // Serialisieren + drosseln über ein eigenes Lock (nicht-blockierend: läuft schon → raus).
    $lock = @fopen(PULT_AKT_STAND . '.lock', 'c');
    if (!$lock) {
        return;
    }
    if (!flock($lock, LOCK_EX | LOCK_NB)) {
        fclose($lock);
        return;   // ein anderer Aufruf prüft gerade
    }
    $stand = store_read(PULT_AKT_STAND, null);
    if (!is_array($stand)) {
        $stand = [];
    }
    $jetzt = time();
    if (($jetzt - (int) ($stand['geprueft'] ?? 0)) < PULT_AKT_PRUEF_INTERVALL) {
        flock($lock, LOCK_UN);
        fclose($lock);
        return;   // noch zu früh
    }
    // Drossel-Stempel sofort sichern — auch bei späterem Timeout wird nicht sofort
    // erneut geprüft (der nächste Lauf wartet reguläre 150s ab).
    $stand['geprueft'] = $jetzt;
    store_write(PULT_AKT_STAND, $stand);

    $deadline = microtime(true) + PULT_AKT_ZEITBUDGET;
    if ($mailkonten && pult_mail_verfuegbar()) {
        pult_akt_mail_pruefen($mailkonten, $stand, $deadline);
    }
    pult_akt_feed_pruefen($stand, $deadline);

    flock($lock, LOCK_UN);
    fclose($lock);
}

/**
 * Für jedes Postfach die Zahl neuer Nachrichten (per höchster UID) ermitteln und loggen.
 * $stand wird nach jedem Postfach inkrementell persistiert (Timeout-fest); $deadline stoppt.
 */
function pult_akt_mail_pruefen(array $mailkonten, array &$stand, float $deadline): void
{
    foreach ($mailkonten as $k) {
        if (microtime(true) >= $deadline) {
            break;   // Zeitbudget erschöpft — Rest erledigt der nächste Lauf
        }
        if (!is_array($k)) {
            continue;
        }
        $id = (string) ($k['id'] ?? '');
        if ($id === '') {
            continue;
        }
        $host = (string) ($k['host'] ?? '');
        $port = (int) ($k['port'] ?? 993);
        $user = (string) ($k['user'] ?? '');
        $pw   = pult_decrypt((string) ($k['pw_enc'] ?? ''));
        if ($host === '' || $user === '' || $pw === '') {
            continue;
        }
        $imap = pult_mail_oeffnen($host, $port, $user, $pw, PULT_AKT_EXT_TIMEOUT);
        if (!$imap) {
            @imap_errors();
            continue;
        }
        $hoechste = (int) ($stand['mail'][$id] ?? 0);
        $gesamt   = (int) @imap_num_msg($imap);
        $neu = 0;
        $maxUid = $hoechste;
        if ($gesamt > 0) {
            $von = max(1, $gesamt - 30 + 1);   // nur die neuesten bis zu 30 ansehen
            $ov = @imap_fetch_overview($imap, $von . ':' . $gesamt, 0);
            if ($ov) {
                foreach ($ov as $o) {
                    $uid = (int) ($o->uid ?? 0);
                    if ($uid > $hoechste) {
                        $neu++;
                    }
                    if ($uid > $maxUid) {
                        $maxUid = $uid;
                    }
                }
            }
        }
        @imap_close($imap);
        @imap_errors();
        // Erststart (kein Wasserzeichen) meldet nichts — nur die Marke wird gesetzt.
        if ($hoechste > 0 && $neu > 0) {
            pult_akt('mail', 'mail', mb_substr(trim((string) ($k['name'] ?? 'Postfach')), 0, 120), $neu);
        }
        $stand['mail'][$id] = $maxUid;
        store_write(PULT_AKT_STAND, $stand);   // inkrementell sichern
    }
}

/**
 * RSS-Karten des Boards gegen ihren zuletzt gesehenen Beitrag prüfen und Neues loggen.
 * $stand wird nach jedem Feed inkrementell persistiert; $deadline stoppt den Lauf.
 */
function pult_akt_feed_pruefen(array &$stand, float $deadline): void
{
    $dash = store_read(PULT_DASHBOARD, null);
    if (!is_array($dash) || !is_array($dash['flaechen'] ?? null)) {
        return;
    }
    $geprueft = 0;
    foreach ($dash['flaechen'] as $f) {
        if (!is_array($f) || (string) ($f['typ'] ?? '') !== 'rss') {
            continue;
        }
        $id = (string) ($f['id'] ?? '');
        if (!pult_block_id_ok($id)) {
            continue;
        }
        $b = pult_block_read($id);
        $url = is_array($b) ? trim((string) ($b['url'] ?? '')) : '';
        if ($url === '' || !pult_url_erlaubt($url)) {
            continue;
        }
        if (++$geprueft > PULT_AKT_FEED_MAX) {
            break;
        }
        if (microtime(true) >= $deadline) {
            break;   // Zeitbudget erschöpft
        }
        $erg = pult_fetch_info($url, 1048576, PULT_AKT_EXT_TIMEOUT, true);
        if (($erg['body'] ?? null) === null) {
            continue;
        }
        $eintraege = pult_rss_parse($erg['body']);
        if (!$eintraege) {
            continue;
        }
        $key         = substr(sha1($url), 0, 16);
        $neuesteMarke = (string) ($eintraege[0]['link'] ?? ($eintraege[0]['titel'] ?? ''));
        $alteMarke    = (string) ($stand['feeds'][$key] ?? '');
        if ($alteMarke !== '' && $neuesteMarke !== '' && $neuesteMarke !== $alteMarke) {
            $n = 0;
            foreach ($eintraege as $e) {
                $m = (string) ($e['link'] ?? ($e['titel'] ?? ''));
                if ($m === $alteMarke) {
                    break;   // bis zum zuletzt gesehenen Beitrag zählen
                }
                $n++;
            }
            if ($n > 0) {
                pult_akt('rss', 'feed', mb_substr(trim((string) ($f['titel'] ?? 'RSS')), 0, 120), $n);
            }
        }
        if ($neuesteMarke !== '') {
            $stand['feeds'][$key] = $neuesteMarke;
            store_write(PULT_AKT_STAND, $stand);   // inkrementell sichern
        }
    }
}
