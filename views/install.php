<?php
/** Einrichtungs-Seite von Funkfeld. Erwartet $fehler aus install.php. */
if (!defined('PULT_ROOT')) {
    http_response_code(403);
    exit;
}
$fehler = $fehler ?? '';
$ver = (string) max((int) @filemtime(__DIR__ . '/../assets/css/pult.css'), 1);
?>
<!DOCTYPE html>
<html lang="de" data-theme="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Funkfeld — Einrichten</title>
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/pult.css?v=<?= e($ver) ?>">
</head>
<body class="login-body">
    <main class="login-karte">
        <h1 class="login-logo">Funkfeld</h1>
        <p class="login-sub">Einrichtung — lege ein Passwort fest</p>

        <?php if ($fehler !== ''): ?>
            <p class="login-fehler" role="alert"><?= e($fehler) ?></p>
        <?php endif; ?>

        <form method="post" action="install.php" class="login-form">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">

            <label for="passwort">Passwort (mind. 8 Zeichen)</label>
            <input type="password" id="passwort" name="passwort"
                   autocomplete="new-password" minlength="8" required autofocus>

            <label for="passwort2">Passwort wiederholen</label>
            <input type="password" id="passwort2" name="passwort2"
                   autocomplete="new-password" minlength="8" required>

            <button type="submit">Funkfeld einrichten</button>
        </form>
    </main>
</body>
</html>
