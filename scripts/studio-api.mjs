// Studio API — Fase 3/4 de Fashion Studio SOL (aditivo; no toca el pipeline).
// Gestiona la Ontología V1 sobre library.json y el Outfit Layer sobre outfits.json.
//
//   GET    /api/studio/ontology            vocabularios V1 (copia generada del canónico)
//   PATCH  /api/studio/garments/:id        edita campos de una prenda (marca human_confirmed)
//   GET    /api/studio/outfits             lista outfits
//   POST   /api/studio/outfits             crea outfit (draft) — manual o import de manifest
//   PATCH  /api/studio/outfits/:id         edita metadatos/prendas
//   POST   /api/studio/outfits/:id/review  { action: approve|reject|draft }
//   POST   /api/studio/outfits/:id/asset   { imageBase64, kind: "editorial"|"flatlay" }
//   DELETE /api/studio/outfits/:id
//   GET    /api/import/outfits/:file       sirve data/outfit-images/* (lo que la skill esperaba)
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
// Contrato canónico VENDORIZADO desde Fashion-Studio-SOL (tools/sync-ontology.mjs).
// Wardrobe usa el MISMO validador y la MISMA máquina de estados: ninguna regla se
// reimplementa aquí, así que no puede divergir de la fuente.
import {
  ONTOLOGY as VENDOR_ONT, validateOutfit as validateOutfitCanonical,
  sanitizeNewOutfitStatus, reviewTransition
} from "../vendor/fashion-schema/validate.mjs";

const HEX = /^#[0-9a-f]{6}$/i;
const AREAS = VENDOR_ONT.bodyArea.values;

// Campos de prenda editables desde el Studio (Ontología V1)
const GARMENT_FIELDS = ["name", "description", "part", "bodyArea", "category", "subcategory", "garmentType", "color", "secondaryColor", "material", "pattern", "silhouette", "fit", "season", "style", "occasion", "thermalWeight", "tags", "price", "currency", "sizes", "productUrl", "brand", "collection", "sku"];

export function studioApi() {
  const root = process.cwd();
  const dataDir = path.join(root, "data");
  const libFile = path.join(dataDir, "library.json");
  const outfitsFile = path.join(dataDir, "outfits.json");
  const outfitImagesDir = path.join(dataDir, "outfit-images");
  const ontologyFile = path.join(root, "vendor", "fashion-schema", "ontology.json");

  const readJson = async (file, fallback) => {
    try { return JSON.parse(await readFile(file, "utf8")); }
    catch (e) { if (e.code === "ENOENT") return fallback; throw e; }
  };
  const atomic = async (file, value) => {
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value, null, 2) + "\n");
    await rename(tmp, file);
  };
  const body = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw Object.assign(new Error("JSON inválido"), { status: 400 }); }
  };
  const json = (res, status, value) => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(value));
  };

  async function ontology() { return readJson(ontologyFile, null); }

  // Validación de outfit = validador canónico vendorizado (misma semántica exacta).
  const validateOutfit = (o, garmentsById) => validateOutfitCanonical(o, garmentsById).errors;

  return {
    name: "studio-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, "http://localhost");
        try {
          // ---- assets de outfit (la skill los referenciaba; ahora existen) ----
          const assetMatch = url.pathname.match(/^\/api\/import\/outfits\/([\w.-]+\.png)$/);
          if (assetMatch && req.method === "GET") {
            const file = path.join(outfitImagesDir, path.basename(assetMatch[1]));
            if (!existsSync(file)) return json(res, 404, { error: "asset no encontrado" });
            res.setHeader("content-type", "image/png");
            res.end(await readFile(file));
            return;
          }
          if (!url.pathname.startsWith("/api/studio/")) return next();

          if (url.pathname === "/api/studio/ontology" && req.method === "GET") {
            const ont = await ontology();
            return ont ? json(res, 200, ont) : json(res, 503, { error: "public/ontology.json no encontrado; sincroniza desde fashion-schema" });
          }

          // ---- prendas ----
          const gMatch = url.pathname.match(/^\/api\/studio\/garments\/([\w-]+)$/);
          if (gMatch && req.method === "PATCH") {
            const library = await readJson(libFile, []);
            const idx = library.findIndex(g => g.id === gMatch[1]);
            if (idx === -1) return json(res, 404, { error: "prenda no encontrada" });
            const input = await body(req);
            const ont = await ontology();
            const rec = { ...library[idx] };
            rec.fieldProvenance = { ...(rec.fieldProvenance || {}) };
            const errors = [];
            for (const [k, v] of Object.entries(input)) {
              if (!GARMENT_FIELDS.includes(k)) continue;
              if (["color", "secondaryColor"].includes(k) && v && !HEX.test(v)) { errors.push(`${k} inválido`); continue; }
              if (ont) {
                if (["category", "garmentType", "material", "pattern", "silhouette", "fit", "style"].includes(k) && v != null && v !== "" && !ont[k].values.includes(v)) { errors.push(`${k} fuera de vocabulario: ${v}`); continue; }
                if (["season", "occasion"].includes(k) && Array.isArray(v) && v.some(x => !ont[k].values.includes(x))) { errors.push(`${k} fuera de vocabulario`); continue; }
                if (k === "subcategory" && v && !(ont.subcategoryByCategory[input.category ?? rec.category] || []).includes(v)) { errors.push(`subcategory no pertenece a la categoría`); continue; }
                if ((k === "part" || k === "bodyArea") && v && !AREAS.includes(v)) { errors.push(`${k} inválido`); continue; }
              }
              if (v === null || v === "") { delete rec[k]; rec.fieldProvenance[k] = "unknown"; }
              else { rec[k] = v; rec.fieldProvenance[k] = "human_confirmed"; }
            }
            if (input.part) { rec.bodyArea = input.part; }
            if (input.bodyArea) { rec.part = input.bodyArea; }
            if (errors.length) return json(res, 400, { errors });
            rec.schemaVersion = "garment/v0.2";
            rec.review = { ...(rec.review || {}), status: "approved", by: "studio-editor", at: new Date().toISOString() };
            library[idx] = rec;
            await atomic(libFile, library);
            return json(res, 200, rec);
          }

          // ---- outfits ----
          const load = async () => {
            const data = await readJson(outfitsFile, { version: 1, outfits: [] });
            data.outfits ||= [];
            return data;
          };
          const garmentsById = async () => Object.fromEntries((await readJson(libFile, [])).map(g => [g.id, g]));

          if (url.pathname === "/api/studio/outfits" && req.method === "GET") {
            return json(res, 200, await load());
          }
          if (url.pathname === "/api/studio/outfits" && req.method === "POST") {
            const input = await body(req);
            const data = await load();
            // admite outfit único o manifest { outfits: [...] }
            const incoming = Array.isArray(input.outfits) ? input.outfits : [input];
            const byId = await garmentsById();
            const ont = await ontology();
            const created = [];
            for (const raw of incoming) {
              const o = {
                id: raw.id, name: raw.name?.trim(), description: raw.description || raw.reason || "",
                garmentIds: raw.garmentIds || [], occasion: raw.occasion || [], season: raw.season || [],
                style: raw.style || null, tags: raw.tags || [],
                image: raw.image || null, flatLayImage: raw.flatLayImage || null,
                // Anti-bypass: crear/importar SIEMPRE nace en draft, ignorando el
                // status entrante. Publicar exige pasar por el workflow de revisión.
                status: sanitizeNewOutfitStatus(raw.status),
                source: raw.source || (Array.isArray(input.outfits) ? "manifest-import" : "manual"),
                createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
                history: [{ at: new Date().toISOString(), event: "created", via: raw.source || "studio" }]
              };
              const errors = validateOutfit(o, byId);
              if (data.outfits.some(x => x.id === o.id)) errors.push(`id duplicado: ${o.id}`);
              if (errors.length) return json(res, 400, { id: o.id, errors });
              created.push(o);
            }
            data.outfits.push(...created);
            await atomic(outfitsFile, data);
            return json(res, 201, { created: created.map(o => o.id), total: data.outfits.length });
          }

          const oMatch = url.pathname.match(/^\/api\/studio\/outfits\/([\w-]+)(?:\/(\w+))?$/);
          if (!oMatch) return json(res, 404, { error: "ruta no encontrada" });
          const data = await load();
          const idx = data.outfits.findIndex(o => o.id === oMatch[1]);
          if (idx === -1) return json(res, 404, { error: "outfit no encontrado" });
          const outfit = data.outfits[idx];
          const action = oMatch[2] || "";

          if (!action && req.method === "DELETE") {
            data.outfits.splice(idx, 1);
            await atomic(outfitsFile, data);
            return json(res, 200, { deleted: oMatch[1] });
          }
          if (!action && req.method === "PATCH") {
            const input = await body(req);
            const next = { ...outfit };
            for (const k of ["name", "description", "garmentIds", "occasion", "season", "style", "tags", "image", "flatLayImage"]) {
              if (input[k] !== undefined) next[k] = input[k];
            }
            const errors = validateOutfit(next, await garmentsById());
            if (errors.length) return json(res, 400, { errors });
            next.updatedAt = new Date().toISOString();
            next.status = ["approved", "published"].includes(outfit.status) ? "review" : outfit.status; // editar un aprobado lo devuelve a revisión
            next.history = [...(outfit.history || []), { at: next.updatedAt, event: "edited" }];
            data.outfits[idx] = next;
            await atomic(outfitsFile, data);
            return json(res, 200, next);
          }
          if (action === "review" && req.method === "POST") {
            const { action: verb, note } = await body(req);
            // Única vía de cambio de estado: máquina de estados canónica vendorizada.
            const t = reviewTransition(outfit.status, verb);
            if (!t.ok) return json(res, 409, { error: t.error });
            outfit.status = t.status;
            outfit.updatedAt = new Date().toISOString();
            outfit.history = [...(outfit.history || []), { at: outfit.updatedAt, event: t.status, note: note || null }];
            data.outfits[idx] = outfit;
            await atomic(outfitsFile, data);
            return json(res, 200, outfit);
          }
          if (action === "asset" && req.method === "POST") {
            const { imageBase64, kind = "editorial" } = await body(req);
            if (!imageBase64) return json(res, 400, { error: "falta imageBase64" });
            const bytes = Buffer.from(imageBase64.replace(/^data:image\/png;base64,/, ""), "base64");
            if (bytes.length < 100) return json(res, 400, { error: "imagen vacía" });
            await mkdir(outfitImagesDir, { recursive: true });
            const name = `${outfit.id}${kind === "flatlay" ? "-flatlay" : ""}.png`;
            await writeFile(path.join(outfitImagesDir, name), bytes);
            const ref = `outfit-images/${name}`;
            if (kind === "flatlay") outfit.flatLayImage = ref; else outfit.image = ref;
            outfit.updatedAt = new Date().toISOString();
            outfit.history = [...(outfit.history || []), { at: outfit.updatedAt, event: `asset:${kind}` }];
            data.outfits[idx] = outfit;
            await atomic(outfitsFile, data);
            return json(res, 200, outfit);
          }
          return json(res, 405, { error: "método no soportado" });
        } catch (error) {
          return json(res, error.status || 500, { error: error.message });
        }
      });
    }
  };
}
