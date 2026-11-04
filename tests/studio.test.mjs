// Tests für das Nachrichtenstudio – ausführen mit: node tests/studio.test.mjs
import { matrixFuerViereck, glatt, mundAuf } from "../studio.js";
let ok = 0, fehl = 0;
const pruef = (n, b) => { if (b) ok++; else { fehl++; console.error("✗ " + n); } };
// Punkt mit CSS-matrix3d (spaltenweise) abbilden
const abbilden = (m, x, y) => { const X = m[0]*x + m[4]*y + m[12], Y = m[1]*x + m[5]*y + m[13], W = m[3]*x + m[7]*y + m[15]; return [X / W, Y / W]; };
const nah = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
const ecken = [[100, 50], [700, 80], [680, 420], [120, 400]];
const m = matrixFuerViereck(800, 450, ecken);
pruef("Matrix gefunden", Array.isArray(m) && m.length === 16);
pruef("oben links", nah(abbilden(m, 0, 0), ecken[0]));
pruef("oben rechts", nah(abbilden(m, 800, 0), ecken[1]));
pruef("unten rechts", nah(abbilden(m, 800, 450), ecken[2]));
pruef("unten links", nah(abbilden(m, 0, 450), ecken[3]));
const id = matrixFuerViereck(10, 10, [[0, 0], [10, 0], [10, 10], [0, 10]]);
pruef("gleiches Rechteck = keine Verzerrung", nah(abbilden(id, 3, 7), [3, 7]));
pruef("unmögliches Viereck → null", matrixFuerViereck(10, 10, [[0, 0], [0, 0], [0, 0], [0, 0]]) === null);
pruef("glatt Anfang/Ende", glatt(0) === 0 && glatt(1) === 1 && glatt(.5) === .5);
pruef("Mund zu, wenn still", mundAuf(1.234, false) === 0);
let max = 0, min = 1; for (let t = 0; t < 10; t += .01) { const v = mundAuf(t, true); max = Math.max(max, v); min = Math.min(min, v); }
pruef("Mund bewegt sich beim Sprechen", max > .7 && min < .3 && max <= 1 && min >= 0);
console.log(`${ok} bestanden, ${fehl} fehlgeschlagen`); if (fehl) process.exit(1);
