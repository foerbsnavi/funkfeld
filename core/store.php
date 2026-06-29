<?php
declare(strict_types=1);

/**
 * Atomarer JSON-Speicher — Funkfelds einzige "Datenbank".
 * Lesen liefert bei fehlender/kaputter Datei den Vorgabewert.
 * Schreiben erfolgt atomar: erst in eine temporäre Datei, dann umbenennen.
 */

/**
 * Liest eine JSON-Datei als Array.
 *
 * @param mixed $default Rückgabewert, wenn die Datei fehlt oder ungültig ist.
 * @return mixed
 */
function store_read(string $path, $default = null)
{
    if (!is_file($path)) {
        return $default;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $default;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

/**
 * Schreibt Daten atomar als hübsches JSON.
 *
 * @param mixed $data
 */
function store_write(string $path, $data): bool
{
    $dir = dirname($path);
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        return false;
    }

    $json = json_encode(
        $data,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    if ($json === false) {
        return false;
    }

    // Temporär schreiben, dann atomar umbenennen
    // (rename ist atomar, solange Quelle und Ziel im selben Dateisystem liegen).
    $tmp = $path . '.tmp.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) {
        return false;
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }
    @chmod($path, 0664);
    return true;
}
