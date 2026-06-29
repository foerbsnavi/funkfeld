# Funkfeld

**Dein selbstgehostetes Management-Dashboard fürs Web.** Frei anordbare Flächen
(Notizen, Aufgaben, Kalender, Mail, Wetter, eine gemeinsame Live-Karte, eigene
Widgets …) auf einem dunklen Steuerstand — in reinem PHP, **ohne Datenbank**,
ohne Build-Schritt, auf jedem einfachen Webspace.

🔗 **Live ansehen:** [funkfeld.brosemedien.de](https://funkfeld.brosemedien.de/) · 📦 **Download:** [funkfeld.brosemedien.de/download](https://funkfeld.brosemedien.de/download)

![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-ea6b17) ![PHP 7.4+](https://img.shields.io/badge/PHP-7.4%2B-777bb4) ![ohne Datenbank](https://img.shields.io/badge/Datenbank-keine-2e9e5b)

---

## Warum Funkfeld?

- **Serverarm:** läuft auf jedem PHP-Shared-Webspace. Keine Datenbank, keine Build-Tools, keine Abhängigkeiten auf dem Server.
- **Backup = Ordner kopieren.** Alle Daten liegen als JSON-Dateien unter `data/`.
- **Du behältst die Kontrolle:** Open Source (MIT), selbst gehostet, deine Daten bleiben bei dir.
- **Erweiterbar:** eine eigene **Custom-Fläche** führt dein HTML/JavaScript sicher in einer Sandbox aus.

## Flächen (Widgets)

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
| **Chat** | Gemeinsamer Verlauf, Nachrichten als Sprechblasen |
| **Live-Karte** | Leaflet-Karte mit Markern & Strichen, in Echtzeit für alle Betrachter |
| **Livestream** | Webcam-/Standbild von einer URL, automatisch aktualisiert |
| **Wirtschaft** | Gold · Bitcoin · Euro · US-Dollar als normierter Verlauf (1 Woche – 5 Jahre) |
| **Custom** | Eigenes HTML/CSS/JavaScript, sicher im Sandbox-iframe |

## Oberfläche

- **Drei Ansichten:**
  - **Frei** – Flächen frei ziehen, stapeln, in der Größe ändern.
  - **Raster** – automatisches, gleichmäßiges Gitter.
  - **Clips** – magnetisches Einrasten mit festem 10-px-Abstand; **Trenn-Griffe**
    zwischen benachbarten Kacheln passen mehrere gleichzeitig an („magnetisches Gartengebilde").
- **Mehrere Dashboards** je Konto/Instanz, mit Übersichtsseite.
- **3 Anordnungsbänke** – Layouts speichern, abrufen, durchschalten.
- **Festsetzen** per Schloss – sperrt Verschieben/Bearbeiten für eine „Kiosk"-Ansicht.
- **Teilen** einzelner Dashboards per Link (Plattform-Modus).
- **Export/Import** einzelner Dashboards als XML – zum Sichern oder Umziehen.

## Installation

1. [ZIP herunterladen](https://funkfeld.brosemedien.de/files/funkfeld_latest.zip), entpacken und den Inhalt per FTP in ein Verzeichnis laden.
2. Sicherstellen, dass der Ordner `data/` **beschreibbar** ist.
3. Im Browser `install.php` aufrufen und ein Passwort festlegen.
4. Fertig — Funkfeld öffnet sich.

### Voraussetzungen

- **PHP 7.4+** mit `json` (Standard). `imap` nur fürs Mail-Widget, `zip` fürs Selbst-Update.
- Apache mit `.htaccess` (üblicher Shared-Webspace genügt).
- **Keine Datenbank.** Für Karte/Livestream/Wirtschaft ist eine Internetverbindung nötig.

## Aktualisieren

In der Dashboard-Übersicht zeigt Funkfeld die installierte Version und sucht auf Wunsch
nach Updates. Ein Klick auf **„Jetzt aktualisieren"** lädt das aktuelle Paket und ersetzt
**nur den Programmcode** — dein `data/`-Ordner bleibt unangetastet. Alternativ einfach das
neue ZIP über die Installation legen (nur `data/` behalten).

## Sicherheit & Datenschutz

- Alles liegt hinter einem **Login** (Passwort gehasht, Brute-Force-Bremse).
- **CSRF**-Schutz auf allen schreibenden Aktionen, **SSRF**-Schutz für externe Abrufe
  (Wetter/RSS/Kalender), strikte Eingabe-Bereinigung.
- `data/` ist per `.htaccess` vor direktem Web-Zugriff geschützt.
- Die **Custom-Fläche** läuft in einem `sandbox`-iframe mit eigenem, opakem Ursprung:
  kein Zugriff auf Login, Session oder andere Flächen.
- **Geteilte Dashboards:** Da Bild-/Livestream-Quellen beliebige `https:`-Adressen sein
  dürfen, teile Dashboards nur mit Personen, denen du vertraust.

## Technik

Reines **PHP + Vanilla-JavaScript + CSS**. Keine Datenbank (JSON-Dateien als Speicher),
kein Build-Schritt, kein Framework. Die Karte nutzt [Leaflet](https://leafletjs.com/) +
OpenStreetMap; Wirtschaftsdaten kommen schlüssellos von CoinGecko und der EZB (Frankfurter).

```
core/      Programmcode (Bootstrap, Auth, Blocks, Storage, Feeds, Mail, Krypto, Dashboards)
assets/    CSS + JavaScript (assets/js/widgets/ = die Flächen-Typen)
views/     HTML-Gerüste (App, Login, Übersicht, Topbar …)
data/      deine Konfiguration und Inhalte — bleiben bei Updates erhalten
api.php    JSON-Schnittstelle · index.php Einstieg · install.php Ersteinrichtung
```

## Mitwirken

Pull Requests willkommen! Funkfeld lässt sich lokal direkt aus diesem Repo betreiben
(`install.php` aufrufen). Bitte beim Stil bleiben (kein Framework, keine Build-Tools).

## Lizenz

[MIT](LICENSE) — frei nutzen, anpassen und weitergeben, auch kommerziell.

---

Gebaut von [Foerb / brosemedien.de](https://brosemedien.de/) · Teil der
[Werkzeug-Sammlung auf github.com/foerbsnavi](https://github.com/foerbsnavi).
