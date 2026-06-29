/* Funkfeld-Widget: Karte (Leaflet). Eigene SVG-Marker mit sichtbaren Labels,
   verschiebbare Marker und Linien-Punkte, eigene SVG-Werkzeuge (keine Emojis).
   Speichert in den Block-Inhalt; live-Sync über api.php?action=block_get. */
(() => {
    'use strict';
    window.PultWidgets = window.PultWidgets || {};

    // Leaflet einmalig nachladen (SRI gesichert), nur wenn gebraucht.
    let leafletPromise = null;
    function ladeLeaflet() {
        if (window.L) return Promise.resolve(window.L);
        if (leafletPromise) return leafletPromise;
        leafletPromise = new Promise((resolve, reject) => {
            const css = document.createElement('link');
            css.rel = 'stylesheet';
            css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
            css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
            css.crossOrigin = 'anonymous';
            document.head.appendChild(css);
            const js = document.createElement('script');
            js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
            js.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
            js.crossOrigin = 'anonymous';
            js.onload = () => resolve(window.L);
            js.onerror = () => { leafletPromise = null; reject(new Error('Leaflet nicht ladbar')); };
            document.head.appendChild(js);
        });
        return leafletPromise;
    }

    // Eigene SVG-Grafiken (keine HTML-Symbole/Emojis)
    const SVG = {
        marker: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2c-3.9 0-7 3-7 6.8 0 4.8 7 12.2 7 12.2s7-7.4 7-12.2C19 5 15.9 2 12 2z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="8.8" r="2.4" fill="currentColor"/></svg>',
        linie:  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="4" cy="19" r="2.2" fill="currentColor"/><circle cx="12" cy="6" r="2.2" fill="currentColor"/><circle cx="20" cy="15" r="2.2" fill="currentColor"/><path d="M4 19 12 6 20 15" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
        check:  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 12.5 10 18 20 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        layers: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3 2 8l10 5 10-5-10-5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M2 13l10 5 10-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
        // Marker-Stecknadel als eigenständige Grafik (für die Karte)
        pin: (farbe) => '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">'
            + '<path d="M15 1C8 1 2.5 6.4 2.5 13.2 2.5 22.6 15 38.5 15 38.5S27.5 22.6 27.5 13.2C27.5 6.4 22 1 15 1z" fill="' + farbe + '" stroke="#11181f" stroke-width="1.6"/>'
            + '<circle cx="15" cy="13" r="5" fill="#11181f"/></svg>',
    };

    function genId(p) { return p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function dashArray(art) { if (art === 'dashed') return '8 6'; if (art === 'dotted') return '1 7'; return null; }

    function normalisiere(inhalt) {
        const a = (inhalt && inhalt.ansicht) || {};
        return {
            ansicht: {
                lat: Number.isFinite(a.lat) ? a.lat : 51.16,
                lng: Number.isFinite(a.lng) ? a.lng : 10.45,
                zoom: Number.isFinite(a.zoom) ? a.zoom : 6
            },
            basis: (inhalt && inhalt.basis === 'satellit') ? 'satellit' : 'karte',
            marker: Array.isArray(inhalt && inhalt.marker) ? inhalt.marker.slice() : [],
            striche: Array.isArray(inhalt && inhalt.striche) ? inhalt.striche.slice() : []
        };
    }
    function signatur(state) { return JSON.stringify({ m: state.marker, s: state.striche }); }

    window.PultWidgets.karte = {
        standard() {
            return { ansicht: { lat: 51.16, lng: 10.45, zoom: 6 }, basis: 'karte', marker: [], striche: [] };
        },

        erstelle(container, inhalt, aenderung, ctx) {
            const wrap = document.createElement('div');
            wrap.className = 'w-karte';
            container.appendChild(wrap);

            let state = normalisiere(inhalt);
            let aktuelleSig = signatur(state);
            let letztMtime = -1;

            // --- Werkzeugleiste (eigene SVG-Knöpfe) ---
            const leiste = document.createElement('div');
            leiste.className = 'w-karte-leiste';
            const btnMarker = svgBtn(SVG.marker, 'Marker', 'Marker setzen', true);
            const btnLinie = svgBtn(SVG.linie, 'Strich', 'Strich zeichnen', true);
            const farbe = document.createElement('input');
            farbe.type = 'color'; farbe.value = '#00ccaa'; farbe.className = 'w-karte-farbe';
            farbe.setAttribute('aria-label', 'Strichfarbe');
            const artSel = document.createElement('select');
            artSel.className = 'w-karte-art w-eingabe'; artSel.setAttribute('aria-label', 'Strichart');
            [['solid', 'durchgezogen'], ['dashed', 'gestrichelt'], ['dotted', 'gepunktet']].forEach((o) => {
                const opt = document.createElement('option'); opt.value = o[0]; opt.textContent = o[1]; artSel.appendChild(opt);
            });
            const btnFertig = svgBtn(SVG.check, 'Fertig', 'Strich abschließen', false);
            btnFertig.hidden = true;
            leiste.append(btnMarker, btnLinie, farbe, artSel, btnFertig);

            const status = document.createElement('p');
            status.className = 'w-status w-karte-status';
            status.setAttribute('aria-live', 'polite');
            status.textContent = 'Karte lädt…';

            const karteEl = document.createElement('div');
            karteEl.className = 'w-karte-flaeche';
            wrap.append(leiste, status, karteEl);

            function svgBtn(svg, text, label, toggle) {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'w-sekundaer-btn w-karte-btn';
                b.innerHTML = '<span class="w-karte-ico" aria-hidden="true">' + svg + '</span><span>' + text + '</span>';
                b.setAttribute('aria-label', label);
                if (toggle) b.setAttribute('aria-pressed', 'false');
                return b;
            }

            let map = null, markerLayer = null, stricheLayer = null, vorschau = null, ro = null;
            let osm = null, sat = null, aktuellBase = null;
            let modus = 'keine';            // 'keine' | 'marker' | 'linie'
            let entwurf = [];
            let popupOffen = false;
            const linien = {};              // s.id -> L.polyline
            let editId = null, editHandles = [];

            function speichern() {
                aktuelleSig = signatur(state);
                aenderung(JSON.parse(JSON.stringify(state)));
            }
            function ansageGeladen() { if (window.pultAnsage) window.pultAnsage('Karte geladen.'); }

            ladeLeaflet().then((L) => {
                if (!container.isConnected) return;
                status.hidden = true;
                ansageGeladen();
                map = L.map(karteEl, { zoomControl: true }).setView([state.ansicht.lat, state.ansicht.lng], state.ansicht.zoom);
                osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
                    { maxZoom: 19, attribution: '© OpenStreetMap-Mitwirkende' });
                sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                    { maxZoom: 19, attribution: '© Esri' });
                aktuellBase = (state.basis === 'satellit' ? sat : osm).addTo(map);

                // Eigener Layer-Umschalter (SVG) statt L.control.layers → kein externes Bild (CSP-frei)
                const LayerBtn = L.Control.extend({
                    onAdd: function () {
                        const b = L.DomUtil.create('button', 'w-karte-layerbtn');
                        b.type = 'button';
                        b.innerHTML = SVG.layers;
                        b.title = 'Karte / Satellit umschalten';
                        b.setAttribute('aria-label', 'Karte oder Satellit');
                        L.DomEvent.on(b, 'click', L.DomEvent.stop);
                        L.DomEvent.on(b, 'click', () => {
                            map.removeLayer(aktuellBase);
                            aktuellBase = (aktuellBase === osm ? sat : osm).addTo(map);
                            state.basis = (aktuellBase === sat) ? 'satellit' : 'karte';
                            aenderung(JSON.parse(JSON.stringify(state)));   // Basiskarte merken
                        });
                        return b;
                    }
                });
                new LayerBtn({ position: 'topright' }).addTo(map);

                markerLayer = L.layerGroup().addTo(map);
                stricheLayer = L.layerGroup().addTo(map);
                rendere(L);

                setTimeout(() => map && map.invalidateSize(), 60);
                if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (map) map.invalidateSize(); }); ro.observe(karteEl); }

                map.on('click', (e) => {
                    if (modus === 'marker') markerHinzufuegen(L, e.latlng);
                    else if (modus === 'linie') { entwurf.push([e.latlng.lat, e.latlng.lng]); zeichneEntwurf(L); }
                });
                map.on('mousemove', (e) => { if (modus === 'linie' && entwurf.length) zeichneEntwurf(L, e.latlng); });
                map.on('moveend zoomend', () => {
                    if (!map) return;
                    const c = map.getCenter();
                    state.ansicht = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
                    aenderung(JSON.parse(JSON.stringify(state)));
                });
            }).catch(() => {
                status.hidden = false;
                status.textContent = 'Karte konnte nicht geladen werden (keine Internetverbindung?).';
                if (window.pultAnsage) window.pultAnsage(status.textContent);
            });

            function pinIcon(L) {
                return L.divIcon({
                    className: 'w-karte-pin', html: SVG.pin('#ea6b17'),
                    iconSize: [30, 40], iconAnchor: [15, 39], popupAnchor: [0, -34], tooltipAnchor: [0, -34]
                });
            }
            function griffIcon(L, klasse) {
                return L.divIcon({ className: 'w-karte-griff ' + (klasse || ''), html: '', iconSize: [16, 16], iconAnchor: [8, 8] });
            }

            function popupFokus(e) {
                popupOffen = true;
                setTimeout(() => {
                    const el = e && e.popup && e.popup.getElement && e.popup.getElement();
                    const ziel = el && el.querySelector('input, button');
                    if (ziel) ziel.focus();
                }, 0);
            }

            function rendere(L) {
                if (!map) return;
                editEnde();                       // laufende Bearbeitung beenden
                markerLayer.clearLayers();
                stricheLayer.clearLayers();
                for (const k in linien) delete linien[k];

                state.striche.forEach((s) => {
                    const pl = L.polyline(s.punkte, {
                        color: s.farbe, weight: s.breite,
                        dashArray: dashArray(s.strichart), lineCap: s.strichart === 'dotted' ? 'round' : 'butt'
                    });
                    pl.on('click', (ev) => { if (L.DomEvent) L.DomEvent.stop(ev); lineMenu(L, s, pl, ev.latlng); });
                    linien[s.id] = pl;
                    stricheLayer.addLayer(pl);
                });

                state.marker.forEach((m) => {
                    const mk = L.marker([m.lat, m.lng], { icon: pinIcon(L), draggable: true });
                    if (m.titel) mk.bindTooltip(m.titel, { permanent: true, direction: 'top', className: 'w-karte-label' });
                    mk.on('dragend', () => { const ll = mk.getLatLng(); m.lat = ll.lat; m.lng = ll.lng; speichern(); });
                    mk.bindPopup(() => markerPopup(L, m, mk));
                    mk.on('popupopen', popupFokus);
                    mk.on('popupclose', () => { popupOffen = false; });
                    markerLayer.addLayer(mk);
                });
                aktuelleSig = signatur(state);
            }

            function markerHinzufuegen(L, latlng) {
                state.marker.push({ id: genId('m'), lat: latlng.lat, lng: latlng.lng, titel: '' });
                speichern();
                rendere(L);
            }

            function markerPopup(L, m, mk) {
                const box = document.createElement('div');
                box.className = 'w-karte-popup';
                const feld = document.createElement('input');
                feld.type = 'text'; feld.className = 'w-eingabe'; feld.placeholder = 'Beschriftung…';
                feld.value = m.titel || ''; feld.setAttribute('aria-label', 'Marker-Beschriftung');
                feld.addEventListener('change', () => {
                    const t = state.marker.find((x) => x.id === m.id);
                    if (!t) return;
                    t.titel = feld.value.slice(0, 120);
                    speichern();
                    mk.unbindTooltip();
                    if (t.titel) mk.bindTooltip(t.titel, { permanent: true, direction: 'top', className: 'w-karte-label' });
                });
                const weg = document.createElement('button');
                weg.type = 'button'; weg.className = 'w-sekundaer-btn'; weg.textContent = 'Löschen';
                weg.addEventListener('click', async () => {
                    const ok = window.pultConfirm ? await window.pultConfirm('Marker löschen?') : true;
                    if (!ok) return;
                    state.marker = state.marker.filter((x) => x.id !== m.id);
                    speichern(); rendere(L);
                });
                box.append(feld, weg);
                return box;
            }

            // Kontextmenü für eine Linie: bearbeiten (Punkte verschieben) / löschen
            function lineMenu(L, s, pl, latlng) {
                const box = document.createElement('div');
                box.className = 'w-karte-popup';
                const edit = document.createElement('button');
                edit.type = 'button'; edit.className = 'w-sekundaer-btn';
                edit.textContent = editId === s.id ? 'Bearbeiten beenden' : 'Punkte verschieben';
                edit.addEventListener('click', () => { map.closePopup(); if (editId === s.id) editEnde(); else editStart(L, s); });
                const weg = document.createElement('button');
                weg.type = 'button'; weg.className = 'w-sekundaer-btn'; weg.textContent = 'Löschen';
                weg.addEventListener('click', async () => {
                    const ok = window.pultConfirm ? await window.pultConfirm('Strich löschen?') : true;
                    if (!ok) return;
                    map.closePopup();
                    state.striche = state.striche.filter((x) => x.id !== s.id);
                    speichern(); rendere(L);
                });
                box.append(edit, weg);
                L.popup({ closeButton: true }).setLatLng(latlng || pl.getCenter()).setContent(box).openOn(map);
            }

            // Linien-Bearbeitung: Vertex-Griffe (Punkte verschieben) + Verschiebe-Griff (ganze Linie)
            function editStart(L, s) {
                editEnde();
                editId = s.id;
                const pl = linien[s.id];
                if (!pl) return;
                s.punkte.forEach((p, i) => {
                    const h = L.marker([p[0], p[1]], { icon: griffIcon(L, 'w-karte-griff-punkt'), draggable: true, zIndexOffset: 1000 });
                    h.on('drag', () => { const ll = h.getLatLng(); s.punkte[i] = [ll.lat, ll.lng]; pl.setLatLngs(s.punkte); });
                    h.on('dragend', speichern);
                    h.addTo(map); editHandles.push(h);
                });
                // Verschiebe-Griff (ganze Linie) am Mittelpunkt
                const c = pl.getCenter();
                const move = L.marker([c.lat, c.lng], { icon: griffIcon(L, 'w-karte-griff-move'), draggable: true, zIndexOffset: 1000 });
                let vorLat = c.lat, vorLng = c.lng;
                move.on('dragstart', () => { const ll = move.getLatLng(); vorLat = ll.lat; vorLng = ll.lng; });
                move.on('drag', () => {
                    const ll = move.getLatLng();
                    const dLat = ll.lat - vorLat, dLng = ll.lng - vorLng;
                    vorLat = ll.lat; vorLng = ll.lng;
                    s.punkte = s.punkte.map((p) => [p[0] + dLat, p[1] + dLng]);
                    pl.setLatLngs(s.punkte);
                    editHandles.forEach((hh, idx) => { if (idx < s.punkte.length) hh.setLatLng(s.punkte[idx]); });
                });
                move.on('dragend', speichern);
                move.addTo(map); editHandles.push(move);
                if (window.pultAnsage) window.pultAnsage('Strich-Bearbeitung: Punkte ziehen, der mittlere Griff verschiebt die ganze Linie.');
            }
            function editEnde() {
                editHandles.forEach((h) => { try { map.removeLayer(h); } catch (e) {} });
                editHandles = []; editId = null;
            }

            function zeichneEntwurf(L, cursor) {
                if (vorschau) { map.removeLayer(vorschau); vorschau = null; }
                if (!entwurf.length) return;
                const punkte = cursor ? entwurf.concat([[cursor.lat, cursor.lng]]) : entwurf;
                vorschau = L.polyline(punkte, { color: farbe.value, weight: 4, dashArray: dashArray(artSel.value), opacity: 0.8 }).addTo(map);
            }

            function modusSetzen(neu) {
                modus = (modus === neu) ? 'keine' : neu;
                btnMarker.setAttribute('aria-pressed', modus === 'marker' ? 'true' : 'false');
                btnLinie.setAttribute('aria-pressed', modus === 'linie' ? 'true' : 'false');
                btnMarker.classList.toggle('aktiv', modus === 'marker');
                btnLinie.classList.toggle('aktiv', modus === 'linie');
                btnFertig.hidden = modus !== 'linie';
                if (modus !== 'linie') { entwurf = []; if (vorschau && map) { map.removeLayer(vorschau); vorschau = null; } }
                if (modus !== 'keine') editEnde();
                if (window.pultAnsage) {
                    window.pultAnsage(modus === 'marker' ? 'Marker-Modus: in die Karte tippen.'
                        : modus === 'linie' ? 'Strich-Modus: Punkte antippen, dann Fertig.' : 'Bearbeiten beendet.');
                }
            }

            btnMarker.addEventListener('click', () => modusSetzen('marker'));
            btnLinie.addEventListener('click', () => modusSetzen('linie'));
            btnFertig.addEventListener('click', () => {
                if (entwurf.length >= 2) {
                    state.striche.push({ id: genId('s'), punkte: entwurf.slice(), farbe: farbe.value, breite: 4, strichart: artSel.value });
                    speichern();
                    if (window.L) rendere(window.L);
                }
                modusSetzen('linie');
            });

            // Live-Übertragung: gezielter Poll, nur Overlays übernehmen (Ausschnitt bleibt).
            const timer = setInterval(async () => {
                if (!container.isConnected) { clearInterval(timer); aufraeumen(); return; }
                if (document.hidden || modus === 'linie' || popupOffen || editId) return;
                try {
                    const r = await fetch('api.php?action=block_get&id=' + encodeURIComponent(ctx.id), { credentials: 'same-origin' });
                    const j = await r.json();
                    if (!j.ok || !j.content) return;
                    if (j.mtime === letztMtime) return;
                    letztMtime = j.mtime;
                    const neu = normalisiere(j.content);
                    if (signatur(neu) !== aktuelleSig) {
                        state.marker = neu.marker; state.striche = neu.striche;
                        if (window.L && map) rendere(window.L);
                    }
                } catch (e) { /* nächster Tick */ }
            }, 4000);

            function aufraeumen() {
                if (ro) { try { ro.disconnect(); } catch (e) {} ro = null; }
                if (map) { try { map.remove(); } catch (e) {} map = null; }
            }
        }
    };
})();
