/* Funkfeld — gemeinsame Widget-Helfer: Zeit-Formatierung, Status-Anzeige,
   selbst-aufräumendes Intervall. Pendant zu io.js (Import/Export): einmal
   definiert statt in jedem Flächen-Typ kopiert. */
(() => {
    'use strict';

    /** Zweistellig mit führender Null (Minuten, Stunden, Sekunden). */
    function zwei(n) { return n < 10 ? '0' + n : '' + n; }

    /** „Wann war das?"-Angabe: heute nur Uhrzeit, sonst Datum + Uhrzeit (Chat, Neuigkeiten). */
    function zeitText(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const heute = new Date();
        const uhr = zwei(d.getHours()) + ':' + zwei(d.getMinutes());
        if (d.toDateString() === heute.toDateString()) return uhr;
        return d.getDate() + '.' + (d.getMonth() + 1) + '. ' + uhr;
    }

    /** Kompaktes Datum: heute nur Uhrzeit, sonst Datum (+Jahr, wenn nicht dieses) — Mail, RSS. */
    function datumText(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const heute = new Date();
        if (d.toDateString() === heute.toDateString()) {
            return zwei(d.getHours()) + ':' + zwei(d.getMinutes());
        }
        let s = d.getDate() + '.' + (d.getMonth() + 1) + '.';
        if (d.getFullYear() !== heute.getFullYear()) s += d.getFullYear();
        return s;
    }

    window.pultZeit = { zwei, zeitText, datumText };

    /**
     * Status-/Hinweistext in ein Ziel-Element setzen (ersetzt dessen Inhalt), optional mit
     * „Einstellungen öffnen"-Button — für Service-Widgets ohne fertige Konfiguration.
     * Widget-eigene Zustands-Resets (Fokus, Signaturen) bleiben Sache des Aufrufers.
     */
    window.pultStatus = function (ziel, text, mitEinstellungen) {
        ziel.textContent = '';
        const p = document.createElement('p');
        p.className = 'w-status';
        p.textContent = text;
        ziel.appendChild(p);
        if (mitEinstellungen && window.pultEinstellungen) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'w-sekundaer-btn w-feedhinweis-btn';
            b.textContent = 'Einstellungen öffnen';
            b.addEventListener('click', () => window.pultEinstellungen());
            ziel.appendChild(b);
        }
    };

    /**
     * setInterval, das sich selbst aufräumt, sobald die Fläche aus dem DOM verschwindet
     * (kein weitertickender Timer geschlossener Flächen). Liefert die Timer-ID.
     */
    window.pultIntervall = function (container, fn, ms) {
        const timer = setInterval(() => {
            if (!container.isConnected) { clearInterval(timer); return; }
            fn();
        }, ms);
        return timer;
    };
})();
