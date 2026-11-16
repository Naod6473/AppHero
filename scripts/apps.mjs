// Lecture et validation des apps/*/app.json.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { DAYS } from "../shared/calendar.js";

export const ROOT = new URL("..", import.meta.url).pathname;
export const APPS_DIR = join(ROOT, "apps");
const STATUSES = ["brouillon", "prêt"];
// La fiche de fabrication affichée avec chaque app (tout est facultatif).
export const MAKING = {
  buildMinutes: "number", // temps de construction, en minutes
  thinkingMinutes: "number", // temps de réflexion (idée, maquette), en minutes
  tokens: "number", // tokens utilisés par l'IA
  prompts: "number", // nombre de messages envoyés à l'IA
  lines: "number", // lignes de code
  tool: "string", // l'outil, par exemple "Claude Code"
  note: "string", // une phrase sur la fabrication
};

// Le logo de l'app : logo.svg, logo.png, logo.webp ou logo.jpg à la racine de son dossier.
export const LOGO_FILES = ["logo.svg", "logo.png", "logo.webp", "logo.jpg"];
function logoOf(dir, folder) {
  const file = LOGO_FILES.find((f) => existsSync(join(dir, f)));
  return file ? `/apps/${folder}/${file}` : null;
}

export function readApps() {
  const errors = [];
  const apps = [];
  if (!existsSync(APPS_DIR)) return { apps, errors };
  for (const folder of readdirSync(APPS_DIR).sort()) {
    const dir = join(APPS_DIR, folder);
    if (!statSync(dir).isDirectory()) continue;
    const where = `apps/${folder}`;
    const m = folder.match(/^(\d{2})-([a-z0-9-]+)$/);
    if (!m) {
      errors.push(`${where} : le dossier doit s'appeler NN-nom-en-minuscules`);
      continue;
    }
    const file = join(dir, "app.json");
    if (!existsSync(file)) {
      errors.push(`${where} : app.json manquant`);
      continue;
    }
    let app;
    try {
      app = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      errors.push(`${where}/app.json : JSON invalide (${e.message})`);
      continue;
    }
    const num = Number(m[1]);
    const day = DAYS[num - 1];
    const err = (msg) => errors.push(`${where}/app.json : ${msg}`);
    if (!day) err(`numéro ${num} hors du calendrier (1 à ${DAYS.length})`);
    if (app.num !== num) err(`"num" doit valoir ${num} (comme le dossier)`);
    if (!app.title || typeof app.title !== "string") err(`"title" manquant`);
    if (!app.tagline || typeof app.tagline !== "string") err(`"tagline" manquant`);
    if (!app.publishAt || Number.isNaN(Date.parse(app.publishAt))) err(`"publishAt" manquant ou invalide`);
    if (app.color && !/^#[0-9a-fA-F]{6}$/.test(app.color)) err(`"color" doit être au format #RRGGBB`);
    if (app.status && !STATUSES.includes(app.status)) err(`"status" doit être ${STATUSES.join(" ou ")}`);
    const making = {};
    if (app.making != null) {
      if (typeof app.making !== "object") err(`"making" doit être un objet`);
      else
        for (const [k, kind] of Object.entries(MAKING)) {
          const v = app.making[k];
          if (v == null || v === "") continue;
          if (typeof v !== kind) err(`"making.${k}" doit être ${kind === "number" ? "un nombre" : "un texte"}`);
          else making[k] = v;
        }
    }
    if (!existsSync(join(dir, app.build?.output || "", "index.html")) && !app.build) err(`index.html manquant`);
    apps.push({
      num,
      id: m[1],
      slug: folder,
      title: app.title,
      tagline: app.tagline,
      publishAt: app.publishAt,
      date: day?.date,
      theme: day?.theme,
      color: app.color || day?.color || "#FFF8E1",
      tags: Array.isArray(app.tags) ? app.tags : [],
      status: app.status || "prêt",
      criterion: app.criterion || null,
      making: Object.keys(making).length ? making : null,
      logo: logoOf(dir, folder),
      build: app.build || null,
      dir,
    });
  }
  const seen = new Set();
  for (const a of apps) {
    if (seen.has(a.num)) errors.push(`deux apps portent le numéro ${a.id}`);
    seen.add(a.num);
  }
  return { apps, errors };
}
