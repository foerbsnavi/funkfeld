/* Funkfeld-Widget: Livestream — Webcam-/Standbild von einer URL, volle Breite,
   Höhe passt sich an. MJPG wird nativ gestreamt; Standbilder werden optional
   in einem Intervall neu geladen (Cache-Buster). */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    // Motion-JPEG (mjpg/mjpeg) ist ein fortlaufender Stream → nicht neu laden.
    function istStream(url) { return /\.mjpe?g(\?|#|$)/i.test(url || ''); }

    window.PultWidgets.livestream = {
        standard() { return { url: '', intervall: 5 }; },

        erstelle(container, inhalt, aenderung) {
            const state = {
                url: (inhalt && typeof inhalt.url === 'string') ? inhalt.url : '',
                intervall: (inhalt && Number.isFinite(inhalt.intervall)) ? inhalt.intervall : 5
            };

            const wrap = document.createElement('div');
            wrap.className = 'w-livestream';

            const leiste = document.createElement('div');
            leiste.className = 'w-ls-leiste';
            const feld = document.createElement('input');
            feld.type = 'url';
            feld.className = 'w-eingabe w-ls-url';
            feld.placeholder = 'Bild-/Webcam-URL (https://…)';
            feld.value = state.url;
            feld.setAttribute('aria-label', 'Bild- oder Webcam-Adresse');
            const sel = document.createElement('select');
            sel.className = 'w-eingabe w-ls-intervall';
            sel.setAttribute('aria-label', 'Aktualisierung');
            [['0', 'Aus'], ['2', '2 s'], ['5', '5 s'], ['15', '15 s'], ['60', '60 s']].forEach((o) => {
                const op = document.createElement('option');
                op.value = o[0]; op.textContent = o[1];
                sel.appendChild(op);
            });
            sel.value = String(state.intervall);
            leiste.append(feld, sel);

            const buehne = document.createElement('div');
            buehne.className = 'w-ls-buehne';
            const bild = document.createElement('img');
            bild.className = 'w-ls-bild';
            bild.alt = 'Livestream-Kamerabild';
            bild.hidden = true;
            const status = document.createElement('p');
            status.className = 'w-status w-ls-status';
            status.setAttribute('aria-live', 'polite');
            buehne.append(bild, status);

            wrap.append(leiste, buehne);
            container.appendChild(wrap);

            let timer = null;

            function quelle() {
                if (istStream(state.url)) return state.url;                 // nativer Stream
                const cb = 'ffts=' + Date.now();                            // Standbild: frisch laden
                return state.url + (state.url.includes('?') ? '&' : '?') + cb;
            }

            function stoppe() { if (timer) { clearInterval(timer); timer = null; } }

            function zeigen() {
                stoppe();
                if (!state.url) {
                    bild.hidden = true; status.hidden = false;
                    status.textContent = 'Keine Adresse — oben eine Bild-/Webcam-URL eingeben.';
                    return;
                }
                if (!/^https:\/\//i.test(state.url)) {
                    bild.hidden = true; status.hidden = false;
                    status.textContent = 'Bitte eine vollständige https-Adresse angeben.';
                    return;
                }
                status.hidden = true; bild.hidden = false;
                bild.src = quelle();
                if (!istStream(state.url) && state.intervall > 0) {
                    timer = setInterval(() => {
                        if (!container.isConnected) { stoppe(); return; }   // Fläche geschlossen
                        if (!document.hidden) bild.src = quelle();
                    }, state.intervall * 1000);
                }
            }

            bild.addEventListener('error', () => {
                status.hidden = false;
                status.textContent = 'Bild konnte nicht geladen werden (Adresse/Verbindung prüfen).';
            });
            bild.addEventListener('load', () => { status.hidden = true; });

            function speichern() { aenderung({ url: state.url, intervall: state.intervall }); }

            feld.addEventListener('change', () => { state.url = feld.value.trim(); speichern(); zeigen(); });
            sel.addEventListener('change', () => { state.intervall = Number(sel.value) || 0; speichern(); zeigen(); });

            zeigen();
        }
    };
})();
