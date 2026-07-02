<?php
declare(strict_types=1);

/**
 * Leichte Verschlüsselung für gespeicherte Zugangsdaten (z. B. Mail-Passwort).
 * Der App-Schlüssel liegt in data/key.bin (separat von config.json, beide vom
 * Web gesperrt). Schützt, falls nur config.json durchsickert — auf Shared-Hosting
 * ohne echten Schlüsseltresor kein 100%-Schutz, aber Verteidigung in der Tiefe.
 */

/** Verschlüsselung verfügbar (openssl-Erweiterung)? */
function pult_crypto_verfuegbar(): bool
{
    return function_exists('openssl_encrypt');
}

/** Liefert (oder erzeugt) den 32-Byte-App-Schlüssel. */
function pult_app_key(): string
{
    $pfad = PULT_DATA . '/key.bin';
    if (is_file($pfad)) {
        $k = @file_get_contents($pfad);
        if ($k !== false && strlen($k) === 32) {
            return $k;
        }
    }
    $k = random_bytes(32);
    @file_put_contents($pfad, $k, LOCK_EX);
    @chmod($pfad, 0600);
    return $k;
}

/** Verschlüsselt einen String (AES-256-GCM) → base64, oder '' bei Fehler. */
function pult_encrypt(string $klartext): string
{
    if (!pult_crypto_verfuegbar()) {
        return '';
    }
    $key = pult_app_key();
    $iv  = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($klartext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        return '';
    }
    return base64_encode($iv . $tag . $cipher);
}

/** Entschlüsselt einen mit pult_encrypt() erzeugten Wert (oder '' bei Fehler). */
function pult_decrypt(string $code): string
{
    if (!pult_crypto_verfuegbar() || $code === '') {
        return '';
    }
    $raw = base64_decode($code, true);
    if ($raw === false || strlen($raw) < 29) {
        return '';
    }
    $iv     = substr($raw, 0, 12);
    $tag    = substr($raw, 12, 16);
    $cipher = substr($raw, 28);
    $key    = pult_app_key();
    $plain  = openssl_decrypt($cipher, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return $plain === false ? '' : $plain;
}

/* ---------------------------------------------------------------------------
   Zugangsdaten „at rest" verschlüsseln (Token, Kalender-URL, DAV-Logins …).
   Gespeichert wird ein selbstbeschreibender Wert mit Präfix ENC1:, damit
   Klartext-Altbestand weiter lesbar ist (Migration beim nächsten Speichern).
   Nur für sensible Zugänge gedacht — nicht für Inhalte (Chat/Notizen/Kontakte).
   --------------------------------------------------------------------------- */

const PULT_ENC_PRAEFIX = 'ENC1:';

/** Ist ein gespeicherter Wert bereits verschlüsselt? */
function pult_ist_geheim(string $wert): bool
{
    return strncmp($wert, PULT_ENC_PRAEFIX, strlen(PULT_ENC_PRAEFIX)) === 0;
}

/**
 * Bereitet einen Zugangsdaten-Wert zum Speichern auf: verschlüsselt ihn
 * (Präfix ENC1:). Leerer Wert bleibt leer. Steht keine Verschlüsselung zur
 * Verfügung, wird der Klartext gespeichert (Funktion vor Schutz — kein
 * Datenverlust; auf Standard-PHP ist openssl praktisch immer vorhanden).
 * Ein bereits verschlüsselter Wert wird nicht doppelt verschlüsselt.
 */
function pult_geheim(string $klar): string
{
    if ($klar === '' || pult_ist_geheim($klar)) {
        return $klar;
    }
    if (!pult_crypto_verfuegbar()) {
        return $klar;
    }
    $code = pult_encrypt($klar);
    return $code !== '' ? (PULT_ENC_PRAEFIX . $code) : $klar;
}

/** Liest einen gespeicherten Zugangsdaten-Wert im Klartext (entschlüsselt bei Präfix). */
function pult_klartext(string $wert): string
{
    if ($wert === '') {
        return '';
    }
    if (!pult_ist_geheim($wert)) {
        return $wert;   // Altbestand: noch Klartext
    }
    return pult_decrypt(substr($wert, strlen(PULT_ENC_PRAEFIX)));
}
