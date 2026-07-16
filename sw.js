/* Funkfeld — Service Worker (PWA, Stufe 6).
   Strategie, bewusst schlank:
   - Statische Assets (css/js/woff2/svg/png): cache-first mit Laufzeit-Befüllung —
     KEINE lange Precache-Liste, die mit views/app.php driften könnte.
   - api.php / alles mit ?action= / *.php: IMMER Netz, wird NIE gecacht
     (CSRF-Token, private Inhalte, Live-Sync — gehören nicht in den Cache).
   - Seiten-Navigationen: erst Netz, offline ein ehrlicher Hinweis (offline.html).
   Versionierung: registriert wird sw.js?v=<Cache-Buster der Assets> — ändert sich
   eine Asset-Datei, ist die SW-URL neu, der Browser installiert frisch und
   'activate' räumt alle alten Versions-Caches weg. */
'use strict';

const VER = new URL(self.location.href).searchParams.get('v') || '0';
const CACHE = 'funkfeld-' + VER;

// Kleine Kern-Liste: nur was die Offline-Hinweisseite selbst braucht.
const KERN = [
    'offline.html',
    'assets/css/pult.css?v=' + VER,
    'assets/img/favicon.svg',
];

// Nur diese Dateitypen dürfen in den Cache — Daten (JSON-Antworten, PHP) nie.
const STATISCH = /\.(css|js|woff2|svg|png|webmanifest)(\?|$)/;

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE)
            .then((c) => c.addAll(KERN))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k.startsWith('funkfeld-') && k !== CACHE)
                    .map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;                      // Schreibendes immer ans Netz
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;       // Fremdes (Kartenkacheln) nicht anfassen

    // API und PHP-Seiten: nie cachen. Navigationen bekommen offline einen Hinweis.
    if (url.pathname.endsWith('.php') || url.searchParams.has('action') || req.mode === 'navigate') {
        if (req.mode === 'navigate') {
            e.respondWith(fetch(req).catch(() => caches.match('offline.html')));
        }
        return;                                             // sonst: Standard-Netzverhalten
    }

    // Statische Assets: cache-first, bei Erstabruf in den Versions-Cache legen.
    // ignoreSearch: der ?v=-Cache-Buster darf den Treffer nicht verhindern (offline.html
    // verweist ohne ?v=) — gefahrlos, weil jeder Versions-Cache nur EINEN Asset-Stand hält.
    if (STATISCH.test(url.pathname + url.search)) {
        e.respondWith(
            caches.match(req, { ignoreSearch: true }).then((tref) => tref || fetch(req).then((antwort) => {
                if (antwort && antwort.ok) {
                    const kopie = antwort.clone();
                    caches.open(CACHE).then((c) => c.put(req, kopie));
                }
                return antwort;
            }))
        );
    }
});
