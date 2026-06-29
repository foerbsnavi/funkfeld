FUNKFELD
========

Selbstgehostetes zentrales Management-Dashboard fürs Web: frei verschiebbare
Flächen (Notizen, Checklisten, Kalender, Mail, Wetter, RSS, Chat) und eine
gemeinsame Live-Karte mit Markierungen und Strichen.

https://funkfeld.brosemedien.de


SYSTEMVORAUSSETZUNGEN
---------------------
- PHP 7.4 oder neuer (mit der Standard-Erweiterung json; IMAP optional für Mail)
- Apache-Webserver mit .htaccess-Unterstützung (üblicher Shared-Webspace reicht)
- Keine Datenbank nötig — alle Daten liegen als Dateien auf deinem Webspace
- Für die Karte: Internetverbindung (Leaflet + OpenStreetMap-Kacheln)


INSTALLATION IN 4 SCHRITTEN
---------------------------
1. ZIP entpacken und den kompletten Inhalt in ein Verzeichnis auf
   deinem Webspace hochladen (z. B. /funkfeld/).
2. Sicherstellen, dass der Ordner data/ Schreibrechte hat
   (bei den meisten Hostern automatisch der Fall).
3. install.php im Browser aufrufen und ein Passwort festlegen.
4. Fertig — Funkfeld öffnet sich.


ORDNER-ÜBERSICHT
----------------
index.php      Einstiegspunkt
api.php        JSON-Schnittstelle
install.php    Ersteinrichtung (Passwort setzen)
core/          Programmcode — wird bei Updates ersetzt
assets/        CSS/JS (inkl. assets/js/widgets/ = Flächen-Typen) — wird bei Updates ersetzt
views/         HTML-Gerüste — wird bei Updates ersetzt
data/          deine Konfiguration und Inhalte — bleiben bei Updates erhalten
version.json   installierte Version


LIZENZ
------
Funkfeld steht unter der MIT-Lizenz — frei nutzen, anpassen und weitergeben,
auch kommerziell. Einzige Bedingung: Der Lizenztext in der Datei LICENSE
bleibt erhalten.


FREMDSOFTWARE
-------------
Die Karte nutzt Leaflet (BSD-2-Clause) und OpenStreetMap-Kartenkacheln
(© OpenStreetMap-Mitwirkende, ODbL). Beide werden zur Laufzeit aus dem
Internet geladen und sind nicht Teil dieses Pakets.
