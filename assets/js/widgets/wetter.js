/* Funkfeld-Widget: Wetter (OpenWeatherMap). Ort im Block, Schlüssel serverseitig. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    // Eigene, abstrakte SVG-Wettergrafiken (keine Emojis). viewBox 48×48, füllt den Container.
    const WOLKE = '<path d="M14 30h18a8 8 0 0 0 .6-15.97A11 11 0 0 0 12 17a7 7 0 0 0 2 13z" fill="#9fb0c0"/>';
    const SVG_W = {
        sonne: '<circle cx="24" cy="24" r="9" fill="#f0a23a"/><g stroke="#f0a23a" stroke-width="2.6" stroke-linecap="round"><line x1="24" y1="4" x2="24" y2="10"/><line x1="24" y1="38" x2="24" y2="44"/><line x1="4" y1="24" x2="10" y2="24"/><line x1="38" y1="24" x2="44" y2="24"/><line x1="9.8" y1="9.8" x2="14" y2="14"/><line x1="34" y1="34" x2="38.2" y2="38.2"/><line x1="38.2" y1="9.8" x2="34" y2="14"/><line x1="14" y1="34" x2="9.8" y2="38.2"/></g>',
        mond: '<path d="M31 9a16 16 0 1 0 9 28A13.5 13.5 0 0 1 31 9z" fill="#cdd6e2"/>',
        wolke: WOLKE,
        teils: '<circle cx="18" cy="16" r="7" fill="#f0a23a"/>' + '<path d="M16 36h18a8 8 0 0 0 .6-15.97A11 11 0 0 0 14 23a7 7 0 0 0 2 13z" fill="#9fb0c0"/>',
        regen: WOLKE + '<g stroke="#6db3e6" stroke-width="2.6" stroke-linecap="round"><line x1="16" y1="34" x2="14" y2="41"/><line x1="24" y1="34" x2="22" y2="41"/><line x1="32" y1="34" x2="30" y2="41"/></g>',
        gewitter: WOLKE + '<path d="M25 32l-7 10h5l-2 6 8-11h-5l3-5z" fill="#f0a23a"/>',
        schnee: WOLKE + '<g fill="#cfe6f5"><circle cx="17" cy="38" r="2"/><circle cx="24" cy="41" r="2"/><circle cx="31" cy="38" r="2"/></g>',
        nebel: '<g stroke="#9fb0c0" stroke-width="3" stroke-linecap="round"><line x1="10" y1="18" x2="38" y2="18"/><line x1="7" y1="26" x2="41" y2="26"/><line x1="12" y1="34" x2="34" y2="34"/></g>'
    };
    function wetterIcon(icon) {
        const p = (icon || '').slice(0, 2);
        const nacht = (icon || '').endsWith('n');
        let inhalt;
        if (p === '01') inhalt = nacht ? SVG_W.mond : SVG_W.sonne;
        else if (p === '02') inhalt = nacht ? (SVG_W.mond + WOLKE) : SVG_W.teils;
        else if (p === '03' || p === '04') inhalt = SVG_W.wolke;
        else if (p === '09' || p === '10') inhalt = SVG_W.regen;
        else if (p === '11') inhalt = SVG_W.gewitter;
        else if (p === '13') inhalt = SVG_W.schnee;
        else if (p === '50') inhalt = SVG_W.nebel;
        else inhalt = SVG_W.wolke;
        return '<svg viewBox="0 0 48 48" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">' + inhalt + '</svg>';
    }

    const WTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    function wochentag(datum) {
        // datum = "YYYY-MM-DD" → Wochentags-Kürzel
        const t = (datum || '').split('-');
        if (t.length !== 3) return '';
        const d = new Date(Number(t[0]), Number(t[1]) - 1, Number(t[2]));
        return WTAGE[d.getDay()] || '';
    }

    window.PultWidgets.wetter = {
        standard() {
            return { ort: '' };
        },

        erstelle(container, inhalt, aenderung) {
            const wrap = document.createElement('div');
            wrap.className = 'w-wetter';

            const ortZeile = document.createElement('div');
            ortZeile.className = 'w-eingabe-zeile';
            const ortFeld = document.createElement('input');
            ortFeld.type = 'text';
            ortFeld.className = 'w-wetter-ort w-eingabe';
            ortFeld.placeholder = 'Ort…';
            ortFeld.value = String((inhalt && inhalt.ort) || '');
            ortFeld.setAttribute('aria-label', 'Ort');
            const ladeBtn = document.createElement('button');
            ladeBtn.type = 'button';
            ladeBtn.className = 'w-sekundaer-btn';
            ladeBtn.textContent = 'Laden';
            ortZeile.append(ortFeld, ladeBtn);

            const anzeige = document.createElement('div');
            anzeige.className = 'w-wetter-anzeige';

            wrap.append(ortZeile, anzeige);
            container.appendChild(wrap);

            function status(t, mitEinstellungen) {
                anzeige.textContent = '';
                const p = document.createElement('p');
                p.className = 'w-status';
                p.textContent = t;
                anzeige.appendChild(p);
                if (mitEinstellungen && window.pultEinstellungen) {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'w-sekundaer-btn w-feedhinweis-btn';
                    b.textContent = 'Einstellungen öffnen';
                    b.addEventListener('click', () => window.pultEinstellungen());
                    anzeige.appendChild(b);
                }
                if (window.pultAnsage) window.pultAnsage(t);
            }

            let letzterOrt = String((inhalt && inhalt.ort) || '');

            async function laden() {
                const ort = ortFeld.value.trim();
                if (ort !== letzterOrt) {                 // Ort nur speichern, wenn er sich geändert hat
                    letzterOrt = ort;                     // (sonst schreibt jedes Seiten-Laden den Block neu)
                    aenderung({ ort });
                }
                if (!ort) { anzeige.textContent = ''; return; }
                // Ohne hinterlegten Schlüssel gar nicht erst anfragen (spart den 400er bei jedem Laden)
                if (window.pultEinstellung) {
                    const e = await window.pultEinstellung().catch(() => null);
                    if (e && e.owm_key_gesetzt === false) {
                        status('Kein API-Schlüssel — in den Einstellungen hinterlegen.', true);
                        return;
                    }
                }
                status('Lädt…');
                try {
                    const res = await fetch('api.php?action=wetter&ort=' + encodeURIComponent(ort),
                        { credentials: 'same-origin' });
                    const data = await res.json();
                    if (data.ok && data.wetter) { zeigeWetter(data.wetter); }
                    else if (data.brauchtSchluessel) { status('Kein API-Schlüssel — in den Einstellungen hinterlegen.', true); }
                    else { status(data.fehler || 'Fehler beim Laden'); }
                } catch (e) {
                    status('Wetterdienst nicht erreichbar');
                }
            }

            function zeigeWetter(w) {
                anzeige.textContent = '';
                const kopf = document.createElement('div');
                kopf.className = 'w-wetter-kopf';
                const ico = document.createElement('span');
                ico.className = 'w-wetter-icon';
                ico.innerHTML = wetterIcon(w.icon);
                ico.setAttribute('aria-hidden', 'true');
                const temp = document.createElement('span');
                temp.className = 'w-wetter-temp';
                temp.textContent = (w.temp != null ? w.temp + '°C' : '—');
                kopf.append(ico, temp);

                const besch = document.createElement('div');
                besch.className = 'w-wetter-besch';
                besch.textContent = (w.beschreibung || '') + (w.ort ? ' · ' + w.ort : '');

                const detail = document.createElement('div');
                detail.className = 'w-wetter-detail';
                const teile = [];
                if (w.gefuehlt != null) teile.push('Gefühlt ' + w.gefuehlt + '°C');
                if (w.feuchte != null) teile.push(w.feuchte + '% Luftf.');
                if (w.wind != null) teile.push(w.wind + ' km/h Wind');
                detail.textContent = teile.join(' · ');

                anzeige.append(kopf, besch, detail);

                // 3-Tage-Vorschau (falls vorhanden)
                if (Array.isArray(w.vorschau) && w.vorschau.length) {
                    const vor = document.createElement('div');
                    vor.className = 'w-wetter-vorschau';
                    vor.setAttribute('role', 'list');
                    vor.setAttribute('aria-label', 'Drei-Tage-Vorschau');
                    w.vorschau.forEach((t) => {
                        const tag = document.createElement('div');
                        tag.className = 'w-wetter-vtag';
                        tag.setAttribute('role', 'listitem');
                        const name = document.createElement('span');
                        name.className = 'w-wetter-vname';
                        name.textContent = wochentag(t.datum);
                        name.setAttribute('aria-hidden', 'true');   // Inhalt steckt im aria-label des Tags
                        const ico = document.createElement('span');
                        ico.className = 'w-wetter-vicon';
                        ico.innerHTML = wetterIcon(t.icon);
                        ico.setAttribute('aria-hidden', 'true');
                        if (t.beschreibung) ico.title = t.beschreibung;
                        const temp = document.createElement('span');
                        temp.className = 'w-wetter-vtemp';
                        const max = (t.max != null ? t.max + '°' : '—');
                        const min = (t.min != null ? t.min + '°' : '—');
                        temp.textContent = max + ' / ' + min;
                        const lab = wochentag(t.datum)
                            + (t.beschreibung ? ', ' + t.beschreibung : '')
                            + ', ' + max + ' bis ' + min;
                        tag.setAttribute('aria-label', lab);
                        tag.append(name, ico, temp);
                        vor.appendChild(tag);
                    });
                    anzeige.appendChild(vor);
                }

                if (window.pultAnsage) {
                    window.pultAnsage('Wetter ' + (w.ort || '') + ': '
                        + (w.temp != null ? w.temp + ' Grad' : '') + ' ' + (w.beschreibung || ''));
                }
            }

            ladeBtn.addEventListener('click', laden);
            ortFeld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); laden(); } });

            if (ortFeld.value.trim()) laden();

            // Selbst-Aktualisierung alle 15 Minuten (räumt sich beim Schließen auf)
            const timer = setInterval(() => {
                if (!container.isConnected) { clearInterval(timer); return; }
                if (ortFeld.value.trim()) laden();
            }, 900000);
        }
    };
})();
