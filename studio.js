// Das Nachrichtenstudio des Nachrichten-Hefts.
//
// Ein 3D-Studio im Browser (three.js): Moderationstisch, große Bildwand, Licht.
// Am Tisch sitzt Thorsten – eine gezeichnete KI-Figur, kein echter Mensch.
// Auf der Bildwand läuft, was der Player sowieso zeigt (Fotos, Grafiken,
// Karten): das HTML-Element .pl-bild wird perspektivisch genau auf die Wand
// gelegt. So bleiben Fotos scharf und alle bisherigen Tafeln funktionieren.
//
// Kameras: "total" (ganzes Studio), "nah" (Thorsten), "studio" (Thorsten und
// Wand), "wand" (die Bildwand groß). Thorstens Mund bewegt sich, solange die
// Stimme spricht; er blinzelt, atmet und schaut in die Kamera.

const THREE_URL = "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { thorstenBauen, LID_OFFEN, LID_ZU } from "./thorsten3d.js";

// ------------------------------------------------------------ reine Mathematik

// Homographie: bildet das Rechteck (0,0)-(b,h) auf vier Punkte ab
// (oben links, oben rechts, unten rechts, unten links). Ergebnis als CSS matrix3d.
export function matrixFuerViereck(b, h, ecken) {
  const src = [[0, 0], [b, 0], [b, h], [0, h]];
  const A = [], B = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = ecken[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); B.push(v);
  }
  const p = loese(A, B);
  if (!p) return null;
  const [a, bb, c, d, e, f, g, hh] = p;
  // CSS matrix3d ist spaltenweise
  return [a, d, 0, g, bb, e, 0, hh, 0, 0, 1, 0, c, f, 0, 1];
}
// Gauß-Verfahren für 8x8
function loese(A, B) {
  const n = B.length, M = A.map((r, i) => [...r, B[i]]);
  for (let k = 0; k < n; k++) {
    let p = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(M[i][k]) > Math.abs(M[p][k])) p = i;
    if (Math.abs(M[p][k]) < 1e-12) return null;
    [M[k], M[p]] = [M[p], M[k]];
    for (let i = k + 1; i < n; i++) {
      const f = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= f * M[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n];
    for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j];
    x[i] = s / M[i][i];
  }
  return x;
}
export const glatt = t => t * t * (3 - 2 * t);          // weiches Anfahren und Abbremsen

// Mundöffnung beim Sprechen: Silben-Rhythmus, nie ganz gleichmäßig.
export function mundAuf(t, spricht) {
  if (!spricht) return 0;
  const silbe = Math.abs(Math.sin(t * 10.5)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1 + 1.3)));
  const pause = Math.sin(t * 1.7) > 0.93 ? 0.15 : 1;      // kleine Atempausen
  return Math.min(1, 0.12 + 0.88 * silbe * pause);
}

// ------------------------------------------------------------ das Studio

export async function studioStarten(buehne, opt = {}) {
  if (!buehne) return null;
  const probe = document.createElement("canvas");
  if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
  const THREE = await import(THREE_URL);
  const akzent = new THREE.Color(opt.akzent || "#16407A");

  const leinwand = document.createElement("canvas");
  leinwand.className = "pl-studio";
  leinwand.setAttribute("aria-hidden", "true");
  buehne.prepend(leinwand);

  const renderer = new THREE.WebGLRenderer({ canvas: leinwand, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const szene = new THREE.Scene();
  szene.background = new THREE.Color("#060c18");
  szene.fog = new THREE.Fog("#060c18", 9, 18);
  const NEBEL = szene.fog, HINTERGRUND = new THREE.Color("#060c18"), SCHWARZ = new THREE.Color("#000000");
  const HELL = 1.05;
  // Alles, was zum Studio gehört – im Intro erst unsichtbar, dann geht das Licht an
  const set = new THREE.Group(); szene.add(set);
  const kamera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 50);

  const mat = (farbe, extra = {}) => new THREE.MeshStandardMaterial({ color: farbe, roughness: .55, metalness: .05, ...extra });

  // ---- Licht
  set.add(new THREE.HemisphereLight("#b9d3ff", "#1a2335", .8));
  const gesichtLicht = new THREE.PointLight("#ffe9d6", 3.2, 4, 1.5); gesichtLicht.position.set(-.6, 1.9, .9); set.add(gesichtLicht);
  const haupt = new THREE.SpotLight("#fff4e6", 55, 14, .5, .55, 1.5);
  haupt.position.set(1.6, 4.2, 3.4); haupt.target.position.set(-.9, 1.3, -.6);
  set.add(haupt, haupt.target);
  const fuell = new THREE.PointLight("#cfe0ff", 6, 8, 1.8); fuell.position.set(-2.6, 2.2, 2.2); set.add(fuell);
  const kante = new THREE.PointLight(akzent, 14, 6, 1.6); kante.position.set(-1.4, 2.4, -2.0); set.add(kante);

  // ---- Boden: dunkel glänzend mit Leuchtlinien
  const boden = new THREE.Mesh(new THREE.CircleGeometry(9, 64), mat("#0b1424", { roughness: .28, metalness: .35 }));
  boden.rotation.x = -Math.PI / 2; set.add(boden);
  for (let r = 1.6; r < 8; r += 1.3) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + .012, 96),
      new THREE.MeshBasicMaterial({ color: akzent, transparent: true, opacity: .35 - r * .03 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-.6, .002, -.8); set.add(ring);
  }

  // ---- Rückwand mit Lichtsäulen
  const wandHinten = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 6, 64, 1, true, Math.PI * .72, Math.PI * .56),
    mat("#0a1730", { side: THREE.BackSide, roughness: .9 }));
  wandHinten.position.set(0, 3, 2.2); set.add(wandHinten);
  const saeulen = [];
  for (let i = 0; i < 9; i++) {
    const w = Math.PI * .74 + i * (Math.PI * .52 / 8);
    const s = new THREE.Mesh(new THREE.BoxGeometry(.06, 5.2, .06),
      new THREE.MeshBasicMaterial({ color: i % 2 ? "#2b5aa8" : akzent, transparent: true, opacity: .55 }));
    s.position.set(Math.sin(w) * 7.3, 2.6, 2.2 + Math.cos(w) * 7.3); set.add(s); saeulen.push(s);
  }

  // ---- Globus aus Linien (links hinten), dreht sich langsam
  const globus = new THREE.Group();
  const globusMat = new THREE.LineBasicMaterial({ color: "#5b8fe0", transparent: true, opacity: .45 });
  for (let i = 0; i < 8; i++) {
    const kurve = new THREE.EllipseCurve(0, 0, 1, 1, 0, Math.PI * 2);
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(kurve.getPoints(64)), globusMat);
    l.rotation.y = i * Math.PI / 8; globus.add(l);
  }
  for (let b = -2; b <= 2; b++) {
    const y = b * .38, r = Math.sqrt(1 - y * y);
    const kurve = new THREE.EllipseCurve(0, 0, r, r, 0, Math.PI * 2);
    const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(kurve.getPoints(64)), globusMat);
    l.rotation.x = Math.PI / 2; l.position.y = y; globus.add(l);
  }
  globus.scale.setScalar(1.15); globus.position.set(-3.4, 2.3, -3.2); set.add(globus);

  // ---- Für das Intro: Sterne und eine Erde (selbst gezeichnet, ohne Bilddateien)
  const sterneGeo = new THREE.BufferGeometry(), sp = [];
  for (let i = 0; i < 1800; i++) {
    const u = Math.random() * 2 - 1, w = Math.random() * Math.PI * 2, r = 40 + Math.random() * 20;
    sp.push(Math.sqrt(1 - u * u) * Math.cos(w) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(w) * r);
  }
  sterneGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  const sterne = new THREE.Points(sterneGeo, new THREE.PointsMaterial({ color: "#ffffff", size: .09, sizeAttenuation: true, transparent: true, opacity: .9, fog: false }));
  sterne.position.copy(globus.position); sterne.visible = false; szene.add(sterne);
  const erdeMat = new THREE.ShaderMaterial({
    transparent: true, fog: false,
    uniforms: { deck: { value: 1 }, licht: { value: new THREE.Vector3(.6, .4, .7).normalize() } },
    vertexShader: `varying vec3 vP; varying vec3 vN; varying vec3 vW;
      void main(){ vP = position; vN = normalize(normalMatrix * normal);
        vec4 w = modelViewMatrix * vec4(position, 1.0); vW = -w.xyz; gl_Position = projectionMatrix * w; }`,
    fragmentShader: `uniform float deck; uniform vec3 licht; varying vec3 vP; varying vec3 vN; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float rauschen(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
      float fbm(vec3 p){ float s = 0.0, a = .5; for (int i = 0; i < 5; i++){ s += a * rauschen(p); p *= 2.03; a *= .5; } return s; }
      void main(){
        vec3 n = normalize(vP);
        float land = smoothstep(.52, .56, fbm(n * 2.3 + 3.1));
        vec3 meer = mix(vec3(.05,.18,.42), vec3(.09,.32,.62), fbm(n * 6.0));
        vec3 boden = mix(vec3(.22,.42,.18), vec3(.55,.47,.3), fbm(n * 5.0 + 7.0));
        vec3 farbe = mix(meer, boden, land);
        farbe = mix(farbe, vec3(.95), smoothstep(.78, .86, abs(n.y)));
        float wolken = smoothstep(.55, .75, fbm(n * 3.5 + 11.0));
        farbe = mix(farbe, vec3(1.0), wolken * .55);
        float hell = max(.08, dot(normalize(vN), licht));
        float rand = pow(1.0 - max(0.0, dot(normalize(vN), normalize(vW))), 2.5);
        gl_FragColor = vec4(farbe * hell + vec3(.3,.55,1.0) * rand * .9, deck);
      }`
  });
  const erde = new THREE.Mesh(new THREE.SphereGeometry(1.1, 64, 48), erdeMat);
  erde.position.copy(globus.position); erde.visible = false; szene.add(erde);

  // ---- Bildwand (das Foto/die Grafik wird per HTML genau darauf gelegt)
  const WAND = { b: 3.6, h: 3.6 * 9 / 16 };
  const wand = new THREE.Group();
  const rahmen = new THREE.Mesh(new THREE.BoxGeometry(WAND.b + .14, WAND.h + .14, .08), mat("#111b2c", { metalness: .6, roughness: .3 }));
  rahmen.position.z = -.05;
  const flaeche = new THREE.Mesh(new THREE.PlaneGeometry(WAND.b, WAND.h), new THREE.MeshBasicMaterial({ color: "#0D2B55" }));
  const leiste = new THREE.Mesh(new THREE.BoxGeometry(WAND.b + .14, .03, .09), new THREE.MeshBasicMaterial({ color: akzent }));
  leiste.position.set(0, -WAND.h / 2 - .09, -.03);
  wand.add(rahmen, flaeche, leiste);
  wand.position.set(1.35, 1.85, -2.4); wand.rotation.y = -.22;
  set.add(wand);

  // ---- Moderationstisch
  const tisch = new THREE.Group();
  const platte = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, .06, 48, 1, false, -Math.PI * .5, Math.PI),
    mat("#1a2740", { roughness: .2, metalness: .5 }));
  platte.position.y = .76;
  const front = new THREE.Mesh(new THREE.CylinderGeometry(1.15, .95, .74, 48, 1, true, -Math.PI * .5, Math.PI),
    mat("#0f1a2e", { side: THREE.DoubleSide, roughness: .4, metalness: .3 }));
  front.position.y = .37;
  const licht = new THREE.Mesh(new THREE.CylinderGeometry(1.16, 1.16, .025, 48, 1, true, -Math.PI * .5, Math.PI),
    new THREE.MeshBasicMaterial({ color: akzent, side: THREE.DoubleSide }));
  licht.position.y = .6;
  tisch.add(platte, front, licht);
  // ein paar Blätter auf dem Tisch
  const papier = new THREE.Mesh(new THREE.BoxGeometry(.3, .006, .21), mat("#f2f4f7", { roughness: .9 }));
  papier.position.set(.1, .795, .55); papier.rotation.y = .12; tisch.add(papier);
  const tablet = new THREE.Mesh(new THREE.BoxGeometry(.26, .012, .18), mat("#0b0f16", { roughness: .3, metalness: .4 }));
  tablet.position.set(-.5, .798, .6); tablet.rotation.y = -.3; tisch.add(tablet);
  tisch.position.set(-.9, 0, -.62); tisch.scale.set(.85, 1.22, .62);
  set.add(tisch);

  // ---- Thorsten (gezeichnete Figur, siehe thorsten3d.js)
  const T = thorstenBauen(THREE, { krawatte: "#c8551f" });
  const thorsten = T.figur, kopf = T.kopf;
  thorsten.position.set(-.9, 0, -.85);
  set.add(thorsten);

  // ---- Kameras
  const wandMitte = new THREE.Vector3(); wand.getWorldPosition(wandMitte);
  const wandNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(wand.quaternion);
  const wandAbstand = (WAND.h / 2) / Math.tan(THREE.MathUtils.degToRad(kamera.fov / 2)) / .9;
  const EINSTELLUNG = {
    total:  { pos: [0.1, 1.75, 5.2], ziel: [0.05, 1.45, -1.2] },
    nah:    { pos: [-0.55, 1.62, 1.55], ziel: [-0.9, 1.55, -0.85] },
    studio: { pos: [0.75, 1.68, 4.3], ziel: [0.3, 1.55, -1.3] },
    wand:   { pos: wandMitte.clone().addScaledVector(wandNormal, wandAbstand).toArray(), ziel: wandMitte.toArray() }
  };
  const kam = { von: null, nach: EINSTELLUNG.total, t: 1, dauer: 1, art: "total" };
  const v3 = a => new THREE.Vector3(...a);
  let film = null, gewuenscht = null;
  function einstellung(art, schnitt) {
    if (film) { gewuenscht = [art, schnitt]; return; }
    if (art !== "abspann") renderer.toneMappingExposure = HELL;
    const e = EINSTELLUNG[art] || EINSTELLUNG.studio;
    if (kam.art === art) return;
    const jetzt = { pos: kamera.position.toArray(), ziel: kam.zielJetzt ? kam.zielJetzt.toArray() : e.ziel };
    kam.von = schnitt ? null : jetzt; kam.nach = e; kam.t = 0; kam.dauer = .9; kam.art = art;
    kam.seit = performance.now();
  }

  // ---- Bildwand-HTML auf die Wand legen
  const bild = buehne.querySelector(".pl-bild");
  const ecken = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([x, y]) => new THREE.Vector3(x * WAND.b / 2, y * WAND.h / 2, .002));
  function bildAufWand(b, h) {
    if (!bild) return;
    // Im All gibt es keine Bildwand; beim Licht-Anschalten blendet sie mit auf
    if (!set.visible) { bild.style.visibility = "hidden"; return; }
    bild.style.opacity = film && film.art === "intro" ? Math.min(1, renderer.toneMappingExposure / HELL).toFixed(2) : "";
    const punkte = ecken.map(p => {
      const w = p.clone().applyMatrix4(flaeche.matrixWorld).project(kamera);
      return [(w.x + 1) / 2 * b, (1 - w.y) / 2 * h, w.z];
    });
    if (punkte.some(p => p[2] > 1)) { bild.style.visibility = "hidden"; return; }
    const m = matrixFuerViereck(b, h, punkte.map(p => [p[0], p[1]]));
    if (!m) return;
    bild.style.visibility = "";
    bild.style.width = b + "px"; bild.style.height = h + "px";
    bild.style.transform = `matrix3d(${m.map(x => +x.toFixed(6)).join(",")})`;
  }

  // ---- Größe
  let breite = 0, hoehe = 0;
  function groesse() {
    const r = buehne.getBoundingClientRect();
    if (r.width === breite && r.height === hoehe) return;
    breite = r.width; hoehe = r.height;
    renderer.setSize(breite, hoehe, false);
    kamera.aspect = breite / Math.max(1, hoehe); kamera.updateProjectionMatrix();
  }

  // ---- Intro und Abspann als kleine Filme mit eigener Kamera
  const glob = globus.position.clone();
  const mische = (a, b, f) => new THREE.Vector3().lerpVectors(a, b, f);
  function filmBild(jetztMs) {
    const p = Math.min(1, (jetztMs - film.start) / (film.dauer * 1000));
    const tot = EINSTELLUNG.total;
    if (film.art === "intro") {
      const A = .46;                      // bis hier: im All auf die Erde zu
      buehne.classList.toggle("im-all", p < A + .2);
      if (p < A) {
        const f = glatt(p / A);
        kamera.position.copy(mische(glob.clone().add(new THREE.Vector3(.4, 1.2, 17)), glob.clone().add(new THREE.Vector3(.35, .08, 2.6)), f));
        kamera.lookAt(glob);
        set.visible = false; sterne.visible = true; erde.visible = true; erdeMat.uniforms.deck.value = 1;
        szene.fog = null; szene.background = SCHWARZ; renderer.toneMappingExposure = HELL;
      } else {
        const f = glatt((p - A) / (1 - A));
        set.visible = true; szene.fog = NEBEL;
        szene.background = SCHWARZ.clone().lerp(HINTERGRUND, Math.min(1, f * 2));
        erdeMat.uniforms.deck.value = Math.max(0, 1 - f * 3); erde.visible = erdeMat.uniforms.deck.value > 0;
        sterne.material.opacity = .9 * (1 - f); sterne.visible = f < 1;
        renderer.toneMappingExposure = .08 + (HELL - .08) * Math.min(1, f * 1.6);   // Studiolicht geht an
        kamera.position.copy(mische(glob.clone().add(new THREE.Vector3(.35, .08, 2.6)), v3(tot.pos), f));
        kamera.lookAt(mische(glob, v3(tot.ziel), f));
      }
    } else if (film.art === "abspann") {
      const f = glatt(p);
      kamera.position.copy(mische(film.vonPos, new THREE.Vector3(0.1, 2.05, 7.2), f));
      kamera.lookAt(mische(film.vonZiel, v3(tot.ziel), f));
      renderer.toneMappingExposure = HELL - (HELL - .28) * glatt(Math.max(0, (p - .55) / .45));   // Licht wird gedimmt
    }
    if (p >= 1) {
      const art = film.art; film = null;
      buehne.classList.remove("im-all");
      sterne.visible = false; erde.visible = false; sterne.material.opacity = .9;
      set.visible = true; szene.fog = NEBEL; szene.background = HINTERGRUND;
      if (art === "intro") { renderer.toneMappingExposure = HELL; kam.art = "total"; kam.nach = EINSTELLUNG.total; kam.von = null; kam.t = 1; }
      else { kam.art = "abspann"; kam.nach = { pos: kamera.position.toArray(), ziel: tot.ziel }; kam.von = null; kam.t = 1; }
      if (gewuenscht && art === "intro") { const g = gewuenscht; gewuenscht = null; einstellung(g[0], g[1]); }
      gewuenscht = null;
      if (film === null && art === "intro" && opt.introFertig) opt.introFertig();
    }
  }
  function introStarten(dauer) {
    film = { art: "intro", start: performance.now(), dauer: Math.max(3, dauer || 5) };
  }
  function abspannStarten(dauer) {
    renderer.toneMappingExposure = HELL;
    film = { art: "abspann", start: performance.now(), dauer: Math.max(3, dauer || 7),
      vonPos: kamera.position.clone(), vonZiel: (kam.zielJetzt || v3(EINSTELLUNG.total.ziel)).clone() };
  }
  // Countdown-Uhr (eigenes Design): der Sekundenzeiger läuft die letzten Sekunden ab
  function countdown(sek = 3, tick) {
    return new Promise(fertig => {
      const uhr = document.createElement("div");
      uhr.className = "pl-countdown"; uhr.setAttribute("aria-hidden", "true");
      const jetzt = new Date();
      const stunde = (jetzt.getHours() % 12) * 30 + jetzt.getMinutes() * .5, minute = jetzt.getMinutes() * 6;
      uhr.innerHTML = `<svg viewBox="-110 -110 220 220">
        <circle r="104" class="cd-ring"/><circle r="96" class="cd-blatt"/>
        ${Array.from({ length: 60 }, (_, i) => `<circle class="cd-punkt${i % 5 ? "" : " gross"}" r="${i % 5 ? 2 : 4.2}" cx="${(Math.sin(i * Math.PI / 30) * 84).toFixed(2)}" cy="${(-Math.cos(i * Math.PI / 30) * 84).toFixed(2)}"/>`).join("")}
        <line class="cd-std" x1="0" y1="8" x2="0" y2="-46" transform="rotate(${stunde})"/>
        <line class="cd-min" x1="0" y1="10" x2="0" y2="-68" transform="rotate(${minute})"/>
        <g class="cd-sek"><line x1="0" y1="14" x2="0" y2="-80"/><circle r="5"/></g>
      </svg><div class="cd-name">Nachrichten-Heft</div>`;
      buehne.appendChild(uhr);
      const zeiger = uhr.querySelector(".cd-sek"), start = performance.now();
      let letzteSek = -1;
      (function lauf(t) {
        const p = (t - start) / 1000;
        const sekunde = 60 - sek + Math.min(sek, p);
        zeiger.setAttribute("transform", `rotate(${(sekunde * 6).toFixed(2)})`);
        const ganz = Math.floor(sekunde);
        if (ganz !== letzteSek) { letzteSek = ganz; if (tick && ganz < 60) tick(); }
        if (p < sek && laeuft) return requestAnimationFrame(lauf);
        uhr.classList.add("weg");
        setTimeout(() => uhr.remove(), 450);
        fertig();
      })(start);
    });
  }

  // ---- Lebendig machen
  let laeuft = true, letzt = performance.now(), zeit = 0, blinzelBis = 0, naechstesBlinzeln = 2.5;
  let mundJetzt = 0, gestik = 0;
  const blick = new THREE.Vector3();
  function bild_(jetztMs) {
    if (!laeuft) return;
    requestAnimationFrame(bild_);
    if (document.hidden) return;
    const dt = Math.min(.1, (jetztMs - letzt) / 1000); letzt = jetztMs; zeit += dt;
    groesse();

    // Kamera fahren (mit leichtem Nachschwingen wie eine Studiokamera)
    if (film) filmBild(jetztMs);
    else {
    kam.t = Math.min(1, kam.t + dt / kam.dauer);
    const f = glatt(kam.t);
    const zielPos = v3(kam.nach.pos), zielBlick = v3(kam.nach.ziel);
    if (kam.von) { zielPos.lerpVectors(v3(kam.von.pos), zielPos, f); zielBlick.lerpVectors(v3(kam.von.ziel), zielBlick, f); }
    const drift = kam.art === "wand" ? .015 : .05;
    zielPos.x += Math.sin(zeit * .23) * drift; zielPos.y += Math.sin(zeit * .17) * drift * .5;
    kamera.position.copy(zielPos); kamera.lookAt(zielBlick); kam.zielJetzt = zielBlick;
    }

    // Sprechen, Atmen, Blinzeln, Blick
    const spricht = !!(opt.spricht && opt.spricht());
    mundJetzt += (mundAuf(zeit, spricht) - mundJetzt) * Math.min(1, dt * 18);
    T.kiefer.position.y = -.088 - mundJetzt * .01;
    T.mundInnen.scale.y = .1 + mundJetzt * .55;
    T.zaehne.visible = mundJetzt > .25;
    const atmen = Math.sin(zeit * 1.6) * .006;
    T.rumpf.scale.x = 1 + atmen; T.schultern.forEach(k => k.position.y = 1.33 + atmen);
    if (zeit > naechstesBlinzeln) { blinzelBis = zeit + .14; naechstesBlinzeln = zeit + 2.5 + Math.random() * 3; }
    const zu = zeit < blinzelBis ? Math.sin((blinzelBis - zeit) / .14 * Math.PI) : 0;
    T.lider.forEach(l => l.rotation.x = LID_OFFEN + (LID_ZU - LID_OFFEN) * zu);
    // Thorsten schaut in die Kamera – bei der Bildwand-Einstellung zur Wand
    const ziel = kam.art === "wand" ? wandMitte : kamera.position;
    kopf.getWorldPosition(blick);
    const richtung = ziel.clone().sub(blick);
    const dreh = Math.atan2(richtung.x, richtung.z), neig = -Math.atan2(richtung.y, Math.hypot(richtung.x, richtung.z));
    kopf.rotation.y += (THREE.MathUtils.clamp(dreh, -.6, .6) + (spricht ? Math.sin(zeit * 1.3) * .05 : 0) - kopf.rotation.y) * Math.min(1, dt * 3);
    kopf.rotation.x += (THREE.MathUtils.clamp(neig, -.25, .25) + (spricht ? Math.sin(zeit * 2.2) * .03 : 0) - kopf.rotation.x) * Math.min(1, dt * 3);
    T.augen.forEach(a => a.braue.position.y = .066 + (spricht ? Math.max(0, Math.sin(zeit * .9)) * .006 : 0));
    // ab und zu eine Handbewegung beim Sprechen
    gestik += ((spricht && Math.sin(zeit * .45) > .55 ? 1 : 0) - gestik) * Math.min(1, dt * 2.5);
    T.armR.unten.rotation.x = -gestik * .35 + Math.sin(zeit * 3) * gestik * .05;
    T.armR.unten.rotation.y = gestik * .25;

    globus.rotation.y += dt * .12;
    saeulen.forEach((s, i) => { s.material.opacity = .35 + .25 * Math.sin(zeit * .8 + i); });

    renderer.render(szene, kamera);
    bildAufWand(breite, hoehe);
  }
  szene.updateMatrixWorld(true);
  kamera.position.set(...EINSTELLUNG.total.pos); kamera.lookAt(v3(EINSTELLUNG.total.ziel));
  requestAnimationFrame(bild_);

  return {
    einstellung, introStarten, abspannStarten, countdown,
    get filmArt() { return film ? film.art : null; },
    akzent(farbe) { try { akzent.set(farbe); kante.color.set(farbe); licht.material.color.set(farbe); leiste.material.color.set(farbe); } catch {} },
    stopp() {
      laeuft = false;
      buehne.classList.remove("im-all");
      if (bild) { bild.style.transform = ""; bild.style.width = ""; bild.style.height = ""; bild.style.visibility = ""; bild.style.opacity = ""; }
      renderer.dispose(); leinwand.remove();
    }
  };
}
