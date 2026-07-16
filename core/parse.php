<?php
declare(strict_types=1);

/**
 * Parser für externe Feed-Inhalte (getrennt von core/feeds.php, das nur den
 * Transport/Cache macht): ICS-Kalender und RSS/Atom.
 * Setzt pult_clean_url() (core/blocks.php) voraus.
 */

/* --- ICS-Kalender (VEVENT) --- */

/** Entschärft ICS-Text-Escapes (\\n, \\, \\; \\\\). */
function pult_ics_text(string $wert): string
{
    $wert = str_replace(['\\n', '\\N'], ' ', $wert);
    $wert = str_replace(['\\,', '\\;', '\\\\'], [',', ';', '\\'], $wert);
    return trim($wert);
}

/** Wandelt ein ICS-Datum (YYYYMMDD oder YYYYMMDDTHHMMSS[Z]) in einen Timestamp. */
function pult_ics_datum(string $wert): ?int
{
    $wert = trim($wert);
    if (preg_match('/^(\d{4})(\d{2})(\d{2})(T(\d{2})(\d{2})(\d{2})(Z)?)?$/', $wert, $m)) {
        $str = $m[1] . '-' . $m[2] . '-' . $m[3] . ' '
            . ($m[5] ?? '00') . ':' . ($m[6] ?? '00') . ':' . ($m[7] ?? '00');
        $ts = !empty($m[8]) ? strtotime($str . ' UTC') : strtotime($str);
        return $ts !== false ? $ts : null;
    }
    $ts = strtotime(substr($wert, 0, 64));   // Eingabe für den Fallback begrenzen
    return $ts !== false ? $ts : null;
}

/**
 * Parst die VEVENTs aus einem ICS-Text.
 * Hinweis: Zeitzonen (TZID) werden vereinfacht behandelt (Z = UTC, sonst Serverzeit).
 * @return array Liste von ['start'=>int, 'end'=>?int, 'summary'=>string, 'ort'=>string]
 */
function pult_ics_parse(string $text): array
{
    $text   = preg_replace("/\r\n[ \t]/", '', $text);          // gefaltete Zeilen
    $text   = str_replace(["\r\n", "\r"], "\n", $text);
    $zeilen = array_slice(explode("\n", $text), 0, 50000);     // Zeilenanzahl deckeln

    $events = [];
    $cur    = null;
    foreach ($zeilen as $z) {
        if ($z === 'BEGIN:VEVENT') { $cur = []; continue; }
        if ($z === 'END:VEVENT')   { if ($cur) { $events[] = $cur; } $cur = null; continue; }
        if ($cur === null) { continue; }

        $pos = strpos($z, ':');
        if ($pos === false) { continue; }
        $links = substr($z, 0, $pos);
        $wert  = substr($z, $pos + 1);
        $name  = strtoupper(explode(';', $links)[0]);

        if ($name === 'SUMMARY')      { $cur['summary'] = pult_ics_text($wert); }
        elseif ($name === 'LOCATION') { $cur['ort']     = pult_ics_text($wert); }
        elseif ($name === 'DTSTART')  { $cur['start']   = pult_ics_datum($wert); }
        elseif ($name === 'DTEND')    { $cur['end']     = pult_ics_datum($wert); }
    }
    return $events;
}

/* --- RSS / Atom --- */

/** Baut einen bereinigten Feed-Eintrag (Titel gekürzt, Link nur http/https). */
function pult_rss_eintrag(string $titel, string $link, string $datum): array
{
    $ts = $datum !== '' ? strtotime($datum) : false;
    return [
        'titel' => mb_substr(trim($titel), 0, 300),
        'link'  => pult_clean_url(trim($link)),
        'datum' => $ts !== false ? $ts : null,
    ];
}

/**
 * Parst einen RSS-2.0-, RSS-1.0- oder Atom-Feed (max 30 Einträge).
 * XXE-sicher: LIBXML_NONET (keine externen Entities/Netzzugriffe).
 */
function pult_rss_parse(string $xml): array
{
    $xml = trim($xml);
    if ($xml === '') {
        return [];
    }
    // DTDs ganz ablehnen → kein XXE und keine Entity-Expansion (Billion Laughs)
    if (preg_match('/<!DOCTYPE/i', $xml)) {
        return [];
    }
    $vorher = libxml_use_internal_errors(true);
    $doc = simplexml_load_string($xml, 'SimpleXMLElement', LIBXML_NONET | LIBXML_NOCDATA);
    libxml_clear_errors();
    libxml_use_internal_errors($vorher);
    if ($doc === false) {
        return [];
    }

    $eintraege = [];

    if (isset($doc->channel->item)) {           // RSS 2.0
        foreach ($doc->channel->item as $it) {
            $eintraege[] = pult_rss_eintrag((string) $it->title, (string) $it->link, (string) ($it->pubDate ?? ''));
            if (count($eintraege) >= 30) { break; }
        }
    } elseif (isset($doc->item)) {              // RSS 1.0 (RDF)
        foreach ($doc->item as $it) {
            $datum = (string) ($it->date ?? '');
            if ($datum === '') {                // RSS 1.0 nutzt meist dc:date
                $dc = $it->children('http://purl.org/dc/elements/1.1/');
                if (isset($dc->date)) { $datum = (string) $dc->date; }
            }
            $eintraege[] = pult_rss_eintrag((string) $it->title, (string) $it->link, $datum);
            if (count($eintraege) >= 30) { break; }
        }
    } elseif (isset($doc->entry)) {             // Atom
        foreach ($doc->entry as $e) {
            $link = '';
            if (isset($e->link)) {
                foreach ($e->link as $l) {
                    $href = (string) ($l['href'] ?? '');
                    $rel  = (string) ($l['rel'] ?? 'alternate');
                    if ($href !== '' && ($rel === 'alternate' || $link === '')) {
                        $link = $href;
                    }
                }
            }
            $datum = (string) ($e->updated ?? '');
            if ($datum === '') { $datum = (string) ($e->published ?? ''); }
            $eintraege[] = pult_rss_eintrag((string) $e->title, $link, $datum);
            if (count($eintraege) >= 30) { break; }
        }
    }
    return $eintraege;
}

/* ---------------------------------------------------------------------------
   CardDAV/CalDAV (seit 1.5.0): Multistatus-Antworten auswerten, vCards lesen,
   VEVENT-ICS bauen. Gleiche XML-Sicherheitslinie wie pult_rss_parse:
   DOCTYPE → ablehnen (kein XXE/Entity-Ausbreitung), LIBXML_NONET.
   --------------------------------------------------------------------------- */

/**
 * Zieht aus einer DAV-Multistatus-Antwort alle Textinhalte eines Feldes
 * (z. B. address-data/calendar-data) — Namespace-fest, präfix-unabhängig.
 */
function pult_dav_datenfelder(string $xml, string $ns, string $feld): array
{
    $xml = trim($xml);
    if ($xml === '' || preg_match('/<!DOCTYPE/i', $xml)) {
        return [];
    }
    $vorher = libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $ok = $doc->loadXML($xml, LIBXML_NONET);
    libxml_clear_errors();
    libxml_use_internal_errors($vorher);
    if (!$ok) {
        return [];
    }
    $aus = [];
    foreach ($doc->getElementsByTagNameNS($ns, $feld) as $el) {
        $t = trim((string) $el->textContent);
        if ($t !== '') {
            $aus[] = $t;
        }
    }
    return $aus;
}

/** Entfaltet vCard-/ICS-Zeilen (RFC-Folding: Folgezeile beginnt mit Space/Tab). */
function pult_vcard_entfalten(string $text): array
{
    $roh = preg_split('/\r\n|\n|\r/', $text) ?: [];
    $zeilen = [];
    foreach ($roh as $z) {
        if (($z !== '' && ($z[0] === ' ' || $z[0] === "\t")) && $zeilen) {
            $zeilen[count($zeilen) - 1] .= substr($z, 1);
        } else {
            $zeilen[] = $z;
        }
    }
    return $zeilen;
}

/** vCard-Escaping zurücknehmen — wie pult_ics_text: \n → Umbruch, \, \; \\ → Zeichen. */
function pult_vcard_text(string $s): string
{
    return str_replace(['\\n', '\\N', '\\,', '\\;', '\\\\'], ["\n", "\n", ',', ';', '\\'], $s);
}

/**
 * Liest vCards (3.0/4.0) aus einem Text (eine oder mehrere) und liefert Kontakte
 * im Telefonbuch-Format: [{name, telefon, email, notiz}]. Grenzen wie blocks.php
 * (max. 500 Kontakte; Name 200, Telefon 60, E-Mail 200, Notiz 500 Zeichen).
 */
function pult_vcard_parse(string $text): array
{
    $kontakte = [];
    $akt = null;
    foreach (pult_vcard_entfalten($text) as $zeile) {
        $z = trim($zeile);
        if ($z === '') {
            continue;
        }
        if (strcasecmp($z, 'BEGIN:VCARD') === 0) {
            $akt = ['name' => '', 'telefon' => '', 'email' => '', 'notiz' => ''];
            continue;
        }
        if (strcasecmp($z, 'END:VCARD') === 0) {
            if (is_array($akt) && ($akt['name'] !== '' || $akt['telefon'] !== '' || $akt['email'] !== '')) {
                $kontakte[] = $akt;
                if (count($kontakte) >= 500) {
                    break;
                }
            }
            $akt = null;
            continue;
        }
        if ($akt === null) {
            continue;
        }
        $pos = strpos($z, ':');
        if ($pos === false) {
            continue;
        }
        // Property-Name ohne Parameter (TEL;TYPE=CELL → TEL), Gruppen-Präfix weg (item1.TEL → TEL)
        $kopf = strtoupper(substr($z, 0, $pos));
        $wert = pult_vcard_text(substr($z, $pos + 1));
        $prop = preg_replace('/^[^.]*\./', '', $kopf);
        $prop = explode(';', $prop)[0];
        if ($prop === 'FN' && $akt['name'] === '') {
            $akt['name'] = mb_substr(trim($wert), 0, 200);
        } elseif ($prop === 'TEL' && $akt['telefon'] === '') {
            // 4.0 schreibt oft tel:+49… als URI — das Schema gehört nicht in die Anzeige
            $akt['telefon'] = mb_substr(trim(preg_replace('/^tel:/i', '', $wert)), 0, 60);
        } elseif ($prop === 'EMAIL' && $akt['email'] === '') {
            $akt['email'] = mb_substr(trim(preg_replace('/^mailto:/i', '', $wert)), 0, 200);
        } elseif ($prop === 'NOTE' && $akt['notiz'] === '') {
            $akt['notiz'] = mb_substr(trim($wert), 0, 500);
        }
    }
    return $kontakte;
}

/** ICS-Escaping für Textwerte (Komma, Semikolon, Backslash, Zeilenumbruch). */
function pult_ics_escape(string $s): string
{
    return str_replace(['\\', ';', ',', "\n"], ['\\\\', '\\;', '\\,', '\\n'], str_replace("\r", '', $s));
}

/**
 * Baut eine minimale VEVENT-ICS (UTC, wie beim Lesen: Anzeige lokal, Speicherung Z).
 * $start/$ende sind Unix-Timestamps. Rückgabe: [uid, ics-Text] — CRLF-Zeilenenden (RFC 5545).
 */
function pult_vevent_ics(string $titel, int $start, int $ende, string $ort = ''): array
{
    $uid = bin2hex(random_bytes(16)) . '@funkfeld';
    $z = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Funkfeld//DE',
        'BEGIN:VEVENT',
        'UID:' . $uid,
        'DTSTAMP:' . gmdate('Ymd\THis\Z'),
        'DTSTART:' . gmdate('Ymd\THis\Z', $start),
        'DTEND:' . gmdate('Ymd\THis\Z', $ende),
        'SUMMARY:' . pult_ics_escape($titel),
    ];
    if ($ort !== '') {
        $z[] = 'LOCATION:' . pult_ics_escape($ort);
    }
    $z[] = 'END:VEVENT';
    $z[] = 'END:VCALENDAR';
    return [$uid, implode("\r\n", $z) . "\r\n"];
}
