// Build complet :
// 1. valide les apps/*/app.json
// 2. écrit le manifeste lu par le Worker (worker/generated/apps.json)
// 3. construit le site avec Vite (site/ -> dist/)
// 4. copie chaque app prête dans dist/apps/NN-nom/ (après son propre build si elle en a un)
//
// Les apps sont toutes copiées, mais le Worker ne les sert qu'à partir de leur publishAt.
import { mkdirSync, writeFileSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { build } from "vite";
import { readApps, ROOT } from "./apps.mjs";
import { DAYS, CHALLENGE_END } from "../shared/calendar.js";

// Les 30 rendez-vous de 18 h, plus le verdict, à ajouter à son agenda.
function calendarIcs() {
  const utc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s) => s.replace(/[\\;,]/g, (c) => "\\" + c);
  const stamp = utc("2026-11-16T12:00:00Z");
  const ev = (uid, start, minutes, title, desc, url) => [
    "BEGIN:VEVENT",
    `UID:${uid}@apphero.cloud`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${utc(start)}`,
    `DTEND:${utc(new Date(Date.parse(start) + minutes * 60000).toISOString())}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(desc)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(title)}`,
    "TRIGGER:-PT5M",
    "END:VALARM",
    "END:VEVENT",
  ];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apphero//Defi 30 apps//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Apphéro · 18 h"];
  for (const d of DAYS) {
    lines.push(...ev(`app-${d.id}`, d.publishAt, 30, `🥂 Apphéro : app ${d.num}/30 (${d.theme})`, `La nouvelle app sort à 18 h pile : https://apphero.cloud/${d.id}`, `https://apphero.cloud/${d.id}`));
  }
  lines.push(...ev("verdict", CHALLENGE_END, 30, "🏆 Apphéro : le verdict de la grande finale", "La grande gagnante des 30 apps : https://apphero.cloud/#vote", "https://apphero.cloud/#vote"));
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

const { apps, errors } = readApps();
if (errors.length) {
  console.error("Build arrêté, app.json invalides :\n- " + errors.join("\n- "));
  process.exit(1);
}
const ready = apps.filter((a) => a.status !== "brouillon");

const manifest = ready.map(({ dir, build, ...pub }) => pub);
mkdirSync(join(ROOT, "worker/generated"), { recursive: true });
writeFileSync(join(ROOT, "worker/generated/apps.json"), JSON.stringify(manifest, null, 2));
console.log(`Manifeste : ${manifest.length} app(s)`);

await build({ configFile: join(ROOT, "vite.config.js"), logLevel: "warn" });
writeFileSync(join(ROOT, "dist/apphero.ics"), calendarIcs());
console.log("Site construit dans dist/ (avec l'agenda apphero.ics)");

for (const app of ready) {
  let src = app.dir;
  if (app.build) {
    console.log(`Build de ${app.slug} : ${app.build.command}`);
    execSync(app.build.command, { cwd: app.dir, stdio: "inherit" });
    src = join(app.dir, app.build.output || "dist");
  }
  const dest = join(ROOT, "dist/apps", app.slug);
  rmSync(dest, { recursive: true, force: true });
  cpSync(src, dest, {
    recursive: true,
    filter: (p) => !/(^|\/)(node_modules|\.git|app\.json)(\/|$)/.test(p.slice(src.length)),
  });
  // Le logo reste à la racine du dossier de l'app, même quand l'app a un build.
  if (app.logo && app.build) cpSync(join(app.dir, app.logo.split("/").pop()), join(dest, app.logo.split("/").pop()));
}
console.log(`Apps copiées : ${ready.map((a) => a.slug).join(", ") || "aucune"}`);
