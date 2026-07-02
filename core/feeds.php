<?php
declare(strict_types=1);

/**
 * Serverseitiges Laden externer Inhalte (Wetter/RSS/ICS) — mit SSRF-Schutz,
 * Timeout, Größenlimit und einfachem Datei-Cache unter data/cache/.
 */

/** Ist eine IP öffentlich (keine privaten/reservierten Bereiche)? */
function pult_ip_oeffentlich(string $ip): bool
{
    return (bool) filter_var(
        $ip,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    );
}

/**
 * Prüft eine URL (nur http/https) und löst den Host auf. ALLE aufgelösten IPs
 * müssen öffentlich sein (SSRF-Schutz). Gibt Host/Port/gewählte-IP zurück,
 * damit der Fetch genau diese IP nutzt (kein zweiter DNS-Lookup → kein
 * DNS-Rebinding zwischen Prüfung und Abruf). Rückgabe null = nicht erlaubt.
 */
function pult_url_aufloesen(string $url): ?array
{
    $teile = parse_url($url);
    if (!$teile || empty($teile['scheme']) || empty($teile['host'])) {
        return null;
    }
    $scheme = strtolower($teile['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) {
        return null;
    }
    $host = $teile['host'];
    $port = isset($teile['port']) ? (int) $teile['port'] : ($scheme === 'https' ? 443 : 80);

    $v4 = [];
    $v6 = [];
    if (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $v4[] = $host;
    } elseif (filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $v6[] = $host;
    } else {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if ($records) {
            foreach ($records as $r) {
                if (!empty($r['ip']))   { $v4[] = $r['ip']; }
                if (!empty($r['ipv6'])) { $v6[] = $r['ipv6']; }
            }
        }
        if (!$v4 && !$v6) {
            $ip = gethostbyname($host);
            if ($ip && $ip !== $host) { $v4[] = $ip; }
        }
    }

    $alle = array_merge($v4, $v6);
    if (!$alle) {
        return null;
    }
    foreach ($alle as $ip) {
        if (!pult_ip_oeffentlich($ip)) {
            return null;   // private/interne Adresse → blockiert
        }
    }
    return ['host' => $host, 'port' => $port, 'ip' => ($v4 ? $v4[0] : $v6[0])];
}

/** Bool-Variante (nur Prüfung). */
function pult_url_erlaubt(string $url): bool
{
    return pult_url_aufloesen($url) !== null;
}

/** Location-Header einer Weiterleitung gegen die Ausgangs-URL auflösen (→ absolute URL oder null). */
function pult_url_absolut(string $location, string $basis): ?string
{
    $location = trim($location);
    if ($location === '') {
        return null;
    }
    if (preg_match('#^https?://#i', $location)) {
        return $location;
    }
    $b = parse_url($basis);
    if (!$b || empty($b['scheme']) || empty($b['host'])) {
        return null;
    }
    $wurzel = $b['scheme'] . '://' . $b['host'] . (isset($b['port']) ? ':' . $b['port'] : '');
    if (strpos($location, '//') === 0) {
        return $b['scheme'] . ':' . $location;
    }
    if ($location[0] === '/') {
        return $wurzel . $location;
    }
    $pfad = isset($b['path']) ? preg_replace('#/[^/]*$#', '/', $b['path']) : '/';
    return $wurzel . $pfad . $location;
}

/**
 * EIN einzelner Abruf ohne Weiterleitung, gepinnt auf die geprüfte IP.
 * Rückgabe null bei Transportfehler, sonst ['code','body','location','zuGross'].
 */
function pult_fetch_einmal(string $url, array $ziel, int $maxBytes, int $timeout, bool $strikt): ?array
{
    if (function_exists('curl_init')) {
        $daten    = '';
        $zuGross  = false;
        $location = '';
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_FOLLOWLOCATION => false,
            // Host fest an die bereits geprüfte IP binden → kein zweiter DNS-Lookup,
            // damit kein DNS-Rebinding zwischen Prüfung und Abruf möglich ist.
            CURLOPT_RESOLVE        => [$ziel['host'] . ':' . $ziel['port'] . ':' . $ziel['ip']],
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_USERAGENT      => 'Funkfeld/1.0 (+selbstgehostet)',
            CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
            CURLOPT_HEADERFUNCTION => function ($ch, $zeile) use (&$location) {
                if (stripos($zeile, 'Location:') === 0) {
                    $location = trim(substr($zeile, 9));
                }
                return strlen($zeile);
            },
            CURLOPT_WRITEFUNCTION  => function ($ch, $chunk) use (&$daten, $maxBytes, &$zuGross) {
                $daten .= $chunk;
                if (strlen($daten) > $maxBytes) {
                    $zuGross = true;
                    return 0;   // bricht den Transfer ab
                }
                return strlen($chunk);
            },
        ]);
        $ok   = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($ok === false && !$zuGross) {
            return null;
        }
        return ['code' => $code, 'body' => $daten, 'location' => $location, 'zuGross' => $zuGross];
    }

    // Bei nutzerdefinierten URLs (Kalender/RSS) ohne cURL gar nicht laden:
    // der Fallback kann den Host nicht an die geprüfte IP binden (DNS-Rebinding).
    if ($strikt) {
        return null;
    }

    // Fallback ohne cURL (nur für feste, vertrauenswürdige Hosts wie OWM)
    $ctx = stream_context_create(['http' => [
        'timeout'       => $timeout,
        'follow_location' => 0,
        'max_redirects' => 0,
        'ignore_errors' => true,
        'header'        => "User-Agent: Funkfeld/1.0\r\n",
    ]]);
    $body = @file_get_contents($url, false, $ctx, 0, $maxBytes);
    if ($body === false) {
        return null;
    }
    $code = 200;
    $location = '';
    foreach ((array) ($http_response_header ?? []) as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $h, $m)) {
            $code = (int) $m[1];
        } elseif (stripos($h, 'Location:') === 0) {
            $location = trim(substr($h, 9));
        }
    }
    return ['code' => $code, 'body' => $body, 'location' => $location, 'zuGross' => false];
}

/**
 * Lädt eine URL serverseitig mit Details für Fehlermeldungen.
 * Folgt höchstens $maxHops Weiterleitungen (Standard 2) — jedes Ziel durchläuft
 * erneut die volle SSRF-Prüfung (nur http/https, nur öffentliche IPs) und wird
 * auf die geprüfte IP gepinnt. $maxHops=0 verbietet Weiterleitungen komplett
 * (Pflicht für host-gebundene Abrufe wie das Selbst-Update — sonst könnte ein
 * Redirect die Host-Bindung aushebeln).
 * Rückgabe: ['body' => ?string, 'code' => int, 'fehler' => ?string].
 */
function pult_fetch_info(string $url, int $maxBytes = 1048576, int $timeout = 8, bool $strikt = false, int $maxHops = 2): array
{
    $aktuell = $url;
    for ($hop = 0; $hop <= $maxHops; $hop++) {
        $ziel = pult_url_aufloesen($aktuell);
        if ($ziel === null) {
            return ['body' => null, 'code' => 0,
                'fehler' => $hop === 0 ? 'Adresse nicht erlaubt (nur http/https, keine internen Server)'
                                       : 'Weiterleitungsziel nicht erlaubt'];
        }
        $antwort = pult_fetch_einmal($aktuell, $ziel, $maxBytes, $timeout, $strikt);
        if ($antwort === null) {
            return ['body' => null, 'code' => 0, 'fehler' => 'nicht erreichbar (Verbindung fehlgeschlagen)'];
        }
        if ($antwort['code'] >= 300 && $antwort['code'] < 400) {
            $naechste = pult_url_absolut($antwort['location'], $aktuell);
            if ($naechste === null) {
                return ['body' => null, 'code' => $antwort['code'], 'fehler' => 'Weiterleitung ohne gültiges Ziel'];
            }
            $aktuell = $naechste;
            continue;
        }
        if ($antwort['zuGross']) {
            return ['body' => null, 'code' => $antwort['code'], 'fehler' => 'Antwort zu groß'];
        }
        if ($antwort['code'] < 200 || $antwort['code'] >= 300) {
            return ['body' => null, 'code' => $antwort['code'], 'fehler' => 'HTTP ' . $antwort['code']];
        }
        return ['body' => $antwort['body'], 'code' => $antwort['code'], 'fehler' => null];
    }
    return ['body' => null, 'code' => 0, 'fehler' => 'zu viele Weiterleitungen'];
}

/**
 * Lädt eine URL serverseitig (Kompatibilitäts-Wrapper). Begrenzte Weiterleitungen
 * mit erneuter SSRF-Prüfung je Ziel, Größen- und Zeitlimit. Body oder null.
 */
function pult_fetch(string $url, int $maxBytes = 1048576, int $timeout = 8, bool $strikt = false, int $maxHops = 2): ?string
{
    return pult_fetch_info($url, $maxBytes, $timeout, $strikt, $maxHops)['body'];
}

/* --- einfacher Datei-Cache unter data/cache/ --- */

function pult_cache_pfad(string $key): string
{
    $key = preg_replace('/[^a-z0-9_]/', '_', strtolower($key));
    return PULT_DATA . '/cache/' . $key . '.json';
}

/** Liefert gecachte Daten, wenn sie nicht älter als $maxAlter Sekunden sind. */
function pult_cache_get(string $key, int $maxAlter)
{
    $d = store_read(pult_cache_pfad($key), null);
    if (!is_array($d) || !isset($d['zeit'])) {
        return null;
    }
    if (time() - (int) $d['zeit'] > $maxAlter) {
        return null;
    }
    return $d['daten'] ?? null;
}

/** Legt Daten in den Cache. */
function pult_cache_set(string $key, $daten): void
{
    $dir = PULT_DATA . '/cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
        // eigener Schutz, falls die data/.htaccess-Vererbung mal nicht greift
        @file_put_contents($dir . '/.htaccess', PULT_HTACCESS_DENY);
    }
    store_write(pult_cache_pfad($key), ['zeit' => time(), 'daten' => $daten]);
}
