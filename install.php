<?php
require_once __DIR__ . '/core/bootstrap.php';

// Schon installiert? → zur App
if (pult_installed()) {
    header('Location: index.php');
    exit;
}

$fehler = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!csrf_valid($_POST['csrf'] ?? null)) {
        $fehler = 'Sitzung abgelaufen, bitte Seite neu laden.';
    } else {
        $pw  = (string) ($_POST['passwort'] ?? '');
        $pw2 = (string) ($_POST['passwort2'] ?? '');

        if (strlen($pw) < 8) {
            $fehler = 'Das Passwort muss mindestens 8 Zeichen haben.';
        } elseif ($pw !== $pw2) {
            $fehler = 'Die Passwörter stimmen nicht überein.';
        } else {
            // Instanz-Konfiguration (Passwort) schreiben. Dashboards legt man danach in der Übersicht an.
            $cfg = [
                'auth'     => ['hash' => password_hash($pw, PASSWORD_DEFAULT)],
                'erstellt' => date('c'),
            ];
            if (!store_write(PULT_INSTALL_CONFIG, $cfg)) {
                $fehler = 'Konnte die Konfiguration nicht schreiben — sind die Schreibrechte für data/ gesetzt?';
            } else {
                attempt_login($pw);
                header('Location: index.php');
                exit;
            }
        }
    }
}

include __DIR__ . '/views/install.php';
