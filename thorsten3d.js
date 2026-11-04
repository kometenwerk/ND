// Thorsten – die gezeichnete KI-Figur des Nachrichten-Hefts (three.js).
// Bewusst eine Animationsfilm-Figur, kein echter Mensch.
// Gibt die Teile zurück, die das Studio bewegt: Kopf, Lider, Kiefer, Arm.

export function thorstenBauen(THREE, opt = {}) {
  const krawattenFarbe = opt.krawatte || "#c8551f";
  const M = (farbe, extra = {}) => new THREE.MeshStandardMaterial({ color: farbe, roughness: .6, metalness: 0, ...extra });
  const haut = M("#e7b48f", { roughness: .62, emissive: "#3a1408", emissiveIntensity: .07 });
  const hautDunkel = M("#d9a07c", { roughness: .65 });
  const haar = M("#3d2a1e", { roughness: .48 });
  const anzug = M("#1d2a44", { roughness: .7 });
  const anzugKante = M("#26365a", { roughness: .6 });
  const hemd = M("#f3f5f9", { roughness: .8 });
  const lippe = M("#b86e62", { roughness: .45 });
  const kugel = (r, m, a = 32, b = a) => new THREE.Mesh(new THREE.SphereGeometry(r, a, b), m);

  // Kugel verformen: f bekommt normierte Koordinaten und gibt neue zurück
  function geformt(geo, f) {
    const p = geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const n = f(v.x, v.y, v.z);
      p.setXYZ(i, n[0], n[1], n[2]);
    }
    geo.computeVertexNormals();
    return geo;
  }

  const figur = new THREE.Group();

  // ---------- Kopf
  const kopf = new THREE.Group(); kopf.position.y = 1.625;
  // Kopfform: schmaleres Kinn, Wangen, flacheres Gesicht, größerer Hinterkopf
  const schaedel = new THREE.Mesh(geformt(new THREE.SphereGeometry(1, 64, 48), (x, y, z) => {
    let nx = x, ny = y, nz = z;
    if (y < 0) { const k = Math.pow(-y, 1.4); nx *= 1 - .3 * k; nz *= 1 - .12 * k; if (z > 0) nz += .06 * k; }   // Kiefer + Kinn
    if (y < -.75) ny = -.75 + (y + .75) * .6;                                         // Kinn nicht zu spitz
    if (z < 0) nz *= 1.1;                                                              // Hinterkopf
    if (z > .55) nz = .55 + (nz - .55) * .55;                                          // flaches Gesicht
    if (z > .3 && y > -.55 && y < .05) nx *= 1.04;                                     // Wangen
    if (Math.abs(x) > .8 && Math.abs(y) < .4) nx *= .97;                               // Schläfen
    return [nx * .148, ny * .2, nz * .172];
  }), haut);
  kopf.add(schaedel);

  // Ohren
  [-1, 1].forEach(s => {
    const ohr = new THREE.Mesh(new THREE.TorusGeometry(.024, .012, 10, 20, Math.PI * 1.6), hautDunkel);
    ohr.position.set(s * .147, -.005, -.01); ohr.rotation.set(0, s * Math.PI / 2, Math.PI * .7);
    ohr.scale.set(1, 1.45, 1);
    const innen = kugel(.018, hautDunkel, 12); innen.position.set(s * .146, -.008, -.01); innen.scale.set(.5, 1.3, 1);
    kopf.add(ohr, innen);
  });

  // Nase: Rücken + Spitze + Nasenflügel
  const ruecken = kugel(.015, haut, 20); ruecken.scale.set(.75, 2.2, 1); ruecken.position.set(0, -.004, .162); ruecken.rotation.x = -.3;
  const spitze = kugel(.0155, haut, 20); spitze.position.set(0, -.034, .172);
  const fluegelL = kugel(.01, hautDunkel, 12), fluegelR = kugel(.01, hautDunkel, 12);
  fluegelL.position.set(-.015, -.04, .163); fluegelR.position.set(.015, -.04, .163);
  kopf.add(ruecken, spitze, fluegelL, fluegelR);

  // Augen mit Lidern
  const lider = [];
  const augen = [-1, 1].map(s => {
    const g = new THREE.Group(); g.position.set(s * .052, .028, .138);
    const apfel = kugel(.024, M("#fbfbf8", { roughness: .15 }), 24); apfel.scale.z = .7;
    const iris = new THREE.Mesh(new THREE.CircleGeometry(.0115, 24), M("#4f6f8c", { roughness: .3 }));
    iris.position.z = .0172;
    const pupille = new THREE.Mesh(new THREE.CircleGeometry(.0055, 16), new THREE.MeshBasicMaterial({ color: "#0b0f14" }));
    pupille.position.z = .0175;
    const glanz = new THREE.Mesh(new THREE.CircleGeometry(.0025, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    glanz.position.set(.004, .004, .018);
    // Oberlid: halbe Hautkugel, dreht sich zum Blinzeln nach unten
    const lid = new THREE.Mesh(new THREE.SphereGeometry(.0262, 24, 12, 0, Math.PI * 2, 0, Math.PI * .5), haut);
    lid.scale.z = .74; lid.rotation.x = LID_OFFEN;       // offen: deckt das obere Drittel
    const unterlid = new THREE.Mesh(new THREE.TorusGeometry(.022, .003, 6, 20, Math.PI), hautDunkel);
    unterlid.rotation.z = Math.PI; unterlid.position.set(0, -.003, .006); unterlid.scale.set(1, .55, 1);
    g.add(apfel, iris, pupille, glanz, lid, unterlid);
    lider.push(lid);
    kopf.add(g);
    // Augenbraue: leicht gebogen
    const kurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.026, -.003, 0), new THREE.Vector3(0, .008, .004), new THREE.Vector3(.028, -.005, -.002));
    const braue = new THREE.Mesh(new THREE.TubeGeometry(kurve, 12, .0045, 6), haar);
    braue.position.set(s * .054, .066, .152); braue.scale.x = s;
    kopf.add(braue);
    return { g, braue };
  });

  // Mund: Oberlippe fest, Unterlippe und Kiefer bewegen sich
  const mundInnen = new THREE.Mesh(new THREE.CircleGeometry(.026, 24), new THREE.MeshBasicMaterial({ color: "#3a1515" }));
  mundInnen.position.set(0, -.087, .157); mundInnen.scale.set(.85, .1, 1);
  const zaehne = new THREE.Mesh(new THREE.BoxGeometry(.034, .008, .004), M("#f4f1ea", { roughness: .3 }));
  zaehne.position.set(0, -.081, .158);
  const oberlippe = new THREE.Mesh(new THREE.TorusGeometry(.026, .0055, 8, 24, Math.PI), lippe);
  oberlippe.position.set(0, -.088, .157); oberlippe.scale.set(1, .32, .6);
  const kiefer = new THREE.Group(); kiefer.position.set(0, -.088, .157);
  const unterlippe = new THREE.Mesh(new THREE.TorusGeometry(.024, .0065, 8, 24, Math.PI), lippe);
  unterlippe.rotation.z = Math.PI; unterlippe.scale.set(1, .4, .6);
  kiefer.add(unterlippe);
  kopf.add(mundInnen, zaehne, oberlippe, kiefer);
  // ein Hauch Wangenröte
  [-1, 1].forEach(s => {
    const r = new THREE.Mesh(new THREE.CircleGeometry(.03, 20), new THREE.MeshBasicMaterial({ color: "#e08a7a", transparent: true, opacity: .16, depthWrite: false }));
    r.position.set(s * .085, -.035, .145); r.rotation.y = s * .55; kopf.add(r);
  });

  // Frisur: Kappe, Hinterkopf, Seitenscheitel mit Schwung, Koteletten
  const kappe = new THREE.Mesh(geformt(new THREE.SphereGeometry(1, 48, 24, 0, Math.PI * 2, 0, Math.PI * .56), (x, y, z) => {
    let ny = y; if (z > .5) ny = y + (z - .5) * .25;            // Haaransatz vorne höher
    return [x * .158, ny * .19, z * .184];
  }), haar);
  kappe.position.set(0, .03, -.008); kappe.rotation.x = -.32;
  const hinten = kugel(1, haar, 32); hinten.scale.set(.152, .17, .14); hinten.position.set(0, .0, -.055);
  const schwung = new THREE.Mesh(geformt(new THREE.SphereGeometry(1, 32, 16), (x, y, z) => [x * .11 + y * .02, y * .035, z * .1]), haar);
  schwung.position.set(.03, .148, .06); schwung.rotation.set(.3, 0, -.2); schwung.scale.set(1.25, 1.1, 1.05);
  const scheitel = new THREE.Mesh(new THREE.BoxGeometry(.004, .002, .09), hautDunkel);
  scheitel.position.set(-.05, .19, .02); scheitel.rotation.x = .4;
  const kotL = new THREE.Mesh(new THREE.BoxGeometry(.012, .045, .02), haar), kotR = kotL.clone();
  kotL.position.set(-.144, .02, .03); kotR.position.set(.144, .02, .03);
  // statt einer Tolle: der Pony fällt leicht zur Seite
  const pony = new THREE.Mesh(geformt(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI * .5), (x, y, z) => [x * .12, y * .045, z * .07]), haar);
  pony.position.set(.025, .118, .105); pony.rotation.set(.55, 0, -.12);
  kopf.add(kappe, hinten, pony, scheitel, kotL, kotR);

  // ---------- Hals, Kragen, Oberkörper
  const hals = new THREE.Mesh(new THREE.CylinderGeometry(.064, .074, .14, 24), haut); hals.position.y = 1.45;
  const rumpf = new THREE.Mesh(geformt(new THREE.CylinderGeometry(1, 1, 1, 40, 8), (x, y, z) => {
    // Schultern abfallend, Brust breit, unten etwas schmaler
    const r = y > .3 ? 1 - (y - .3) * 1.3 : 1 - (.3 - y) * .12;
    return [x * .25 * r, y * .62, z * .15 * (y > .35 ? 1 - (y - .35) * .5 : 1)];
  }), anzug);
  rumpf.position.y = 1.09;
  const schultern = [-1, 1].map(s => { const k = kugel(.08, anzug, 24); k.position.set(s * .215, 1.32, -.005); k.scale.set(1.15, .7, .95); return k; });
  // Nacken und Schulterlinie: weicher Übergang zum Hals
  const nacken = kugel(1, anzug, 32); nacken.scale.set(.22, .06, .085); nacken.position.set(0, 1.37, -.045);
  // Hemd-Ausschnitt, Kragen, Krawatte
  const hemdV = new THREE.Mesh(new THREE.CircleGeometry(.085, 3), hemd);
  hemdV.position.set(0, 1.31, .153); hemdV.rotation.z = -Math.PI / 2; hemdV.scale.set(1.05, .75, 1);
  const kragen = [-1, 1].map(s => { const k = new THREE.Mesh(new THREE.BoxGeometry(.05, .03, .012), hemd); k.position.set(s * .03, 1.39, .118); k.rotation.set(-.4, 0, s * .6); return k; });
  const knoten = new THREE.Mesh(new THREE.CylinderGeometry(.016, .011, .026, 4), M(krawattenFarbe, { roughness: .45 }));
  knoten.position.set(0, 1.37, .152); knoten.rotation.y = Math.PI / 4;
  const krawatte = new THREE.Mesh(new THREE.CylinderGeometry(.012, .028, .2, 4), M(krawattenFarbe, { roughness: .45 }));
  krawatte.position.set(0, 1.25, .158); krawatte.rotation.y = Math.PI / 4; krawatte.scale.z = .3;
  // Revers
  const revers = [-1, 1].map(s => {
    const form = new THREE.Shape(); form.moveTo(0, 0); form.lineTo(s * .07, .03); form.lineTo(s * .11, .2); form.lineTo(s * .04, .16); form.lineTo(0, 0);
    const r = new THREE.Mesh(new THREE.ShapeGeometry(form), anzugKante);
    r.position.set(0, 1.19, .156); r.rotation.y = s * -.3; return r;
  });
  const tuch = new THREE.Mesh(new THREE.BoxGeometry(.04, .014, .006), M(krawattenFarbe, { roughness: .5 }));
  tuch.position.set(.13, 1.27, .15); tuch.rotation.y = -.35;

  // Arme: liegen auf dem Tisch
  const arm = s => {
    const g = new THREE.Group();
    const oben = new THREE.Mesh(new THREE.CylinderGeometry(.062, .055, .34, 20), anzug); oben.position.y = -.17; g.add(oben);
    const unten = new THREE.Group(); unten.position.y = -.33;
    const ua = new THREE.Mesh(new THREE.CylinderGeometry(.054, .047, .3, 20), anzug); ua.rotation.x = Math.PI / 2; ua.position.z = .15; unten.add(ua);
    const manschette = new THREE.Mesh(new THREE.CylinderGeometry(.043, .043, .025, 16), hemd); manschette.rotation.x = Math.PI / 2; manschette.position.z = .305; unten.add(manschette);
    const hand = kugel(.046, haut, 20); hand.scale.set(1.05, .55, 1.35); hand.position.set(0, -.005, .35); unten.add(hand);
    const daumen = kugel(.017, haut, 12); daumen.scale.set(.8, .7, 1.6); daumen.position.set(-s * .04, .008, .335); unten.add(daumen);
    g.add(unten);
    g.position.set(s * .25, 1.3, .0); g.rotation.z = s * .14;
    return { g, unten };
  };
  const armL = arm(-1), armR = arm(1);

  figur.add(rumpf, nacken, ...schultern, hemdV, ...kragen, knoten, krawatte, ...revers, tuch, hals, armL.g, armR.g, kopf);
  return { figur, kopf, lider, kiefer, mundInnen, zaehne, rumpf, schultern, augen, armR };
}

// Lid-Winkel: die Halbkugel deckt bei 0 die obere Augenhälfte, bei ~1.45 das ganze Auge
export const LID_OFFEN = -.32, LID_ZU = 1.45;
