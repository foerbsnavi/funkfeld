<?php
require_once __DIR__ . '/core/bootstrap.php';

// Noch nicht installiert? → Installer
if (!pult_installed()) {
    header('Location: install.php');
    exit;
}

$fehler = '';

// Login-Versuch verarbeiten
if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_POST['form'] ?? '') === 'login') {
    $sperre = pult_login_gesperrt();
    if (!csrf_valid($_POST['csrf'] ?? null)) {
        $fehler = 'Sitzung abgelaufen, bitte erneut versuchen.';
    } elseif ($sperre > 0) {
        $fehler = 'Zu viele Fehlversuche. Bitte in ' . (int) ceil($sperre / 60) . ' Minuten erneut versuchen.';
    } elseif (attempt_login((string) ($_POST['passwort'] ?? ''))) {
        pult_login_erfolg();
        header('Location: index.php');
        exit;
    } else {
        pult_login_misserfolg();
        $fehler = 'Falsches Passwort.';
    }
}

// Nicht angemeldet → Login-Seite
if (!is_logged_in()) {
    include __DIR__ . '/views/login.php';
    exit;
}

// Angemeldet, aber kein Dashboard gewählt → Übersicht (anlegen/öffnen)
if (!PULT_HAS_DASH) {
    include __DIR__ . '/views/overview.php';
    exit;
}

// Dashboard gewählt → App-Gerüst
include __DIR__ . '/views/app.php';
