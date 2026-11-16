// Crée une nouvelle app à partir du gabarit.
// Usage : npm run new -- 05 nom-de-l-app "Titre de l'app" ["Accroche"]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DAYS, fmtLong } from "../shared/calendar.js";
import { APPS_DIR, ROOT } from "./apps.mjs";

const [numArg, name, title, tagline = "Une phrase qui donne envie."] = process.argv.slice(2);
const num = Number(numArg);
const day = DAYS[num - 1];
if (!day || !name || !title || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Usage : npm run new -- 05 nom-en-minuscules "Titre de l\'app" ["Accroche"]');
  process.exit(1);
}
const slug = `${day.id}-${name}`;
const dir = join(APPS_DIR, slug);
if (existsSync(dir)) {
  console.error(`apps/${slug} existe déjà.`);
  process.exit(1);
}
const vars = {
  ID: day.id,
  NUM: String(num),
  SLUG: slug,
  TITLE: title,
  TAGLINE: tagline,
  COLOR: day.color,
  THEME: day.theme,
  DATE: fmtLong(day.date).toLowerCase(),
};
const fill = (s) => s.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
mkdirSync(dir, { recursive: true });
for (const f of ["index.html", "README.md"]) {
  writeFileSync(join(dir, f), fill(readFileSync(join(ROOT, "scripts/template", f), "utf8")));
}
const app = {
  num,
  title,
  tagline,
  publishAt: day.publishAt,
  color: day.color,
  tags: [],
  status: "brouillon",
};
writeFileSync(join(dir, "app.json"), JSON.stringify(app, null, 2) + "\n");
console.log(`apps/${slug} créé (sortie ${fmtLong(day.date)} à 18 h).`);
console.log('Passe "status" à "prêt" dans app.json quand l\'app est finie.');
