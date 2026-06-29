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

/**
 * Lädt eine URL serverseitig. Folgt KEINEN Weiterleitungen (SSRF-Umgehung),
 * begrenzt Größe und Zeit. Gibt den Body oder null zurück.
 */
function pult_fetch(string $url, int $maxBytes = 1048576, int $timeout = 8, bool $strikt = false): ?string
{
    $ziel = pult_url_aufloesen($url);
    if ($ziel === null) {
        return null;
    }

    if (function_exists('curl_init')) {
        $daten   = '';
        $zuGross = false;
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

        if ($zuGross || $ok === false || $code < 200 || $code >= 300) {
            return null;
        }
        return $daten;
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
    // HTTP-Status aus den Antwort-Headern prüfen (sonst käme auch ein 4xx/5xx-Body durch)
    if (isset($http_response_header[0])
        && preg_match('#^HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) {
        $code = (int) $m[1];
        if ($code < 200 || $code >= 300) {
            return null;
        }
    }
    return $body;
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
