# Änderungsverlauf

Alle nennenswerten Änderungen an Funkfeld werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [1.0.0] – 2026-06-29

### Erste öffentliche Version

Selbstgehostetes, zentrales Management-Dashboard in reinem PHP + JavaScript + CSS,
**ohne Datenbank** (alle Daten als JSON-Dateien), ohne Build-Schritt auf dem Server.

**Flächen (Widgets):** Notiz, Aufgaben, Links, Tabelle, Telefonbuch, Dateien, Uhr,
Wetter (mit 3-Tage-Vorschau), Kalender (ICS), Mail (IMAP, lesend), RSS, Chat,
Live-Karte (Leaflet), Livestream (Webcam-/Standbild), Wirtschaft (Gold/Bitcoin/
Euro/US-Dollar als 1-Jahres-Verlauf, Spannen 1 Woche bis 5 Jahre) und Custom
(eigenes HTML/JS in einem abgeschotteten Sandbox-iframe).

**Oberfläche:** mehrere Dashboards je Konto/Instanz, drei Ansichten (Frei, Raster,
Clips mit magnetischem Einrasten + Trenn-Griffen), drei Anordnungsbänke, „Festsetzen"
per Schloss, einheitliche Kopfleiste.

**Daten & Betrieb:** Export/Import einzelner Dashboards als XML, optionales
Selbst-Update (lädt das aktuelle Paket und ersetzt nur den Code – Daten bleiben),
Mehrnutzer-Betrieb über geteilte Dashboards.

**Sicherheit:** Login mit Brute-Force-Bremse, CSRF-Schutz, SSRF-Schutz für externe
Abrufe (Wetter/RSS/Kalender), strikte Eingabe-Bereinigung, Sandbox-Isolierung der
Custom-Fläche, geschützte Datenverzeichnisse.
