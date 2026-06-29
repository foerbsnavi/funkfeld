/* Funkfeld-Widget: RSS — Schlagzeilen aus einem RSS-/Atom-Feed. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    function zwei(n) { return n < 10 ? '0' + n : '' + n; }
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

    window.PultWidgets.rss = {
        standard() {
            return { url: '' };
        },

        erstelle(container, inhalt, aenderung) {
            const wrap = document.createElement('div');
            wrap.className = 'w-rss';

            const zeile = document.createElement('div');
            zeile.className = 'w-eingabe-zeile';
            const urlFeld = document.createElement('input');
            urlFeld.type = 'url';
            urlFeld.className = 'w-rss-url w-eingabe';
            urlFeld.placeholder = 'Feed-Adresse (RSS/Atom)';
            urlFeld.value = String((inhalt && inhalt.url) || '');
            urlFeld.setAttribute('aria-label', 'Feed-Adresse');
            const ladeBtn = document.createElement('button');
            ladeBtn.type = 'button';
            ladeBtn.className = 'w-sekundaer-btn';
            ladeBtn.textContent = 'Laden';
            zeile.append(urlFeld, ladeBtn);

            const liste = document.createElement('div');
            liste.className = 'w-rss-liste';

            wrap.append(zeile, liste);
            container.appendChild(wrap);

            function status(t) {
                liste.textContent = '';
                liste.removeAttribute('role');
                const p = document.createElement('p');
                p.className = 'w-status';
                p.textContent = t;
                liste.appendChild(p);
                if (window.pultAnsage) window.pultAnsage(t);
            }

            async function laden() {
                const url = urlFeld.value.trim();
                aenderung({ url });
                if (!url) {
                    liste.textContent = '';
                    if (window.pultAnsage) window.pultAnsage('Bitte eine Feed-Adresse eingeben.');
                    return;
                }
                status('Lädt…');
                try {
                    const res = await fetch('api.php?action=rss&url=' + encodeURIComponent(url),
                        { credentials: 'same-origin' });
                    const data = await res.json();
                    if (data.ok && Array.isArray(data.eintraege)) { zeigeEintraege(data.eintraege); }
                    else { status(data.fehler || 'Fehler beim Laden'); }
                } catch (e) {
                    status('Feed nicht erreichbar');
                }
            }

            function zeigeEintraege(eintraege) {
                liste.textContent = '';
                if (!eintraege.length) { status('Keine Einträge.'); return; }
                liste.setAttribute('role', 'list');
                eintraege.forEach((e) => {
                    const z = document.createElement('div');
                    z.className = 'w-rss-eintrag';
                    z.setAttribute('role', 'listitem');
                    const a = document.createElement('a');
                    a.className = 'w-rss-titel';
                    a.textContent = e.titel || '(ohne Titel)';   // textContent → kein HTML
                    if (e.link) {                                 // serverseitig auf http/https geprüft
                        a.href = e.link;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.setAttribute('aria-label', (e.titel || e.link) + ' (öffnet neues Fenster)');
                    }
                    z.appendChild(a);
                    const dt = datumText(e.datum);
                    if (dt) {
                        const dat = document.createElement('time');
                        dat.className = 'w-rss-datum';
                        if (e.datum) dat.setAttribute('datetime', new Date(e.datum * 1000).toISOString());
                        dat.textContent = dt;
                        z.appendChild(dat);
                    }
                    liste.appendChild(z);
                });
                if (window.pultAnsage) window.pultAnsage(eintraege.length + ' Einträge geladen');
            }

            ladeBtn.addEventListener('click', laden);
            urlFeld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); laden(); } });

            if (urlFeld.value.trim()) laden();

            // Selbst-Aktualisierung alle 15 Minuten (räumt sich beim Schließen auf)
            const timer = setInterval(() => {
                if (!container.isConnected) { clearInterval(timer); return; }
                if (urlFeld.value.trim()) laden();
            }, 900000);
        }
    };
})();
