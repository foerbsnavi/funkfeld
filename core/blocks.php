<?php
declare(strict_types=1);

/**
 * Inhalte der Flächen ("Blöcke") — je Fläche eine Datei blocks/<id>.json.
 * Inhalte werden streng nach Typ bereinigt; Links nur mit http(s)-Schema.
 */

/** Die bekannten Inhalts-Typen — zentral, damit neue Typen nur hier ergänzt werden. */
const PULT_WIDGET_TYPEN = ['notiz', 'checkliste', 'links', 'tabelle', 'telefonbuch', 'dateien', 'uhr', 'wetter', 'kalender', 'mail', 'rss', 'chat', 'karte', 'livestream', 'wirtschaft', 'custom'];

/** Kürzt und trimmt einen String auf eine Maximallänge. */
function pult_kurz(string $s, int $max): string
{
    $s = trim($s);
    return mb_strlen($s) > $max ? mb_substr($s, 0, $max) : $s;
}

/** Prüft eine Block-/Flächen-ID (kein Path-Traversal möglich). */
function pult_block_id_ok($id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id) === 1;
}

/** Dateipfad eines Blocks. */
function pult_block_pfad(string $id): string
{
    return PULT_BLOCKS . '/' . $id . '.json';
}

/** Liest den Inhalt eines Blocks (oder null, wenn keiner existiert). */
function pult_block_read(string $id): ?array
{
    if (!pult_block_id_ok($id)) {
        return null;
    }
    $data = store_read(pult_block_pfad($id), null);
    return is_array($data) ? $data : null;
}

/** Schreibt den (bereits bereinigten) Inhalt eines Blocks. */
function pult_block_write(string $id, array $content): bool
{
    if (!pult_block_id_ok($id)) {
        return false;
    }
    return store_write(pult_block_pfad($id), $content);
}

/** Rekursiv ein Verzeichnis löschen (z. B. ein komplettes Dashboard). */
function pult_rrmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }
    foreach (scandir($dir) ?: [] as $eintrag) {
        if ($eintrag === '.' || $eintrag === '..') {
            continue;
        }
        $pfad = $dir . '/' . $eintrag;
        if (is_dir($pfad) && !is_link($pfad)) {
            pult_rrmdir($pfad);
        } else {
            @unlink($pfad);
        }
    }
    @rmdir($dir);
}

/** Kopiert einen Ordner rekursiv (für das Einspielen von Updates). */
function pult_copy_rekursiv(string $von, string $nach): void
{
    if (!is_dir($von)) {
        return;
    }
    @mkdir($nach, 0775, true);
    foreach (scandir($von) ?: [] as $eintrag) {
        if ($eintrag === '.' || $eintrag === '..') {
            continue;
        }
        $q = $von . '/' . $eintrag;
        $z = $nach . '/' . $eintrag;
        if (is_dir($q) && !is_link($q)) {
            pult_copy_rekursiv($q, $z);
        } else {
            @copy($q, $z);
        }
    }
}

/** Löscht den Block einer Fläche (z. B. beim Schließen). */
function pult_block_delete(string $id): void
{
    if (pult_block_id_ok($id)) {
        $pfad = pult_block_pfad($id);
        if (is_file($pfad)) {
            @unlink($pfad);
        }
    }
}

/** Erlaubt nur http/https-Adressen — alles andere wird zu '' (kein javascript:, data: …). */
function pult_clean_url($url): string
{
    $url = trim((string) $url);
    if ($url === '') {
        return '';
    }
    $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
    return in_array($scheme, ['http', 'https'], true) ? $url : '';
}

/**
 * Bereinigt einen Block-Inhalt streng nach Typ.
 * Unbekannte Typen liefern einen leeren Inhalt.
 */
function pult_clean_block(string $typ, $content): array
{
    if (!is_array($content)) {
        $content = [];
    }

    switch ($typ) {
        case 'notiz':
            $text = (string) ($content['text'] ?? '');
            if (mb_strlen($text) > 20000) {
                $text = mb_substr($text, 0, 20000);
            }
            return ['text' => $text];

        case 'checkliste':
            $items = [];
            foreach ((array) ($content['items'] ?? []) as $it) {
                if (!is_array($it)) {
                    continue;
                }
                $t = (string) ($it['text'] ?? '');
                if (mb_strlen($t) > 500) {
                    $t = mb_substr($t, 0, 500);
                }
                $items[] = ['text' => $t, 'erledigt' => !empty($it['erledigt'])];
                if (count($items) >= 500) {
                    break;
                }
            }
            return ['items' => $items];

        case 'links':
            $items = [];
            foreach ((array) ($content['items'] ?? []) as $it) {
                if (!is_array($it)) {
                    continue;
                }
                $titel = (string) ($it['titel'] ?? '');
                if (mb_strlen($titel) > 200) {
                    $titel = mb_substr($titel, 0, 200);
                }
                $url = (string) ($it['url'] ?? '');
                if (mb_strlen($url) > 2000) {
                    $url = mb_substr($url, 0, 2000);
                }
                $items[] = ['titel' => $titel, 'url' => pult_clean_url($url)];
                if (count($items) >= 200) {
                    break;
                }
            }
            return ['items' => $items];

        case 'tabelle':
            $spalten = [];
            foreach ((array) ($content['spalten'] ?? []) as $s) {
                $spalten[] = pult_kurz((string) $s, 100);
                if (count($spalten) >= 12) {
                    break;
                }
            }
            if (!$spalten) {
                $spalten = [''];
            }
            $breite = count($spalten);
            $zeilen = [];
            foreach ((array) ($content['zeilen'] ?? []) as $zeile) {
                if (!is_array($zeile)) {
                    continue;
                }
                $z = [];
                for ($i = 0; $i < $breite; $i++) {
                    $z[] = pult_kurz((string) ($zeile[$i] ?? ''), 500);
                }
                $zeilen[] = $z;
                if (count($zeilen) >= 200) {
                    break;
                }
            }
            return ['spalten' => $spalten, 'zeilen' => $zeilen];

        case 'telefonbuch':
            $items = [];
            foreach ((array) ($content['items'] ?? []) as $it) {
                if (!is_array($it)) {
                    continue;
                }
                $items[] = [
                    'name'    => pult_kurz((string) ($it['name'] ?? ''), 200),
                    'telefon' => pult_kurz((string) ($it['telefon'] ?? ''), 60),
                    'email'   => pult_kurz((string) ($it['email'] ?? ''), 200),
                    'notiz'   => pult_kurz((string) ($it['notiz'] ?? ''), 500),
                ];
                if (count($items) >= 500) {
                    break;
                }
            }
            return ['items' => $items];

        case 'dateien':
            $items = [];
            foreach ((array) ($content['items'] ?? []) as $it) {
                if (!is_array($it)) {
                    continue;
                }
                $id = (string) ($it['id'] ?? '');
                if (!pult_block_id_ok($id)) {
                    continue;
                }
                $items[] = [
                    'id'   => $id,
                    'name' => pult_kurz((string) ($it['name'] ?? 'Datei'), 255),
                    'size' => max(0, (int) ($it['size'] ?? 0)),
                ];
                if (count($items) >= 200) {
                    break;
                }
            }
            return ['items' => $items];

        case 'wetter':
            return ['ort' => pult_kurz((string) ($content['ort'] ?? ''), 120)];

        case 'rss':
            return ['url' => pult_kurz((string) ($content['url'] ?? ''), 2000)];

        case 'mail':
            // nur die gewählte Konto-ID (kein Geheimnis)
            return ['konto' => pult_kurz((string) ($content['konto'] ?? ''), 16)];

        case 'kalender':
            // nur die gewählte Kalender-ID (kein Geheimnis); Adressen bleiben zentral
            return ['kalender' => pult_kurz((string) ($content['kalender'] ?? ''), 16)];

        case 'karte':
            return pult_clean_karte($content);

        case 'livestream':
            return pult_clean_livestream($content);

        case 'wirtschaft':
            // nur die gewählte Zeitspanne; Daten kommen serverseitig
            $sp = (string) ($content['spanne'] ?? '1y');
            return ['spanne' => in_array($sp, ['1w', '1m', '3m', '1y', '2y', '5y'], true) ? $sp : '1y'];

        case 'custom':
            // Roh-HTML/JS bewusst UNVERÄNDERT speichern; sichere Ausführung erfolgt
            // ausschließlich im Sandbox-iframe (action=custom_render). Nur Länge begrenzen.
            $html = (is_array($content) && isset($content['html']) && is_string($content['html'])) ? $content['html'] : '';
            if (mb_strlen($html) > 100000) {
                $html = mb_substr($html, 0, 100000);
            }
            return ['html' => $html];

        default:
            return [];
    }
}

/** Livestream-Block: nur eine https-Bild-/Webcam-URL + Aktualisierungsintervall. */
function pult_clean_livestream($content): array
{
    $url = '';
    if (is_array($content) && isset($content['url']) && is_string($content['url'])) {
        $u = trim($content['url']);
        if ($u !== '' && preg_match('#^https://#i', $u) && mb_strlen($u) <= 2000) {
            $url = $u;
        }
    }
    $iv = 5;
    if (is_array($content) && isset($content['intervall']) && in_array((int) $content['intervall'], [0, 2, 5, 15, 60], true)) {
        $iv = (int) $content['intervall'];
    }
    return ['url' => $url, 'intervall' => $iv];
}

/** Prüft, ob ein Wert eine endliche Zahl im Bereich ist; sonst null. */
function pult_zahl_bereich($v, float $min, float $max): ?float
{
    if (!is_numeric($v)) {
        return null;
    }
    $f = (float) $v;
    if (!is_finite($f) || $f < $min || $f > $max) {
        return null;
    }
    return $f;
}

/** Erlaubt nur eine Hex-Farbe #rgb oder #rrggbb; sonst ein neutraler Standard. */
function pult_clean_farbe($v): string
{
    $v = strtolower(trim((string) $v));
    return preg_match('/^#([0-9a-f]{3}|[0-9a-f]{6})$/', $v) === 1 ? $v : '#00ccaa';
}

/**
 * Bereinigt den Inhalt einer Karten-Fläche streng:
 *   ansicht {lat,lng,zoom}, marker [{id,lat,lng,titel}], striche [{id,punkte[[lat,lng]…],farbe,breite,strichart}].
 * Keine Geheimnisse; nur geprüfte Zahlen/Strings.
 */
function pult_clean_karte($content): array
{
    if (!is_array($content)) {
        $content = [];
    }

    // Kartenausschnitt
    $a    = is_array($content['ansicht'] ?? null) ? $content['ansicht'] : [];
    $lat  = pult_zahl_bereich($a['lat'] ?? null, -90, 90);
    $lng  = pult_zahl_bereich($a['lng'] ?? null, -180, 180);
    $zoom = pult_zahl_bereich($a['zoom'] ?? null, 1, 22);
    $ansicht = [
        'lat'  => $lat !== null ? $lat : 51.16,   // Standard: Mitte Deutschlands
        'lng'  => $lng !== null ? $lng : 10.45,
        'zoom' => $zoom !== null ? (int) round($zoom) : 6,
    ];

    // Markierungen
    $marker = [];
    foreach ((array) ($content['marker'] ?? []) as $m) {
        if (!is_array($m)) {
            continue;
        }
        $mlat = pult_zahl_bereich($m['lat'] ?? null, -90, 90);
        $mlng = pult_zahl_bereich($m['lng'] ?? null, -180, 180);
        if ($mlat === null || $mlng === null) {
            continue;
        }
        $id = (string) ($m['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            continue;
        }
        $marker[] = [
            'id'    => $id,
            'lat'   => $mlat,
            'lng'   => $mlng,
            'titel' => pult_kurz((string) ($m['titel'] ?? ''), 120),
        ];
        if (count($marker) >= 300) {
            break;
        }
    }

    // Striche / Linien
    $striche = [];
    foreach ((array) ($content['striche'] ?? []) as $s) {
        if (!is_array($s)) {
            continue;
        }
        $id = (string) ($s['id'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{1,64}$/', $id)) {
            continue;
        }
        $punkte = [];
        foreach ((array) ($s['punkte'] ?? []) as $p) {
            if (!is_array($p)) {
                continue;
            }
            $plat = pult_zahl_bereich($p[0] ?? null, -90, 90);
            $plng = pult_zahl_bereich($p[1] ?? null, -180, 180);
            if ($plat === null || $plng === null) {
                continue;
            }
            $punkte[] = [$plat, $plng];
            if (count($punkte) >= 1000) {
                break;
            }
        }
        if (count($punkte) < 2) {
            continue;   // ein Strich braucht mindestens zwei Punkte
        }
        $art = (string) ($s['strichart'] ?? 'solid');
        if (!in_array($art, ['solid', 'dashed', 'dotted'], true)) {
            $art = 'solid';
        }
        $striche[] = [
            'id'        => $id,
            'punkte'    => $punkte,
            'farbe'     => pult_clean_farbe($s['farbe'] ?? ''),
            'breite'    => (int) max(1, min(12, (int) ($s['breite'] ?? 4))),
            'strichart' => $art,
        ];
        if (count($striche) >= 200) {
            break;
        }
    }

    $basis = (($content['basis'] ?? '') === 'satellit') ? 'satellit' : 'karte';

    return ['ansicht' => $ansicht, 'basis' => $basis, 'marker' => $marker, 'striche' => $striche];
}
