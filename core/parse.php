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
