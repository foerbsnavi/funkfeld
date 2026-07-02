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

/** Strenge Host-Prüfung: erlaubte Zeichen + öffentliche IP. */
function pult_host_erlaubt(string $host): bool
{
    if ($host === '' || strlen($host) > 255) {
        return false;
    }
    // Nur Hostname-/IPv4-Zeichen — schließt }, /, :, Leerzeichen aus (imap_open-Schutz)
    if (!preg_match('/^[A-Za-z0-9.\-]+$/', $host)) {
        return false;
    }
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;   // direkte IP (vom Host-Regex ohnehin auf IPv4 begrenzt)
    } else {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if ($records) {
            foreach ($records as $r) {
                if (!empty($r['ip']))   { $ips[] = $r['ip']; }
                if (!empty($r['ipv6'])) { $ips[] = $r['ipv6']; }
            }
        }
        if (!$ips) {
            $ip = gethostbyname($host);
            if ($ip && $ip !== $host) { $ips[] = $ip; }
        }
    }
    if (!$ips) {
        return false;
    }
    foreach ($ips as $ip) {
        if (!pult_ip_oeffentlich($ip)) {
            return false;
        }
    }
    return true;
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
