<?php
/** App-Gerüst (nur im angemeldeten Zustand eingebunden). */
if (!defined('PULT_ROOT')) {
    http_response_code(403);
    exit;
}
// Alle ausgelieferten Skripte (Reihenfolge = Ladereihenfolge).
$pult_js = [
    'assets/js/confirm.js', 'assets/js/io.js', 'assets/js/einstellungen.js',
    'assets/js/widgets/notiz.js', 'assets/js/widgets/checkliste.js', 'assets/js/widgets/links.js',
    'assets/js/widgets/tabelle.js', 'assets/js/widgets/telefonbuch.js', 'assets/js/widgets/dateien.js',
    'assets/js/widgets/uhr.js', 'assets/js/widgets/wetter.js', 'assets/js/widgets/kalender.js',
    'assets/js/widgets/mail.js', 'assets/js/widgets/rss.js', 'assets/js/widgets/chat.js',
    'assets/js/widgets/karte.js', 'assets/js/widgets/livestream.js', 'assets/js/widgets/wirtschaft.js',
    'assets/js/widgets/custom.js', 'assets/js/pult.js',
];
// Cache-Buster: neueste Änderungszeit über ALLE Assets (CSS + JS), damit auch ein einzelnes
// Widget-Update sofort greift statt eine veraltete Datei aus dem Browser-Cache zu liefern.
$ver_zeiten = [1, (int) @filemtime(__DIR__ . '/../assets/css/pult.css')];
foreach ($pult_js as $src) { $ver_zeiten[] = (int) @filemtime(__DIR__ . '/../' . $src); }
$ver = (string) max($ver_zeiten);
?>
<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Funkfeld — Dashboard</title>
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/pult.css?v=<?= e($ver) ?>">
</head>
<body class="app-body" data-csrf="<?= e(csrf_token()) ?>">

    <?php include __DIR__ . '/topbar.php'; ?>

    <!-- App-Steuerung (zweite, schmale Leiste): Dashboard-Name + Werkzeuge -->
    <header class="toolbar subtoolbar" aria-label="Werkzeugleiste">
        <span class="subtoolbar-name"><?= e(defined('PULT_DASH_OWNER') && defined('PULT_DASH_ID') ? pult_dash_name(PULT_DASH_OWNER, PULT_DASH_ID) : '') ?></span>
        <div class="toolbar-rechts">
            <button type="button" id="btn-einstellungen" class="tb-btn" aria-label="Einstellungen">⚙ Einstellungen</button>
            <div class="baenke" role="group" aria-label="Anordnungsbänke">
                <button type="button" class="tb-btn bank-btn" data-bank="0" aria-label="Anordnungsbank 1">1</button>
                <button type="button" class="tb-btn bank-btn" data-bank="1" aria-label="Anordnungsbank 2">2</button>
                <button type="button" class="tb-btn bank-btn" data-bank="2" aria-label="Anordnungsbank 3">3</button>
                <button type="button" class="tb-btn" id="bank-speichern" aria-pressed="false" aria-label="Anordnung auf eine Bank speichern">Speichern</button>
            </div>
            <select id="ansicht-wahl" class="w-eingabe ansicht-wahl" aria-label="Ansicht">
                <option value="frei">Frei</option>
                <option value="raster">Raster</option>
                <option value="clips">Clips</option>
            </select>
            <button type="button" id="btn-sperre" class="tb-btn tb-icon-btn" aria-pressed="false"
                    aria-label="Ansicht festsetzen"></button>
        </div>
    </header>

    <h1 class="sr-only"><?= e('Funkfeld — ' . (defined('PULT_DASH_OWNER') && defined('PULT_DASH_ID') ? pult_dash_name(PULT_DASH_OWNER, PULT_DASH_ID) : 'Dashboard')) ?></h1>
    <main id="board" class="board" aria-label="Dashboard">
        <div id="leerhinweis" class="leerhinweis" role="status">
            <p class="leerhinweis-gross">Der Steuerstand ist leer.</p>
            <p class="leerhinweis-klein">Unten rechts auf den runden Knopf <span aria-hidden="true">＋</span> tippen, um eine Fläche hinzuzufügen.</p>
        </div>
    </main>

    <!-- Runder Hinzufügen-Knopf (klappt eine Gruppe von Buttons auf) -->
    <div class="fab" id="fab">
        <div class="fab-menu" id="werkzeuge" role="group" aria-label="Fläche hinzufügen">
            <button type="button" class="tb-btn fab-item" data-typ="notiz">Notiz</button>
            <button type="button" class="tb-btn fab-item" data-typ="checkliste">Aufgaben</button>
            <button type="button" class="tb-btn fab-item" data-typ="links">Links</button>
            <button type="button" class="tb-btn fab-item" data-typ="tabelle">Tabelle</button>
            <button type="button" class="tb-btn fab-item" data-typ="telefonbuch">Telefon</button>
            <button type="button" class="tb-btn fab-item" data-typ="dateien">Dateien</button>
            <button type="button" class="tb-btn fab-item" data-typ="uhr">Uhr</button>
            <button type="button" class="tb-btn fab-item" data-typ="wetter">Wetter</button>
            <button type="button" class="tb-btn fab-item" data-typ="kalender">Kalender</button>
            <button type="button" class="tb-btn fab-item" data-typ="mail">Mail</button>
            <button type="button" class="tb-btn fab-item" data-typ="rss">RSS</button>
            <button type="button" class="tb-btn fab-item" data-typ="chat">Chat</button>
            <button type="button" class="tb-btn fab-item" data-typ="karte">Karte</button>
            <button type="button" class="tb-btn fab-item" data-typ="livestream">Livestream</button>
            <button type="button" class="tb-btn fab-item" data-typ="wirtschaft">Wirtschaft</button>
            <button type="button" class="tb-btn fab-item" data-typ="custom">Custom</button>
        </div>
        <button type="button" class="fab-btn" id="fab-btn" aria-controls="werkzeuge" aria-expanded="false"
                aria-label="Fläche hinzufügen">＋</button>
    </div>

    <p id="ansicht-status" class="sr-only" aria-live="polite" aria-atomic="true"></p>
    <p id="flaeche-hilfe" class="sr-only">Pfeiltasten verschieben die Fläche, Shift und Pfeiltasten ändern die Größe, Enter benennt um, Entf schließt.</p>

<?php
    // Skripte (Liste oben definiert) mit Cache-Buster (?v=) ausgeben, damit Updates sofort greifen.
    foreach ($pult_js as $src) {
        echo '    <script src="' . e($src) . '?v=' . e($ver) . '" defer></script>' . "\n";
    }
?>
</body>
</html>
