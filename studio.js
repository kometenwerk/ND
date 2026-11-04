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
  const kamera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 50);

  const mat = (farbe, extra = {}) => new THREE.MeshStandardMaterial({ color: farbe, roughness: .55, metalness: .05, ...extra });

  // ---- Licht
  szene.add(new THREE.HemisphereLight("#b9d3ff", "#1a2335", .8));
  const gesichtLicht = new THREE.PointLight("#ffe9d6", 3.2, 4, 1.5); gesichtLicht.position.set(-.6, 1.9, .9); szene.add(gesichtLicht);
  const haupt = new THREE.SpotLight("#fff4e6", 55, 14, .5, .55, 1.5);
  haupt.position.set(1.6, 4.2, 3.4); haupt.target.position.set(-.9, 1.3, -.6);
  szene.add(haupt, haupt.target);
  const fuell = new THREE.PointLight("#cfe0ff", 6, 8, 1.8); fuell.position.set(-2.6, 2.2, 2.2); szene.add(fuell);
  const kante = new THREE.PointLight(akzent, 14, 6, 1.6); kante.position.set(-1.4, 2.4, -2.0); szene.add(kante);

  // ---- Boden: dunkel glänzend mit Leuchtlinien
  const boden = new THREE.Mesh(new THREE.CircleGeometry(9, 64), mat("#0b1424", { roughness: .28, metalness: .35 }));
  boden.rotation.x = -Math.PI / 2; szene.add(boden);
  for (let r = 1.6; r < 8; r += 1.3) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + .012, 96),
      new THREE.MeshBasicMaterial({ color: akzent, transparent: true, opacity: .35 - r * .03 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(-.6, .002, -.8); szene.add(ring);
  }

  // ---- Rückwand mit Lichtsäulen
  const wandHinten = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 6, 64, 1, true, Math.PI * .72, Math.PI * .56),
    mat("#0a1730", { side: THREE.BackSide, roughness: .9 }));
  wandHinten.position.set(0, 3, 2.2); szene.add(wandHinten);
  const saeulen = [];
  for (let i = 0; i < 9; i++) {
    const w = Math.PI * .74 + i * (Math.PI * .52 / 8);
    const s = new THREE.Mesh(new THREE.BoxGeometry(.06, 5.2, .06),
      new THREE.MeshBasicMaterial({ color: i % 2 ? "#2b5aa8" : akzent, transparent: true, opacity: .55 }));
    s.position.set(Math.sin(w) * 7.3, 2.6, 2.2 + Math.cos(w) * 7.3); szene.add(s); saeulen.push(s);
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
  globus.scale.setScalar(1.15); globus.position.set(-3.4, 2.3, -3.2); szene.add(globus);

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
  szene.add(wand);

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
  szene.add(tisch);

  // ---- Thorsten (gezeichnete Figur, siehe thorsten3d.js)
  const T = thorstenBauen(THREE, { krawatte: "#c8551f" });
  const thorsten = T.figur, kopf = T.kopf;
  thorsten.position.set(-.9, 0, -.85);
  szene.add(thorsten);

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
  function einstellung(art, schnitt) {
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
    kam.t = Math.min(1, kam.t + dt / kam.dauer);
    const f = glatt(kam.t);
    const zielPos = v3(kam.nach.pos), zielBlick = v3(kam.nach.ziel);
    if (kam.von) { zielPos.lerpVectors(v3(kam.von.pos), zielPos, f); zielBlick.lerpVectors(v3(kam.von.ziel), zielBlick, f); }
    const drift = kam.art === "wand" ? .015 : .05;
    zielPos.x += Math.sin(zeit * .23) * drift; zielPos.y += Math.sin(zeit * .17) * drift * .5;
    kamera.position.copy(zielPos); kamera.lookAt(zielBlick); kam.zielJetzt = zielBlick;

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
    einstellung,
    akzent(farbe) { try { akzent.set(farbe); kante.color.set(farbe); licht.material.color.set(farbe); leiste.material.color.set(farbe); } catch {} },
    stopp() {
      laeuft = false;
      if (bild) { bild.style.transform = ""; bild.style.width = ""; bild.style.height = ""; bild.style.visibility = ""; }
      renderer.dispose(); leinwand.remove();
    }
  };
}
