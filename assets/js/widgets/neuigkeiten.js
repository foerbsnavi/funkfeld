/* Funkfeld-Widget: Neuigkeiten — zeigt automatisch alle Änderungen im Dashboard
   als Verlauf (neueste oben). Keine Verkabelung nötig; neutral, ohne Namen. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    // Anzeige-Namen der Karten-/Ereignistypen
    const TYP_LABEL = {
        notiz: 'Notiz', checkliste: 'Aufgaben', links: 'Links', tabelle: 'Tabelle',
        telefonbuch: 'Telefonbuch', dateien: 'Dateien', uhr: 'Uhr', wetter: 'Wetter',
        kalender: 'Kalender', mail: 'Mail', rss: 'RSS', chat: 'Chat', karte: 'Karte',
        livestream: 'Livestream', wirtschaft: 'Wirtschaft', custom: 'Custom',
        neuigkeiten: 'Neuigkeiten'
    };

    const zeitText = (ts) => window.pultZeit.zeitText(ts);   // gemeinsamer Helfer (hilfen.js)

    /** Kartenname in Anführungszeichen, aber nur wenn er nicht ohnehin dem Typ-Label entspricht. */
    function benannt(label, ziel) {
        return (ziel && ziel !== label) ? label + ' „' + ziel + '“' : label;
    }

    /** Einen Log-Eintrag in einen deutschen Satz übersetzen. */
    function satz(e) {
        const label = TYP_LABEL[e.typ] || 'Fläche';
        const ziel = (e.ziel || '').toString();
        const n = Number(e.n) || 0;
        switch (e.aktion) {
            case 'geaendert':    return benannt(label, ziel) + ' geändert';
            case 'hinzugefuegt': return benannt(label, ziel) + ' hinzugefügt';
            case 'entfernt':     return benannt(label, ziel) + ' entfernt';
            case 'datei':        return ziel ? 'Datei „' + ziel + '“ hochgeladen' : 'Datei hochgeladen';
            case 'chat':         return 'Neue Chat-Nachricht';
            case 'mail':         return (n > 0 ? n + (n === 1 ? ' neue Mail' : ' neue Mails') : 'Neue Mail')
                                        + (ziel ? ' in ' + ziel : '');
            case 'feed':         return (n > 0 ? n + (n === 1 ? ' neuer Beitrag' : ' neue Beiträge') : 'Neuer Beitrag')
                                        + (ziel ? ' (' + ziel + ')' : '');
            case 'termin':       return 'Termin angelegt' + (ziel ? ' in „' + ziel + '“' : '');
            default:             return benannt(label, ziel);
        }
    }

    window.PultWidgets.neuigkeiten = {
        standard() { return {}; },

        erstelle(container) {
            const wrap = document.createElement('div');
            wrap.className = 'w-neuigkeiten';

            const kopf = document.createElement('div');
            kopf.className = 'w-feedkopf';
            const titel = document.createElement('span');
            titel.className = 'w-feedkopf-titel';
            titel.textContent = 'Neuigkeiten';
            const neu = document.createElement('button');
            neu.type = 'button';
            neu.className = 'w-mini';
            neu.setAttribute('aria-label', 'Neu laden');
            neu.textContent = '↻';
            kopf.append(titel, neu);

            const liste = document.createElement('div');
            liste.className = 'w-neu-liste';
            liste.setAttribute('aria-label', 'Verlauf der Neuigkeiten');
            // role="log" impliziert aria-live="polite" + aria-relevant="additions" —
            // neue Einträge werden Screenreadern dezent angesagt, ohne eigene Ansage-Region.
            liste.setAttribute('role', 'log');

            wrap.append(kopf, liste);
            container.appendChild(wrap);

            let letzteSig = null;
            let letzterStempel = null;

            function status(t) {
                liste.textContent = '';
                letzteSig = null;
                const p = document.createElement('p');
                p.className = 'w-status';
                p.textContent = t;
                liste.appendChild(p);
            }

            async function laden() {
                let data;
                try {
                    const r = await fetch('api.php?action=aktivitaet_get', { credentials: 'same-origin' });
                    data = await r.json();
                } catch (e) {
                    return;   // nächste Sync-Runde versucht es erneut
                }
                if (!data.ok || !Array.isArray(data.eintraege)) return;
                const sig = JSON.stringify(data.eintraege);
                if (sig === letzteSig) return;      // nichts Neues
                letzteSig = sig;
                zeigen(data.eintraege);
            }

            function zeigen(eintraege) {
                liste.textContent = '';
                if (!eintraege.length) {
                    status('Noch keine Neuigkeiten.');
                    return;
                }
                // Neueste zuerst
                for (let i = eintraege.length - 1; i >= 0; i--) {
                    const e = eintraege[i];
                    const z = document.createElement('div');
                    z.className = 'w-neu-eintrag';
                    const tx = document.createElement('span');
                    tx.className = 'w-neu-text';
                    tx.textContent = satz(e);            // textContent → kein HTML
                    const zt = document.createElement('time');
                    zt.className = 'w-neu-zeit';
                    if (e.zeit) zt.setAttribute('datetime', new Date(e.zeit * 1000).toISOString());
                    zt.textContent = zeitText(e.zeit);
                    z.append(tx, zt);
                    liste.appendChild(z);
                }
            }

            // Externen Abgleich (Mail/Feeds) anstoßen — serverseitig gedrosselt. Neue Einträge
            // bewegen den Aktivitäts-Stempel und werden über den Sync-Poll nachgeladen.
            async function pruefen() {
                try {
                    await fetch('api.php?action=aktivitaet_pruefen', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ csrf: document.body.dataset.csrf || '' })
                    });
                } catch (e) { /* nächster Takt versucht es erneut */ }
            }

            neu.addEventListener('click', () => { pruefen(); laden(); });
            laden();
            pruefen();
            window.pultIntervall(container, () => {
                if (document.hidden) return;
                pruefen();
            }, 180000);

            // Aktualisierung über den zentralen Sync-Poll: erst wenn der Aktivitäts-Stempel
            // sich bewegt, wird nachgeladen — kein eigener Poll-Timer je Fläche.
            if (window.pultSync) {
                window.pultSync.abonnieren(container, (z) => {
                    const stempel = Number(z && z.aktivitaet) || 0;
                    if (stempel === letzterStempel) return;
                    letzterStempel = stempel;
                    laden();
                });
            } else {
                window.pultIntervall(container, () => {
                    if (document.hidden) return;
                    laden();
                }, 20000);
            }
        }
    };
})();
