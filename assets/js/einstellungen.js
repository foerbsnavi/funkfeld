/* Funkfeld — Einstellungs-Popup (zentral: API-Schlüssel, Kalender, Mail-Konto). */
(() => {
    'use strict';

    function csrf() { return document.body.dataset.csrf || ''; }

    // Gemeinsam genutzter, gecachter einstellung_get-Abruf: Mail-, Chat- und
    // Kalender-Widgets teilen sich eine Antwort statt jeweils einzeln zu laden.
    // Innerhalb einer Sitzung ändern sich Einstellungen nur über Speichern → Reload,
    // daher ist ein dauerhafter Cache unbedenklich.
    let _einstellungPromise = null;
    function einstellungLaden() {
        if (!_einstellungPromise) {
            _einstellungPromise = fetch('api.php?action=einstellung_get', { credentials: 'same-origin' })
                .then((r) => r.json())
                .then((j) => (j && j.ok ? (j.einstellungen || {}) : {}))
                .catch(() => { _einstellungPromise = null; return {}; });
        }
        return _einstellungPromise;
    }
    window.pultEinstellung = einstellungLaden;

    function feld(label, typ, wert, ph) {
        const l = document.createElement('label');
        l.className = 'pe-label';
        l.textContent = label;
        const i = document.createElement('input');
        i.type = typ;
        i.className = 'pe-feld w-eingabe';
        if (wert) i.value = wert;
        if (ph) i.placeholder = ph;
        l.appendChild(i);
        return { label: l, input: i };
    }

    function gruppe(text) {
        const h = document.createElement('div');
        h.className = 'pe-gruppe';
        h.setAttribute('role', 'heading');
        h.setAttribute('aria-level', '3');
        h.textContent = text;
        return h;
    }

    async function oeffnen() {
        const e = await einstellungLaden();
        const konten = Array.isArray(e.mailkonten) ? e.mailkonten : [];

        // Freigabe-Status (nur Plattform-Modus liefert verfuegbar:true)
        let fg = {};
        try {
            const r = await fetch('api.php?action=freigabe_get', { credentials: 'same-origin' });
            fg = await r.json();
        } catch (err) { /* nicht verfügbar */ }

        // Freigabe-Bereich (Dashboard teilen) — baut sich nach jeder Aktion neu auf.
        const freigabeWrap = document.createElement('div');
        freigabeWrap.className = 'pe-freigabe';
        async function fgPost(aktion) {
            try {
                const r = await fetch('api.php?action=' + aktion, {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ csrf: csrf() })
                });
                return await r.json();
            } catch (e2) { return { ok: false }; }
        }
        async function fgNeuLaden() {
            try {
                const r = await fetch('api.php?action=freigabe_get', { credentials: 'same-origin' });
                fgRender(await r.json());
            } catch (e2) { /* belassen */ }
        }
        function fgRender(d) {
            freigabeWrap.textContent = '';
            if (!d || !d.verfuegbar) {
                const p = document.createElement('p');
                p.className = 'w-status';
                p.textContent = 'Teilen ist nur in der Online-Plattform verfügbar.';
                freigabeWrap.appendChild(p);
                return;
            }
            if (d.fremd) {
                const p = document.createElement('p');
                p.className = 'pe-hinweis';
                p.textContent = 'Dies ist ein geteiltes Dashboard' + (d.ownerName ? ' von ' + d.ownerName : '')
                    + '. Teilen kann nur der Eigentümer. Eigene Dashboards verwaltest du über „Dashboards".';
                freigabeWrap.appendChild(p);
                return;
            }
            const info = document.createElement('p');
            info.className = 'pe-hinweis';
            info.textContent = 'Über einen Freigabelink kann jede Person mit Funkfeld-Konto deinem Dashboard beitreten und mitarbeiten.';
            freigabeWrap.appendChild(info);
            if (d.geteilt && d.link) {
                const feld = document.createElement('input');
                feld.type = 'text';
                feld.className = 'pe-feld w-eingabe';
                feld.readOnly = true;
                feld.value = d.link;
                feld.setAttribute('aria-label', 'Freigabelink');
                feld.addEventListener('focus', () => feld.select());
                feld.addEventListener('click', () => feld.select());
                const neu = document.createElement('button');
                neu.type = 'button';
                neu.className = 'w-sekundaer-btn';
                neu.textContent = 'Neuen Link erzeugen';
                neu.addEventListener('click', async () => { await fgPost('freigabe_create'); fgNeuLaden(); });
                const weg = document.createElement('button');
                weg.type = 'button';
                weg.className = 'w-sekundaer-btn';
                weg.textContent = 'Freigabe aufheben';
                weg.addEventListener('click', async () => {
                    if (window.pultConfirm && !(await window.pultConfirm('Freigabe aufheben? Der aktuelle Link wird ungültig.'))) return;
                    await fgPost('freigabe_revoke'); fgNeuLaden();
                });
                const reihe = document.createElement('div');
                reihe.className = 'pe-freigabe-knoepfe';
                reihe.append(neu, weg);
                freigabeWrap.append(feld, reihe);
            } else {
                const erstellen = document.createElement('button');
                erstellen.type = 'button';
                erstellen.className = 'w-sekundaer-btn';
                erstellen.textContent = 'Freigabelink erstellen';
                erstellen.addEventListener('click', async () => { await fgPost('freigabe_create'); fgNeuLaden(); });
                freigabeWrap.appendChild(erstellen);
            }
        }
        fgRender(fg);

        const vorher = document.activeElement;
        const overlay = document.createElement('div');
        overlay.className = 'pult-modal-overlay';
        const box = document.createElement('div');
        box.className = 'pult-modal pe-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', 'pe-titel');

        const titel = document.createElement('h2');
        titel.className = 'pe-titel';
        titel.id = 'pe-titel';
        titel.textContent = 'Einstellungen';

        const owm = feld('OpenWeatherMap API-Schlüssel', 'password', '',
            e.owm_key_gesetzt ? '•••••• hinterlegt (zum Ändern neu eingeben)' : 'API-Schlüssel');

        // Kalender — mehrere ICS-Feeds
        const kalender = Array.isArray(e.kalender) ? e.kalender : [];
        const kalWrap = document.createElement('div');
        kalWrap.className = 'pe-konten';
        const kalRows = [];
        function kalenderZeile(k) {
            k = k || {};
            const kbox = document.createElement('div');
            kbox.className = 'pe-konto';
            kbox.setAttribute('role', 'group');
            const name = feld('Name', 'text', k.name || '', 'z. B. Privat');
            const url = feld('Adresse (ICS/iCal)', 'url', k.url || '', 'https://…');
            const weg = document.createElement('button');
            weg.type = 'button';
            weg.className = 'w-sekundaer-btn pe-konto-weg';
            weg.textContent = 'Kalender entfernen';
            function labelSetzen() {
                const nm = name.input.value.trim();
                kbox.setAttribute('aria-label', nm ? 'Kalender: ' + nm : 'Neuer Kalender');
                weg.setAttribute('aria-label', (nm ? 'Kalender „' + nm + '"' : 'Neuen Kalender') + ' entfernen');
            }
            labelSetzen();
            name.input.addEventListener('input', labelSetzen);
            const eintrag = {
                element: kbox,
                lesen: () => ({
                    id: k.id || '',
                    name: name.input.value.trim(),
                    url: url.input.value.trim()
                })
            };
            weg.addEventListener('click', () => {
                kbox.remove();
                const i = kalRows.indexOf(eintrag);
                if (i >= 0) kalRows.splice(i, 1);
            });
            kbox.append(name.label, url.label, weg);
            return eintrag;
        }
        function addKalender(k) {
            const z = kalenderZeile(k);
            kalRows.push(z);
            kalWrap.appendChild(z.element);
        }
        kalender.forEach(addKalender);
        const addKalBtn = document.createElement('button');
        addKalBtn.type = 'button';
        addKalBtn.className = 'w-sekundaer-btn pe-konto-add';
        addKalBtn.textContent = '+ Kalender hinzufügen';
        addKalBtn.addEventListener('click', () => addKalender({}));

        // Mail — mehrere Postfächer
        const kontenWrap = document.createElement('div');
        kontenWrap.className = 'pe-konten';
        const kontoRows = [];
        function kontoZeile(k) {
            k = k || {};
            const kbox = document.createElement('div');
            kbox.className = 'pe-konto';
            kbox.setAttribute('role', 'group');
            const name = feld('Name', 'text', k.name || '', 'z. B. Privat');
            const host = feld('Server (IMAP, SSL)', 'text', k.host || '', 'imap.beispiel.de');
            const user = feld('Benutzer / E-Mail', 'text', k.user || '', '');
            const port = feld('Port', 'number', String(k.port || 993), '993');
            const pw = feld('Passwort', 'password', '', k.pw_gesetzt ? '•••••• hinterlegt' : 'Passwort');
            const weg = document.createElement('button');
            weg.type = 'button';
            weg.className = 'w-sekundaer-btn pe-konto-weg';
            weg.textContent = 'Konto entfernen';
            // Gruppe + Entfernen-Button sprechend benennen (folgt dem Konto-Namen)
            function labelSetzen() {
                const nm = name.input.value.trim();
                kbox.setAttribute('aria-label', nm ? 'Postfach: ' + nm : 'Neues Postfach');
                weg.setAttribute('aria-label', (nm ? 'Postfach „' + nm + '"' : 'Neues Postfach') + ' entfernen');
            }
            labelSetzen();
            name.input.addEventListener('input', labelSetzen);
            const eintrag = {
                element: kbox,
                lesen: () => ({
                    id: k.id || '',
                    name: name.input.value.trim(),
                    host: host.input.value.trim(),
                    user: user.input.value.trim(),
                    port: Number(port.input.value) || 993,
                    passwort: pw.input.value
                })
            };
            weg.addEventListener('click', () => {
                kbox.remove();
                const i = kontoRows.indexOf(eintrag);
                if (i >= 0) kontoRows.splice(i, 1);
            });
            kbox.append(name.label, host.label, user.label, port.label, pw.label, weg);
            return eintrag;
        }
        function addKonto(k) {
            const z = kontoZeile(k);
            kontoRows.push(z);
            kontenWrap.appendChild(z.element);
        }
        konten.forEach(addKonto);
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'w-sekundaer-btn pe-konto-add';
        addBtn.textContent = '+ Postfach hinzufügen';
        addBtn.addEventListener('click', () => addKonto({}));

        // Chat-Namen (frei wählbar im Chat)
        const namen = Array.isArray(e.chatnamen) ? e.chatnamen : [];
        const namenWrap = document.createElement('div');
        namenWrap.className = 'pe-namen';
        const namenRows = [];
        function namenZeile(wert) {
            const z = document.createElement('div');
            z.className = 'pe-name';
            z.setAttribute('role', 'group');
            const feldN = document.createElement('input');
            feldN.type = 'text';
            feldN.className = 'pe-feld w-eingabe';
            feldN.value = wert || '';
            feldN.maxLength = 40;
            feldN.setAttribute('aria-label', 'Chat-Name');
            feldN.placeholder = 'Name';
            const weg = document.createElement('button');
            weg.type = 'button';
            weg.className = 'w-sekundaer-btn pe-name-weg';
            weg.textContent = 'Entfernen';
            function labelSetzen() {
                const nm = feldN.value.trim();
                z.setAttribute('aria-label', nm ? 'Chat-Name: ' + nm : 'Neuer Chat-Name');
                weg.setAttribute('aria-label', (nm ? '„' + nm + '"' : 'neuen Namen') + ' entfernen');
            }
            labelSetzen();
            feldN.addEventListener('input', labelSetzen);
            const eintrag = { element: z, lesen: () => feldN.value.trim() };
            weg.addEventListener('click', () => {
                z.remove();
                const i = namenRows.indexOf(eintrag);
                if (i >= 0) namenRows.splice(i, 1);
            });
            z.append(feldN, weg);
            return eintrag;
        }
        function addName(wert) {
            const z = namenZeile(wert);
            namenRows.push(z);
            namenWrap.appendChild(z.element);
        }
        namen.forEach(addName);
        const addNameBtn = document.createElement('button');
        addNameBtn.type = 'button';
        addNameBtn.className = 'w-sekundaer-btn pe-konto-add';
        addNameBtn.textContent = '+ Name hinzufügen';
        addNameBtn.addEventListener('click', () => addName(''));

        const knoepfe = document.createElement('div');
        knoepfe.className = 'pult-modal-knoepfe';
        const abbrechen = document.createElement('button');
        abbrechen.type = 'button';
        abbrechen.className = 'pult-modal-btn';
        abbrechen.textContent = 'Schließen';
        const speichern = document.createElement('button');
        speichern.type = 'button';
        speichern.className = 'pult-modal-btn pult-modal-btn-haupt';
        speichern.textContent = 'Speichern';
        knoepfe.append(abbrechen, speichern);

        box.append(titel,
            gruppe('Wetter'), owm.label,
            gruppe('Kalender'), kalWrap, addKalBtn,
            gruppe('Mail (nur Lesen)'), kontenWrap, addBtn,
            gruppe('Chat-Namen'), namenWrap, addNameBtn);
        if (fg && fg.verfuegbar) {
            box.append(gruppe('Dashboard teilen'), freigabeWrap);
        }
        box.append(knoepfe);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        const hintergrund = Array.from(document.body.children).filter((x) => x !== overlay);
        hintergrund.forEach((x) => x.setAttribute('inert', ''));
        owm.input.focus();

        function schliessen() {
            document.removeEventListener('keydown', taste, true);
            hintergrund.forEach((x) => x.removeAttribute('inert'));
            overlay.remove();
            if (vorher && vorher.focus) { try { vorher.focus(); } catch (e2) {} }
        }
        function taste(ev) {
            if (ev.key === 'Escape') { ev.preventDefault(); schliessen(); return; }
            if (ev.key === 'Tab') {
                const f = box.querySelectorAll('input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled])');
                if (!f.length) return;
                const erste = f[0], letzte = f[f.length - 1];
                if (ev.shiftKey && document.activeElement === erste) { ev.preventDefault(); letzte.focus(); }
                else if (!ev.shiftKey && document.activeElement === letzte) { ev.preventDefault(); erste.focus(); }
            }
        }
        document.addEventListener('keydown', taste, true);
        overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) schliessen(); });
        abbrechen.addEventListener('click', schliessen);

        speichern.addEventListener('click', async () => {
            speichern.disabled = true;
            const payload = {
                csrf: csrf(),
                kalender: kalRows
                    .map((r) => r.lesen())
                    .filter((k) => k.url),
                mailkonten: kontoRows
                    .map((r) => r.lesen())
                    .filter((k) => k.name || k.host || k.user),
                chatnamen: namenRows
                    .map((r) => r.lesen())
                    .filter((n) => n !== '')
            };
            if (owm.input.value.trim() !== '') payload.owm_key = owm.input.value.trim();
            try {
                const res = await fetch('api.php?action=einstellung_save', {
                    method: 'POST', credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (data && data.ok) {
                    location.reload();   // neu konfigurierte Quellen sofort übernehmen
                    return;
                }
                throw new Error('nicht ok');
            } catch (e3) {
                speichern.disabled = false;
                let fehler = box.querySelector('.pe-fehler');
                if (!fehler) {
                    fehler = document.createElement('p');
                    fehler.className = 'pe-fehler';
                    fehler.setAttribute('role', 'alert');
                    box.insertBefore(fehler, knoepfe);
                }
                fehler.textContent = 'Einstellungen konnten nicht gespeichert werden — bitte erneut versuchen.';
                if (window.pultAnsage) window.pultAnsage('Einstellungen konnten nicht gespeichert werden.');
            }
        });
    }

    window.pultEinstellungen = oeffnen;
    document.getElementById('btn-einstellungen')?.addEventListener('click', oeffnen);
})();
