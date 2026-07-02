/* Funkfeld — Dashboard-Übersicht: anlegen, öffnen, umbenennen, löschen, teilen, verlassen. */
(() => {
    'use strict';
    function csrf() { return document.body.dataset.csrf || ''; }
    const grid = document.querySelector('.uebersicht-grid');
    if (!grid) return;

    async function api(action, payload, method, query) {
        const opt = { method: method || 'POST', credentials: 'same-origin' };
        if (opt.method === 'POST') {
            opt.headers = { 'Content-Type': 'application/json' };
            opt.body = JSON.stringify(Object.assign({ csrf: csrf() }, payload || {}));
        }
        try {
            const url = 'api.php?action=' + encodeURIComponent(action) + (query ? '&' + query : '');
            const r = await fetch(url, opt);
            return await r.json();
        } catch (e) { return { ok: false }; }
    }

    // --- Neues Dashboard anlegen ---
    const form = document.getElementById('dash-neu-form');
    form?.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const feld = document.getElementById('dash-neu-name');
        const name = (feld.value || '').trim();
        if (!name) return;
        const btn = form.querySelector('button');
        btn.disabled = true;
        const r = await api('dash_create', { name });
        if (r && r.ok && r.id) { location.href = '?d=' + encodeURIComponent(r.id); }
        else { btn.disabled = false; if (window.pultAnsage) window.pultAnsage('Anlegen fehlgeschlagen.'); }
    });

    // --- Aktionen je Karte (Delegation) ---
    grid.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button[data-akt]');
        if (!btn) return;
        const karte = btn.closest('.dash-karte');
        const id = karte.dataset.id;
        const o = karte.dataset.o;
        const akt = btn.dataset.akt;

        if (akt === 'delete') {
            const ok = window.pultConfirm
                ? await window.pultConfirm('Dieses Dashboard mit allen Inhalten endgültig löschen?')
                : confirm('Dieses Dashboard mit allen Inhalten endgültig löschen?');
            if (!ok) return;
            const r = await api('dash_delete', { id });
            if (r && r.ok) karte.remove();
            return;
        }

        if (akt === 'leave') {
            const ok = window.pultConfirm
                ? await window.pultConfirm('Dieses geteilte Dashboard verlassen?')
                : confirm('Dieses geteilte Dashboard verlassen?');
            if (!ok) return;
            const r = await api('dash_leave', { o: o, d: id });
            if (r && r.ok) karte.remove();
            return;
        }

        if (akt === 'rename') {
            const h3 = karte.querySelector('.dash-name');
            if (karte.querySelector('.dash-rename-feld')) return;
            const alt = h3.textContent;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.className = 'w-eingabe dash-rename-feld';
            inp.value = alt;
            inp.maxLength = 60;
            inp.setAttribute('aria-label', 'Dashboard umbenennen');
            h3.replaceWith(inp);
            inp.focus(); inp.select();
            let beendet = false;
            const fertig = async (speichern) => {
                if (beendet) return;               // nur einmal abschließen (Enter löst auch blur aus)
                beendet = true;
                const neu = inp.value.trim();
                const neuH3 = document.createElement('h2');
                neuH3.className = 'dash-name';
                if (speichern && neu && neu !== alt) {
                    const r = await api('dash_rename', { id, name: neu });
                    neuH3.textContent = (r && r.ok) ? neu : alt;
                    if (r && r.ok) ariaNamenAktualisieren(karte, neu);
                } else {
                    neuH3.textContent = alt;
                }
                inp.replaceWith(neuH3);
                const knopf = karte.querySelector('button[data-akt="rename"]');
                if (knopf) knopf.focus();   // Fokus nicht an <body> verlieren
            };
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); fertig(true); }
                else if (e.key === 'Escape') { e.preventDefault(); fertig(false); }
            });
            inp.addEventListener('blur', () => fertig(true));
            return;
        }

        if (akt === 'share') {
            const panel = karte.querySelector('.dash-share');
            if (!panel) return;
            if (!panel.hidden) { panel.hidden = true; panel.textContent = ''; btn.setAttribute('aria-expanded', 'false'); return; }
            panel.hidden = false;
            btn.setAttribute('aria-expanded', 'true');
            panel.textContent = 'Lädt…';
            await shareRender(panel, id);
            const fokus = panel.querySelector('input, button');   // Fokus ins geöffnete Panel
            if (fokus) fokus.focus();
            return;
        }
    });

    async function shareRender(panel, id) {
        const d = await api('freigabe_get', null, 'GET', 'id=' + encodeURIComponent(id));
        panel.textContent = '';
        if (!d || !d.verfuegbar) { panel.textContent = 'Teilen ist nur in der Online-Plattform verfügbar.'; return; }
        const info = document.createElement('p');
        info.className = 'pe-hinweis';
        info.textContent = 'Wer den Link öffnet, tritt diesem Dashboard bei und arbeitet mit.';
        panel.appendChild(info);
        if (d.geteilt && d.link) {
            const feld = document.createElement('input');
            feld.type = 'text'; feld.className = 'w-eingabe'; feld.readOnly = true; feld.value = d.link;
            feld.setAttribute('aria-label', 'Freigabelink');
            feld.addEventListener('focus', () => feld.select());
            feld.addEventListener('click', () => feld.select());
            const neu = mkBtn('Neuen Link', async () => { await api('freigabe_create', { id }); shareRender(panel, id); });
            const weg = mkBtn('Freigabe aufheben', async () => {
                const ok = window.pultConfirm ? await window.pultConfirm('Freigabe aufheben? Der Link wird ungültig.') : true;
                if (ok) { await api('freigabe_revoke', { id }); shareRender(panel, id); }
            });
            const reihe = document.createElement('div');
            reihe.className = 'pe-freigabe-knoepfe';
            reihe.append(neu, weg);
            panel.append(feld, reihe);
        } else {
            panel.appendChild(mkBtn('Freigabelink erstellen', async () => { await api('freigabe_create', { id }); shareRender(panel, id); }));
        }
    }

    /** Nach dem Umbenennen den Dashboard-Namen in allen aria-Labels der Karte nachziehen. */
    function ariaNamenAktualisieren(karte, name) {
        // Ersetzungs-FUNKTION (nicht -String): sonst würden $-Folgen im Namen wie $& oder $1
        // von String.replace speziell interpretiert und ergäben ein falsches aria-Label.
        karte.querySelectorAll('[aria-label*="„"]').forEach((el) => {
            const alt = el.getAttribute('aria-label') || '';
            el.setAttribute('aria-label', alt.replace(/„[^“]*“/, () => '„' + name + '“'));
        });
    }

    function mkBtn(text, fn) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'w-sekundaer-btn'; b.textContent = text;
        b.addEventListener('click', fn);
        return b;
    }

    // --- Import (XML hochladen → neues Dashboard) ---
    const impBtn = document.getElementById('dash-import-btn');
    const impFile = document.getElementById('dash-import-datei');
    const impStatus = document.getElementById('import-status');
    impBtn?.addEventListener('click', () => impFile && impFile.click());
    impFile?.addEventListener('change', async () => {
        const f = impFile.files && impFile.files[0];
        if (!f) return;
        if (impStatus) impStatus.textContent = 'Lese Datei …';
        try {
            const text = await f.text();
            const r = await api('dash_import', { xml: text });
            if (r && r.ok && r.id) { location.href = '?d=' + encodeURIComponent(r.id); }
            else if (impStatus) impStatus.textContent = (r && r.fehler) ? r.fehler : 'Import fehlgeschlagen.';
        } catch (e) {
            if (impStatus) impStatus.textContent = 'Import fehlgeschlagen.';
        }
        impFile.value = '';
    });

    // --- Update (nur Standalone: Versionsabgleich + Einspielen) ---
    const updPruef = document.getElementById('update-pruefen');
    const updStatus = document.getElementById('update-status');
    const updBtn = document.getElementById('update-anwenden');
    updPruef?.addEventListener('click', async () => {
        updStatus.textContent = 'Prüfe …';
        if (updBtn) updBtn.hidden = true;
        const r = await api('update_check', null, 'GET');
        if (!r || !r.ok) { updStatus.textContent = (r && r.fehler) ? r.fehler : 'Update-Server nicht erreichbar.'; return; }
        if (r.neuer) {
            updStatus.textContent = 'Neue Version ' + r.aktuell + ' verfügbar (installiert: ' + r.installiert + ').';
            if (updBtn) updBtn.hidden = false;
        } else {
            updStatus.textContent = 'Du hast die aktuelle Version (' + r.installiert + ').';
        }
    });
    updBtn?.addEventListener('click', async () => {
        const ok = window.pultConfirm
            ? await window.pultConfirm('Update jetzt einspielen? Der Programmcode wird ersetzt, deine Daten bleiben erhalten.')
            : confirm('Update jetzt einspielen?');
        if (!ok) return;
        updBtn.disabled = true;
        updStatus.textContent = 'Lädt und installiert … bitte warten.';
        const r = await api('update_apply', {});
        if (r && r.ok) {
            updStatus.textContent = 'Aktualisiert auf Version ' + (r.version || '') + '. Seite wird neu geladen …';
            setTimeout(() => location.reload(), 1500);
        } else {
            updBtn.disabled = false;
            updStatus.textContent = (r && r.fehler) ? r.fehler : 'Update fehlgeschlagen.';
        }
    });
})();
