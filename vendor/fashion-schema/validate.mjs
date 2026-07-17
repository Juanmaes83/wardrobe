// GENERADO por Fashion-Studio-SOL/tools/sync-ontology.mjs — NO EDITAR.
// Copia canónica de packages/fashion-schema/validate.mjs (ontología v1.1.0).
// Validador ligero de la Ontología V1 (sin dependencias). Es el MISMO código que
// usan el migrador, el exportador y los tests: una sola interpretación del contrato.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ONTOLOGY = JSON.parse(readFileSync(path.join(here, "ontology.json"), "utf8"));

const HEX = /^#[0-9a-f]{6}$/i;
const inVocab = (field, value) => ONTOLOGY[field]?.values?.includes(value);

// Campos con vocabulario cerrado (opcionales salvo los de identidad/clasificación base)
const VOCAB_FIELDS = ["category", "garmentType", "material", "pattern", "silhouette", "fit", "style"];
const VOCAB_ARRAY_FIELDS = ["season", "occasion"];

/**
 * Valida un Garment v0.2. Devuelve { ok, errors[] }.
 * Reglas: id/name/bodyArea obligatorios; el resto opcional pero, si existe,
 * debe pertenecer al vocabulario. `unknown` se representa OMITIENDO el campo
 * y (opcionalmente) anotando fieldProvenance[campo] = "unknown".
 */
export function validateGarment(g) {
  const errors = [];
  const where = g?.id || "?";
  if (!g || typeof g !== "object") return { ok: false, errors: ["garment no es un objeto"] };
  if (!g.id) errors.push(`${where}: falta id`);
  if (!g.name) errors.push(`${where}: falta name`);
  const area = g.bodyArea || g.part; // compat con datos históricos
  if (!inVocab("bodyArea", area)) errors.push(`${where}: bodyArea/part inválido (${area})`);
  if (g.color && !HEX.test(g.color)) errors.push(`${where}: color inválido`);
  if (g.secondaryColor != null && g.secondaryColor !== "" && !HEX.test(g.secondaryColor)) errors.push(`${where}: secondaryColor inválido`);

  for (const f of VOCAB_FIELDS) {
    if (g[f] != null && !inVocab(f, g[f])) errors.push(`${where}: ${f} fuera de vocabulario (${g[f]})`);
  }
  for (const f of VOCAB_ARRAY_FIELDS) {
    if (g[f] != null) {
      if (!Array.isArray(g[f])) errors.push(`${where}: ${f} debe ser array`);
      else g[f].forEach(v => { if (!inVocab(f, v)) errors.push(`${where}: ${f} fuera de vocabulario (${v})`); });
    }
  }
  if (g.subcategory != null) {
    const cat = g.category;
    const allowed = ONTOLOGY.subcategoryByCategory[cat] || [];
    if (!allowed.includes(g.subcategory)) errors.push(`${where}: subcategory ${g.subcategory} no pertenece a ${cat || "(sin category)"}`);
  }
  if (g.thermalWeight != null && !ONTOLOGY.thermalWeight.values.includes(g.thermalWeight)) {
    errors.push(`${where}: thermalWeight fuera de rango`);
  }
  if (g.fieldProvenance != null) {
    for (const [k, v] of Object.entries(g.fieldProvenance)) {
      if (!ONTOLOGY.provenance.includes(v)) errors.push(`${where}: provenance inválida en ${k} (${v})`);
    }
  }
  if (g.tags != null && !Array.isArray(g.tags)) errors.push(`${where}: tags debe ser array`);
  if (g.price != null && (typeof g.price !== "number" || g.price < 0)) errors.push(`${where}: price inválido`);
  return { ok: !errors.length, errors };
}

/**
 * Valida un Outfit contra la biblioteca. Reglas: id/name/garmentIds; estados del
 * vocabulario; garmentIds deben existir; sin slots duplicados (dos prendas en el
 * mismo bodyArea) salvo accessories_up.
 */
export function validateOutfit(o, garmentsById) {
  const errors = [];
  const where = o?.id || "?";
  if (!o || typeof o !== "object") return { ok: false, errors: ["outfit no es un objeto"] };
  if (!o.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(o.id)) errors.push(`${where}: id inválido`);
  if (!o.name) errors.push(`${where}: falta name`);
  if (!Array.isArray(o.garmentIds) || !o.garmentIds.length) errors.push(`${where}: garmentIds vacío`);
  if (o.status && !ONTOLOGY.outfitStatus.values.includes(o.status)) errors.push(`${where}: status inválido (${o.status})`);
  const seen = new Map();
  for (const id of o.garmentIds || []) {
    const g = garmentsById?.[id];
    if (!g) { errors.push(`${where}: garmentId no existe (${id})`); continue; }
    const area = g.bodyArea || g.part;
    if (area !== "accessories_up") {
      if (seen.has(area)) errors.push(`${where}: conflicto de slot ${area} (${seen.get(area)} vs ${id})`);
      seen.set(area, id);
    }
  }
  for (const f of ["occasion", "season"]) {
    (o[f] || []).forEach(v => { if (!ONTOLOGY[f].values.includes(v)) errors.push(`${where}: ${f} fuera de vocabulario (${v})`); });
  }
  // style es un valor único (nullable) del vocabulario canónico — misma interpretación
  // que el JSON Schema derivado (outfit.schema.json).
  if (o.style != null && o.style !== "" && !ONTOLOGY.style.values.includes(o.style)) {
    errors.push(`${where}: style fuera de vocabulario (${o.style})`);
  }
  if (o.tags != null && !Array.isArray(o.tags)) errors.push(`${where}: tags debe ser array`);
  return { ok: !errors.length, errors };
}

export function isPublishable(outfit) {
  return ONTOLOGY.outfitPublishable.includes(outfit.status);
}

/* ---------------- Máquina de estados de outfit (única e ineludible) ----------------
   Creación/importación SIEMPRE nacen en `draft`: ninguna vía puede parir un outfit
   directamente approved o published. La única forma de cambiar de estado es
   reviewTransition, y `publish` exige estado `approved`. */

export const OUTFIT_INITIAL_STATUS = "draft";

// Verbo de revisión → estado destino, con guardas.
const REVIEW_VERBS = {
  submit: { to: "review", from: ["draft", "rejected"] },
  approve: { to: "approved", from: ["review", "draft", "rejected"] },
  reject: { to: "rejected", from: ["draft", "review", "approved", "published"] },
  draft: { to: "draft", from: ["review", "approved", "rejected", "published"] },
  publish: { to: "published", from: ["approved"] }
};

// Estado con el que nace un outfit, ignorando cualquier status entrante (anti-bypass).
export function sanitizeNewOutfitStatus() {
  return OUTFIT_INITIAL_STATUS;
}

// Transición válida o null. `current` = estado actual, `verb` = acción de revisión.
export function reviewTransition(current, verb) {
  const rule = REVIEW_VERBS[verb];
  if (!rule) return { ok: false, error: `acción inválida: ${verb}` };
  if (!rule.from.includes(current)) return { ok: false, error: `no se puede '${verb}' desde '${current}'` };
  return { ok: true, status: rule.to };
}

export const REVIEW_ACTIONS = Object.keys(REVIEW_VERBS);
