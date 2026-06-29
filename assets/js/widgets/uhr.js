/* Funkfeld-Widget: Uhr — Live-Zeit und Datum (rein im Browser). */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    function zwei(n) { return n < 10 ? '0' + n : '' + n; }

    window.PultWidgets.uhr = {
        standard() {
            return {};
        },

        erstelle(container, inhalt, aenderung) {
            const wrap = document.createElement('div');
            wrap.className = 'w-uhr';

            const zeit = document.createElement('time');
            zeit.className = 'w-uhr-zeit';

            const datum = document.createElement('time');
            datum.className = 'w-uhr-datum';

            wrap.append(zeit, datum);
            container.appendChild(wrap);

            let timer;
            function tick() {
                // Selbst-Aufräumen, wenn die Fläche geschlossen wurde (kein Speicher-Leck)
                if (!container.isConnected) {
                    clearInterval(timer);
                    return;
                }
                const d = new Date();
                zeit.setAttribute('datetime', d.toISOString());
                datum.setAttribute('datetime', d.toISOString().slice(0, 10));
                zeit.textContent = zwei(d.getHours()) + ':' + zwei(d.getMinutes()) + ':' + zwei(d.getSeconds());
                datum.textContent = TAGE[d.getDay()] + ', ' + d.getDate() + '. ' + MONATE[d.getMonth()] + ' ' + d.getFullYear();
            }

            tick();
            timer = setInterval(tick, 1000);
        }
    };
})();
