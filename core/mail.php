<?php
declare(strict_types=1);

/**
 * Mail (IMAP, nur Lesen). Verbindung immer per SSL. Das Passwort wird
 * verschlüsselt gespeichert (AES-256-GCM via core/crypto.php, Feld pw_enc in den
 * Einstellungen) und nur serverseitig für die IMAP-Verbindung entschlüsselt —
 * es verlässt den Server nie (einstellung_get liefert nur „gesetzt?").
 *
 * Sicherheit: der Host wird streng geprüft (nur Hostname/IPv4-Zeichen → keine
 * imap_open-Einschleusung) und muss auf eine öffentliche IP zeigen (kein SSRF
 * gegen interne Dienste). Setzt pult_ip_oeffentlich() aus core/feeds.php voraus.
 */

/** Ist die PHP-IMAP-Erweiterung vorhanden? */
function pult_mail_verfuegbar(): bool
{
    return function_exists('imap_open');
}

/** Strenge Host-Prüfung: erlaubte Zeichen + öffentliche IP (nutzt pult_host_ip, s. u.). */
function pult_host_erlaubt(string $host): bool
{
    return pult_host_ip($host) !== null;
}

/**
 * Löst einen Hostnamen auf und gibt EINE geprüfte öffentliche IP zurück (oder null).
 * Wie pult_url_aufloesen (feeds.php), aber für einen reinen Host (SMTP): der Aufrufer
 * verbindet dann direkt zu dieser IP → kein zweiter DNS-Lookup, kein DNS-Rebinding.
 */
function pult_host_ip(string $host): ?string
{
    if ($host === '' || strlen($host) > 255 || !preg_match('/^[A-Za-z0-9.\-]+$/', $host)) {
        return null;
    }
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
            return null;   // eine interne/reservierte IP → komplett ablehnen
        }
    }
    return $v4 ? $v4[0] : $v6[0];
}

/** Öffnet eine read-only IMAP-Verbindung (immer SSL) oder gibt false zurück. */
function pult_mail_oeffnen(string $host, int $port, string $user, string $pw)
{
    if (!pult_mail_verfuegbar() || !pult_host_erlaubt($host)) {
        return false;
    }
    if ($port < 1 || $port > 65535) {
        return false;
    }
    // Benutzername absichern (nur druckbares ASCII, keine Steuerzeichen → keine Options-Einschleusung)
    if ($user === '' || strlen($user) > 255 || !preg_match('/^[\x20-\x7E]+$/', $user)) {
        return false;
    }
    @imap_timeout(IMAP_OPENTIMEOUT, 8);
    @imap_timeout(IMAP_READTIMEOUT, 8);
    $mailbox = '{' . $host . ':' . $port . '/imap/ssl}INBOX';
    $imap = @imap_open($mailbox, $user, $pw, OP_READONLY, 1);
    return $imap ?: false;
}

/** Dekodiert einen MIME-Header (Betreff/Absender) nach UTF-8. */
function pult_mail_decode(string $s): string
{
    $teile = @imap_mime_header_decode($s);
    if (!$teile) {
        return $s;
    }
    $out = '';
    foreach ($teile as $t) {
        $cs  = strtoupper($t->charset ?? 'default');
        $txt = $t->text;
        if ($cs !== 'DEFAULT' && $cs !== 'UTF-8' && $cs !== '') {
            $conv = @iconv($cs, 'UTF-8//IGNORE', $txt);
            if ($conv !== false) { $txt = $conv; }
        }
        $out .= $txt;
    }
    return $out;
}

/** Liefert die neuesten Kopfzeilen (max $anzahl), neueste zuerst. */
function pult_mail_liste($imap, int $anzahl = 15): array
{
    $gesamt = @imap_num_msg($imap);
    if (!$gesamt) {
        return [];
    }
    $von = max(1, $gesamt - $anzahl + 1);
    $overview = @imap_fetch_overview($imap, $von . ':' . $gesamt, 0);
    if (!$overview) {
        return [];
    }
    $liste = [];
    foreach ($overview as $o) {
        $liste[] = [
            'uid'     => (int) ($o->uid ?? 0),
            'von'     => mb_substr(pult_mail_decode((string) ($o->from ?? '')), 0, 200),
            'betreff' => mb_substr(pult_mail_decode((string) ($o->subject ?? '(kein Betreff)')), 0, 300),
            'datum'   => !empty($o->date) ? (strtotime($o->date) ?: null) : null,
            'gesehen' => !empty($o->seen),
        ];
    }
    usort($liste, function ($a, $b) { return ($b['datum'] ?? 0) <=> ($a['datum'] ?? 0); });
    return $liste;
}

/** Sucht rekursiv den text/plain-Teil einer MIME-Struktur. */
function pult_mail_finde_plain(array $parts, string $prefix): ?array
{
    foreach ($parts as $i => $p) {
        $nr = ($prefix === '') ? (string) ($i + 1) : $prefix . '.' . ($i + 1);
        if ((int) ($p->type ?? -1) === 0 && strtoupper($p->subtype ?? '') === 'PLAIN') {
            $charset = 'UTF-8';
            if (!empty($p->parameters)) {
                foreach ($p->parameters as $pp) {
                    if (strtoupper($pp->attribute) === 'CHARSET') { $charset = $pp->value; }
                }
            }
            return ['nr' => $nr, 'enc' => (int) ($p->encoding ?? 0), 'charset' => $charset];
        }
        if (!empty($p->parts)) {
            $r = pult_mail_finde_plain($p->parts, $nr);
            if ($r) { return $r; }
        }
    }
    return null;
}

/** Dekodiert einen Body-Teil (base64 / quoted-printable) nach UTF-8. */
function pult_mail_dekodiere(string $roh, int $enc, string $charset): string
{
    if ($enc === 3)      { $roh = base64_decode($roh); }
    elseif ($enc === 4)  { $roh = quoted_printable_decode($roh); }
    $cs = strtoupper($charset);
    if ($cs !== 'UTF-8' && $cs !== '') {
        $conv = @iconv($cs, 'UTF-8//IGNORE', $roh);
        if ($conv !== false) { $roh = $conv; }
    }
    return $roh;
}

/** Holt den Klartext einer Nachricht (per UID, ohne sie als gelesen zu markieren). */
function pult_mail_text($imap, int $uid): string
{
    $struktur = @imap_fetchstructure($imap, $uid, FT_UID);
    $text = '';
    if ($struktur && !empty($struktur->parts)) {
        $teil = pult_mail_finde_plain($struktur->parts, '');
        if ($teil) {
            $roh  = (string) @imap_fetchbody($imap, $uid, $teil['nr'], FT_UID | FT_PEEK);
            $text = pult_mail_dekodiere($roh, $teil['enc'], $teil['charset']);
        }
    }
    if ($text === '') {
        $roh  = (string) @imap_body($imap, $uid, FT_UID | FT_PEEK);
        $enc  = (int) (is_object($struktur) ? ($struktur->encoding ?? 0) : 0);
        $text = pult_mail_dekodiere($roh, $enc, 'UTF-8');
    }
    if (mb_strlen($text) > 20000) {
        $text = mb_substr($text, 0, 20000);
    }
    return $text;
}

/* ===========================================================================
   Mail SENDEN (SMTP). Eigener minimaler Client (kein Fremd-Paket):
   - Verbindung per SSL (Port 465) oder STARTTLS (Port 587), Zertifikat wird geprüft.
   - Host SSRF-geprüft (pult_host_ip → nur öffentliche IPs) und zur geprüften IP verbunden.
   - Absender ist FEST aus dem Konto (kein frei wählbares From) → kein Spoofing-Relay.
   - Genau ein Empfänger, nur Text (base64/UTF-8), Header-Injection-Schutz (CR/LF).
   =========================================================================== */

/** Eine SMTP-Antwort lesen (mehrzeilig bis „NNN ␣…"). */
function pult_smtp_lesen($fp): string
{
    $data = '';
    while (($line = fgets($fp, 1024)) !== false) {
        $data .= $line;
        // letzte Zeile einer Antwort: 4. Zeichen ist ein Leerzeichen (z. B. "250 OK")
        if (strlen($line) >= 4 && $line[3] === ' ') {
            break;
        }
        if (strlen($data) > 65536) {
            break;   // Schutz gegen endlose Antworten
        }
    }
    return $data;
}
function pult_smtp_code(string $resp): int { return (int) substr($resp, 0, 3); }

/**
 * Versendet eine Text-Mail über das SMTP eines Kontos.
 * Rückgabe: '' bei Erfolg, sonst eine kurze Fehlermeldung (keine Serverinterna).
 */
function pult_smtp_senden(array $konto, string $an, string $betreff, string $text): string
{
    $host   = (string) ($konto['smtp_host'] ?? '');
    $port   = (int) ($konto['smtp_port'] ?? 465);
    $secure = (string) ($konto['smtp_secure'] ?? 'ssl');   // 'ssl' (465) | 'starttls' (587)
    $user   = (string) ($konto['user'] ?? '');
    $pass   = pult_decrypt((string) ($konto['pw_enc'] ?? ''));
    $von    = (string) ($konto['absender'] ?? '');
    if ($von === '') { $von = $user; }

    if (!in_array($port, [465, 587], true))                       return 'SMTP-Port muss 465 oder 587 sein';
    if ($pass === '')                                             return 'Kein Passwort hinterlegt';
    if (!filter_var($von, FILTER_VALIDATE_EMAIL))                 return 'Absenderadresse ungültig';
    if (!filter_var($an, FILTER_VALIDATE_EMAIL))                  return 'Empfängeradresse ungültig';
    // Header-Injection-Schutz: keine Steuerzeichen in Adressen/Betreff
    if (preg_match('/[\r\n]/', $an . $von . $betreff))            return 'Ungültige Zeichen im Kopf';
    if (mb_strlen($betreff) > 250)                               { $betreff = mb_substr($betreff, 0, 250); }
    if (mb_strlen($text) > 50000)                                { $text = mb_substr($text, 0, 50000); }

    // Host EINMAL zu einer geprüften öffentlichen IP auflösen und dorthin verbinden
    // (kein zweiter DNS-Lookup → kein DNS-Rebinding). Zertifikat wird trotzdem gegen
    // den Hostnamen geprüft (peer_name).
    $ip = pult_host_ip($host);
    if ($ip === null)                                             return 'SMTP-Server nicht erlaubt';
    $ipHost = (strpos($ip, ':') !== false) ? '[' . $ip . ']' : $ip;   // IPv6 klammern

    $ssl  = ($secure === 'ssl');
    $ziel = ($ssl ? 'ssl://' : 'tcp://') . $ipHost . ':' . $port;
    $ctx  = stream_context_create(['ssl' => [
        'verify_peer'       => true,
        'verify_peer_name'  => true,
        'SNI_enabled'       => true,
        'peer_name'         => $host,   // Cert gegen den Hostnamen, obwohl zur IP verbunden
    ]]);
    $errno = 0; $errstr = '';
    $fp = @stream_socket_client($ziel, $errno, $errstr, 12, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        return 'Verbindung zum SMTP-Server fehlgeschlagen';
    }
    stream_set_timeout($fp, 12);

    $schritt = function (string $cmd, $erwartet, ?string $sende = null) use ($fp) {
        // $sende=null → nur lesen (Begrüßung); sonst Befehl schreiben und Antwort prüfen
        if ($sende !== null) { fwrite($fp, $sende . "\r\n"); }
        $r    = pult_smtp_lesen($fp);
        $code = pult_smtp_code($r);
        $ok   = is_array($erwartet) ? in_array($code, $erwartet, true) : ($code === $erwartet);
        return $ok ? '' : $cmd;   // '' = ok, sonst Name des fehlgeschlagenen Schritts
    };

    $ehlo = 'funkfeld';
    $fehler = '';
    do {
        if (($fehler = $schritt('Begrüßung', 220)))                       break;
        if (($fehler = $schritt('EHLO', 250, 'EHLO ' . $ehlo)))           break;
        if (!$ssl && $secure === 'starttls') {
            if (($fehler = $schritt('STARTTLS', 220, 'STARTTLS')))        break;
            if (!@stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT
                    | STREAM_CRYPTO_METHOD_TLSv1_1_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT)) {
                $fehler = 'TLS'; break;
            }
            if (($fehler = $schritt('EHLO-TLS', 250, 'EHLO ' . $ehlo)))   break;
        }
        if (($fehler = $schritt('AUTH', 334, 'AUTH LOGIN')))              break;
        if (($fehler = $schritt('Benutzer', 334, base64_encode($user)))) break;
        if (($fehler = $schritt('Anmeldung', 235, base64_encode($pass)))) break;
        if (($fehler = $schritt('MAIL FROM', 250, 'MAIL FROM:<' . $von . '>'))) break;
        if (($fehler = $schritt('RCPT TO', [250, 251], 'RCPT TO:<' . $an . '>'))) break;
        if (($fehler = $schritt('DATA', 354, 'DATA')))                   break;

        // Nachricht: Header + base64-Body (base64 vermeidet Zeilenlängen-/Punkt-Probleme)
        $kopf = [
            'Date: ' . date('r'),
            'From: <' . $von . '>',
            'To: <' . $an . '>',
            'Subject: =?UTF-8?B?' . base64_encode($betreff) . '?=',
            'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . $host . '>',
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
        ];
        $nachricht = implode("\r\n", $kopf) . "\r\n\r\n" . chunk_split(base64_encode($text));
        $nachricht = preg_replace('/\r\n|\r|\n/', "\r\n", $nachricht);
        $nachricht = preg_replace('/^\./m', '..', $nachricht);   // Punkt-Stuffing (bei base64 nie nötig, sicherheitshalber)
        fwrite($fp, $nachricht . "\r\n.\r\n");
        $fehler = $schritt('Versand', 250, null);
    } while (false);

    @fwrite($fp, "QUIT\r\n");
    @fclose($fp);

    if ($fehler === '') {
        return '';
    }
    // Nutzerfreundliche Meldung je Schritt
    $texte = [
        'Anmeldung' => 'Anmeldung am SMTP-Server fehlgeschlagen (Zugangsdaten prüfen)',
        'AUTH'      => 'SMTP-Server unterstützt AUTH LOGIN nicht',
        'RCPT TO'   => 'Empfänger vom Server abgelehnt',
        'TLS'       => 'Verschlüsselung (STARTTLS) fehlgeschlagen',
    ];
    return $texte[$fehler] ?? ('Versand fehlgeschlagen (' . $fehler . ')');
}
