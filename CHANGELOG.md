# Änderungsverlauf

Alle nennenswerten Änderungen an Funkfeld werden hier festgehalten.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [1.0.2] – 2026-07-02

### Behoben
- Raster- und Handy-Ansicht: leere erste Kachel (unsichtbarer Scroll-Platzhalter belegte eine Gitter-Zelle).
- Wetter und Karte lösten beim bloßen Öffnen des Dashboards unnötige Speicher- bzw. Fehl-Anfragen aus.
- Dashboard-Übersicht: Umbenennen speicherte doppelt; Vorlese-Beschriftungen (aria) der Karten-Knöpfe blieben nach dem Umbenennen veraltet.
- Wirtschaft: Bei Spannen über einem Jahr verschwanden Bitcoin/Gold kommentarlos (CoinGecko liefert höchstens 12 Monate) — jetzt Teilverlauf mit Hinweis.
- Livestream ohne Adresse zeigte ein kaputtes Bild-Symbol.

### Verbessert
- **Deutlich weniger Hintergrund-Anfragen:** Chat und Live-Karte nutzen den zentralen Live-Sync (ein gemeinsamer Poll) statt eigener Abfrage-Timer je Fläche.
- Kalender und RSS folgen Weiterleitungen kontrolliert (volle Sicherheitsprüfung je Ziel) — Feeds wie tagesschau.de funktionieren jetzt; Fehlermeldungen nennen den Grund (z. B. HTTP-Status).
- Neue Flächen erscheinen an einer freien Stelle statt fast deckungsgleich übereinander.
- Import: Ein Dashboard mit bereits vergebenem Namen erhält den Zusatz „(Import)“.
- Markenschrift wird als WOFF2 geladen (rund zwei Drittel kleinerer Download).

### Sicherheit
- Freigabe aufheben wirkt rückwirkend: Bereits beigetretene Konten verlieren den Zugriff sofort.
- Selbst-Update lädt strikt nur noch direkt von der Update-Domain (Weiterleitungen werden abgelehnt).

## [1.0.1] – 2026-06-30

### Behoben
- Hinzufügen-Menü (FAB): Der Schließen-Knopf bleibt an der Position des Plus-Knopfs.

### Verbessert
- README deutlich ausgebaut (Funktionen, Ansichten, Installation, Update, Sicherheit, Technik).

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
