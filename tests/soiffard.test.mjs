// Tests de Soiffard : node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../apps/26-soiffard/lib.js";
import { weekKey as serverWeek, parseOverpass, cleanPseudo, overpassQuery } from "../worker/src/soiffard.js";

const paris = { lat: 48.8566, lon: 2.3522 };
const lyon = { lat: 45.764, lon: 4.8357 };

test("distance et cap", () => {
  const d = L.distance(paris, lyon);
  assert.ok(d > 390000 && d < 395000, `Paris-Lyon ≈ 392 km, obtenu ${d}`);
  assert.equal(Math.round(L.distance(paris, paris)), 0);
  const north = L.bearing(paris, { lat: 48.86, lon: 2.3522 });
  assert.ok(north < 1 || north > 359);
  const east = L.bearing(paris, { lat: 48.8566, lon: 2.36 });
  assert.ok(Math.abs(east - 90) < 1);
});

test("formats", () => {
  assert.equal(L.fmtDist(142), "140 m");
  assert.equal(L.fmtDist(1449), "1,4 km");
  assert.equal(L.fmtDur(7260), "2 h 01");
  assert.equal(L.fmtDur(2520), "42 min");
  assert.equal(L.fmtClock(5077), "1:24:37");
  assert.equal(L.fmtKm(2400), "2,4");
});

test("horaires OpenStreetMap", () => {
  const mon19 = new Date(2026, 10, 16, 19, 0); // lundi 16 novembre, 19 h
  const tue01 = new Date(2026, 10, 17, 1, 30); // mardi 1 h 30
  assert.deepEqual(L.openState("Mo-Su 17:00-02:00", mon19), { open: true, until: "02:00", from: null });
  assert.equal(L.openState("Mo-Su 17:00-02:00", tue01).open, true, "la nuit d'avant déborde après minuit");
  assert.equal(L.openState("Tu-Sa 18:00-01:00; Mo off", mon19).open, false);
  assert.equal(L.openState("Mo-Fr 12:00-14:00,18:00-23:00", mon19).open, true);
  const st = L.openState("Mo-Fr 20:00-23:00", mon19);
  assert.equal(st.open, false);
  assert.equal(L.hoursLabel(st), "Fermé, ouvre à 20 h");
  assert.equal(L.openState("24/7", mon19).open, true);
  assert.equal(L.openState("sunrise-sunset", mon19).open, null, "format inconnu : on ne sait pas");
  assert.equal(L.hoursLabel(L.openState("Mo-Su 18:00-00:00", mon19)), "Ouvert jusqu'à minuit");
  assert.equal(L.openState("Sa-Mo 18:00-02:00", mon19).open, true, "plage de jours qui fait le tour du dimanche");
});

test("semaine : bascule le lundi à 6 h (Paris), même clé côté app et serveur", () => {
  const sun23 = Date.parse("2026-11-22T22:00:00Z"); // dimanche 23 h à Paris
  const mon05 = Date.parse("2026-11-23T04:30:00Z"); // lundi 5 h 30
  const mon07 = Date.parse("2026-11-23T06:30:00Z"); // lundi 7 h 30
  assert.equal(L.weekKey(sun23), "2026-W47");
  assert.equal(L.weekKey(mon05), "2026-W47");
  assert.equal(L.weekKey(mon07), "2026-W48");
  for (const t of [sun23, mon05, mon07, Date.parse("2026-12-31T12:00:00Z"), Date.parse("2027-01-04T12:00:00Z")]) {
    assert.equal(L.weekKey(t), serverWeek(t));
  }
  assert.equal(L.weekdayIndex(mon05), 6, "lundi 5 h 30 compte encore pour dimanche");
});

test("temps crédité au comptoir", () => {
  const t0 = 1_000_000;
  assert.equal(L.creditedSeconds(t0, t0 + 600e3, t0 + 900e3), 600, "on s'arrête au dernier moment près du bar");
  assert.equal(L.creditedSeconds(t0, t0 + 20 * 3600e3, t0 + 20 * 3600e3), 4 * 3600, "4 h maximum");
  assert.equal(L.creditedSeconds(t0, null, t0 + 61e3), 61);
});

test("parcours : points trop proches, imprécis ou sauts GPS", () => {
  let tr = [];
  let r = L.addPoint(tr, { lat: 48.8566, lon: 2.3522, acc: 10 });
  assert.equal(r.track.length, 1);
  r = L.addPoint(r.track, { lat: 48.85661, lon: 2.35221, acc: 10 });
  assert.equal(r.track.length, 1, "moins de 15 m : ignoré");
  r = L.addPoint(r.track, { lat: 48.858, lon: 2.3522, acc: 200 });
  assert.equal(r.track.length, 1, "imprécis : ignoré");
  r = L.addPoint(r.track, { lat: 48.858, lon: 2.3522, acc: 10 });
  assert.equal(r.track.length, 2);
  assert.ok(r.added > 150 && r.added < 160);
  r = L.addPoint(r.track, { lat: 45.764, lon: 4.8357, acc: 10 });
  assert.equal(r.added, 0, "saut de plus de 2 km : pas de distance");
});

test("stats de la semaine, kcal, niveaux et humour", () => {
  const now = Date.parse("2026-11-18T21:00:00Z");
  const o = (start, visits, meters, glasses) => ({ start, meters, glasses, seconds: 7200, visits });
  const outs = [
    o(Date.parse("2026-11-16T19:00:00Z"), [{ id: "n1", seconds: 3600 }, { id: "n2", seconds: 1800 }], 2400, 4),
    o(Date.parse("2026-11-18T19:00:00Z"), [{ id: "n1", seconds: 1200 }], 800, 2),
    o(Date.parse("2026-11-10T19:00:00Z"), [{ id: "n9", seconds: 999 }], 5000, 9), // semaine d'avant
  ];
  const ws = L.weekStats(outs, now);
  assert.equal(ws.bars, 2);
  assert.equal(ws.meters, 3200);
  assert.equal(ws.counter, 6600);
  assert.equal(ws.glasses, 6);
  assert.equal(ws.perDay[0], 5400);
  assert.equal(ws.perDay[2], 1200);
  assert.equal(L.kcalIn(6), 900);
  assert.equal(L.kcalOut(3200), 176);
  assert.equal(L.croissants(900), 4);
  assert.equal(L.glassLevel(0), "Échauffement");
  assert.equal(L.glassLevel(7), "Légende du comptoir");
  assert.match(L.joke({ bars: 3, seconds: 11520, meters: 2400, glasses: 6 }), /1 bar toutes les 64 min/);
});

test("badges", () => {
  const visits = (ids) => ids.map((id) => ({ id, seconds: 600 }));
  const b = L.badges([{ start: Date.parse("2026-11-16T18:00:00Z"), end: Date.parse("2026-11-16T22:00:00Z"), meters: 1000, visits: visits(["a", "b", "c"]) }], 1);
  const done = Object.fromEntries(b.map((x) => [x.id, x.done]));
  assert.equal(done.first, true);
  assert.equal(done.tour, true);
  assert.equal(done.king, true);
  assert.equal(done.explorer, false);
});

test("avatar stable et carte", () => {
  assert.deepEqual(L.avatar("abc"), L.avatar("abc"));
  const v = L.fitView([paris, { lat: 48.86, lon: 2.36 }], 300, 140);
  assert.ok(v.z >= 12 && v.z <= 17);
});

test("serveur : lecture d'Overpass et pseudo", () => {
  const bars = parseOverpass({
    elements: [
      { type: "node", id: 1, lat: 48.1, lon: 2.1, tags: { amenity: "bar", name: "Le Zinc", opening_hours: "Mo-Su 17:00-02:00" } },
      { type: "way", id: 2, center: { lat: 48.2, lon: 2.2 }, tags: { amenity: "pub", name: "L'Escale", "addr:street": "Rue du Port", "addr:housenumber": "3" } },
      { type: "node", id: 3, lat: 48.3, lon: 2.3, tags: { amenity: "bar" } }, // sans nom : ignoré
      { type: "node", id: 1, lat: 48.1, lon: 2.1, tags: { amenity: "bar", name: "Le Zinc" } }, // doublon
      { type: "node", id: 4, lat: 48.4, lon: 2.4, tags: { amenity: "bar", name: "Brasserie du Coin" } },
    ],
  });
  assert.equal(bars.length, 3);
  assert.deepEqual(bars[0], { id: "n1", name: "Le Zinc", kind: "Bar", lat: 48.1, lon: 2.1, oh: "Mo-Su 17:00-02:00", street: null });
  assert.equal(bars[1].id, "w2");
  assert.equal(bars[1].street, "3 Rue du Port");
  assert.equal(bars[2].kind, "Brasserie");
  assert.equal(cleanPseudo("  <b>Max</b>  "), "bMax/b");
  assert.equal(cleanPseudo("x"), null);
  assert.match(overpassQuery("48.857", "2.352"), /around:2000,48\.857,2\.352/);
});

test("prépositions devant le nom du bar", () => {
  assert.equal(L.au("Le Zinc"), "au Zinc");
  assert.equal(L.au("La Taverne des Halles"), "à la Taverne des Halles");
  assert.equal(L.au("L'Escale"), "à l'Escale");
  assert.equal(L.au("Les Trois Brasseurs"), "aux Trois Brasseurs");
  assert.equal(L.au("Chez Lulu"), "chez Lulu");
  assert.equal(L.au("Bar des Amis"), "au Bar des Amis");
  assert.equal(L.au("O'Sullivans"), "à O'Sullivans");
  assert.equal(L.du("Le Zinc"), "du Zinc");
  assert.equal(L.du("L'Escale"), "de l'Escale");
  assert.equal(L.du("Chez Lulu"), "de Chez Lulu");
  assert.equal(L.du("O'Sullivans"), "d'O'Sullivans");
});
