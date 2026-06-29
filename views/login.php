<?php
/** Login-Seite von Funkfeld. Erwartet $fehler aus index.php. */
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
    <title>Funkfeld — Anmelden</title>
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="assets/css/pult.css?v=<?= e($ver) ?>">
</head>
<body class="login-body">
    <main class="login-karte">
        <h1 class="login-logo">Funkfeld</h1>
        <p class="login-sub">Dein zentrales Dashboard</p>

        <?php if ($fehler !== ''): ?>
            <p class="login-fehler" role="alert"><?= e($fehler) ?></p>
        <?php endif; ?>

        <form method="post" action="index.php" class="login-form">
            <input type="hidden" name="form" value="login">
            <input type="hidden" name="csrf" value="<?= e(csrf_token()) ?>">

            <label for="passwort">Passwort</label>
            <input type="password" id="passwort" name="passwort"
                   autocomplete="current-password" required autofocus>

            <button type="submit">Anmelden</button>
        </form>
    </main>
</body>
</html>
