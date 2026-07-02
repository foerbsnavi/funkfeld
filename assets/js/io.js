/* Funkfeld — gemeinsame Import/Export-Helfer (CSV, vCard, Datei-Download/-Wahl).
   Wird vor den Widgets geladen; genutzt von Telefonbuch und Tabelle. */
(() => {
    'use strict';

    // --- Datei herunterladen (Blob + temporärer Link) ---
    function download(dateiname, text, mime) {
        const blob = new Blob(['﻿' + text], { type: (mime || 'text/plain') + ';charset=utf-8' }); // BOM: Excel erkennt UTF-8
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = dateiname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    // --- Datei wählen und als Text lesen → Promise<{name, text}|null> ---
    function dateiWaehlen(accept) {
        return new Promise((resolve) => {
            const inp = document.createElement('input');
            inp.type = 'file';
            if (accept) inp.accept = accept;
            inp.hidden = true;   // natives hidden (wie dateien.js), kein Inline-Style
            document.body.appendChild(inp);
            inp.addEventListener('change', () => {
                const f = inp.files && inp.files[0];
                if (!f) { inp.remove(); resolve(null); return; }
                if (f.size > 5 * 1024 * 1024) {   // 5 MB — schützt den Tab vor Riesen-Importen
                    inp.remove();
                    if (window.pultAnsage) window.pultAnsage('Datei zu groß (höchstens 5 MB).');
                    resolve(null); return;
                }
                const r = new FileReader();
                r.onload = () => { inp.remove(); resolve({ name: f.name, text: String(r.result || '') }); };
                r.onerror = () => { inp.remove(); resolve(null); };
                r.readAsText(f);
            }, { once: true });
            // Abbruch im Dateidialog lässt 'change' aus → nach Fokus-Rückkehr aufräumen
            window.addEventListener('focus', () => setTimeout(() => {
                if (inp.isConnected && (!inp.files || !inp.files.length)) { inp.remove(); resolve(null); }
            }, 500), { once: true });
            inp.click();
        });
    }

    // --- CSV schreiben (2D-Array von Strings) ---
    function csvErzeugen(zeilen) {
        const feld = (v) => {
            let s = String(v == null ? '' : v);
            // CSV-/Formel-Injection entschärfen: Zellen, die Excel/Sheets als Formel
            // deuten würde (= + - @, Tab, CR), mit Apostroph neutralisieren.
            if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
            return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        return zeilen.map((z) => z.map(feld).join(',')).join('\r\n');
    }

    // --- CSV lesen → 2D-Array (RFC-4180: Quotes, doppelte Quotes, Zeilenumbrüche im Feld) ---
    function csvLesen(text) {
        const s = String(text || '').replace(/^﻿/, '');   // BOM entfernen
        const rows = [];
        let row = [], feld = '', i = 0, inQuote = false;
        while (i < s.length) {
            const c = s[i];
            if (inQuote) {
                if (c === '"') {
                    if (s[i + 1] === '"') { feld += '"'; i += 2; continue; }
                    inQuote = false; i++; continue;
                }
                feld += c; i++; continue;
            }
            if (c === '"') { inQuote = true; i++; continue; }
            if (c === ',') { row.push(feld); feld = ''; i++; continue; }
            if (c === '\r') { i++; continue; }
            if (c === '\n') { row.push(feld); rows.push(row); row = []; feld = ''; i++; continue; }
            feld += c; i++;
        }
        if (feld !== '' || row.length) { row.push(feld); rows.push(row); }
        // Schutz-Apostroph wieder entfernen, das ein Export vor Formel-Zeichen gesetzt hat
        // (z. B. Telefonnummer '+49 → +49). Nur genau dieser Fall, nichts anderes.
        const entschaerft = (s) => (s.length > 1 && s[0] === "'" && /[=+\-@\t\r]/.test(s[1])) ? s.slice(1) : s;
        return rows.filter((r) => r.some((z) => z !== '')).map((r) => r.map(entschaerft));   // Leerzeilen weg
    }

    // --- vCard 3.0 erzeugen (Kontakte: {name, telefon, email, notiz}) ---
    function vcardEscape(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1'); }
    function vcardErzeugen(kontakte) {
        const teile = [];
        kontakte.forEach((k) => {
            const z = ['BEGIN:VCARD', 'VERSION:3.0'];
            z.push('FN:' + vcardEscape(k.name || ''));
            z.push('N:' + vcardEscape(k.name || '') + ';;;;');
            if (k.telefon) z.push('TEL;TYPE=voice:' + vcardEscape(k.telefon));
            if (k.email) z.push('EMAIL;TYPE=internet:' + vcardEscape(k.email));
            if (k.notiz) z.push('NOTE:' + vcardEscape(k.notiz));
            z.push('END:VCARD');
            teile.push(z.join('\r\n'));
        });
        return teile.join('\r\n');
    }

    // --- vCard lesen → [{name, telefon, email, notiz}] ---
    function vcardEntfalten(text) {
        // gefaltete Zeilen (Fortsetzung mit Leerzeichen/Tab am Zeilenanfang) zusammenführen
        return String(text || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
    }
    function vcardWert(zeile) {
        const idx = zeile.indexOf(':');
        if (idx < 0) return '';
        return zeile.slice(idx + 1).replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();
    }
    function vcardLesen(text) {
        const zeilen = vcardEntfalten(text).split('\n');
        const kontakte = [];
        let cur = null;
        for (const roh of zeilen) {
            const zeile = roh.trim();
            const oben = zeile.toUpperCase();
            if (oben === 'BEGIN:VCARD') { cur = { name: '', telefon: '', email: '', notiz: '' }; continue; }
            if (oben === 'END:VCARD') { if (cur) kontakte.push(cur); cur = null; continue; }
            if (!cur) continue;
            const feld = oben.split(/[;:]/)[0];
            if (feld === 'FN') cur.name = vcardWert(zeile);
            else if (feld === 'N' && !cur.name) {
                const teile = vcardWert(zeile).split(';');
                cur.name = ((teile[1] || '') + ' ' + (teile[0] || '')).trim();
            }
            else if (feld === 'TEL' && !cur.telefon) cur.telefon = vcardWert(zeile);
            else if (feld === 'EMAIL' && !cur.email) cur.email = vcardWert(zeile);
            else if (feld === 'NOTE' && !cur.notiz) cur.notiz = vcardWert(zeile);
        }
        return kontakte.filter((k) => k.name || k.telefon || k.email || k.notiz);
    }

    window.pultIO = { download, dateiWaehlen, csvErzeugen, csvLesen, vcardErzeugen, vcardLesen };
})();
