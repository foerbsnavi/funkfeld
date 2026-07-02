/* Funkfeld-Widget: Wirtschaft — Gold, Bitcoin, Euro/USD, US-Dollar-Index als auf 100% normierte
   Linien über eine wählbare Spanne (1 Woche … 5 Jahre). Daten serverseitig (schlüssellos, gecacht). */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};
    const SVGNS = 'http://www.w3.org/2000/svg';

    const SPANNEN = [
        { k: '1w', kurz: '1 W', lang: '1 Woche' },
        { k: '1m', kurz: '1 M', lang: '1 Monat' },
        { k: '3m', kurz: '3 M', lang: '3 Monaten' },
        { k: '1y', kurz: '1 J', lang: '1 Jahr' },
        { k: '2y', kurz: '2 J', lang: '2 Jahren' },
        { k: '5y', kurz: '5 J', lang: '5 Jahren' }
    ];
    function spanIndex(k) { const i = SPANNEN.findIndex((s) => s.k === k); return i < 0 ? 3 : i; }

    window.PultWidgets.wirtschaft = {
        standard() { return { spanne: '1y' }; },

        erstelle(container, inhalt, aenderung) {
            let idx = spanIndex(inhalt && inhalt.spanne);

            const wrap = document.createElement('div');
            wrap.className = 'w-wirtschaft';

            const kopf = document.createElement('div');
            kopf.className = 'w-feedkopf';
            const titel = document.createElement('span');
            titel.className = 'w-feedkopf-titel';
            titel.textContent = 'Verlauf · normiert 100 %';
            const minus = document.createElement('button');
            minus.type = 'button'; minus.className = 'w-mini'; minus.textContent = '−';
            minus.setAttribute('aria-label', 'Kürzere Zeitspanne');
            const spanLbl = document.createElement('span');
            spanLbl.className = 'w-wi-span';
            spanLbl.setAttribute('aria-live', 'polite');
            spanLbl.setAttribute('aria-atomic', 'true');
            const plus = document.createElement('button');
            plus.type = 'button'; plus.className = 'w-mini'; plus.textContent = '+';
            plus.setAttribute('aria-label', 'Längere Zeitspanne');
            const neu = document.createElement('button');
            neu.type = 'button'; neu.className = 'w-mini'; neu.textContent = '↻';
            neu.setAttribute('aria-label', 'Neu laden');
            kopf.append(titel, minus, spanLbl, plus, neu);

            const legende = document.createElement('div');
            legende.className = 'w-wi-legende';

            const flaeche = document.createElement('div');
            flaeche.className = 'w-wi-flaeche';
            const status = document.createElement('p');
            status.className = 'w-status w-wi-status';
            status.setAttribute('aria-live', 'polite');
            flaeche.appendChild(status);

            wrap.append(kopf, legende, flaeche);
            container.appendChild(wrap);

            let reihen = null;
            let ro = null;

            function farbeAenderung(a) { return a > 0 ? '#3fcf7a' : (a < 0 ? '#ff6b6b' : 'var(--text-leise)'); }

            function legendeBauen() {
                legende.textContent = '';
                reihen.forEach((r) => {
                    const el = document.createElement('span');
                    el.className = 'w-wi-leg';
                    const punkt = document.createElement('span');
                    punkt.className = 'w-wi-leg-punkt';
                    punkt.style.background = r.farbe;
                    punkt.setAttribute('aria-hidden', 'true');
                    const txt = document.createElement('span');
                    txt.textContent = r.name + ' ';
                    const chg = document.createElement('strong');
                    const a = Number(r.aenderung) || 0;
                    chg.textContent = (a > 0 ? '+' : '') + a + ' %';
                    chg.style.color = farbeAenderung(a);
                    el.append(punkt, txt, chg);
                    if (r.teil) {
                        // Datenquelle deckt die gewählte Spanne nicht ab (z. B. CoinGecko max. 1 Jahr)
                        const hinweis = document.createElement('span');
                        hinweis.className = 'w-wi-teil';
                        hinweis.textContent = ' (' + r.teil + ')';
                        el.appendChild(hinweis);
                    }
                    legende.appendChild(el);
                });
            }

            function zeichne() {
                if (!reihen) return;
                const w = flaeche.clientWidth || 300;
                const h = flaeche.clientHeight || 160;
                let ymin = Infinity, ymax = -Infinity, tmax = 0;
                reihen.forEach((r) => r.werte.forEach((p) => {
                    if (p.v < ymin) ymin = p.v; if (p.v > ymax) ymax = p.v; if (p.t > tmax) tmax = p.t;
                }));
                if (!isFinite(ymin) || !isFinite(ymax) || tmax <= 0) return;
                if (ymax - ymin < 1) { ymax += 1; ymin -= 1; }
                const padY = (ymax - ymin) * 0.08;
                ymin -= padY; ymax += padY;
                const ml = 6, mr = 6, mt = 6, mb = 14;
                const px = (t) => ml + Math.max(0, Math.min(1, t / tmax)) * (w - ml - mr);
                const py = (v) => mt + (1 - (v - ymin) / (ymax - ymin)) * (h - mt - mb);

                const svg = document.createElementNS(SVGNS, 'svg');
                svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
                svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
                svg.setAttribute('preserveAspectRatio', 'none');
                svg.setAttribute('class', 'w-wi-svg');
                svg.setAttribute('aria-hidden', 'true');   // Werte stehen textuell in der Legende

                if (ymin < 100 && ymax > 100) {
                    const base = document.createElementNS(SVGNS, 'line');
                    base.setAttribute('x1', ml); base.setAttribute('x2', w - mr);
                    base.setAttribute('y1', py(100)); base.setAttribute('y2', py(100));
                    base.setAttribute('class', 'w-wi-grund');
                    svg.appendChild(base);
                }
                reihen.forEach((r) => {
                    if (!r.werte.length) return;
                    let dStr = '';
                    r.werte.forEach((p, i) => { dStr += (i ? 'L' : 'M') + px(p.t).toFixed(1) + ' ' + py(p.v).toFixed(1) + ' '; });
                    const path = document.createElementNS(SVGNS, 'path');
                    path.setAttribute('d', dStr.trim());
                    path.setAttribute('fill', 'none');
                    path.setAttribute('stroke', r.farbe);
                    path.setAttribute('stroke-width', '2');
                    path.setAttribute('stroke-linejoin', 'round');
                    path.setAttribute('vector-effect', 'non-scaling-stroke');
                    svg.appendChild(path);
                });

                flaeche.textContent = '';
                flaeche.appendChild(svg);
                const v1 = document.createElement('span'); v1.className = 'w-wi-x w-wi-x-l'; v1.textContent = 'vor ' + SPANNEN[idx].lang;
                const v2 = document.createElement('span'); v2.className = 'w-wi-x w-wi-x-r'; v2.textContent = 'heute';
                flaeche.append(v1, v2);
            }

            async function laden() {
                spanLbl.textContent = SPANNEN[idx].kurz;
                minus.setAttribute('aria-disabled', idx === 0 ? 'true' : 'false');
                plus.setAttribute('aria-disabled', idx === SPANNEN.length - 1 ? 'true' : 'false');
                status.hidden = false; status.textContent = 'Lädt …';
                flaeche.textContent = ''; flaeche.appendChild(status);
                try {
                    const r = await fetch('api.php?action=wirtschaft&spanne=' + encodeURIComponent(SPANNEN[idx].k), { credentials: 'same-origin' });
                    const j = await r.json();
                    if (!j.ok || !Array.isArray(j.reihen) || !j.reihen.length) {
                        status.hidden = false; status.textContent = (j && j.fehler) ? j.fehler : 'Keine Daten.';
                        flaeche.textContent = ''; flaeche.appendChild(status);
                        return;
                    }
                    reihen = j.reihen;
                    legendeBauen();
                    zeichne();
                } catch (e) {
                    status.hidden = false; status.textContent = 'Wirtschaftsdaten nicht erreichbar.';
                    flaeche.textContent = ''; flaeche.appendChild(status);
                }
            }

            function spanneWechseln(d) {
                const neuIdx = Math.max(0, Math.min(SPANNEN.length - 1, idx + d));
                if (neuIdx === idx) return;
                idx = neuIdx;
                aenderung({ spanne: SPANNEN[idx].k });
                laden();
            }
            minus.addEventListener('click', () => spanneWechseln(-1));
            plus.addEventListener('click', () => spanneWechseln(1));
            neu.addEventListener('click', laden);
            let zeichneTimer = null;
            if (window.ResizeObserver) {
                ro = new ResizeObserver(() => {
                    clearTimeout(zeichneTimer);
                    zeichneTimer = setTimeout(() => { if (reihen) zeichne(); }, 60);   // Debounce gegen DOM-Thrash
                });
                ro.observe(flaeche);
            }

            spanLbl.textContent = SPANNEN[idx].kurz;
            laden();

            const timer = setInterval(() => {
                if (!container.isConnected) { clearInterval(timer); if (ro) ro.disconnect(); return; }
                if (!document.hidden) laden();
            }, 1800000);
        }
    };
})();
