<?php
declare(strict_types=1);

/**
 * Datei-Zwischenlager — hochgeladene Dateien liegen in data/files/<id>.
 * Der Dateiname ist eine generierte ID (kein Originalname → kein Path-Traversal);
 * der echte Name steht nur in der zugehörigen .meta-Datei.
 *
 * Setzt pult_block_id_ok() (core/blocks.php) zur ID-Prüfung voraus.
 */

/** Pfad der Binärdatei. */
function pult_file_pfad(string $id): string
{
    return PULT_FILES . '/' . $id;
}

/** Pfad der zugehörigen Metadaten (Originalname, Größe). */
function pult_file_meta_pfad(string $id): string
{
    return PULT_FILES . '/' . $id . '.meta';
}

/** Löscht eine hochgeladene Datei samt Metadaten. */
function pult_file_delete(string $id): void
{
    if (!pult_block_id_ok($id)) {
        return;
    }
    foreach ([pult_file_pfad($id), pult_file_meta_pfad($id)] as $p) {
        if (is_file($p)) {
            @unlink($p);
        }
    }
}
