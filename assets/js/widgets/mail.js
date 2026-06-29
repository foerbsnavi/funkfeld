/* Funkfeld-Widget: Mail (IMAP, nur Lesen) — wählt eines der zentral angelegten Konten. */
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

    window.PultWidgets.mail = {
        standard() { return { konto: '' }; },

        erstelle(container, inhalt, aenderung) {
            const wrap = document.createElement('div');
            wrap.className = 'w-mail';
            container.appendChild(wrap);

            let konten = [];
            let kontoId = String((inhalt && inhalt.konto) || '');
            let zielUid = null;

            function kontoName(id) {
                const k = konten.find((x) => x.id === id);
                return k ? (k.name || 'Postfach') : '';
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

            function kopfListe() {
                const kopf = document.createElement('div');
                kopf.className = 'w-feedkopf';
                if (konten.length > 1) {
                    const sel = document.createElement('select');
                    sel.className = 'w-mail-konto w-eingabe';
                    sel.setAttribute('aria-label', 'Postfach wählen');
                    konten.forEach((k) => {
                        const o = document.createElement('option');
                        o.value = k.id;
                        o.textContent = k.name || 'Postfach';
                        if (k.id === kontoId) o.selected = true;
                        sel.appendChild(o);
                    });
                    sel.addEventListener('change', () => {
                        kontoId = sel.value;
                        aenderung({ konto: kontoId });
                        ladeListe();
                    });
                    kopf.appendChild(sel);
                } else {
                    const t = document.createElement('span');
                    t.className = 'w-feedkopf-titel';
                    t.textContent = kontoName(kontoId) || 'Posteingang';
                    kopf.appendChild(t);
                }
                const neu = document.createElement('button');
                neu.type = 'button';
                neu.className = 'w-mini';
                neu.setAttribute('aria-label', 'Neu laden');
                neu.textContent = '↻';
                neu.addEventListener('click', ladeListe);
                kopf.appendChild(neu);
                return kopf;
            }

            function kopfNachricht(titelText, zurueck) {
                const kopf = document.createElement('div');
                kopf.className = 'w-feedkopf';
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'w-mini';
                b.textContent = '‹ Zurück';
                b.setAttribute('aria-label', 'Zurück zur Liste');
                b.addEventListener('click', zurueck);
                const t = document.createElement('span');
                t.className = 'w-feedkopf-titel';
                t.textContent = titelText;
                kopf.append(b, t);
                return kopf;
            }

            async function ladeListe() {
                try {
                    const res = await fetch('api.php?action=mail_liste&konto=' + encodeURIComponent(kontoId),
                        { credentials: 'same-origin' });
                    if (res.status === 501) { status('IMAP ist auf diesem Server nicht verfügbar.'); return; }
                    const data = await res.json();
                    if (data.ok && Array.isArray(data.nachrichten)) { zeigeListe(data.nachrichten); }
                    else if (data.nichtEingerichtet) { status('Postfach unvollständig — bitte in den Einstellungen prüfen.', true); }
                    else { status(data.fehler || 'Fehler beim Laden', true); }
                } catch (e) {
                    status('Server nicht erreichbar');
                }
            }

            function zeigeListe(nachrichten) {
                leeren();
                wrap.appendChild(kopfListe());
                if (!nachrichten.length) {
                    const p = document.createElement('p');
                    p.className = 'w-status';
                    p.textContent = 'Keine Nachrichten.';
                    wrap.appendChild(p);
                    return;
                }
                const liste = document.createElement('div');
                liste.className = 'w-mail-liste';
                nachrichten.forEach((n) => {
                    const e = document.createElement('button');
                    e.type = 'button';
                    e.className = 'w-mail-eintrag' + (n.gesehen ? '' : ' ungelesen');
                    e.dataset.uid = n.uid;
                    e.setAttribute('aria-label',
                        (n.gesehen ? '' : 'Ungelesen: ') + (n.von || '') + ', ' + (n.betreff || '(kein Betreff)'));
                    const z1 = document.createElement('div');
                    z1.className = 'w-mail-z1';
                    const von = document.createElement('span');
                    von.className = 'w-mail-von';
                    von.textContent = n.von || '';
                    const dat = document.createElement('span');
                    dat.className = 'w-mail-datum';
                    dat.textContent = datumText(n.datum);
                    z1.append(von, dat);
                    const betreff = document.createElement('div');
                    betreff.className = 'w-mail-betreff';
                    betreff.textContent = n.betreff || '(kein Betreff)';
                    e.append(z1, betreff);
                    e.addEventListener('click', () => ladeText(n.uid, n));
                    liste.appendChild(e);
                });
                wrap.appendChild(liste);
                if (zielUid != null) {
                    const ziel = liste.querySelector('[data-uid="' + zielUid + '"]') || liste.querySelector('.w-mail-eintrag');
                    if (ziel) ziel.focus();
                    zielUid = null;
                }
            }

            async function ladeText(uid, kopfdaten) {
                status('Lädt…');
                try {
                    const res = await fetch('api.php?action=mail_text&uid=' + encodeURIComponent(uid)
                        + '&konto=' + encodeURIComponent(kontoId), { credentials: 'same-origin' });
                    if (res.status === 501) { status('IMAP nicht verfügbar.'); return; }
                    const data = await res.json();
                    if (data.ok) { zeigeNachricht(kopfdaten, data.text || ''); }
                    else if (data.nichtEingerichtet) { status('Postfach unvollständig — bitte in den Einstellungen prüfen.', true); }
                    else { status(data.fehler || 'Fehler beim Laden', true); }
                } catch (e) {
                    status('Server nicht erreichbar');
                }
            }

            function zeigeNachricht(n, text) {
                leeren();
                wrap.appendChild(kopfNachricht(n.betreff || '(kein Betreff)', () => { zielUid = n.uid; ladeListe(); }));
                const meta = document.createElement('div');
                meta.className = 'w-mail-meta';
                meta.textContent = (n.von || '') + (n.datum ? ' · ' + datumText(n.datum) : '');
                const body = document.createElement('div');
                body.className = 'w-mail-text';
                body.textContent = text;
                wrap.append(meta, body);
                wrap.querySelector('.w-mini')?.focus();
            }

            async function init() {
                status('Lädt…');
                const daten = await (window.pultEinstellung
                    ? window.pultEinstellung()
                    : fetch('api.php?action=einstellung_get', { credentials: 'same-origin' })
                        .then((r) => r.json()).then((j) => (j.ok ? j.einstellungen || {} : {})).catch(() => ({})));
                konten = Array.isArray(daten.mailkonten) ? daten.mailkonten : [];
                if (!konten.length) {
                    status('Kein Mail-Konto angelegt — in den Einstellungen hinzufügen.', true);
                    return;
                }
                if (!konten.some((k) => k.id === kontoId)) {
                    kontoId = konten[0].id;
                    aenderung({ konto: kontoId });
                }
                ladeListe();
            }

            init();

            // Selbst-Aktualisierung alle 2 Minuten, aber nur in der Listenansicht
            const timer = setInterval(() => {
                if (!container.isConnected) { clearInterval(timer); return; }
                if (konten.length && wrap.querySelector('.w-mail-liste')) ladeListe();
            }, 120000);
        }
    };
})();
