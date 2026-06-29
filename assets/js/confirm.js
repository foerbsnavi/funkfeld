/* Funkfeld — wiederverwendbares Bestätigungs-Popup (Promise<boolean>). */
(() => {
    'use strict';

    let offen = false;   // verhindert mehrere Popups gleichzeitig (z. B. bei Doppelklick)

    /**
     * Zeigt ein modales Bestätigungs-Popup.
     * @param {string} nachricht   Frage an den Nutzer
     * @param {object} [optionen]  { bestaetigen: 'Löschen' }
     * @returns {Promise<boolean>} true = bestätigt, false = abgebrochen
     */
    function pultConfirm(nachricht, optionen) {
        optionen = optionen || {};
        const bestaetigenText = optionen.bestaetigen || 'Löschen';

        if (offen) return Promise.resolve(false);   // schon ein Popup offen → ignorieren
        offen = true;

        return new Promise((resolve) => {
            const vorherFokus = document.activeElement;

            const overlay = document.createElement('div');
            overlay.className = 'pult-modal-overlay';

            const box = document.createElement('div');
            box.className = 'pult-modal';
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-label', 'Bestätigung');

            const text = document.createElement('p');
            text.className = 'pult-modal-text';
            text.id = 'pult-modal-frage';
            text.textContent = nachricht;                  // textContent → XSS-sicher
            box.setAttribute('aria-describedby', 'pult-modal-frage');

            const knoepfe = document.createElement('div');
            knoepfe.className = 'pult-modal-knoepfe';

            const abbrechen = document.createElement('button');
            abbrechen.type = 'button';
            abbrechen.className = 'pult-modal-btn';
            abbrechen.textContent = 'Abbrechen';

            const ok = document.createElement('button');
            ok.type = 'button';
            ok.className = 'pult-modal-btn pult-modal-btn-gefahr';
            ok.textContent = bestaetigenText;

            knoepfe.append(abbrechen, ok);
            box.append(text, knoepfe);
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            // Hintergrund für Tastatur & Screenreader sperren (inert)
            const hintergrund = Array.from(document.body.children).filter((el) => el !== overlay);
            hintergrund.forEach((el) => el.setAttribute('inert', ''));

            abbrechen.focus();   // sicherer Erst-Fokus bei destruktiver Aktion

            function schliessen(ergebnis) {
                offen = false;
                document.removeEventListener('keydown', taste, true);
                hintergrund.forEach((el) => el.removeAttribute('inert'));
                overlay.remove();
                if (vorherFokus && vorherFokus.focus) {
                    try { vorherFokus.focus(); } catch (e) { /* Element evtl. entfernt */ }
                }
                resolve(ergebnis);
            }

            function taste(ev) {
                if (ev.key === 'Escape') {
                    ev.preventDefault();
                    schliessen(false);
                } else if (ev.key === 'Tab') {
                    // Fokus zwischen den zwei Buttons halten (Fokus-Falle)
                    const fokus = [abbrechen, ok];
                    const i = fokus.indexOf(document.activeElement);
                    ev.preventDefault();
                    const next = ev.shiftKey
                        ? (i <= 0 ? fokus.length - 1 : i - 1)
                        : (i >= fokus.length - 1 ? 0 : i + 1);
                    fokus[next].focus();
                }
            }

            document.addEventListener('keydown', taste, true);
            overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) schliessen(false); });
            abbrechen.addEventListener('click', () => schliessen(false));
            ok.addEventListener('click', () => schliessen(true));
        });
    }

    window.pultConfirm = pultConfirm;
})();
