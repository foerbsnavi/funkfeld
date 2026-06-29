<?php
/** Einheitliche Plattform-Kopfleiste (identisch zu CMF + Account-Seiten).
 *  Einbinden in views/app.php und views/overview.php. */
if (!defined('PULT_ROOT')) { return; }
$ff_platform = defined('PULT_PLATFORM') && PULT_PLATFORM;
$ff_dash_url = $ff_platform ? '/app/funkfeld/?uebersicht=1' : 'index.php?uebersicht=1';
?>
    <div class="ff-topbar">
        <div class="ff-topbar-inner">
            <a class="ff-marke" href="/"><span>Funkfeld</span></a>
            <nav class="ff-topnav" aria-label="Funkfeld">
                <a class="ff-topnav-link aktiv" aria-current="page" href="<?= e($ff_dash_url) ?>">Dashboards</a>
<?php if ($ff_platform): ?>
                <a class="ff-topnav-link" href="/app/?p=profil">Profil</a>
<?php if (defined('PULT_ACCOUNT_ADMIN') && PULT_ACCOUNT_ADMIN): ?>
                <a class="ff-topnav-link" href="/app/?p=admin">Verwaltung</a>
<?php endif; ?>
                <a class="ff-topnav-link ff-abmelden" href="/app/?p=logout">Abmelden</a>
<?php else: ?>
                <button type="button" id="btn-logout" class="ff-topnav-link ff-abmelden">Abmelden</button>
<?php endif; ?>
            </nav>
        </div>
    </div>
