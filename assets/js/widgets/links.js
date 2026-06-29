/* Funkfeld-Widget: Links — Schnellzugriff-Sammlung. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    /** Nur http/https als klickbare Adresse zulassen (kein javascript:, data: …). */
    function sichereUrl(url) {
        try {
            const u = new URL(String(url));
            return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
        } catch (e) {
            return '';
        }
    }

    window.PultWidgets.links = {
        standard() {
            return { items: [] };
        },

        erstelle(container, inhalt, aenderung) {
            const items = (inhalt && Array.isArray(inhalt.items))
                ? inhalt.items.map(i => ({ titel: String((i && i.titel) || ''), url: String((i && i.url) || '') }))
                : [];

            const liste = document.createElement('div');
            liste.className = 'w-link-liste';

            const speichern = () => aenderung({ items: items.slice() });

            function ansicht(it, idx) {
                const zeile = document.createElement('div');
                zeile.className = 'w-link-zeile';

                const link = document.createElement('a');
                link.className = 'w-link-a';
                link.textContent = it.titel || it.url || '(leer)';   // textContent → kein HTML
                const href = sichereUrl(it.url);
                let warn = null;
                if (href) {
                    link.href = href;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.setAttribute('aria-label', (it.titel || it.url) + ' (öffnet neues Fenster)');
                } else if (it.url) {
                    link.title = 'Keine gültige http(s)-Adresse';
                    link.classList.add('ungueltig');
                    // für Screenreader sichtbarer Hinweis (nicht nur Farbe)
                    warn = document.createElement('span');
                    warn.className = 'w-link-warn';
                    warn.setAttribute('role', 'img');
                    warn.setAttribute('aria-label', 'Ungültige Adresse');
                    warn.textContent = '⚠';
                }

                const bearbeiten = document.createElement('button');
                bearbeiten.type = 'button';
                bearbeiten.className = 'w-zeile-edit';
                bearbeiten.setAttribute('aria-label', 'Link bearbeiten');
                bearbeiten.textContent = '✎';
                bearbeiten.addEventListener('click', () => { zeile.replaceWith(formular(it, idx)); });

                const weg = document.createElement('button');
                weg.type = 'button';
                weg.className = 'w-zeile-weg';
                weg.setAttribute('aria-label', 'Link entfernen');
                weg.textContent = '×';
                weg.addEventListener('click', async () => {
                    if (!(await window.pultConfirm('Diesen Link entfernen?'))) return;
                    items.splice(idx, 1); speichern(); zeichne();
                });

                zeile.append(link);
                if (warn) zeile.append(warn);
                zeile.append(bearbeiten, weg);
                return zeile;
            }

            function formular(it, idx) {
                const zeile = document.createElement('div');
                zeile.className = 'w-link-zeile bearbeiten';

                const titel = document.createElement('input');
                titel.type = 'text';
                titel.className = 'w-link-titel';
                titel.placeholder = 'Titel';
                titel.setAttribute('aria-label', 'Link-Titel');
                titel.value = it.titel;

                const url = document.createElement('input');
                url.type = 'url';
                url.className = 'w-link-url';
                url.placeholder = 'https://…';
                url.setAttribute('aria-label', 'Link-Adresse');
                url.value = it.url;

                const ok = document.createElement('button');
                ok.type = 'button';
                ok.className = 'w-zeile-ok';
                ok.textContent = 'OK';
                ok.setAttribute('aria-label', 'Link speichern');

                const fertig = () => {
                    it.titel = titel.value.trim();
                    it.url = url.value.trim();
                    speichern(); zeichne();
                };
                const abbrechen = () => { zeichne(); };   // ohne Übernahme zur Ansicht zurück
                ok.addEventListener('click', fertig);
                titel.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); url.focus(); }
                    else if (ev.key === 'Escape') { ev.preventDefault(); abbrechen(); }
                });
                url.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter') { ev.preventDefault(); fertig(); }
                    else if (ev.key === 'Escape') { ev.preventDefault(); abbrechen(); }
                });

                zeile.append(titel, url, ok);
                // Fokus nach dem Einhängen setzen
                setTimeout(() => titel.focus(), 0);
                return zeile;
            }

            function zeichne() {
                liste.textContent = '';
                items.forEach((it, idx) => liste.appendChild(ansicht(it, idx)));
            }

            zeichne();

            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'w-add';
            add.textContent = '+ Link';
            add.addEventListener('click', () => {
                items.push({ titel: '', url: '' });
                speichern();
                zeichne();
                // direkt ins Bearbeiten-Formular der neuen Zeile
                const letzte = liste.lastElementChild;
                if (letzte) letzte.replaceWith(formular(items[items.length - 1], items.length - 1));
            });

            container.append(liste, add);
        }
    };
})();
