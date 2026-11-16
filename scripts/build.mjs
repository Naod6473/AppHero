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
console.log("Site construit dans dist/");

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
}
console.log(`Apps copiées : ${ready.map((a) => a.slug).join(", ") || "aucune"}`);
