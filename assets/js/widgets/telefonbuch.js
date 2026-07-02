/* Funkfeld-Widget: Telefonbuch — Kontakte (Name, Telefon, E-Mail, Notiz). */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    const FELDER = [
        { schluessel: 'name',    label: 'Name',    typ: 'text',  ph: 'Name' },
        { schluessel: 'telefon', label: 'Telefon', typ: 'tel',   ph: 'Telefon' },
        { schluessel: 'email',   label: 'E-Mail',  typ: 'email', ph: 'E-Mail' },
        { schluessel: 'notiz',   label: 'Notiz',   typ: 'text',  ph: 'Notiz' }
    ];

    window.PultWidgets.telefonbuch = {
        standard() {
            return { items: [] };
        },

        erstelle(container, inhalt, aenderung) {
            const items = (inhalt && Array.isArray(inhalt.items))
                ? inhalt.items.map(i => ({
                    name:    String((i && i.name) || ''),
                    telefon: String((i && i.telefon) || ''),
                    email:   String((i && i.email) || ''),
                    notiz:   String((i && i.notiz) || '')
                })) : [];

            const liste = document.createElement('div');
            liste.className = 'w-tel-liste';

            const speichern = () => aenderung({ items: items.slice() });

            function zeichne() {
                liste.textContent = '';
                items.forEach((it, idx) => {
                    const karte = document.createElement('div');
                    karte.className = 'w-tel-karte';

                    FELDER.forEach(f => {
                        const inp = document.createElement('input');
                        inp.type = f.typ;
                        inp.className = 'w-tel-feld w-tel-' + f.schluessel;
                        inp.placeholder = f.ph;
                        inp.value = it[f.schluessel];
                        inp.setAttribute('aria-label', f.label + ' (Kontakt ' + (idx + 1) + ')');
                        inp.addEventListener('input', () => { it[f.schluessel] = inp.value; speichern(); });
                        karte.appendChild(inp);
                    });

                    const weg = document.createElement('button');
                    weg.type = 'button';
                    weg.className = 'w-zeile-weg';
                    weg.textContent = '×';
                    weg.setAttribute('aria-label', 'Kontakt ' + (idx + 1) + ' entfernen');
                    weg.addEventListener('click', async () => {
                        if (!(await window.pultConfirm('Diesen Kontakt entfernen?'))) return;
                        items.splice(idx, 1); speichern(); zeichne();
                        const namen = liste.querySelectorAll('.w-tel-name');
                        if (namen.length) namen[Math.max(0, idx - 1)].focus();
                        else add.focus();
                    });
                    karte.appendChild(weg);

                    liste.appendChild(karte);
                });
            }

            zeichne();

            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'w-add';
            add.textContent = '+ Kontakt';
            add.addEventListener('click', () => {
                items.push({ name: '', telefon: '', email: '', notiz: '' });
                speichern(); zeichne();
                const namen = liste.querySelectorAll('.w-tel-name');
                const letzte = namen[namen.length - 1];
                if (letzte) letzte.focus();
            });

            // --- Import / Export (vCard, CSV) ---
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

            const MAX = 500;   // gleiche Obergrenze wie serverseitig (blocks.php)

            const impBtn = mkIoBtn('Import', 'Import: Kontakte aus vCard oder CSV laden', async () => {
                if (!window.pultIO) return;
                const datei = await window.pultIO.dateiWaehlen('.vcf,.vcard,.csv,text/vcard,text/csv');
                if (!datei) { impBtn.focus(); return; }
                let neu = [];
                const istVcard = /\.(vcf|vcard)$/i.test(datei.name) || /BEGIN:VCARD/i.test(datei.text);
                if (istVcard) {
                    neu = window.pultIO.vcardLesen(datei.text);
                } else {
                    const rows = window.pultIO.csvLesen(datei.text);
                    if (rows.length && String(rows[0][0] || '').toLowerCase() === 'name') rows.shift();   // Kopfzeile
                    neu = rows.map((r) => ({
                        name: String(r[0] || ''), telefon: String(r[1] || ''),
                        email: String(r[2] || ''), notiz: String(r[3] || '')
                    })).filter((k) => k.name || k.telefon || k.email || k.notiz);
                }
                if (!neu.length) { if (window.pultAnsage) window.pultAnsage('Keine Kontakte in der Datei gefunden.'); impBtn.focus(); return; }
                // Auf Server-Limit kappen — verhindert Freeze durch Riesen-Importe
                const frei = Math.max(0, MAX - items.length);
                const zunehmen = neu.slice(0, frei);
                items.push(...zunehmen);
                speichern(); zeichne();
                if (window.pultAnsage) {
                    window.pultAnsage(zunehmen.length < neu.length
                        ? (zunehmen.length + ' von ' + neu.length + ' importiert (max. ' + MAX + ' Kontakte).')
                        : (zunehmen.length + ' Kontakt(e) importiert.'));
                }
                impBtn.focus();
            });

            const vcfBtn = mkIoBtn('Export vCard', 'Export vCard: Kontakte als Datei speichern', () => {
                if (!window.pultIO || !items.length) return;
                window.pultIO.download('telefonbuch.vcf', window.pultIO.vcardErzeugen(items), 'text/vcard');
            });

            const csvBtn = mkIoBtn('Export CSV', 'Export CSV: Kontakte als Datei speichern', () => {
                if (!window.pultIO || !items.length) return;
                const rows = [['Name', 'Telefon', 'E-Mail', 'Notiz']]
                    .concat(items.map((k) => [k.name, k.telefon, k.email, k.notiz]));
                window.pultIO.download('telefonbuch.csv', window.pultIO.csvErzeugen(rows), 'text/csv');
            });

            ioLeiste.append(impBtn, vcfBtn, csvBtn);

            container.append(liste, add, ioLeiste);
        }
    };
})();
