/* Funkfeld-Widget: Kalender — nächste Termine aus einem der zentral hinterlegten ICS-Feeds. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const zwei = (n) => window.pultZeit.zwei(n);   // gemeinsamer Helfer (hilfen.js)
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
            let eigenes = true;   // Termine anlegen geht nur im eigenen Dashboard (Server erzwingt es)

            function kalName(id) {
                const k = kalender.find((x) => x.id === id);
                return k ? (k.name || 'Kalender') : '';
            }

            function leeren() { wrap.textContent = ''; }
            function status(t, mitEinstellungen) {
                window.pultStatus(wrap, t, mitEinstellungen);   // gemeinsamer Helfer (hilfen.js)
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
                // „+ Termin" nur bei CalDAV-Kalendern im eigenen Dashboard (sonst kein toter Knopf)
                const akt = kalender.find((x) => x.id === kalId);
                if (akt && akt.caldav && eigenes) {
                    const plus = document.createElement('button');
                    plus.type = 'button';
                    plus.className = 'w-mini';
                    plus.setAttribute('aria-label', 'Termin anlegen');
                    plus.textContent = '+ Termin';
                    plus.addEventListener('click', () => terminFormular(plus));
                    k.appendChild(plus);
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

            // Kleines Formular zum Termin-Anlegen (CalDAV): Titel, von–bis, optional Ort.
            function terminFormular(ausloeser) {
                if (wrap.querySelector('.w-kal-neu')) return;   // schon offen
                const form = document.createElement('form');
                form.className = 'w-kal-neu';
                const titel = document.createElement('input');
                titel.className = 'w-eingabe';
                titel.type = 'text';
                titel.required = true;
                titel.maxLength = 200;
                titel.placeholder = 'Titel';
                titel.setAttribute('aria-label', 'Titel des Termins');
                const von = document.createElement('input');
                von.className = 'w-eingabe';
                von.type = 'datetime-local';
                von.required = true;
                von.setAttribute('aria-label', 'Beginn');
                const bis = document.createElement('input');
                bis.className = 'w-eingabe';
                bis.type = 'datetime-local';
                bis.required = true;
                bis.setAttribute('aria-label', 'Ende');
                // Vorbelegung: nächste volle Stunde, eine Stunde lang
                const j = new Date(); j.setMinutes(0, 0, 0); j.setHours(j.getHours() + 1);
                const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                von.value = iso(j);
                bis.value = iso(new Date(j.getTime() + 3600000));
                const ort = document.createElement('input');
                ort.className = 'w-eingabe';
                ort.type = 'text';
                ort.maxLength = 200;
                ort.placeholder = 'Ort (optional)';
                ort.setAttribute('aria-label', 'Ort');
                const ok = document.createElement('button');
                ok.type = 'submit';
                ok.className = 'w-sekundaer-btn';
                ok.textContent = 'Anlegen';
                const abbruch = document.createElement('button');
                abbruch.type = 'button';
                abbruch.className = 'w-sekundaer-btn';
                abbruch.textContent = 'Abbrechen';
                const meldung = document.createElement('p');
                meldung.className = 'w-status';
                meldung.setAttribute('aria-live', 'polite');
                meldung.hidden = true;
                const knoepfe = document.createElement('div');
                knoepfe.className = 'w-kal-neu-knoepfe';
                knoepfe.append(ok, abbruch);
                form.append(titel, von, bis, ort, knoepfe, meldung);
                abbruch.addEventListener('click', () => { form.remove(); ausloeser.focus(); });
                form.addEventListener('submit', async (ev) => {
                    ev.preventDefault();
                    const start = Math.floor(new Date(von.value).getTime() / 1000);
                    const ende  = Math.floor(new Date(bis.value).getTime() / 1000);
                    if (!Number.isFinite(start) || !Number.isFinite(ende) || ende <= start) {
                        meldung.hidden = false;
                        meldung.textContent = 'Das Ende muss nach dem Beginn liegen.';
                        return;
                    }
                    ok.disabled = true;
                    meldung.hidden = false;
                    meldung.textContent = 'Legt an …';
                    try {
                        const res = await fetch('api.php?action=kalender_anlegen', {
                            method: 'POST', credentials: 'same-origin',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                csrf: document.body.dataset.csrf || '',
                                kalender: kalId,
                                titel: titel.value.trim(),
                                ort: ort.value.trim(),
                                start: start,
                                ende: ende
                            })
                        });
                        const data = await res.json();
                        if (data && data.ok) { laden(); return; }
                        throw new Error(data && data.fehler ? data.fehler : 'unbekannt');
                    } catch (fehler) {
                        ok.disabled = false;
                        meldung.textContent = 'Anlegen fehlgeschlagen: ' + (fehler && fehler.message ? fehler.message : 'unbekannt');
                    }
                });
                wrap.insertBefore(form, wrap.querySelector('.w-kal-liste'));
                titel.focus();
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
                liste.removeAttribute('role');
                window.pultStatus(liste, t, mitEinstellungen);   // gemeinsamer Helfer (hilfen.js)
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
                eigenes = daten.eigenes !== false;
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
            window.pultIntervall(container, () => {
                if (kalender.length) laden();
            }, 900000);
        }
    };
})();
