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

            container.append(liste, add);
        }
    };
})();
