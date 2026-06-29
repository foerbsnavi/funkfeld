/* Funkfeld-Widget: Kalender — nächste Termine aus einem der zentral hinterlegten ICS-Feeds. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    function zwei(n) { return n < 10 ? '0' + n : '' + n; }
    function datumText(ts) {
        const d = new Date(ts * 1000);
        const heute = new Date();
        let tag = TAGE[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
        if (d.getFullYear() !== heute.getFullYear()) tag += d.getFullYear();
        const ganztags = d.getHours() === 0 && d.getMinutes() === 0;
        return ganztags ? tag : (tag + ' ' + zwei(d.getHours()) + ':' + zwei(d.getMinutes()));
    }

    window.PultWidgets.kalender = {
        standard() { return { kalender: '' }; },

        erstelle(container, inhalt, aenderung) {
            const wrap = document.createElement('div');
            wrap.className = 'w-kal';
            container.appendChild(wrap);

            let kalender = [];
            let kalId = String((inhalt && inhalt.kalender) || '');

            function kalName(id) {
                const k = kalender.find((x) => x.id === id);
                return k ? (k.name || 'Kalender') : '';
            }

            function leeren() { wrap.textContent = ''; }
            function status(t, mitEinstellungen) {
                leeren();
                const p = document.createElement('p');
                p.className = 'w-status';
                p.textContent = t;
                wrap.appendChild(p);
                if (mitEinstellungen && window.pultEinstellungen) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'w-sekundaer-btn w-feedhinweis-btn';
                    b.textContent = 'Einstellungen öffnen';
                    b.addEventListener('click', () => window.pultEinstellungen());
                    wrap.appendChild(b);
                }
                if (window.pultAnsage) window.pultAnsage(t);
            }

            function kopf() {
                const k = document.createElement('div');
                k.className = 'w-feedkopf';
                if (kalender.length > 1) {
                    const sel = document.createElement('select');
                    sel.className = 'w-kal-wahl w-eingabe';
                    sel.setAttribute('aria-label', 'Kalender wählen');
                    kalender.forEach((c) => {
                        const o = document.createElement('option');
                        o.value = c.id;
                        o.textContent = c.name || 'Kalender';
                        if (c.id === kalId) o.selected = true;
                        sel.appendChild(o);
                    });
                    sel.addEventListener('change', () => {
                        kalId = sel.value;
                        aenderung({ kalender: kalId });
                        laden();
                    });
                    k.appendChild(sel);
                } else {
                    const t = document.createElement('span');
                    t.className = 'w-feedkopf-titel';
                    t.textContent = kalName(kalId) || 'Termine';
                    k.appendChild(t);
                }
                const neu = document.createElement('button');
                neu.type = 'button';
                neu.className = 'w-mini';
                neu.setAttribute('aria-label', 'Neu laden');
                neu.textContent = '↻';
                neu.addEventListener('click', laden);
                k.appendChild(neu);
                return k;
            }

            async function laden() {
                leeren();
                wrap.appendChild(kopf());
                const liste = document.createElement('div');
                liste.className = 'w-kal-liste';
                wrap.appendChild(liste);
                listeStatus(liste, 'Lädt…');
                try {
                    const res = await fetch('api.php?action=kalender&kalender=' + encodeURIComponent(kalId),
                        { credentials: 'same-origin' });
                    const data = await res.json();
                    if (data.ok && Array.isArray(data.termine)) { zeigeTermine(liste, data.termine); }
                    else { listeStatus(liste, data.fehler || 'Fehler beim Laden', true); }
                } catch (e) {
                    listeStatus(liste, 'Kalender nicht erreichbar');
                }
            }

            function listeStatus(liste, t, mitEinstellungen) {
                liste.textContent = '';
                liste.removeAttribute('role');
                const p = document.createElement('p');
                p.className = 'w-status';
                p.textContent = t;
                liste.appendChild(p);
                if (mitEinstellungen && window.pultEinstellungen) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'w-sekundaer-btn w-feedhinweis-btn';
                    b.textContent = 'Einstellungen öffnen';
                    b.addEventListener('click', () => window.pultEinstellungen());
                    liste.appendChild(b);
                }
                if (window.pultAnsage) window.pultAnsage(t);
            }

            function zeigeTermine(liste, termine) {
                liste.textContent = '';
                if (!termine.length) { listeStatus(liste, 'Keine kommenden Termine.'); return; }
                liste.setAttribute('role', 'list');
                termine.forEach((t) => {
                    const eintrag = document.createElement('div');
                    eintrag.className = 'w-kal-eintrag';
                    eintrag.setAttribute('role', 'listitem');
                    const wann = document.createElement('time');
                    wann.className = 'w-kal-wann';
                    wann.setAttribute('datetime', new Date(t.start * 1000).toISOString());
                    wann.textContent = datumText(t.start);
                    const ti = document.createElement('div');
                    ti.className = 'w-kal-titel';
                    ti.textContent = t.titel || '(ohne Titel)';
                    eintrag.append(wann, ti);
                    if (t.ort) {
                        const ort = document.createElement('div');
                        ort.className = 'w-kal-ort';
                        ort.textContent = t.ort;
                        eintrag.appendChild(ort);
                    }
                    liste.appendChild(eintrag);
                });
            }

            async function init() {
                status('Lädt…');
                const daten = await (window.pultEinstellung
                    ? window.pultEinstellung()
                    : fetch('api.php?action=einstellung_get', { credentials: 'same-origin' })
                        .then((r) => r.json()).then((j) => (j.ok ? j.einstellungen || {} : {})).catch(() => ({})));
                kalender = Array.isArray(daten.kalender) ? daten.kalender : [];
                if (!kalender.length) {
                    status('Kein Kalender angelegt — in den Einstellungen hinzufügen.', true);
                    return;
                }
                if (!kalender.some((k) => k.id === kalId)) {
                    kalId = kalender[0].id;
                    aenderung({ kalender: kalId });
                }
                laden();
            }

            init();

            // Selbst-Aktualisierung alle 15 Minuten (= Server-Cache-TTL; räumt sich beim Schließen auf)
            const timer = setInterval(() => {
                if (!container.isConnected) { clearInterval(timer); return; }
                if (kalender.length) laden();
            }, 900000);
        }
    };
})();
