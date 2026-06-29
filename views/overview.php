<?php
/** Dashboard-Übersicht: mehrere Dashboards anlegen/öffnen/teilen. */
if (!defined('PULT_ROOT')) { http_response_code(403); exit; }
$ver      = (string) max((int) @filemtime(__DIR__ . '/../assets/js/pult.js'), (int) @filemtime(__DIR__ . '/../assets/css/pult.css'), 1);
$platform = defined('PULT_PLATFORM') && PULT_PLATFORM;
$eigner   = pult_dash_eigner();
$basis    = pult_dash_basis_von($eigner);
$eigene   = $basis !== null ? pult_dash_liste($basis) : [];
$joined   = pult_dash_joined();
$version  = (string) (store_read(PULT_ROOT . '/version.json', [])['version'] ?? '');
?>
<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Funkfeld — Dashboards</title>
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/pult.css?v=<?= e($ver) ?>">
</head>
<body class="app-body" data-csrf="<?= e(csrf_token()) ?>">

    <?php include __DIR__ . '/topbar.php'; ?>

    <main class="uebersicht">
        <h1 class="uebersicht-titel">Deine Dashboards</h1>
        <p class="uebersicht-info">Lege beliebig viele Dashboards an. Ein Klick auf „Öffnen“ bringt dich in den Steuerstand.</p>

        <div class="uebersicht-grid">
<?php foreach ($eigene as $it): $id = (string) ($it['id'] ?? ''); $nm = (string) ($it['name'] ?? 'Dashboard'); ?>
            <div class="dash-karte" data-id="<?= e($id) ?>" data-o="<?= e($eigner) ?>">
                <h2 class="dash-name"><?= e($nm) ?></h2>
                <div class="dash-karte-knoepfe">
                    <a class="w-sekundaer-btn dash-oeffnen" href="?o=<?= e($eigner) ?>&amp;d=<?= e($id) ?>" aria-label="Dashboard „<?= e($nm) ?>“ öffnen">Öffnen</a>
                    <button type="button" class="w-sekundaer-btn" data-akt="rename" aria-label="Dashboard „<?= e($nm) ?>“ umbenennen">Umbenennen</button>
<?php if ($platform): ?>
                    <button type="button" class="w-sekundaer-btn" data-akt="share" aria-expanded="false" aria-label="Dashboard „<?= e($nm) ?>“ teilen">Teilen</button>
<?php endif; ?>
                    <a class="w-sekundaer-btn dash-export" href="api.php?action=dash_export&amp;id=<?= e($id) ?>" aria-label="Dashboard „<?= e($nm) ?>“ als XML exportieren">Export</a>
                    <button type="button" class="w-sekundaer-btn dash-loeschen" data-akt="delete" aria-label="Dashboard „<?= e($nm) ?>“ löschen">Löschen</button>
                </div>
                <div class="dash-share" hidden></div>
            </div>
<?php endforeach; ?>

<?php foreach ($joined as $e): $o = (string) ($e['o'] ?? ''); $d = (string) ($e['d'] ?? ''); $nm = (string) ($e['name'] ?? 'Dashboard'); ?>
            <div class="dash-karte dash-fremd" data-id="<?= e($d) ?>" data-o="<?= e($o) ?>">
                <span class="dash-marke">geteilt</span>
                <h2 class="dash-name"><?= e($nm) ?></h2>
                <div class="dash-karte-knoepfe">
                    <a class="w-sekundaer-btn dash-oeffnen" href="?o=<?= e($o) ?>&amp;d=<?= e($d) ?>" aria-label="Geteiltes Dashboard „<?= e($nm) ?>“ öffnen">Öffnen</a>
                    <button type="button" class="w-sekundaer-btn" data-akt="leave" aria-label="Geteiltes Dashboard „<?= e($nm) ?>“ verlassen">Verlassen</button>
                </div>
            </div>
<?php endforeach; ?>

            <form class="dash-karte dash-neu" id="dash-neu-form" aria-label="Neues Dashboard anlegen">
                <h2 class="dash-name">Neues Dashboard</h2>
                <input type="text" id="dash-neu-name" class="w-eingabe" placeholder="Name…" maxlength="60" required aria-label="Name des neuen Dashboards">
                <button type="submit" class="w-sekundaer-btn">+ Anlegen</button>
            </form>
        </div>

        <div class="uebersicht-fuss">
            <div class="uebersicht-import">
                <button type="button" class="w-sekundaer-btn" id="dash-import-btn">Dashboard importieren (XML)</button>
                <input type="file" id="dash-import-datei" accept=".xml,text/xml,application/xml" hidden>
                <span id="import-status" class="uebersicht-meldung" aria-live="polite"></span>
            </div>
            <div class="uebersicht-version">
                <span>Funkfeld <?= e($version !== '' ? 'v' . $version : '') ?></span>
<?php if (!$platform): ?>
                <button type="button" class="w-mini" id="update-pruefen">nach Updates suchen</button>
                <span id="update-status" class="uebersicht-meldung" aria-live="polite"></span>
                <button type="button" class="w-sekundaer-btn" id="update-anwenden" hidden>Jetzt aktualisieren</button>
<?php endif; ?>
            </div>
        </div>
    </main>

    <script src="assets/js/confirm.js?v=<?= e($ver) ?>" defer></script>
    <script src="assets/js/overview.js?v=<?= e($ver) ?>" defer></script>
</body>
</html>
