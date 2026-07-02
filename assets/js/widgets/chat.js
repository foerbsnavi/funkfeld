/* Funkfeld-Widget: Chat — gemeinsamer Verlauf, Schreiben unter einem gewählten Namen. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    const NAME_KEY = 'pult_chat_name';
    function zwei(n) { return n < 10 ? '0' + n : '' + n; }
    function zeitText(ts) {
        if (!ts) return '';
        const d = new Date(ts * 1000);
        const heute = new Date();
        const uhr = zwei(d.getHours()) + ':' + zwei(d.getMinutes());
        if (d.toDateString() === heute.toDateString()) return uhr;
        return d.getDate() + '.' + (d.getMonth() + 1) + '. ' + uhr;
    }

    window.PultWidgets.chat = {
        standard() { return {}; },

        erstelle(container) {
            const wrap = document.createElement('div');
            wrap.className = 'w-chat';

            const kopf = document.createElement('div');
            kopf.className = 'w-feedkopf';
            const alsLabel = document.createElement('label');
            alsLabel.className = 'w-chat-als-label';
            alsLabel.textContent = 'Als: ';
            const sel = document.createElement('select');
            sel.className = 'w-chat-als w-eingabe';
            sel.setAttribute('aria-label', 'Schreiben als');
            alsLabel.appendChild(sel);
            const neu = document.createElement('button');
            neu.type = 'button';
            neu.className = 'w-mini';
            neu.setAttribute('aria-label', 'Neu laden');
            neu.textContent = '↻';
            kopf.append(alsLabel, neu);

            const liste = document.createElement('div');
            liste.className = 'w-chat-liste';
            liste.setAttribute('aria-label', 'Chatverlauf');

            // Nur für Screenreader: neue (fremde) Nachrichten ansagen
            const ansageRegion = document.createElement('p');
            ansageRegion.className = 'sr-only';
            ansageRegion.setAttribute('aria-live', 'polite');

            const zeile = document.createElement('div');
            zeile.className = 'w-eingabe-zeile w-chat-eingabe';
            const feld = document.createElement('input');
            feld.type = 'text';
            feld.className = 'w-chat-feld w-eingabe';
            feld.placeholder = 'Nachricht…';
            feld.setAttribute('aria-label', 'Nachricht');
            const sendBtn = document.createElement('button');
            sendBtn.type = 'button';
            sendBtn.className = 'w-sekundaer-btn';
            sendBtn.textContent = 'Senden';
            zeile.append(feld, sendBtn);

            wrap.append(kopf, liste, ansageRegion, zeile);
            container.appendChild(wrap);

            let namen = [];
            let aktiv = '';
            let letzteSig = null;
            let ersterLauf = true;
            let letzterStempel = null;  // Chat-Änderungsstempel aus dem zentralen Sync-Poll
            try { aktiv = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* Privatmodus */ }

            function eingabeAktiv(an) { feld.disabled = !an; sendBtn.disabled = !an; }

            function hinweis(t, mitEinstellungen) {
                liste.textContent = '';
                letzteSig = null;
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

            async function ladeNamen() {
                const daten = await (window.pultEinstellung
                    ? window.pultEinstellung()
                    : fetch('api.php?action=einstellung_get', { credentials: 'same-origin' })
                        .then((r) => r.json()).then((j) => (j.ok ? j.einstellungen || {} : {})).catch(() => ({})));
                namen = Array.isArray(daten.chatnamen) ? daten.chatnamen : [];
                sel.textContent = '';
                namen.forEach((n) => {
                    const o = document.createElement('option');
                    o.value = n;
                    o.textContent = n;
                    sel.appendChild(o);
                });
                if (namen.length) {
                    if (!namen.includes(aktiv)) {
                        aktiv = namen[0];
                        try { localStorage.setItem(NAME_KEY, aktiv); } catch (e) { /* egal */ }
                    }
                    sel.value = aktiv;
                    eingabeAktiv(true);
                } else {
                    eingabeAktiv(false);
                }
            }

            sel.addEventListener('change', () => {
                aktiv = sel.value;
                try { localStorage.setItem(NAME_KEY, aktiv); } catch (e) { /* egal */ }
                letzteSig = null;        // erzwingt Neu-Ausrichtung (eigen/fremd) der vorhandenen Nachrichten
                ladeNachrichten();
            });

            function nahUnten() {
                return liste.scrollHeight - liste.scrollTop - liste.clientHeight < 40;
            }

            async function ladeNachrichten() {
                if (!namen.length) { return; }
                let data;
                try {
                    const r = await fetch('api.php?action=chat_liste', { credentials: 'same-origin' });
                    data = await r.json();
                } catch (e) {
                    return;   // nächste Sync-Runde versucht es erneut
                }
                if (!data.ok || !Array.isArray(data.nachrichten)) return;
                const sig = JSON.stringify(data.nachrichten);
                if (sig === letzteSig) { ersterLauf = false; return; }   // nichts Neues
                letzteSig = sig;
                const unten = nahUnten();
                liste.textContent = '';
                if (!data.nachrichten.length) {
                    const p = document.createElement('p');
                    p.className = 'w-status';
                    p.textContent = 'Noch keine Nachrichten.';
                    liste.appendChild(p);
                    ersterLauf = false;
                    return;
                }
                data.nachrichten.forEach((n) => {
                    const m = document.createElement('div');
                    m.className = 'w-chat-nachricht' + (n.name === aktiv ? ' eigen' : '');
                    const kz = document.createElement('div');
                    kz.className = 'w-chat-kopf';
                    const nm = document.createElement('span');
                    nm.className = 'w-chat-name';
                    nm.textContent = n.name || '';
                    const zt = document.createElement('time');
                    zt.className = 'w-chat-zeit';
                    if (n.zeit) zt.setAttribute('datetime', new Date(n.zeit * 1000).toISOString());
                    zt.textContent = zeitText(n.zeit);
                    kz.append(nm, zt);
                    const tx = document.createElement('div');
                    tx.className = 'w-chat-text';
                    tx.textContent = n.text || '';            // textContent → kein HTML
                    m.append(kz, tx);
                    liste.appendChild(m);
                });
                if (unten) liste.scrollTop = liste.scrollHeight;
                // Neue fremde Nachricht für Screenreader ansagen (nicht beim ersten Laden, nicht eigene)
                if (!ersterLauf) {
                    const letzte = data.nachrichten[data.nachrichten.length - 1];
                    if (letzte && letzte.name !== aktiv) {
                        ansageRegion.textContent = (letzte.name || '') + ': ' + (letzte.text || '');
                    }
                }
                ersterLauf = false;
            }

            async function senden() {
                const text = feld.value.trim();
                if (!text || !aktiv) return;
                sendBtn.disabled = true;
                try {
                    const r = await fetch('api.php?action=chat_senden', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ csrf: document.body.dataset.csrf || '', name: aktiv, text })
                    });
                    const j = await r.json();
                    if (j.ok) { feld.value = ''; await ladeNachrichten(); }
                    else if (window.pultAnsage) { window.pultAnsage('Nachricht konnte nicht gesendet werden.'); }
                } catch (e) {
                    if (window.pultAnsage) window.pultAnsage('Nachricht konnte nicht gesendet werden.');
                }
                sendBtn.disabled = false;
                feld.focus();
            }

            neu.addEventListener('click', ladeNachrichten);
            sendBtn.addEventListener('click', senden);
            feld.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); senden(); } });

            (async () => {
                await ladeNamen();
                if (!namen.length) { hinweis('Noch keine Namen angelegt — in den Einstellungen hinzufügen.', true); }
                else { await ladeNachrichten(); }
            })();

            // Aktualisierung über den zentralen Sync-Poll (window.pultSync): erst wenn der
            // Chat-Änderungsstempel sich bewegt, wird die Liste nachgeladen — statt eines
            // eigenen 5-Sekunden-Polls je Chat-Fläche.
            if (window.pultSync) {
                window.pultSync.abonnieren(container, (z) => {
                    if (document.querySelector('.pult-modal-overlay')) return;
                    const stempel = Number(z && z.chat) || 0;
                    if (stempel === letzterStempel) return;
                    letzterStempel = stempel;
                    ladeNachrichten();
                });
            } else {
                // Rückfall ohne zentralen Sync (sollte nicht vorkommen — Dateien werden zusammen ausgeliefert)
                const timer = setInterval(() => {
                    if (!container.isConnected) { clearInterval(timer); return; }
                    if (document.hidden || document.querySelector('.pult-modal-overlay')) return;
                    ladeNachrichten();
                }, 15000);
            }
        }
    };
})();
