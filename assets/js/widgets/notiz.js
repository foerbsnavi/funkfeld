/* Funkfeld-Widget: Notizzettel — freies Textfeld. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    window.PultWidgets.notiz = {
        standard() {
            return { text: '' };
        },

        /**
         * @param {HTMLElement} container  Inhaltsbereich der Fläche
         * @param {object} inhalt          { text }
         * @param {function} aenderung     Callback mit neuem Inhalt (zum Speichern)
         */
        erstelle(container, inhalt, aenderung) {
            const feld = document.createElement('textarea');
            feld.className = 'w-notiz';
            feld.setAttribute('aria-label', 'Notiztext');
            feld.placeholder = 'Notiz…';
            feld.value = (inhalt && inhalt.text) || '';   // value → kein HTML-Parsing
            feld.addEventListener('input', () => aenderung({ text: feld.value }));
            container.appendChild(feld);
        }
    };
})();
