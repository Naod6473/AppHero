// Vérifie tous les app.json. Utilisé par la CI et avant chaque build.
import { readApps } from "./apps.mjs";

const { apps, errors } = readApps();
if (errors.length) {
  console.error("Problèmes trouvés :\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log(`${apps.length} app(s) valide(s) : ${apps.map((a) => a.slug).join(", ")}`);
