/* Funkfeld-Widget: Checkliste — Aufgaben mit Haken. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    window.PultWidgets.checkliste = {
        standard() {
            return { items: [] };
        },

        erstelle(container, inhalt, aenderung) {
            const items = (inhalt && Array.isArray(inhalt.items))
                ? inhalt.items.map(i => ({ text: String((i && i.text) || ''), erledigt: !!(i && i.erledigt) }))
                : [];

            const liste = document.createElement('div');
            liste.className = 'w-check-liste';

            const speichern = () => aenderung({ items: items.slice() });

            function fokus(index) {
                const felder = liste.querySelectorAll('.w-check-text');
                if (felder[index]) felder[index].focus();
            }

            function zeichne() {
                liste.textContent = '';
                items.forEach((it, idx) => {
                    const zeile = document.createElement('div');
                    zeile.className = 'w-check-zeile';

                    const haken = document.createElement('input');
                    haken.type = 'checkbox';
                    haken.className = 'w-check-box';
                    haken.checked = it.erledigt;
                    haken.setAttribute('aria-label', 'Aufgabe ' + (idx + 1) + ' erledigt');

                    const text = document.createElement('input');
                    text.type = 'text';
                    text.className = 'w-check-text' + (it.erledigt ? ' erledigt' : '');
                    text.setAttribute('aria-label', 'Aufgabe ' + (idx + 1));
                    text.placeholder = 'Aufgabe…';
                    text.value = it.text;            // value → kein HTML

                    const weg = document.createElement('button');
                    weg.type = 'button';
                    weg.className = 'w-zeile-weg';
                    weg.setAttribute('aria-label', 'Aufgabe ' + (idx + 1) + ' entfernen');
                    weg.textContent = '×';

                    haken.addEventListener('change', () => {
                        it.erledigt = haken.checked;
                        text.classList.toggle('erledigt', it.erledigt);
                        speichern();
                    });
                    text.addEventListener('input', () => { it.text = text.value; speichern(); });
                    text.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') {
                            ev.preventDefault();
                            items.splice(idx + 1, 0, { text: '', erledigt: false });
                            speichern(); zeichne(); fokus(idx + 1);
                        } else if (ev.key === 'Backspace' && text.value === '' && items.length > 1) {
                            ev.preventDefault();
                            items.splice(idx, 1);
                            speichern(); zeichne(); fokus(Math.max(0, idx - 1));
                        }
                    });
                    weg.addEventListener('click', async () => {
                        if (!(await window.pultConfirm('Diese Aufgabe entfernen?'))) return;
                        items.splice(idx, 1);
                        speichern(); zeichne();
                        if (items.length) fokus(Math.min(idx, items.length - 1));
                        else add.focus();
                    });

                    zeile.append(haken, text, weg);
                    liste.appendChild(zeile);
                });
            }

            zeichne();

            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'w-add';
            add.textContent = '+ Aufgabe';
            add.addEventListener('click', () => {
                items.push({ text: '', erledigt: false });
                speichern(); zeichne(); fokus(items.length - 1);
            });

            container.append(liste, add);
        }
    };
})();
