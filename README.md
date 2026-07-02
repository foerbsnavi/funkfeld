# Funkfeld

**Euer zentrales Organisations-Pult fürs Web.** Statt hundert einzelner Apps und
Tabs eine Seite, die ihr euch selbst gestaltet: Notizen, Aufgaben, Kalender,
Mail, eine gemeinsame Live-Karte, Chat und mehr auf frei anordbaren Flächen — in
Echtzeit fürs ganze Team synchron. Die Cloud speichert eure Dateien; Funkfeld ist
das Pult, an dem ihr sie organisiert. Selbst gehostet oder online.

🔗 **Live:** [funkfeld.brosemedien.de](https://funkfeld.brosemedien.de/) · 📦 **Download:** [funkfeld.brosemedien.de/download](https://funkfeld.brosemedien.de/download)

![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-ea6b17) ![PHP 7.4+](https://img.shields.io/badge/PHP-7.4%2B-777bb4) ![ohne Datenbank](https://img.shields.io/badge/Datenbank-keine-2e9e5b)

---

## Flächen

| Fläche | Beschreibung |
|--------|--------------|
| **Notiz** | Freies Textfeld |
| **Aufgaben** | Checkliste mit Haken |
| **Links** | Schnellzugriff-Sammlung |
| **Tabelle** | Kleine bearbeitbare Tabelle |
| **Telefonbuch** | Kontakte (Name, Telefon, E-Mail, Notiz) |
| **Dateien** | Datei-Zwischenlager (hoch-/runterladen) |
| **Uhr** | Live-Zeit und Datum |
| **Wetter** | Aktuelles Wetter + 3-Tage-Vorschau (OpenWeatherMap) |
| **Kalender** | Nächste Termine aus einem ICS-Feed |
| **Mail** | IMAP-Posteingang (nur lesen) |
| **RSS** | Schlagzeilen aus einem Feed |
| **Chat** | Gemeinsamer Verlauf als Sprechblasen |
| **Live-Karte** | Leaflet-Karte mit Markern & Strichen, in Echtzeit für alle |
| **Livestream** | Webcam-/Standbild von einer URL, automatisch aktualisiert |
| **Wirtschaft** | Gold · Bitcoin · Euro · US-Dollar als Verlauf (1 Woche – 5 Jahre) |
| **Custom** | Eigenes HTML/CSS/JavaScript, sicher im Sandbox-iframe |

## Oberfläche

- **Drei Ansichten:** *Frei* (ziehen, stapeln, Größe ändern), *Raster* (gleichmäßiges Gitter), *Clips* (magnetisches Einrasten mit Trenn-Griffen).
- **Mehrere Dashboards** je Konto, mit Übersicht.
- **3 Anordnungsbänke** – Layouts speichern und durchschalten.
- **Festsetzen** per Schloss (Kiosk-Ansicht) · **Teilen** einzelner Dashboards per Link (Echtzeit) · **Export/Import** als XML.
- **Live-Sync** auf jedem Gerät; am Handy automatisch einspaltig.

## Installation

1. [ZIP herunterladen](https://funkfeld.brosemedien.de/files/funkfeld_latest.zip), entpacken und den Inhalt per FTP hochladen.
2. Ordner `data/` beschreibbar machen.
3. `install.php` im Browser aufrufen und ein Passwort setzen.

**Voraussetzungen:** PHP 7.4+ mit `json` (Standard); `imap` nur fürs Mail-Widget, `zip` fürs Selbst-Update. Apache mit `.htaccess`. Keine Datenbank. Karte/Livestream/Wirtschaft brauchen eine Internetverbindung.

## Aktualisieren

In der Dashboard-Übersicht sucht Funkfeld auf Wunsch nach Updates und spielt sie auf Klick ein — es wird **nur der Programmcode** ersetzt, `data/` bleibt.

## Sicherheit

Alles hinter Login (Passwort gehasht, Brute-Force-Bremse). CSRF-Schutz auf schreibenden Aktionen, SSRF-Schutz für externe Abrufe, strikte Eingabe-Bereinigung. `data/` per `.htaccess` gesperrt. Die Custom-Fläche läuft in einem `sandbox`-iframe mit opakem Ursprung.

## Technik

Reines **PHP + Vanilla-JavaScript + CSS**. Keine Datenbank (JSON-Dateien), kein Build-Schritt, kein Framework. Karte: [Leaflet](https://leafletjs.com/) + OpenStreetMap; Wirtschaftsdaten schlüssellos von CoinGecko und der EZB (Frankfurter).

```
core/    Programmcode (Auth, Blocks, Storage, Feeds, Mail, Krypto, Dashboards)
assets/  CSS + JavaScript (assets/js/widgets/ = die Flächen-Typen)
views/   HTML-Gerüste
data/    Konfiguration und Inhalte — bleiben bei Updates erhalten
api.php · index.php · install.php
```

## Lizenz

[MIT](LICENSE) — frei nutzen, anpassen und weitergeben, auch kommerziell.

Gebaut von [Foerb / brosemedien.de](https://brosemedien.de/) · Teil der [Werkzeug-Sammlung auf github.com/foerbsnavi](https://github.com/foerbsnavi).
