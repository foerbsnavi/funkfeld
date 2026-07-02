/* Funkfeld-Widget: Tabelle — kleine bearbeitbare Tabelle. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    window.PultWidgets.tabelle = {
        standard() {
            return { spalten: ['Spalte 1', 'Spalte 2'], zeilen: [['', '']] };
        },

        erstelle(container, inhalt, aenderung) {
            const spalten = (inhalt && Array.isArray(inhalt.spalten) && inhalt.spalten.length)
                ? inhalt.spalten.map(s => String(s)) : ['Spalte 1'];
            let zeilen = (inhalt && Array.isArray(inhalt.zeilen))
                ? inhalt.zeilen.map(z => Array.isArray(z) ? z.map(c => String(c)) : []) : [];
            // Zeilen auf Spaltenanzahl bringen
            zeilen = zeilen.map(z => {
                const r = z.slice(0, spalten.length);
                while (r.length < spalten.length) r.push('');
                return r;
            });

            const wrap = document.createElement('div');
            wrap.className = 'w-tab-wrap';
            const tabelle = document.createElement('table');
            tabelle.className = 'w-tab';

            const speichern = () => aenderung({ spalten: spalten.slice(), zeilen: zeilen.map(z => z.slice()) });

            function zeichne() {
                tabelle.textContent = '';

                const thead = document.createElement('thead');
                const kopf = document.createElement('tr');
                spalten.forEach((s, c) => {
                    const th = document.createElement('th');
                    th.setAttribute('scope', 'col');
                    const inp = document.createElement('input');
                    inp.type = 'text';
                    inp.className = 'w-tab-kopf';
                    inp.value = s;
                    inp.setAttribute('aria-label', 'Spaltenname ' + (c + 1));
                    inp.addEventListener('input', () => { spalten[c] = inp.value; speichern(); });
                    const weg = document.createElement('button');
                    weg.type = 'button';
                    weg.className = 'w-tab-weg';
                    weg.textContent = '×';
                    weg.setAttribute('aria-label', 'Spalte ' + (c + 1) + ' entfernen');
                    weg.addEventListener('click', async () => {
                        if (spalten.length <= 1) return;
                        if (!(await window.pultConfirm('Diese Spalte entfernen?'))) return;
                        spalten.splice(c, 1);
                        zeilen.forEach(z => z.splice(c, 1));
                        speichern(); zeichne();
                        const koepfe = tabelle.querySelectorAll('.w-tab-kopf');
                        (koepfe[Math.max(0, c - 1)] || addSpalte).focus();
                    });
                    th.append(inp, weg);
                    kopf.appendChild(th);
                });
                kopf.appendChild(document.createElement('th')).className = 'w-tab-eck';
                thead.appendChild(kopf);
                tabelle.appendChild(thead);

                const tbody = document.createElement('tbody');
                zeilen.forEach((zeile, r) => {
                    const tr = document.createElement('tr');
                    zeile.forEach((zelle, c) => {
                        const td = document.createElement('td');
                        const inp = document.createElement('input');
                        inp.type = 'text';
                        inp.className = 'w-tab-zelle';
                        inp.value = zelle;
                        inp.setAttribute('aria-label', 'Zeile ' + (r + 1) + ', ' + (spalten[c] || ('Spalte ' + (c + 1))));
                        inp.addEventListener('input', () => { zeilen[r][c] = inp.value; speichern(); });
                        td.appendChild(inp);
                        tr.appendChild(td);
                    });
                    const tdWeg = document.createElement('td');
                    const weg = document.createElement('button');
                    weg.type = 'button';
                    weg.className = 'w-tab-weg';
                    weg.textContent = '×';
                    weg.setAttribute('aria-label', 'Zeile ' + (r + 1) + ' entfernen');
                    weg.addEventListener('click', async () => {
                        if (!(await window.pultConfirm('Diese Zeile entfernen?'))) return;
                        zeilen.splice(r, 1); speichern(); zeichne();
                        const reihen = tabelle.querySelectorAll('tbody tr');
                        const ziel = reihen[Math.min(r, reihen.length - 1)];
                        if (ziel) { ziel.querySelector('.w-tab-zelle').focus(); }
                        else { addZeile.focus(); }
                    });
                    tdWeg.appendChild(weg);
                    tr.appendChild(tdWeg);
                    tbody.appendChild(tr);
                });
                tabelle.appendChild(tbody);
            }

            zeichne();
            wrap.appendChild(tabelle);

            const leiste = document.createElement('div');
            leiste.className = 'w-tab-leiste';
            const addZeile = document.createElement('button');
            addZeile.type = 'button';
            addZeile.className = 'w-add';
            addZeile.textContent = '+ Zeile';
            addZeile.addEventListener('click', () => {
                zeilen.push(spalten.map(() => ''));
                speichern(); zeichne();
                const reihen = tabelle.querySelectorAll('tbody tr');
                const letzte = reihen[reihen.length - 1];
                if (letzte) letzte.querySelector('.w-tab-zelle').focus();
            });
            const addSpalte = document.createElement('button');
            addSpalte.type = 'button';
            addSpalte.className = 'w-add';
            addSpalte.textContent = '+ Spalte';
            addSpalte.addEventListener('click', () => {
                spalten.push('Spalte ' + (spalten.length + 1));
                zeilen.forEach(z => z.push(''));
                speichern(); zeichne();
                const koepfe = tabelle.querySelectorAll('.w-tab-kopf');
                if (koepfe.length) koepfe[koepfe.length - 1].focus();
            });
            leiste.append(addZeile, addSpalte);

            // --- Import / Export (CSV) ---
            const ioLeiste = document.createElement('div');
            ioLeiste.className = 'w-io-leiste';
            const mkIoBtn = (text, label, fn) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'w-mini';
                b.textContent = text;
                b.setAttribute('aria-label', label);
                b.addEventListener('click', fn);
                return b;
            };
            const MAX_ZEILEN = 200, MAX_SPALTEN = 12;   // gleiche Grenzen wie serverseitig (blocks.php)
            const impBtn = mkIoBtn('Import CSV', 'Import CSV: Tabelle aus Datei laden', async () => {
                if (!window.pultIO) return;
                const datei = await window.pultIO.dateiWaehlen('.csv,text/csv');
                if (!datei) { impBtn.focus(); return; }
                const rows = window.pultIO.csvLesen(datei.text);
                if (!rows.length) { if (window.pultAnsage) window.pultAnsage('Keine Daten in der Datei gefunden.'); impBtn.focus(); return; }
                if (!(await window.pultConfirm('Importierte CSV ersetzt die aktuelle Tabelle. Fortfahren?'))) { impBtn.focus(); return; }
                // Breite ohne Spread ermitteln (Spread würde bei sehr vielen Zeilen den Stack sprengen)
                const rohBreite = rows.reduce((m, r) => Math.max(m, r.length), 0);
                const breite = Math.min(MAX_SPALTEN, rohBreite);
                spalten.length = 0;
                (rows[0] || []).slice(0, breite).forEach((h, i) => spalten.push(String(h || ('Spalte ' + (i + 1)))));
                while (spalten.length < breite) spalten.push('Spalte ' + (spalten.length + 1));
                zeilen = rows.slice(1, 1 + MAX_ZEILEN).map((r) => {
                    const z = r.slice(0, breite).map((c) => String(c));
                    while (z.length < breite) z.push('');
                    return z;
                });
                speichern(); zeichne();
                if (window.pultAnsage) {
                    const gekappt = (rows.length - 1) > MAX_ZEILEN || rohBreite > MAX_SPALTEN;
                    window.pultAnsage('Tabelle importiert: ' + zeilen.length + ' Zeile(n)'
                        + (gekappt ? ' (auf max. ' + MAX_ZEILEN + ' Zeilen / ' + MAX_SPALTEN + ' Spalten gekappt).' : '.'));
                }
                impBtn.focus();
            });
            const expBtn = mkIoBtn('Export CSV', 'Export CSV: Tabelle als Datei speichern', () => {
                if (!window.pultIO) return;
                const rows = [spalten.slice()].concat(zeilen.map((z) => z.slice()));
                window.pultIO.download('tabelle.csv', window.pultIO.csvErzeugen(rows), 'text/csv');
            });
            ioLeiste.append(impBtn, expBtn);

            container.append(wrap, leiste, ioLeiste);
        }
    };
})();
