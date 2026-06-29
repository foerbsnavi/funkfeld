/* =========================================================
   Funkfeld — App-Logik (Stufe 1: Fenster-Manager)
   Flächen anlegen, an der Titelleiste ziehen, überlagern,
   Größe ändern, einklappen, umbenennen, schließen.
   Alles wird verzögert automatisch in dashboard.json gespeichert.
   ========================================================= */
(() => {
    'use strict';

    const csrf       = document.body.dataset.csrf || '';
    const board      = document.getElementById('board');
    const hinweis    = document.getElementById('leerhinweis');
    const ansichtWahl = document.getElementById('ansicht-wahl');
    const btnSperre = document.getElementById('btn-sperre');

    // Unsichtbarer Platzhalter im Board: erzeugt die Scroll-Höhe, damit man unter den
    // Sichtbereich gestapelte Flächen erreichen kann (absolute Flächen vergrößern den
    // Scrollbereich nicht von selbst; das Board darf NICHT über den Flex-Container wachsen).
    const boardSpacer = document.createElement('div');
    boardSpacer.className = 'board-spacer';
    boardSpacer.setAttribute('aria-hidden', 'true');
    board.appendChild(boardSpacer);

    const kompaktAbfrage = window.matchMedia('(max-width: 700px)');

    // clips: getrennte Geometrie für den Clips-Modus (id → {x,y,b,h}); baenke: 3 Anordnungs-Snapshots
    let layout = { flaechen: [], naechsteZ: 1, ansicht: 'frei', clips: {}, baenke: [null, null, null], gesperrt: false };
    // Schloss-Symbole (eigene SVG): offen = bedienbar, geschlossen = festgesetzt
    const SCHLOSS_AUF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    const SCHLOSS_ZU  = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
    let speicherTimer = null;
    const CLIP_RASTER = 10;   // Raster-Schrittweite für den Clips-Modus (magnetisches Einrasten)
    const CLIP_GAP = 10;      // fester Mindestabstand zwischen Karten im Clips-Modus
    let bankSpeichernModus = false;
    let trenner = [];         // Trenn-Griffe zwischen benachbarten Clips-Karten

    // Inhalte je Fläche (id → Inhaltsobjekt) und ihre Speicher-Timer
    let bloecke = {};
    const blockTimers = {};

    // Live-Sync: Zeitstempel der letzten Abfrage + Zeiger-/Poll-Zustand
    let letzteMtimes = null;
    let zeigerUnten = false;
    let syncTimer = null;

    // Standard-Titel je Flächen-Typ
    const TYP_INFO = {
        notiz:       { titel: 'Notiz' },
        checkliste:  { titel: 'Aufgaben' },
        links:       { titel: 'Links' },
        tabelle:     { titel: 'Tabelle' },
        telefonbuch: { titel: 'Telefonbuch' },
        dateien:     { titel: 'Dateien' },
        uhr:         { titel: 'Uhr' },
        wetter:      { titel: 'Wetter' },
        kalender:    { titel: 'Kalender' },
        mail:        { titel: 'Mail' },
        rss:         { titel: 'RSS' },
        chat:        { titel: 'Chat' },
        karte:       { titel: 'Karte', b: 380, h: 320 },
        livestream:  { titel: 'Livestream', b: 360, h: 300 },
        wirtschaft:  { titel: 'Wirtschaft', b: 400, h: 300 },
        custom:      { titel: 'Custom', b: 360, h: 300 }
    };

    /** Fokus-Ziel, wenn keine Fläche mehr da ist (der Hinzufügen-Knopf). */
    function fokusZiel() {
        return document.getElementById('fab-btn');
    }

    /* ---------------------------------------------------------
       API & Speichern
       --------------------------------------------------------- */

    function api(action, opts = {}) {
        return fetch('api.php?action=' + action, { credentials: 'same-origin', ...opts });
    }

    /** Speichern leicht verzögert bündeln (Auto-Save). */
    function planeSpeichern() {
        clearTimeout(speicherTimer);
        speicherTimer = setTimeout(speichern, 500);
    }

    async function speichern() {
        try {
            await api('layout_save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csrf, layout })
            });
        } catch (e) {
            // Beim nächsten Edit wird erneut gespeichert.
        }
    }

    /** Inhalt einer Fläche verzögert speichern (Auto-Save pro Fläche). */
    function planeBlockSpeichern(id, typ) {
        clearTimeout(blockTimers[id]);
        blockTimers[id] = setTimeout(() => speichereBlock(id, typ), 500);
    }

    async function speichereBlock(id, typ) {
        try {
            await api('block_save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csrf, id, typ, content: bloecke[id] })
            });
        } catch (e) {
            // nächster Edit speichert erneut
        }
    }

    async function loescheBlock(id) {
        try {
            await api('block_delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csrf, id })
            });
        } catch (e) {
            // unkritisch — verwaiste Datei wird beim nächsten Speichern ohnehin ignoriert
        }
    }

    /* ---------------------------------------------------------
       Hilfen
       --------------------------------------------------------- */

    function neueId() {
        if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    /** Geladene Fläche auf saubere Typen/Werte bringen (defensiv gegen manipulierte JSON). */
    function normalisiere(f) {
        f = f || {};
        return {
            id:          String(f.id ?? ''),
            typ:         String(f.typ ?? 'leer'),
            titel:       String(f.titel ?? 'Fläche'),
            x:           Number(f.x) || 0,
            y:           Number(f.y) || 0,
            b:           Math.max(120, Number(f.b) || 280),
            h:           Math.max(60,  Number(f.h) || 200),
            z:           Number(f.z) || 1,
            eingeklappt: !!f.eingeklappt
        };
    }

    function nachVorn(f, el) {
        f.z = layout.naechsteZ++;
        el.style.zIndex = f.z;
        aktivMarkieren(el);
        planeSpeichern();
    }

    function aktivMarkieren(el) {
        board.querySelectorAll('.flaeche.aktiv').forEach(x => x.classList.remove('aktiv'));
        el.classList.add('aktiv');
    }

    /* ---------------------------------------------------------
       Geometrie je Modus: Frei = flaechen.x/y/b/h · Clips = layout.clips[id]
       --------------------------------------------------------- */
    function clipsModus() { return layout.ansicht === 'clips' && !istKompakt(); }
    function snap(v) { return Math.round(v / CLIP_RASTER) * CLIP_RASTER; }

    /** Liefert das aktive Geometrie-Objekt (Referenz!) — im Clips-Modus aus layout.clips. */
    function geoVon(f) {
        if (clipsModus()) {
            if (!layout.clips[f.id]) layout.clips[f.id] = clipsInit(f);
            return layout.clips[f.id];
        }
        return f;
    }
    function rechteckeUeberlappen(a, b) {
        // mit festem Mindestabstand CLIP_GAP: schon „kollidierend", wenn näher als CLIP_GAP
        // → so bleibt im Clips-Modus immer 10px Luft zwischen den Karten.
        const g = CLIP_GAP;
        return a.x < b.x + b.b + g && a.x + a.b + g > b.x && a.y < b.y + b.h + g && a.y + a.h + g > b.y;
    }
    function andereClipsRechtecke(exclId) {
        const out = [];
        for (const f of layout.flaechen) {
            if (f.id === exclId) continue;
            if (layout.clips[f.id]) out.push(layout.clips[f.id]);
        }
        return out;
    }
    /** Nächste freie, eingerastete Stelle für ein Rechteck b×h nahe (x,y). */
    function freieStelle(x, y, b, h, exclId) {
        const others = andereClipsRechtecke(exclId);
        const passt = (px, py) => !others.some(o => rechteckeUeberlappen({ x: px, y: py, b: b, h: h }, o));
        const bx = Math.max(0, snap(x)), by = Math.max(0, snap(y));
        if (passt(bx, by)) return { x: bx, y: by };
        for (let r = 1; r <= 80; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
                    const px = Math.max(0, bx + dx * CLIP_RASTER), py = Math.max(0, by + dy * CLIP_RASTER);
                    if (passt(px, py)) return { x: px, y: py };
                }
            }
        }
        return { x: bx, y: by + h + CLIP_RASTER };
    }
    function clipsInit(f) {
        const b = Math.max(120, snap(f.b)), h = Math.max(60, snap(f.h));
        const s = freieStelle(f.x, f.y, b, h, f.id);
        return { x: s.x, y: s.y, b: b, h: h };
    }
    function clipsAlleInit() {
        for (const f of layout.flaechen) if (!layout.clips[f.id]) layout.clips[f.id] = clipsInit(f);
    }
    /** Größe so verkleinern, dass nichts überlappt. */
    function clipsGroesseEinpassen(g, exclId) {
        const others = andereClipsRechtecke(exclId);
        const kollidiert = () => others.some(o => rechteckeUeberlappen(g, o));
        while (g.b > 120 && kollidiert()) g.b -= CLIP_RASTER;
        while (g.h > 60 && kollidiert()) g.h -= CLIP_RASTER;
        g.b = Math.max(120, g.b); g.h = Math.max(60, g.h);
    }
    /** Alle Flächen-Elemente an die aktive Geometrie anpassen (nach Wechsel/Laden). */
    function positionenAnwenden() {
        board.querySelectorAll('.flaeche').forEach((el) => {
            const f = layout.flaechen.find(x => x.id === el.dataset.id);
            if (!f) return;
            const g = geoVon(f);
            el.style.left = g.x + 'px'; el.style.top = g.y + 'px';
            el.style.width = g.b + 'px'; el.style.height = g.h + 'px';
        });
    }

    /* ---------------------------------------------------------
       Clips: Trenn-Griffe im Spalt zwischen benachbarten Karten.
       Ziehen verschiebt die gemeinsame Kante — eine Kachel wird
       schmaler/niedriger, die andere im selben Maß größer.
       --------------------------------------------------------- */
    function trennerEntfernen() {
        trenner.forEach((t) => { try { t.remove(); } catch (e) {} });
        trenner = [];
    }
    function flaecheNachId(id) { return layout.flaechen.find((f) => f.id === id); }

    function trennerAktualisieren() {
        trennerEntfernen();
        if (!clipsModus() || layout.gesperrt) return;
        const cs = layout.flaechen.map((f) => ({ id: f.id, g: geoVon(f) }));
        const TOL = 2, UEBERLAPP_MIN = 40;
        const vert = {};    // gemeinsame senkrechte Kante:  L → {links,rechts,von,bis}
        const horiz = {};   // gemeinsame waagerechte Kante: T → {oben,unten,von,bis}
        for (const a of cs) {
            for (const b of cs) {
                if (a === b) continue;
                // a liegt links von b → senkrechte Kante bei L (Spalten-Trenner, ↔)
                if (Math.abs((b.g.x - (a.g.x + a.g.b)) - CLIP_GAP) <= TOL) {
                    const von = Math.max(a.g.y, b.g.y), bis = Math.min(a.g.y + a.g.h, b.g.y + b.g.h);
                    if (bis - von >= UEBERLAPP_MIN) {
                        const L = Math.round(a.g.x + a.g.b);
                        const e = vert[L] || (vert[L] = { links: new Set(), rechts: new Set(), von: Infinity, bis: -Infinity });
                        e.links.add(a.id); e.rechts.add(b.id);
                        e.von = Math.min(e.von, von); e.bis = Math.max(e.bis, bis);
                    }
                }
                // a liegt über b → waagerechte Kante bei T (Zeilen-Trenner, ↕)
                if (Math.abs((b.g.y - (a.g.y + a.g.h)) - CLIP_GAP) <= TOL) {
                    const von = Math.max(a.g.x, b.g.x), bis = Math.min(a.g.x + a.g.b, b.g.x + b.g.b);
                    if (bis - von >= UEBERLAPP_MIN) {
                        const T = Math.round(a.g.y + a.g.h);
                        const e = horiz[T] || (horiz[T] = { oben: new Set(), unten: new Set(), von: Infinity, bis: -Infinity });
                        e.oben.add(a.id); e.unten.add(b.id);
                        e.von = Math.min(e.von, von); e.bis = Math.max(e.bis, bis);
                    }
                }
            }
        }
        for (const L in vert) {
            const e = vert[L];
            trennerErzeugen('x', Number(L), e.von, CLIP_GAP, e.bis - e.von, [...e.links], [...e.rechts]);
        }
        for (const T in horiz) {
            const e = horiz[T];
            trennerErzeugen('y', e.von, Number(T), e.bis - e.von, CLIP_GAP, [...e.oben], [...e.unten]);
        }
    }
    function trennerErzeugen(achse, x, y, w, h, idsA, idsB) {
        const t = document.createElement('div');
        t.className = 'clips-trenner ' + (achse === 'x' ? 'waagerecht-ziehen' : 'senkrecht-ziehen');
        t.style.left = x + 'px'; t.style.top = y + 'px';
        t.style.width = w + 'px'; t.style.height = h + 'px';
        t.setAttribute('aria-hidden', 'true');
        board.appendChild(t);
        trenner.push(t);
        trennerZiehbar(t, achse, idsA, idsB);
    }
    // Verschiebt eine ganze gemeinsame Kante: alle Karten der einen Seite werden
    // im selben Maß größer, alle der anderen Seite kleiner (Außenkanten bleiben fest).
    function trennerZiehbar(el, achse, idsA, idsB) {
        let startP, L0, aktiv = false, A = [], B = [];
        function sammeln(ids) {
            return ids.map((id) => {
                const f = flaecheNachId(id);
                const dom = board.querySelector('.flaeche[data-id="' + id + '"]');
                return (f && dom) ? { g: geoVon(f), el: dom } : null;
            }).filter(Boolean);
        }
        el.addEventListener('pointerdown', (ev) => {
            A = sammeln(idsA); B = sammeln(idsB);
            if (!A.length || !B.length) return;
            ev.stopPropagation();
            aktiv = true;
            if (achse === 'x') {
                startP = ev.clientX;
                L0 = Math.max(...A.map((c) => c.g.x + c.g.b));
                B.forEach((c) => { c.ende = c.g.x + c.g.b; });   // rechte Außenkante bleibt fest
            } else {
                startP = ev.clientY;
                L0 = Math.max(...A.map((c) => c.g.y + c.g.h));
                B.forEach((c) => { c.ende = c.g.y + c.g.h; });    // untere Außenkante bleibt fest
            }
            el.setPointerCapture(ev.pointerId);
            document.body.classList.add('zieht');
        });
        el.addEventListener('pointermove', (ev) => {
            if (!aktiv) return;
            if (achse === 'x') {
                let nb = snap(L0 + (ev.clientX - startP));
                nb = Math.max(Math.max(...A.map((c) => c.g.x)) + 120, Math.min(nb, Math.min(...B.map((c) => c.ende)) - CLIP_GAP - 120));
                A.forEach((c) => { c.g.b = nb - c.g.x; c.el.style.width = c.g.b + 'px'; });
                B.forEach((c) => { c.g.x = nb + CLIP_GAP; c.g.b = c.ende - c.g.x; c.el.style.left = c.g.x + 'px'; c.el.style.width = c.g.b + 'px'; });
                el.style.left = nb + 'px';
            } else {
                let nb = snap(L0 + (ev.clientY - startP));
                nb = Math.max(Math.max(...A.map((c) => c.g.y)) + 60, Math.min(nb, Math.min(...B.map((c) => c.ende)) - CLIP_GAP - 60));
                A.forEach((c) => { c.g.h = nb - c.g.y; c.el.style.height = c.g.h + 'px'; });
                B.forEach((c) => { c.g.y = nb + CLIP_GAP; c.g.h = c.ende - c.g.y; c.el.style.top = c.g.y + 'px'; c.el.style.height = c.g.h + 'px'; });
                el.style.top = nb + 'px';
            }
        });
        const ende = (ev) => {
            if (!aktiv) return;
            aktiv = false;
            document.body.classList.remove('zieht');
            try { el.releasePointerCapture(ev.pointerId); } catch (e) {}
            boardAnpassen(); planeSpeichern(); trennerAktualisieren();
        };
        el.addEventListener('pointerup', ende);
        el.addEventListener('pointercancel', ende);
    }

    /* ---------------------------------------------------------
       Anordnungsbänke (3 Snapshots: Modus + Frei- und Clips-Geometrie)
       --------------------------------------------------------- */
    function aktuelleAnordnung() {
        const frei = {}, clips = {};
        for (const f of layout.flaechen) {
            frei[f.id] = { x: f.x, y: f.y, b: f.b, h: f.h };
            if (layout.clips[f.id]) clips[f.id] = Object.assign({}, layout.clips[f.id]);
        }
        return { ansicht: layout.ansicht, frei: frei, clips: clips };
    }
    function bankSpeichern(i) {
        layout.baenke[i] = aktuelleAnordnung();
        planeSpeichern();
        ansage('Anordnung auf Bank ' + (i + 1) + ' gespeichert.');
        bankStatus();
    }
    function bankAbrufen(i) {
        const b = layout.baenke[i];
        if (!b) { ansage('Bank ' + (i + 1) + ' ist noch leer.'); return; }
        for (const f of layout.flaechen) {
            const fr = b.frei && b.frei[f.id];
            if (fr) { f.x = Number(fr.x) || 0; f.y = Number(fr.y) || 0; f.b = Math.max(120, Number(fr.b) || 280); f.h = Math.max(60, Number(fr.h) || 200); }
            if (b.clips && b.clips[f.id]) layout.clips[f.id] = Object.assign({}, b.clips[f.id]);
        }
        layout.ansicht = ['frei', 'raster', 'clips'].includes(b.ansicht) ? b.ansicht : 'frei';
        if (ansichtWahl) ansichtWahl.value = layout.ansicht;
        ansichtAnwenden(false);
        ansage('Bank ' + (i + 1) + ' abgerufen.');
        planeSpeichern();
    }
    function bankStatus() {
        document.querySelectorAll('.bank-btn').forEach((b) => {
            b.classList.toggle('belegt', !!layout.baenke[Number(b.dataset.bank)]);
        });
    }

    /* ---------------------------------------------------------
       Ansicht: frei ⇄ Raster (+ Handy-Fallback)
       --------------------------------------------------------- */

    /** Schmaler Bildschirm → immer einspaltig, kein freies Verschieben. */
    function istKompakt() {
        return kompaktAbfrage.matches;
    }

    /** Sind Verschieben/Größe gerade gesperrt (Raster oder Handy)? */
    function istRaster() {
        return istKompakt() || layout.ansicht === 'raster';
    }

    /** Kurze Ansage für Screenreader (zentrale Live-Region #ansicht-status). */
    function ansage(text) {
        const el = document.getElementById('ansicht-status');
        if (el) el.textContent = text;
    }
    // Auch den Widgets zur Verfügung stellen (Status ohne eigene Live-Region je Widget)
    window.pultAnsage = ansage;

    /**
     * Modus auf Board und Knopf anwenden.
     * Das Gitter-Layout (.gestapelt) gilt bei Raster ODER auf dem Handy.
     * @param {boolean} ankuendigen  true → Wechsel für Screenreader ansagen
     */
    function ansichtAnwenden(ankuendigen) {
        // Gitter (.gestapelt) bei Raster ODER auf dem Handy; Clips ist eine eigene Klasse.
        board.classList.toggle('gestapelt', istRaster());
        board.classList.toggle('clips', clipsModus());
        if (ansichtWahl) ansichtWahl.value = layout.ansicht;
        if (ankuendigen) {
            ansage(layout.ansicht === 'raster' ? 'Raster-Ansicht'
                : layout.ansicht === 'clips' ? 'Clips-Ansicht: Karten rasten magnetisch ein.' : 'Freie Ansicht');
        }
        positionenAnwenden();
        boardAnpassen();
        sperreAnwenden();
        trennerAktualisieren();
    }

    /** Festgesetzte Ansicht: keine Karten-Knöpfe, kein Verschieben/Größe ändern. */
    function sperreAnwenden() {
        board.classList.toggle('gesperrt', !!layout.gesperrt);   // FAB wird per CSS (.board.gesperrt ~ .fab) ausgeblendet
        if (btnSperre) {
            btnSperre.innerHTML = layout.gesperrt ? SCHLOSS_ZU : SCHLOSS_AUF;
            btnSperre.classList.toggle('aktiv', !!layout.gesperrt);
            btnSperre.setAttribute('aria-pressed', layout.gesperrt ? 'true' : 'false');
            btnSperre.setAttribute('aria-label', layout.gesperrt ? 'Ansicht entsperren' : 'Ansicht festsetzen');
        }
    }
    function sperreUmschalten() {
        layout.gesperrt = !layout.gesperrt;
        sperreAnwenden();
        trennerAktualisieren();
        planeSpeichern();
    }

    /** Auf dem Handy ist die Auswahl ohne Wirkung (immer einspaltig) → ausgrauen. */
    function mobilPruefen() {
        if (ansichtWahl) ansichtWahl.disabled = istKompakt();
    }

    function ansichtSetzen(neu) {
        if (!['frei', 'raster', 'clips'].includes(neu)) return;
        layout.ansicht = neu;
        if (neu === 'clips') clipsAlleInit();
        ansichtAnwenden(true);
        planeSpeichern();
    }

    /** DOM-Element der obersten (vordersten) noch offenen Fläche – für Fokus-Rückgabe. */
    function obersteFlaecheEl() {
        let best = null, bestZ = -Infinity;
        board.querySelectorAll('.flaeche').forEach((el) => {
            const z = Number(el.style.zIndex) || 0;
            if (z > bestZ) { bestZ = z; best = el; }
        });
        return best;
    }

    function hinweisPruefen() {
        if (hinweis) hinweis.hidden = layout.flaechen.length > 0;
    }

    /**
     * Board-Höhe an die unterste Fläche anpassen, damit man Flächen beliebig
     * nach unten stapeln kann (absolute Kinder vergrößern den Scrollbereich nicht
     * von selbst). Im Raster/Handy übernimmt das Gitter die Höhe.
     */
    function boardAnpassen() {
        if (istRaster()) { boardSpacer.style.height = '0'; return; }
        let maxB = 0;
        for (const f of layout.flaechen) {
            const g = geoVon(f);
            const b = (Number(g.y) || 0) + (Number(g.h) || 0);
            if (b > maxB) maxB = b;
        }
        boardSpacer.style.height = (maxB + 96) + 'px';
    }

    /* ---------------------------------------------------------
       Rendern einer Fläche
       --------------------------------------------------------- */

    function rendere(f) {
        const el = document.createElement('section');
        el.className = 'flaeche' + (f.eingeklappt ? ' eingeklappt' : '');
        el.dataset.id = f.id;
        const g0 = geoVon(f);
        el.style.left   = g0.x + 'px';
        el.style.top    = g0.y + 'px';
        el.style.width  = g0.b + 'px';
        el.style.height = g0.h + 'px';
        el.style.zIndex = f.z;
        el.tabIndex = 0;                          // per Tastatur erreichbar
        el.setAttribute('aria-label', f.titel);
        el.setAttribute('aria-roledescription', 'Fläche');
        el.setAttribute('aria-describedby', 'flaeche-hilfe');

        // Titelleiste
        const titel = document.createElement('div');
        titel.className = 'flaeche-titel';

        const text = document.createElement('span');
        text.className = 'flaeche-titel-text';
        text.setAttribute('role', 'heading');
        text.setAttribute('aria-level', '2');
        text.textContent = f.titel;               // textContent → XSS-sicher

        const btnKlapp = document.createElement('button');
        btnKlapp.type = 'button';
        btnKlapp.className = 'flaeche-knopf';
        btnKlapp.setAttribute('aria-label', f.eingeklappt ? 'Ausklappen' : 'Einklappen');
        btnKlapp.setAttribute('aria-expanded', String(!f.eingeklappt));
        btnKlapp.textContent = f.eingeklappt ? '+' : '–';

        const btnZu = document.createElement('button');
        btnZu.type = 'button';
        btnZu.className = 'flaeche-knopf';
        btnZu.setAttribute('aria-label', 'Schließen');
        btnZu.textContent = '×';

        titel.append(text, btnKlapp, btnZu);

        // Inhaltsbereich: passendes Widget einhängen
        const inhalt = document.createElement('div');
        inhalt.className = 'flaeche-inhalt';
        const widget = window.PultWidgets && window.PultWidgets[f.typ];
        if (widget) {
            if (!bloecke[f.id]) bloecke[f.id] = widget.standard();
            widget.erstelle(inhalt, bloecke[f.id], (neu) => {
                bloecke[f.id] = neu;
                planeBlockSpeichern(f.id, f.typ);
            }, { id: f.id, csrf });
        } else {
            inhalt.textContent = 'Leere Fläche';   // alter/unbekannter Typ
        }

        // Größen-Anfasser
        const griff = document.createElement('div');
        griff.className = 'flaeche-resize';
        griff.setAttribute('aria-hidden', 'true');

        el.append(titel, inhalt, griff);
        board.appendChild(el);

        // Interaktion
        el.addEventListener('pointerdown', () => nachVorn(f, el));
        el.addEventListener('focus', () => aktivMarkieren(el));
        el.addEventListener('keydown', (ev) => tastatur(ev, f, el, text));
        ziehbar(titel, el, f);
        groessenbar(griff, el, f);
        btnZu.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            if (!(await window.pultConfirm('Diese Fläche schließen? Der Inhalt geht verloren.'))) return;
            schliesse(f, el);
            fokusZiel()?.focus();
        });
        btnKlapp.addEventListener('click', (ev) => { ev.stopPropagation(); klappe(f, el, btnKlapp); });
        titel.addEventListener('dblclick', () => { if (!layout.gesperrt) umbenennen(f, el, text); });

        return el;
    }

    /* ---------------------------------------------------------
       Tastatur-Bedienung der fokussierten Fläche
       Pfeile: bewegen · Shift+Pfeile: Größe · Alt: feiner Schritt
       Enter: umbenennen · Entf: schließen
       --------------------------------------------------------- */

    function tastatur(ev, f, el, textEl) {
        if (ev.target !== el) return;          // nur wenn die Fläche selbst den Fokus hat
        const pfeile = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
        const d = ev.altKey ? 1 : 10;

        // Festgesetzt: Bewegen, Größe, Umbenennen und Schließen per Tastatur gesperrt.
        if (layout.gesperrt && (pfeile.includes(ev.key) || ev.key === 'Enter' || ev.key === 'Delete')) return;
        // In Raster/Handy sind Bewegen/Größe gesperrt – Umbenennen/Schließen bleiben.
        if (pfeile.includes(ev.key) && istRaster()) return;

        // Im Clips-Modus die Clips-Geometrie verändern, sonst die Frei-Geometrie der Fläche.
        const g = geoVon(f);
        const clips = clipsModus();
        if (ev.shiftKey && pfeile.includes(ev.key)) {
            if (ev.key === 'ArrowLeft')  g.b = Math.max(120, g.b - d);
            if (ev.key === 'ArrowRight') g.b = g.b + d;
            if (ev.key === 'ArrowUp')    g.h = Math.max(60, g.h - d);
            if (ev.key === 'ArrowDown')  g.h = g.h + d;
            if (clips) clipsGroesseEinpassen(g, f.id);   // ohne Überlappung
            el.style.width  = g.b + 'px';
            el.style.height = g.h + 'px';
            ansage('Größe ' + g.b + ' mal ' + g.h + ' Pixel');
            boardAnpassen();
            if (clips) trennerAktualisieren();
        } else if (pfeile.includes(ev.key)) {
            if (ev.key === 'ArrowLeft')  g.x = Math.max(0, g.x - d);
            if (ev.key === 'ArrowRight') g.x = Math.min(board.clientWidth  - 40, g.x + d);
            if (ev.key === 'ArrowUp')    g.y = Math.max(0, g.y - d);
            if (ev.key === 'ArrowDown')  g.y = Math.min(20000, g.y + d);   // nach unten frei
            if (clips) { const s = freieStelle(g.x, g.y, g.b, g.h, f.id); g.x = s.x; g.y = s.y; }
            el.style.left = g.x + 'px';
            el.style.top  = g.y + 'px';
            ansage('Position ' + g.x + ', ' + g.y);
            boardAnpassen();
            if (clips) trennerAktualisieren();
        } else if (ev.key === 'Enter') {
            ev.preventDefault();
            umbenennen(f, el, textEl);
            return;
        } else if (ev.key === 'Delete') {
            ev.preventDefault();
            window.pultConfirm('Diese Fläche schließen? Der Inhalt geht verloren.').then((ja) => {
                if (!ja) return;
                schliesse(f, el);
                (obersteFlaecheEl() || fokusZiel())?.focus();
            });
            return;
        } else {
            return;                            // Taste nicht behandelt → normal weiterreichen
        }
        ev.preventDefault();
        planeSpeichern();
    }

    /* ---------------------------------------------------------
       Ziehen an der Titelleiste
       --------------------------------------------------------- */

    function ziehbar(griffEl, el, f) {
        let startX, startY, ox, oy, startScroll = 0, zieht = false, g = f;

        // Verschiebung berechnen (scroll-bewusst) und anwenden; Board bei Bedarf wachsen lassen.
        function anwenden(ev) {
            let nx = ox + (ev.clientX - startX);
            // Board-Scroll seit Drag-Beginn mitrechnen → man kann beim Scrollen weiterziehen
            let ny = oy + (ev.clientY - startY) + (board.scrollTop - startScroll);
            nx = Math.max(0, Math.min(nx, board.clientWidth - 40));
            ny = Math.max(0, Math.min(ny, 20000));        // nur nach unten praktisch unbegrenzt
            g.x = Math.round(nx); g.y = Math.round(ny);
            el.style.left = g.x + 'px';
            el.style.top  = g.y + 'px';
            // Scroll-Höhe sofort mitwachsen lassen, damit man der Fläche nach unten folgen kann
            const noetig = g.y + g.h + 96;
            if ((parseInt(boardSpacer.style.height, 10) || 0) < noetig) {
                boardSpacer.style.height = noetig + 'px';
            }
        }

        griffEl.addEventListener('pointerdown', (ev) => {
            if (istRaster() || layout.gesperrt) return;            // Raster/Handy/festgesetzt → kein Ziehen
            if (ev.target.closest('.flaeche-knopf')) return;       // Buttons nicht als Drag
            if (ev.button !== undefined && ev.button !== 0) return; // nur linke Maustaste
            zieht = true;
            g = geoVon(f);
            startX = ev.clientX; startY = ev.clientY;
            ox = g.x; oy = g.y;
            startScroll = board.scrollTop;
            griffEl.setPointerCapture(ev.pointerId);
            document.body.classList.add('zieht');
        });

        griffEl.addEventListener('pointermove', (ev) => {
            if (!zieht) return;
            anwenden(ev);
            // Auto-Scroll: nahe am unteren Board-Rand mitscrollen, damit man beliebig
            // weit nach unten ziehen/stapeln kann, ohne die Maus zu verlieren.
            const r = board.getBoundingClientRect();
            if (ev.clientY > r.bottom - 48) {
                board.scrollTop += 14;
                anwenden(ev);
            } else if (ev.clientY < r.top + 48 && board.scrollTop > 0) {
                board.scrollTop -= 14;
                anwenden(ev);
            }
        });

        const ende = (ev) => {
            if (!zieht) return;
            zieht = false;
            document.body.classList.remove('zieht');
            try { griffEl.releasePointerCapture(ev.pointerId); } catch (e) {}
            if (clipsModus()) {                       // magnetisch einrasten, ohne Überlappung
                const s = freieStelle(g.x, g.y, g.b, g.h, f.id);
                g.x = s.x; g.y = s.y;
                el.style.left = g.x + 'px'; el.style.top = g.y + 'px';
            }
            boardAnpassen();
            planeSpeichern();
            trennerAktualisieren();
        };
        griffEl.addEventListener('pointerup', ende);
        griffEl.addEventListener('pointercancel', ende);
    }

    /* ---------------------------------------------------------
       Größe ändern (Anfasser unten rechts)
       --------------------------------------------------------- */

    function groessenbar(griffEl, el, f) {
        let startX, startY, ob, oh, aktiv = false, g = f;

        griffEl.addEventListener('pointerdown', (ev) => {
            if (istRaster() || layout.gesperrt) return;  // Raster/Handy/festgesetzt → keine Größenänderung
            ev.stopPropagation();
            aktiv = true;
            g = geoVon(f);
            startX = ev.clientX; startY = ev.clientY;
            ob = g.b; oh = g.h;
            griffEl.setPointerCapture(ev.pointerId);
            document.body.classList.add('zieht');
        });

        griffEl.addEventListener('pointermove', (ev) => {
            if (!aktiv) return;
            g.b = Math.max(120, Math.round(ob + (ev.clientX - startX)));
            g.h = Math.max(60,  Math.round(oh + (ev.clientY - startY)));
            el.style.width  = g.b + 'px';
            el.style.height = g.h + 'px';
        });

        const ende = (ev) => {
            if (!aktiv) return;
            aktiv = false;
            document.body.classList.remove('zieht');
            try { griffEl.releasePointerCapture(ev.pointerId); } catch (e) {}
            if (clipsModus()) {                       // an Raster einrasten + ohne Überlappung
                g.b = Math.max(120, snap(g.b)); g.h = Math.max(60, snap(g.h));
                clipsGroesseEinpassen(g, f.id);
                el.style.width = g.b + 'px'; el.style.height = g.h + 'px';
            }
            boardAnpassen();
            planeSpeichern();
            trennerAktualisieren();
        };
        griffEl.addEventListener('pointerup', ende);
        griffEl.addEventListener('pointercancel', ende);
    }

    /* ---------------------------------------------------------
       Schließen / Einklappen / Umbenennen
       --------------------------------------------------------- */

    function schliesse(f, el) {
        layout.flaechen = layout.flaechen.filter(x => x.id !== f.id);
        el.remove();
        clearTimeout(blockTimers[f.id]);
        delete blockTimers[f.id];
        delete bloecke[f.id];
        loescheBlock(f.id);
        delete layout.clips[f.id];
        hinweisPruefen();
        planeSpeichern();
        trennerAktualisieren();
    }

    function klappe(f, el, btn) {
        f.eingeklappt = !f.eingeklappt;
        el.classList.toggle('eingeklappt', f.eingeklappt);
        btn.setAttribute('aria-label', f.eingeklappt ? 'Ausklappen' : 'Einklappen');
        btn.setAttribute('aria-expanded', String(!f.eingeklappt));
        btn.textContent = f.eingeklappt ? '+' : '–';
        if (!f.eingeklappt) el.style.height = geoVon(f).h + 'px';
        planeSpeichern();
    }

    function umbenennen(f, el, textEl) {
        const eingabe = document.createElement('input');
        eingabe.type = 'text';
        eingabe.className = 'flaeche-titel-eingabe';
        eingabe.setAttribute('aria-label', 'Flächen-Titel');
        eingabe.value = f.titel;
        eingabe.maxLength = 200;
        textEl.replaceWith(eingabe);
        eingabe.focus();
        eingabe.select();

        let beendet = false;
        const fertig = (zurueckZurFlaeche) => {
            if (beendet) return;               // nur einmal abschließen (Enter + Blur)
            beendet = true;
            f.titel = eingabe.value.trim() || 'Fläche';
            textEl.textContent = f.titel;          // textContent → XSS-sicher
            el.setAttribute('aria-label', f.titel);
            eingabe.replaceWith(textEl);
            planeSpeichern();
            if (zurueckZurFlaeche) el.focus();     // nach Tastatur-Abschluss Fokus zurück
        };

        // Klick woanders hin: abschließen, aber Fokus nicht zurückreißen
        eingabe.addEventListener('blur', () => fertig(false));
        eingabe.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter')  { ev.preventDefault(); fertig(true); }
            if (ev.key === 'Escape') { eingabe.value = f.titel; fertig(true); }
        });
        // Klick im Feld soll nicht das Ziehen auslösen
        eingabe.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    }

    /* ---------------------------------------------------------
       Neue Fläche
       --------------------------------------------------------- */

    function neueFlaeche(typ) {
        if (!TYP_INFO[typ]) return;                 // nur bekannte Typen
        const versatz = (layout.flaechen.length % 8) * 28;
        const wunschB = TYP_INFO[typ].b || 280;
        const wunschH = TYP_INFO[typ].h || 200;
        const b = Math.min(wunschB, Math.max(120, board.clientWidth - 20));
        const h = Math.min(wunschH, Math.max(60, board.clientHeight - 20));
        const f = {
            id: neueId(),
            typ: typ,
            titel: TYP_INFO[typ].titel,
            x: Math.max(0, Math.min(60 + versatz, board.clientWidth  - b - 10)),
            y: Math.max(0, Math.min(60 + versatz, board.clientHeight - h - 10)),
            b: b,
            h: h,
            z: layout.naechsteZ++,
            eingeklappt: false
        };
        layout.flaechen.push(f);
        aktivMarkieren(rendere(f));
        hinweisPruefen();
        boardAnpassen();
        planeSpeichern();
        trennerAktualisieren();
    }

    /* ---------------------------------------------------------
       Abmelden
       --------------------------------------------------------- */

    async function logout() {
        try {
            await api('logout', { method: 'POST', headers: { 'X-Pult-Csrf': csrf } });
        } finally {
            location.href = 'index.php';
        }
    }

    /* ---------------------------------------------------------
       Start
       --------------------------------------------------------- */

    /** Layout + Inhalte aus einer Server-Antwort übernehmen und alle Flächen neu rendern. */
    function uebernehmeLayout(data) {
        const roh = Array.isArray(data.layout.flaechen) ? data.layout.flaechen : [];
        layout.flaechen  = roh.map(normalisiere).filter(f => f.id !== '');
        layout.naechsteZ = Number(data.layout.naechsteZ) || 1;
        layout.ansicht   = ['frei', 'raster', 'clips'].includes(data.layout.ansicht) ? data.layout.ansicht : 'frei';
        bloecke = (data.bloecke && typeof data.bloecke === 'object') ? data.bloecke : {};

        // Clips-Geometrie übernehmen (nur zu existierenden Flächen, geprüfte Zahlen)
        const ids = new Set(layout.flaechen.map(f => f.id));
        layout.clips = {};
        const rc = (data.layout.clips && typeof data.layout.clips === 'object') ? data.layout.clips : {};
        for (const id in rc) {
            if (!ids.has(id) || !rc[id]) continue;
            const g = rc[id];
            layout.clips[id] = {
                x: Math.max(0, Number(g.x) || 0), y: Math.max(0, Number(g.y) || 0),
                b: Math.max(120, Number(g.b) || 280), h: Math.max(60, Number(g.h) || 200)
            };
        }
        layout.baenke = Array.isArray(data.layout.baenke) ? data.layout.baenke.slice(0, 3) : [null, null, null];
        while (layout.baenke.length < 3) layout.baenke.push(null);
        layout.gesperrt = !!data.layout.gesperrt;

        // naechsteZ über die höchste vorhandene Z-Ebene heben
        const maxZ = layout.flaechen.reduce((m, f) => Math.max(m, f.z || 0), 0);
        if (layout.naechsteZ <= maxZ) layout.naechsteZ = maxZ + 1;

        board.querySelectorAll('.flaeche').forEach((el) => el.remove());   // alte Flächen weg
        if (layout.ansicht === 'clips') clipsAlleInit();
        layout.flaechen.forEach(rendere);
        hinweisPruefen();
        ansichtAnwenden();
        bankStatus();
    }

    /** Signatur der Layout-Struktur (für den Sync-Vergleich) — inkl. Modus, Clips-Geometrie, Sperre.
     *  clips/gesperrt werden bewusst übergeben, damit lokaler und ferner Stand korrekt verglichen werden. */
    function layoutSignatur(fl, ansicht, clips, gesperrt) {
        return JSON.stringify({
            a: ansicht,
            f: (fl || []).map((f) => [f.id, f.typ, f.x, f.y, f.b, f.h, f.titel, f.eingeklappt ? 1 : 0]),
            c: clips || {},
            g: gesperrt ? 1 : 0
        });
    }

    /** Den Inhalt EINER Fläche austauschen (frischer Container → alte Timer räumen sich auf). */
    function blockNeuLaden(id, neuerInhalt) {
        const el = board.querySelector('.flaeche[data-id="' + id + '"]');
        if (!el) return;
        const f = layout.flaechen.find((x) => x.id === id);
        const widget = window.PultWidgets && f && window.PultWidgets[f.typ];
        const alt = el.querySelector('.flaeche-inhalt');
        if (!widget || !alt) return;
        // Karte synchronisiert sich selbst (eigener Poll, ohne Karten-Reinit) — ein
        // kompletter Neuaufbau würde den Ausschnitt zurücksetzen.
        if (f.typ === 'karte') { bloecke[id] = neuerInhalt; return; }
        const neu = document.createElement('div');
        neu.className = 'flaeche-inhalt';
        bloecke[id] = neuerInhalt;
        widget.erstelle(neu, bloecke[id], (n) => {
            bloecke[id] = n;
            planeBlockSpeichern(id, f.typ);
        }, { id, csrf });
        alt.replaceWith(neu);
    }

    /**
     * Live-Sync: günstige Zeitstempel-Abfrage; bei Änderung Vollzustand holen und
     * NUR Geändertes übernehmen (Vergleich gegen den lokalen Stand → eigene
     * Änderungen lösen kein Neu-Rendern aus, fremde schon).
     */
    async function syncPoll() {
        if (document.hidden || zeigerUnten) return;
        let z;
        try {
            const r = await api('zustand');
            if (r.status === 401) { location.href = 'index.php'; return; }
            if (!r.ok) return;
            z = await r.json();
        } catch (e) { return; }
        if (!z || !z.ok) return;

        const mtimes = JSON.stringify({ l: z.layout, b: z.bloecke });
        if (letzteMtimes === null) { letzteMtimes = mtimes; return; }
        if (mtimes === letzteMtimes) return;                       // nichts geändert

        // Solange ein Popup offen ist, den Hintergrund nicht antasten (später erneut)
        if (document.querySelector('.pult-modal-overlay')) return;

        let voll;
        try {
            const r = await api('layout_get');
            if (r.status === 401) { location.href = 'index.php'; return; }
            voll = await r.json();
            if (!voll.ok || !voll.layout) return;
        } catch (e) { return; }

        const fernFl = (Array.isArray(voll.layout.flaechen) ? voll.layout.flaechen : [])
            .map(normalisiere).filter((f) => f.id !== '');
        const fernAnsicht = ['frei', 'raster', 'clips'].includes(voll.layout.ansicht) ? voll.layout.ansicht : 'frei';
        const fernClips = (voll.layout.clips && typeof voll.layout.clips === 'object') ? voll.layout.clips : {};
        const fernGesperrt = !!voll.layout.gesperrt;

        // Struktur/Position/Titel anders → alles neu. ABER nicht, solange der Fokus
        // in IRGENDEINER Fläche liegt (Titelleiste, Knöpfe, Umbenennen, Inhalt) →
        // sonst Fokus-/Eingabeverlust. letzteMtimes bleibt → nächste Runde versucht erneut.
        if (layoutSignatur(fernFl, fernAnsicht, fernClips, fernGesperrt)
            !== layoutSignatur(layout.flaechen, layout.ansicht, layout.clips, layout.gesperrt)) {
            const aktiv = document.activeElement;
            if (aktiv && aktiv.closest && aktiv.closest('.flaeche')) return;
            uebernehmeLayout(voll);
            ansage('Dashboard aktualisiert');
            letzteMtimes = mtimes;
            return;
        }

        // Struktur identisch → nur geänderte Block-Inhalte nachladen
        const fernB = (voll.bloecke && typeof voll.bloecke === 'object') ? voll.bloecke : {};
        let alleUebernommen = true;
        let etwasGeaendert = false;
        Object.keys(fernB).forEach((id) => {
            if (JSON.stringify(fernB[id]) === JSON.stringify(bloecke[id])) return;   // unverändert / eigen
            const el = board.querySelector('.flaeche[data-id="' + id + '"]');
            if (el && el.contains(document.activeElement)) { alleUebernommen = false; return; }   // wird bearbeitet
            blockNeuLaden(id, fernB[id]);
            etwasGeaendert = true;
        });
        if (etwasGeaendert) ansage('Inhalt aktualisiert');
        if (alleUebernommen) letzteMtimes = mtimes;   // sonst nächste Runde erneut versuchen
    }

    async function init() {
        try {
            const res = await api('layout_get');
            if (res.status === 401) { location.href = 'index.php'; return; }
            const data = await res.json();
            if (data.ok && data.layout) {
                uebernehmeLayout(data);
            } else {
                ansichtAnwenden();
            }
        } catch (e) {
            ansichtAnwenden();   // bei Fehler bleibt der Leerzustand stehen
        }
        mobilPruefen();
        syncTimer = setInterval(syncPoll, 25000);   // Live-Sync starten
    }

    // Runder Hinzufügen-Knopf (FAB) — fächert das Flächen-Menü auf
    const fab = document.getElementById('fab');
    const fabBtn = document.getElementById('fab-btn');
    function fabSetzen(offen) {
        if (!fab) return;
        const war = fab.classList.contains('fab-offen');
        fab.classList.toggle('fab-offen', offen);
        if (fabBtn) fabBtn.setAttribute('aria-expanded', offen ? 'true' : 'false');
        if (offen) {
            const erstes = fab.querySelector('.fab-item');
            if (erstes) erstes.focus();
        }
        if (war !== offen) ansage(offen ? 'Menü geöffnet' : 'Menü geschlossen');
    }
    fabBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        fabSetzen(!fab.classList.contains('fab-offen'));
    });
    document.addEventListener('click', (e) => {
        if (fab && fab.classList.contains('fab-offen') && !fab.contains(e.target)) fabSetzen(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && fab && fab.classList.contains('fab-offen')) { fabSetzen(false); fabBtn?.focus(); }
    });

    document.querySelectorAll('#werkzeuge .tb-btn[data-typ]').forEach((btn) => {
        btn.addEventListener('click', () => { neueFlaeche(btn.dataset.typ); fabSetzen(false); });
    });
    document.getElementById('btn-logout')?.addEventListener('click', logout);
    ansichtWahl?.addEventListener('change', () => ansichtSetzen(ansichtWahl.value));
    btnSperre?.addEventListener('click', sperreUmschalten);

    // Anordnungsbänke: Klick = abrufen; im Speichern-Modus = belegen.
    const bankSpeichernBtn = document.getElementById('bank-speichern');
    function speichernModusSetzen(an) {
        bankSpeichernModus = an;
        if (bankSpeichernBtn) {
            bankSpeichernBtn.classList.toggle('aktiv', an);
            bankSpeichernBtn.setAttribute('aria-pressed', an ? 'true' : 'false');
        }
        document.querySelectorAll('.bank-btn').forEach((b) => b.classList.toggle('speicherziel', an));
    }
    bankSpeichernBtn?.addEventListener('click', () => speichernModusSetzen(!bankSpeichernModus));
    document.querySelectorAll('.bank-btn').forEach((b) => {
        b.addEventListener('click', () => {
            const i = Number(b.dataset.bank);
            if (bankSpeichernModus) { bankSpeichern(i); speichernModusSetzen(false); }
            else bankAbrufen(i);
        });
    });
    // Sync pausiert, solange gezogen / Größe geändert wird (Zeiger gedrückt)
    board.addEventListener('pointerdown', () => { zeigerUnten = true; });
    document.addEventListener('pointerup', () => { zeigerUnten = false; });
    // Wechsel zwischen Handy/Desktop live berücksichtigen: Layout-Klasse + Knopf neu setzen
    kompaktAbfrage.addEventListener('change', () => { ansichtAnwenden(); mobilPruefen(); });
    init();
})();
