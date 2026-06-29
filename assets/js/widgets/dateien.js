/* Funkfeld-Widget: Datei-Zwischenlager — hochladen, herunterladen, löschen. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    const MAX = 26214400; // 25 MB

    function groesse(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1048576).toFixed(1) + ' MB';
    }

    window.PultWidgets.dateien = {
        standard() {
            return { items: [] };
        },

        erstelle(container, inhalt, aenderung, ctx) {
            const csrf = (ctx && ctx.csrf) || document.body.dataset.csrf || '';
            const items = (inhalt && Array.isArray(inhalt.items))
                ? inhalt.items.map(i => ({
                    id:   String((i && i.id) || ''),
                    name: String((i && i.name) || 'Datei'),
                    size: Number(i && i.size) || 0
                })) : [];

            const liste = document.createElement('div');
            liste.className = 'w-datei-liste';

            const speichern = () => aenderung({ items: items.slice() });

            function zeichne() {
                liste.textContent = '';
                items.forEach((it, idx) => {
                    const zeile = document.createElement('div');
                    zeile.className = 'w-datei-zeile';

                    const link = document.createElement('a');
                    link.className = 'w-datei-name';
                    link.textContent = it.name;                       // textContent → kein HTML
                    link.href = 'api.php?action=file_get&file=' + encodeURIComponent(it.id);
                    link.setAttribute('download', it.name);

                    const gr = document.createElement('span');
                    gr.className = 'w-datei-groesse';
                    gr.textContent = groesse(it.size);

                    const weg = document.createElement('button');
                    weg.type = 'button';
                    weg.className = 'w-zeile-weg';
                    weg.textContent = '×';
                    weg.setAttribute('aria-label', 'Datei entfernen: ' + it.name);
                    weg.addEventListener('click', async () => {
                        if (!(await window.pultConfirm('Diese Datei entfernen?'))) return;
                        try {
                            await fetch('api.php?action=file_delete', {
                                method: 'POST',
                                credentials: 'same-origin',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ csrf, file: it.id })
                            });
                        } catch (e) { /* lokal trotzdem entfernen */ }
                        items.splice(idx, 1);
                        speichern(); zeichne();
                        const knoepfe = liste.querySelectorAll('.w-zeile-weg');
                        if (knoepfe.length) knoepfe[Math.max(0, idx - 1)].focus();
                        else add.focus();
                    });

                    zeile.append(link, gr, weg);
                    liste.appendChild(zeile);
                });
            }

            zeichne();

            const feld = document.createElement('input');
            feld.type = 'file';
            feld.className = 'w-datei-input';
            feld.hidden = true;

            const add = document.createElement('button');
            add.type = 'button';
            add.className = 'w-add';
            add.textContent = '+ Datei hochladen';

            const status = document.createElement('span');
            status.className = 'w-datei-status';
            status.setAttribute('aria-live', 'polite');
            status.setAttribute('aria-atomic', 'true');

            add.addEventListener('click', () => feld.click());

            feld.addEventListener('change', async () => {
                const datei = feld.files && feld.files[0];
                if (!datei) return;
                if (datei.size > MAX) {
                    status.textContent = 'Datei zu groß (max 25 MB)';
                    feld.value = '';
                    return;
                }
                status.textContent = 'Lädt hoch…';
                const fd = new FormData();
                fd.append('csrf', csrf);
                fd.append('datei', datei);
                try {
                    const res = await fetch('api.php?action=file_upload', {
                        method: 'POST', credentials: 'same-origin', body: fd
                    });
                    const data = await res.json();
                    if (data.ok && data.datei) {
                        items.push({
                            id: String(data.datei.id),
                            name: String(data.datei.name),
                            size: Number(data.datei.size) || 0
                        });
                        speichern(); zeichne();
                        status.textContent = '';
                    } else {
                        status.textContent = (data && data.fehler) ? data.fehler : 'Upload fehlgeschlagen';
                    }
                } catch (e) {
                    status.textContent = 'Upload fehlgeschlagen';
                }
                feld.value = '';
            });

            container.append(liste, add, feld, status);
        }
    };
})();
