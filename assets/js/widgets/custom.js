/* Funkfeld-Widget: Custom — eigenes HTML/CSS/JavaScript, sicher in einem Sandbox-iframe.
   Der Inhalt wird roh gespeichert und über api.php?action=custom_render in einem
   abgeschotteten iframe ausgeführt (kein Zugriff auf Login/Session/andere Flächen). */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    window.PultWidgets.custom = {
        standard() { return { html: '' }; },

        erstelle(container, inhalt, aenderung, ctx) {
            const state = { html: (inhalt && typeof inhalt.html === 'string') ? inhalt.html : '' };

            const wrap = document.createElement('div');
            wrap.className = 'w-custom';

            const leiste = document.createElement('div');
            leiste.className = 'w-custom-leiste';
            const btnEdit = document.createElement('button');
            btnEdit.type = 'button';
            btnEdit.className = 'w-mini';
            btnEdit.textContent = 'Bearbeiten';
            btnEdit.setAttribute('aria-expanded', 'false');
            leiste.appendChild(btnEdit);

            const buehne = document.createElement('div');
            buehne.className = 'w-custom-buehne';

            const rahmen = document.createElement('iframe');
            rahmen.className = 'w-custom-frame';
            rahmen.setAttribute('sandbox', 'allow-scripts allow-forms');
            rahmen.setAttribute('title', 'Eigener Inhalt');
            rahmen.setAttribute('referrerpolicy', 'no-referrer');

            const editor = document.createElement('textarea');
            editor.className = 'w-eingabe w-custom-editor';
            editor.placeholder = '<!-- Eigenes HTML / CSS / JavaScript … -->';
            editor.value = state.html;
            editor.hidden = true;
            editor.setAttribute('aria-label', 'Eigenes HTML/JavaScript');
            editor.spellcheck = false;

            const hinweis = document.createElement('p');
            hinweis.className = 'w-custom-hinweis';
            hinweis.hidden = true;
            hinweis.textContent = 'Läuft isoliert (Sandbox) – kein Zugriff auf Login oder andere Flächen.';

            buehne.append(rahmen, editor, hinweis);
            wrap.append(leiste, buehne);
            container.appendChild(wrap);

            function ansehen() {
                rahmen.src = 'api.php?action=custom_render&id=' + encodeURIComponent(ctx.id) + '&t=' + Date.now();
            }
            function modus(bearbeiten) {
                editor.hidden = !bearbeiten;
                hinweis.hidden = !bearbeiten;
                rahmen.hidden = bearbeiten;
                btnEdit.textContent = bearbeiten ? 'Fertig' : 'Bearbeiten';
                btnEdit.setAttribute('aria-expanded', bearbeiten ? 'true' : 'false');
                if (bearbeiten) editor.focus();
            }

            btnEdit.addEventListener('click', () => {
                const imEdit = !editor.hidden;
                if (imEdit) {
                    state.html = editor.value;
                    aenderung({ html: state.html });          // speichert den Block (debounced)
                    modus(false);
                    setTimeout(ansehen, 1500);                // nach dem (debounced) Speichern frisch rendern
                } else {
                    modus(true);
                }
            });

            if (!state.html.trim()) { modus(true); } else { modus(false); ansehen(); }
        }
    };
})();
