// Wetterkarte des Nachrichten-Hefts – für die ganze Welt.
//
// Kartenbild: OpenFreeMap (Daten von OpenStreetMap), gezeichnet mit MapLibre.
// Wetter: Open-Meteo. Die Karte fragt für den sichtbaren Ausschnitt ein grobes
// Raster von Punkten ab (ein Punkt alle paar Grad) und malt dazwischen weich
// aus. Beim Reinzoomen wird das Raster feiner. Schon geladene Punkte bleiben
// eine halbe Stunde im Speicher, damit nicht jedes Verschieben neu fragt.
// Regenradar: RainViewer (nur die letzten 2 Stunden, nur für private und
// Bildungszwecke erlaubt).

const ML = "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.0/dist/maplibre-gl";
const STIL_HELL = "https://tiles.openfreemap.org/styles/positron";
const STIL_DUNKEL = "https://tiles.openfreemap.org/styles/dark";
const RADAR_LISTE = "https://api.rainviewer.com/public/weather-maps.json";
const STUNDEN = 72;

// ---------------------------------------------------------- reine Helfer (testbar)

// Rasterabstand in Grad: so, dass ungefähr 8 bis 10 Spalten sichtbar sind.
export function rasterAbstand(lonSpanne) {
  const stufen = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30];
  return stufen.find(s => lonSpanne / s <= 9) || 30;
}

// Alle Rasterpunkte für einen Ausschnitt (mit einem Rand), höchstens maxPunkte.
export function rasterPunkte(b, maxPunkte = 140) {
  let s = rasterAbstand(Math.min(360, b.ost - b.west));
  for (;;) {
    const lat0 = Math.max(-80, Math.floor(b.sued / s) * s - s);
    const lat1 = Math.min(80, Math.ceil(b.nord / s) * s + s);
    const lon0 = Math.floor(b.west / s) * s - s;
    const lon1 = Math.ceil(b.ost / s) * s + s;
    const n = (Math.round((lat1 - lat0) / s) + 1) * (Math.round((lon1 - lon0) / s) + 1);
    if (n <= maxPunkte || s >= 30) {
      const zeilen = Math.round((lat1 - lat0) / s) + 1, spalten = Math.round((lon1 - lon0) / s) + 1;
      const punkte = [];
      for (let r = 0; r < zeilen; r++)
        for (let c = 0; c < spalten; c++) {
          const la = lat0 + r * s, lo = lon0 + c * s;
          punkte.push({ lat: runde(la), lon: runde(lo), schluessel: schluessel(la, lo) });
        }
      return { s, lat0: runde(lat0), lon0: runde(lon0), zeilen, spalten, punkte };
    }
    s = [0.1, 0.25, 0.5, 1, 2, 2.5, 5, 10, 15, 20, 30].find(x => x > s) || 30;
  }
}
const runde = x => Math.round(x * 1000) / 1000;
// Längengrad auf -180..180 bringen, damit dieselbe Stelle nur einmal geladen wird.
export const lonNormal = lo => ((((lo + 180) % 360) + 360) % 360) - 180;
export const schluessel = (la, lo) => runde(la) + "," + runde(lonNormal(lo));

// Wert zwischen vier Eckpunkten weich ausrechnen (bilinear). Fehlt eine Ecke: null.
export function zwischen(a, b, c, d, fx, fy) {
  if ([a, b, c, d].some(v => v == null || !Number.isFinite(v))) return null;
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// Farbskalen: [Wert, r, g, b, deckkraft]
export const SKALEN = {
  temp:  [[-30, 120, 60, 200, .55], [-15, 60, 90, 230, .55], [0, 110, 190, 240, .5], [10, 80, 190, 120, .45],
          [20, 245, 215, 70, .5], [30, 245, 140, 50, .55], [40, 210, 40, 40, .6]],
  regen: [[0, 80, 160, 255, 0], [0.1, 110, 180, 255, .35], [1, 50, 130, 245, .55], [4, 30, 80, 210, .7], [10, 110, 40, 190, .8]],
  wolken:[[0, 120, 130, 150, 0], [30, 120, 130, 150, .12], [70, 110, 120, 140, .4], [100, 90, 100, 120, .62]],
  wind:  [[0, 120, 200, 160, .1], [15, 110, 200, 120, .3], [35, 240, 210, 60, .45], [60, 245, 130, 40, .55], [90, 210, 40, 60, .65]]
};
export function farbe(skala, v) {
  const s = SKALEN[skala];
  if (v == null) return null;
  if (v <= s[0][0]) return s[0].slice(1);
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i][0]) {
      const a = s[i - 1], b = s[i], f = (v - a[0]) / (b[0] - a[0]);
      return [1, 2, 3, 4].map(k => a[k] + (b[k] - a[k]) * f);
    }
  }
  return s[s.length - 1].slice(1);
}

// Open-Meteo liefert bei einem Ort ein Objekt, bei mehreren eine Liste.
export function antwortZerlegen(d, punkte) {
  const liste = Array.isArray(d) ? d : [d];
  const aus = {};
  liste.forEach((x, i) => {
    const p = punkte[i], h = x && x.hourly;
    if (!p || !h || !h.time) return;
    aus[p.schluessel] = { t0: h.time[0], temp: h.temperature_2m, regen: h.precipitation,
      wolken: h.cloud_cover, wind: h.wind_speed_10m, richtung: h.wind_direction_10m };
  });
  return aus;
}

// Wert eines Punkts zu einer Uhrzeit (Unix-Sekunden, volle Stunde).
export function wertZu(eintrag, ebene, zeit) {
  if (!eintrag) return null;
  const i = Math.round((zeit - eintrag.t0) / 3600);
  const reihe = eintrag[ebene];
  if (!reihe || i < 0 || i >= reihe.length) return null;
  return reihe[i];
}

// ---------------------------------------------------------- die Karte

const EBENEN = [
  { id: "temp", sym: "🌡", name: "Temperatur", einheit: "°" },
  { id: "regen", sym: "🌧", name: "Regen", einheit: " mm" },
  { id: "wolken", sym: "☁", name: "Wolken", einheit: " %" },
  { id: "wind", sym: "💨", name: "Wind", einheit: " km/h" },
  { id: "radar", sym: "📡", name: "Radar" }
];

let mlLaden = null;
function maplibreLaden() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mlLaden) return mlLaden;
  mlLaden = new Promise((ok, nein) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = ML + ".css";
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = ML + ".js"; js.async = true;
    js.onload = () => window.maplibregl ? ok(window.maplibregl) : nein(new Error("Karte nicht geladen"));
    js.onerror = () => { mlLaden = null; nein(new Error("Die Karte konnte nicht geladen werden. Hast du Internet?")); };
    document.head.appendChild(js);
  });
  return mlLaden;
}

const SPEICHER = new Map();          // schluessel -> { zeit, daten }
const HALBE_STUNDE = 30 * 60 * 1000;

function dunkel() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

export async function wetterKarte(box, h) {
  const esc = h.esc;
  box.innerHTML = `
    <div class="wkarte">
      <div class="wkk-ebenen" role="radiogroup" aria-label="Was die Karte zeigt">
        ${EBENEN.map((e, i) => `<button type="button" role="radio" aria-checked="${i === 0}" data-e="${e.id}">
          <span aria-hidden="true">${e.sym}</span>${e.name}</button>`).join("")}
      </div>
      <div class="wkk-buehne">
        <div class="wkk-map" id="wkkMap"></div>
        <canvas class="wkk-farbe" id="wkkFarbe" aria-hidden="true"></canvas>
        <p class="wkk-hinweis" id="wkkHinweis" hidden></p>
      </div>
      <div class="wkk-zeit">
        <button type="button" class="wkk-play" id="wkkPlay" aria-label="Abspielen">▶</button>
        <input type="range" id="wkkRegler" min="0" max="${STUNDEN - 1}" value="0" aria-label="Zeitpunkt">
        <output id="wkkWann">Jetzt</output>
      </div>
      <div class="wkk-legende" id="wkkLegende"></div>
      <p class="w-fuss">Tipp auf die Karte für die Vorhersage an dieser Stelle. Wetter: Open-Meteo ·
        Karte: OpenFreeMap, © OpenStreetMap-Mitwirkende · Radar: RainViewer (nur letzte 2 Stunden, für private und Bildungszwecke).</p>
    </div>`;

  const hinweis = t => { const el = box.querySelector("#wkkHinweis"); el.hidden = !t; el.textContent = t || ""; };
  let ml;
  try { ml = await maplibreLaden(); }
  catch (e) { hinweis(e.message); return; }

  const start = h.start || { lat: 50, lon: 10, zoom: 3 };
  const map = new ml.Map({
    container: box.querySelector("#wkkMap"),
    style: dunkel() ? STIL_DUNKEL : STIL_HELL,
    center: [start.lon, start.lat], zoom: start.zoom,
    minZoom: 1, maxZoom: 10, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: { compact: true, customAttribution: "Wetter: Open-Meteo · Radar: RainViewer" }
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
  // Gibt es den dunklen Stil nicht (mehr), nehmen wir den hellen.
  let stilFehler = false;
  map.on("error", e => {
    if (!stilFehler && e && e.error && /style|404|Failed to fetch/i.test(String(e.error.message || e.error)) && !map.isStyleLoaded()) {
      stilFehler = true; map.setStyle(STIL_HELL);
    }
  });

  const leinwand = box.querySelector("#wkkFarbe");
  // Die Farbschicht gehört zwischen Kartenbild und Info-Fenster, nicht darüber.
  map.getCanvasContainer().appendChild(leinwand);
  const regler = box.querySelector("#wkkRegler");
  const wann = box.querySelector("#wkkWann");
  let ebene = "temp", raster = null, laeuft = null;
  const jetztStunde = () => Math.floor(Date.now() / 3600000) * 3600;
  const zeit = () => jetztStunde() + (+regler.value) * 3600;

  function zeitText() {
    const v = +regler.value;
    if (ebene === "radar") return "";
    if (v === 0) return "Jetzt";
    const d = new Date(zeit() * 1000);
    const tag = new Intl.DateTimeFormat("de-DE", { weekday: "short" }).format(d);
    const uhr = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(d);
    return `${tag} ${uhr}`;
  }

  // ---- Laden der Rasterpunkte
  let ladeNr = 0, ladeTimer = null;
  async function laden() {
    if (ebene === "radar") return;
    const b = map.getBounds();
    raster = rasterPunkte({ west: b.getWest(), ost: b.getEast(), sued: b.getSouth(), nord: b.getNorth() });
    const fehlt = raster.punkte.filter(p => { const s = SPEICHER.get(p.schluessel); return !s || Date.now() - s.zeit > HALBE_STUNDE; });
    zeichnen();
    if (!fehlt.length) return;
    const nr = ++ladeNr;
    // doppelte Schlüssel (gleiche Stelle links und rechts der Datumsgrenze) nur einmal
    const einmal = [...new Map(fehlt.map(p => [p.schluessel, p])).values()];
    try {
      for (let i = 0; i < einmal.length; i += 100) {
        const teil = einmal.slice(i, i + 100);
        const url = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
          latitude: teil.map(p => p.lat).join(","),
          longitude: teil.map(p => runde(lonNormal(p.lon))).join(","),
          hourly: "temperature_2m,precipitation,cloud_cover,wind_speed_10m,wind_direction_10m",
          forecast_days: "3", timezone: "GMT", timeformat: "unixtime"
        });
        const r = await fetch(url);
        if (r.status === 429) throw new Error("Der Wetterdienst bittet um eine kurze Pause. Gleich noch mal versuchen.");
        if (!r.ok) throw new Error("Der Wetterdienst antwortet nicht (" + r.status + ").");
        const neu = antwortZerlegen(await r.json(), teil);
        for (const k in neu) SPEICHER.set(k, { zeit: Date.now(), daten: neu[k] });
        if (nr === ladeNr) zeichnen();
      }
      hinweis("");
    } catch (e) { if (nr === ladeNr) hinweis(e.message || "Wetter konnte nicht geladen werden."); }
  }
  const spaeterLaden = () => { clearTimeout(ladeTimer); ladeTimer = setTimeout(laden, 350); };

  // ---- Farbfläche malen
  function zeichnen() {
    const rahmen = map.getContainer().getBoundingClientRect();
    if (rahmen.width < 2 || rahmen.height < 2) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    leinwand.width = Math.round(rahmen.width * dpr); leinwand.height = Math.round(rahmen.height * dpr);
    leinwand.style.width = rahmen.width + "px"; leinwand.style.height = rahmen.height + "px";
    const g = leinwand.getContext("2d");
    g.clearRect(0, 0, leinwand.width, leinwand.height);
    if (ebene === "radar" || !raster) return;
    const t = zeit(), s = raster.s;
    // Werte einmal pro Bild als Tabelle holen (Zeile = Breite, Spalte = Länge),
    // statt für jeden Bildpunkt neu im Speicher zu suchen.
    const tab = raster.punkte.map(p => { const e = SPEICHER.get(p.schluessel); return e ? wertZu(e.daten, ebene, t) : null; });
    const wert = (gy, gx) => (gy < 0 || gx < 0 || gy >= raster.zeilen || gx >= raster.spalten) ? null : tab[gy * raster.spalten + gx];

    // grobes Bild (1 Feld = 6 Bildschirmpunkte), danach weich vergrößert
    const F = 6, bw = Math.ceil(rahmen.width / F), bh = Math.ceil(rahmen.height / F);
    const klein = document.createElement("canvas"); klein.width = bw; klein.height = bh;
    const kg = klein.getContext("2d"), bild = kg.createImageData(bw, bh);
    // Ohne Drehung hängt der Längengrad nur von x ab, der Breitengrad nur von y.
    const lons = [], lats = [];
    for (let x = 0; x < bw; x++) lons.push(map.unproject([(x + .5) * F, rahmen.height / 2]).lng);
    for (let y = 0; y < bh; y++) lats.push(map.unproject([rahmen.width / 2, (y + .5) * F]).lat);
    for (let y = 0; y < bh; y++) {
      const la = lats[y], gy = Math.floor((la - raster.lat0) / s), fy = (la - raster.lat0) / s - gy;
      for (let x = 0; x < bw; x++) {
        const lo = lons[x], gx = Math.floor((lo - raster.lon0) / s), fx = (lo - raster.lon0) / s - gx;
        const v = zwischen(wert(gy, gx), wert(gy, gx + 1), wert(gy + 1, gx), wert(gy + 1, gx + 1), fx, fy);
        const f = farbe(ebene, v);
        if (!f) continue;
        const k = (y * bw + x) * 4;
        bild.data[k] = f[0]; bild.data[k + 1] = f[1]; bild.data[k + 2] = f[2]; bild.data[k + 3] = Math.round(f[3] * 255);
      }
    }
    kg.putImageData(bild, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(klein, 0, 0, bw * F * dpr, bh * F * dpr);

    // Zahlen bzw. Windpfeile an den Rasterpunkten – nicht zu dicht
    g.save(); g.scale(dpr, dpr);
    const abstand = 70; const belegt = [];
    g.font = "600 12px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    for (const p of raster.punkte) {
      const e = SPEICHER.get(p.schluessel); if (!e) continue;
      const v = wertZu(e.daten, ebene, t); if (v == null) continue;
      const pt = map.project([p.lon, p.lat]);
      if (pt.x < 10 || pt.y < 10 || pt.x > rahmen.width - 10 || pt.y > rahmen.height - 10) continue;
      if (belegt.some(q => Math.abs(q.x - pt.x) < abstand && Math.abs(q.y - pt.y) < abstand * .6)) continue;
      belegt.push(pt);
      if (ebene === "wind") {
        const r = wertZu(e.daten, "richtung", t); if (r == null) continue;
        g.save(); g.translate(pt.x, pt.y); g.rotate((r + 180) * Math.PI / 180);   // zeigt, wohin der Wind weht
        g.strokeStyle = dunkel() ? "#e6ebf1" : "#1b2533"; g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 9); g.lineTo(0, -9); g.moveTo(-4, -4); g.lineTo(0, -9); g.lineTo(4, -4); g.stroke();
        g.restore();
        continue;
      }
      if (ebene !== "temp") continue;
      const txt = Math.round(v) + "°";
      g.lineWidth = 3; g.strokeStyle = dunkel() ? "rgba(15,21,29,.85)" : "rgba(255,255,255,.9)";
      g.strokeText(txt, pt.x, pt.y);
      g.fillStyle = dunkel() ? "#e6ebf1" : "#1b2533"; g.fillText(txt, pt.x, pt.y);
    }
    g.restore();
  }

  // ---- Regenradar (RainViewer)
  let radar = null, radarBild = 0;
  async function radarAn() {
    try {
      if (!radar) {
        const r = await fetch(RADAR_LISTE);
        if (!r.ok) throw new Error();
        const d = await r.json();
        radar = { host: d.host, bilder: (d.radar && d.radar.past) || [] };
        if (!radar.bilder.length) throw new Error();
      }
      radarBild = radar.bilder.length - 1;
      radarZeigen();
      hinweis("");
    } catch (e) { console.warn("Radar:", e); hinweis("Das Regenradar ist gerade nicht erreichbar."); }
  }
  function radarUrl(i) { return `${radar.host}${radar.bilder[i].path}/256/{z}/{x}/{y}/2/1_1.png`; }
  function radarZeigen() {
    if (!radar || !map.isStyleLoaded()) return;
    const url = radarUrl(radarBild);
    const quelle = map.getSource("radar");
    if (quelle && quelle.setTiles) quelle.setTiles([url]);
    else {
      map.addSource("radar", { type: "raster", tiles: [url], tileSize: 256, maxzoom: 7 });
      map.addLayer({ id: "radar", type: "raster", source: "radar", paint: { "raster-opacity": .75 } });
    }
    map.setLayoutProperty("radar", "visibility", "visible");
    const vor = Math.round((Date.now() / 1000 - radar.bilder[radarBild].time) / 60);
    wann.textContent = vor <= 5 ? "Gerade eben" : `vor ${vor} Min.`;
  }
  function radarAus() { if (map.getLayer("radar")) map.setLayoutProperty("radar", "visibility", "none"); }

  // ---- Legende
  function legende() {
    const el = box.querySelector("#wkkLegende");
    const e = EBENEN.find(x => x.id === ebene);
    if (ebene === "radar") { el.innerHTML = `<span>leicht</span><i style="background:linear-gradient(90deg,#9fd3ff,#2f6fe0,#1b2f8f)"></i><span>stark</span>`; return; }
    const s = SKALEN[ebene];
    const stopps = s.map(x => `rgba(${x[1]},${x[2]},${x[3]},${Math.max(.25, x[4])}) ${((x[0] - s[0][0]) / (s[s.length - 1][0] - s[0][0]) * 100).toFixed(0)}%`).join(",");
    el.innerHTML = `<span>${s[0][0]}${esc(e.einheit)}</span><i style="background:linear-gradient(90deg,${stopps})"></i><span>${s[s.length - 1][0]}${esc(e.einheit)}</span>`;
  }

  // ---- Bedienung
  box.querySelectorAll(".wkk-ebenen button").forEach(b => b.onclick = () => {
    ebene = b.dataset.e;
    box.querySelectorAll(".wkk-ebenen button").forEach(x => x.setAttribute("aria-checked", x === b ? "true" : "false"));
    stop(); hinweis("");
    regler.disabled = ebene === "radar";
    if (ebene === "radar") { radarAn(); }
    else { radarAus(); wann.textContent = zeitText(); laden(); }
    legende(); zeichnen();
  });
  regler.oninput = () => { wann.textContent = zeitText(); zeichnen(); };
  function stop() { if (laeuft) { clearInterval(laeuft); laeuft = null; box.querySelector("#wkkPlay").textContent = "▶"; } }
  box.querySelector("#wkkPlay").onclick = e => {
    if (laeuft) return stop();
    e.currentTarget.textContent = "⏸";
    laeuft = setInterval(() => {
      if (ebene === "radar") { if (!radar) return; radarBild = (radarBild + 1) % radar.bilder.length; radarZeigen(); return; }
      regler.value = (+regler.value + 1) % STUNDEN; regler.oninput();
    }, ebene === "radar" ? 700 : 450);
  };

  map.on("move", zeichnen);
  map.on("moveend", spaeterLaden);
  map.on("resize", zeichnen);
  map.on("load", () => { laden(); legende(); });
  map.on("styledata", () => { if (ebene === "radar") radarZeigen(); });

  // Tippen: Vorhersage für genau diese Stelle
  map.on("click", async e => {
    const lat = runde(e.lngLat.lat), lon = runde(lonNormal(e.lngLat.lng));
    const ort = { name: `Punkt ${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? "N" : "S"} · ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? "O" : "W"}`, teil: "auf der Karte gewählt", lat, lon };
    const pop = new ml.Popup({ closeButton: true, maxWidth: "260px" }).setLngLat(e.lngLat)
      .setHTML(`<div class="wkk-pop"><p class="laden">wird geladen …</p></div>`).addTo(map);
    try {
      const w = await h.eigenesWetter(ort);
      const j = w.jetzt || { grad: w.heute.max, code: w.heute.code };
      pop.setHTML(`<div class="wkk-pop">
        <div class="wkk-pop-kopf">${h.wetterBild(j.code, 40)}<b>${esc(j.grad)}°</b></div>
        <p>${esc(h.wetterWort(j.code))} · H ${esc(w.heute.max)}° T ${esc(w.heute.min)}°${w.heute.regen != null ? ` · Regen ${esc(w.heute.regen)} %` : ""}</p>
        <small>${esc(ort.name)}${w.zone && h.ortszeit ? " · Ortszeit " + esc(h.ortszeit(w.zone)) : ""}</small>
        <button type="button" class="wkk-merken">Als Ort merken</button></div>`);
      const knopf = pop.getElement().querySelector(".wkk-merken");
      if (knopf) knopf.onclick = () => { h.ortMerken(ort); h.wetterOrtSetzen(ort.name); location.hash = "#/wetter"; };
    } catch (err) {
      pop.setHTML(`<div class="wkk-pop"><p>${esc(err.message || "Konnte nicht geladen werden.")}</p></div>`);
    }
  });

  legende();
  return map;
}
