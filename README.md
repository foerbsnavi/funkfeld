# Funkfeld

Ein selbstgehostetes **zentrales Management-Dashboard** fürs Web — frei verschiebbare
Flächen (Notizen, Checklisten, Kalender, Mail, Wetter, RSS, Chat …) und eine **gemeinsame
Live-Karte** mit Markierungen und Strichen auf einem dunklen Steuerstand. Mehrere Dashboards
je Konto/Instanz.

Reines PHP + JavaScript + CSS. **Keine Datenbank** (nur JSON-Dateien), kein Build-Schritt,
keine Server-Abhängigkeiten. Läuft auf einfachem Shared-Webspace.

🔗 **Demo / Hosted:** [funkfeld.brosemedien.de](https://funkfeld.brosemedien.de/)

## Funktionen

- **Flächen frei anordnen** – ziehen, stapeln, Größe ändern. Drei Ansichten:
  **Frei**, **Raster** und **Clips** (magnetisches Einrasten mit 10 px Abstand und
  Trenn-Griffen zum gemeinsamen Anpassen benachbarter Kacheln).
- **Mehrere Dashboards** je Konto/Instanz, **3 Anordnungsbänke** zum Speichern/Abrufen
  von Layouts, **Festsetzen** per Schloss.
- **Flächen-Typen:** Notiz · Aufgaben · Links · Tabelle · Telefonbuch · Dateien · Uhr ·
  Wetter (3-Tage-Vorschau) · Kalender (ICS) · Mail (IMAP, lesend) · RSS · Chat ·
  **Live-Karte** (Leaflet) · **Livestream** (Webcam/Standbild) ·
  **Wirtschaft** (Gold/Bitcoin/Euro/US-Dollar, 1 Woche – 5 Jahre) ·
  **Custom** (eigenes HTML/JS, sicher im Sandbox-iframe).
- **Teilen** einzelner Dashboards, **Export/Import** als XML zum Sichern.
- **Selbst-Update**: prüft die veröffentlichte Version und spielt Updates ein, ohne
  die Daten anzutasten.

## Installation

1. Den Ordner per FTP auf den Webspace laden.
2. Sicherstellen, dass der Ordner `data/` **beschreibbar** ist (Schreibrechte).
3. Im Browser `install.php` aufrufen und ein Passwort setzen.
4. Fertig — Funkfeld öffnet sich.

> Voraussetzung: PHP 7.4 oder neuer. Kein Node.js, keine Datenbank nötig.
> Die Karte nutzt Leaflet + OpenStreetMap-Kacheln (Internetverbindung nötig).

## Sicherheit

- Alles liegt hinter einem Login (Passwort gehasht).
- Das Verzeichnis `data/` ist per `.htaccess` vor direktem Zugriff geschützt.

## Hinweise

- **Bedienung der Karte:** Marker setzen, Linien zeichnen und die Trenn-Griffe im Clips-Modus
  sind zeiger-/mausbasiert und derzeit nicht per Tastatur erreichbar (bekannte Einschränkung
  bei kartografischen Widgets). Alle übrigen Funktionen sind voll tastaturbedienbar.
- **Bilder/Livestream & geteilte Dashboards:** Für das Livestream-Widget erlaubt die CSP
  beliebige `https:`-Bildquellen. In *geteilten* Dashboards kann ein Ersteller darüber (z. B. per
  eingebettetem Bild) die IP von Betrachtern bei einem fremden Server protokollieren. Teile
  Dashboards daher nur mit Personen, denen du vertraust.
- **Plattform-Modus (optional):** Liegt eine `core.php` eine Verzeichnisebene über der Anwendung,
  schaltet Funkfeld automatisch in einen eingebetteten Modus (Login/Datenhaltung über eine
  übergeordnete Account-App). Für den normalen Selbstbetrieb ist das ohne Bedeutung — dann gilt
  der eigenständige Modus mit eigenem Passwort-Login (`install.php`).

## Lizenz

MIT — siehe [LICENSE](LICENSE).
