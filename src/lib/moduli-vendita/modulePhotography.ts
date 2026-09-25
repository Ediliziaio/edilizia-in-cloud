/** Illustrations enrich editorial pages; they never populate customer galleries or before/after evidence. */
import { BGN_CHECK_IMAGES, BGN_EDITORIAL_PHOTO_REPLACEMENTS, BGN_ACCESSIBILITY_CLOSING_IMAGE } from "./bgnEditorialPhotography";
import { TETTI_PHOTOGRAPHY_CORRECTIONS } from "./tettiPhotographyCorrections";
import { RST_PHOTO_CORRECTIONS } from "./rstPhotoCorrections";
import { IDR_PHOTO_CORRECTIONS } from "./idrPhotoCorrections";
import { CLM_PHOTO_CORRECTIONS } from "./clmPhotoCorrections";
import { SALES_AREAS } from "./areas";
import { SERRAMENTI_DETAIL_IMAGES } from "./serramentiEditorialPhotography";
type Blocks = Record<string, unknown>;
const record = (value: unknown): Blocks => value && typeof value === "object" && !Array.isArray(value) ? value as Blocks : {};
const common = "/pdf-stock/comune/";
const sectorPhotos: Record<string, { protection: string; checks: string; process: string }> = {
  serramenti: { protection: "/pdf-stock/serramenti/protezione.jpg", checks: "/pdf-stock/serramenti/controllo-squadro.jpg", process: "/pdf-stock/serramenti/rilievo.jpg" },
  ristrutturazione: { protection: "/pdf-stock/ristrutturazione/protezione-scale.jpg", checks: "/pdf-stock/ristrutturazione/controllo-planarita.jpg", process: "/pdf-stock/ristrutturazione/cantiere-ordinato.jpg" },
  bagni: { protection: "/pdf-stock/bagni/protezione.jpg", checks: `${common}controllo-finale.jpg`, process: "/pdf-stock/bagni/installazione.jpg" },
  tetti: { protection: "/pdf-stock/tetti/protezione.jpg", checks: "/pdf-stock/tetti/controllo-termico.jpg", process: "/pdf-stock/tetti/installazione.jpg" },
  termoidraulico: { protection: `${common}protezione-ambienti.jpg`, checks: "/pdf-stock/termoidraulico/collaudo.jpg", process: "/pdf-stock/termoidraulico/risultato.jpg" },
  fotovoltaico: { protection: "/pdf-stock/fotovoltaico/sopralluogo.jpg", checks: "/pdf-stock/fotovoltaico/controllo-termografico.jpg", process: "/pdf-stock/fotovoltaico/installazione.jpg" },
};
const hasPhoto = (value: unknown) => Array.isArray(record(value).foto) && (record(value).foto as unknown[]).some(v => typeof v === "string" && v.length > 0);
const note = "Immagine illustrativa: non documenta un lavoro aziendale, una verifica eseguita o l'immobile del cliente. Le attività incluse sono quelle della proposta.";

/** Factory-only: call before capturing modulo_defaults, never on arbitrary user overrides. */
export function completeModulePhotography(value: unknown, sector: string): Blocks {
  const blocks = structuredClone(record(value));
  const source = sectorPhotos[sector];
  if (!source) return blocks;
  const p = { ...source };
  if (sector === "tetti" && blocks.modulo_intervento === "impermeabilizzazione") {
    p.protection = TETTI_PHOTOGRAPHY_CORRECTIONS.impermeabilizzazione.protezione.newUrl;
    p.checks = TETTI_PHOTOGRAPHY_CORRECTIONS.impermeabilizzazione.controlli.newUrl;
  }
  if (sector === "bagni") p.checks = BGN_CHECK_IMAGES[blocks.modulo_intervento as keyof typeof BGN_CHECK_IMAGES] ?? p.checks;
  if (sector === "fotovoltaico") {
    if (["accumulo", "componenti"].includes(String(blocks.modulo_intervento))) {
      p.protection = "/pdf-stock/fotovoltaico/inverter-batteria-garage.jpg";
      p.checks = "/pdf-stock/fotovoltaico/quadro-elettrico.jpg";
      p.process = "/pdf-stock/fotovoltaico/componenti-elettrici.jpg";
    } else if (blocks.modulo_intervento === "manutenzione") {
      p.process = "/pdf-stock/fotovoltaico/quadro-elettrico.jpg";
    }
  }
  if (sector === "bagni" && ["sanitari", "rinnovo"].includes(String(blocks.modulo_intervento))) {
    const detail = record(blocks.comeFunziona).foto;
    if (Array.isArray(detail) && typeof detail[0] === "string") p.process = detail[0];
  }
  if (sector === "bagni" && blocks.modulo_intervento === "accessibilita") {
    p.process = BGN_CHECK_IMAGES.accessibilita;
  }
  if (sector === "termoidraulico") {
    const detail = record(blocks.comeFunziona).foto;
    if (Array.isArray(detail) && typeof detail[0] === "string") p.process = detail[0];
    if (blocks.modulo_intervento === "acqua-calda") p.checks = "/module-art/termoidraulica-acqua-calda-verifica.jpg";
    else p.checks = IDR_PHOTO_CORRECTIONS.find(change => change.moduleId === blocks.modulo_intervento && change.key === "controlli")?.newUrl ?? p.checks;
  }
  const suggestions: Record<string, string> = { protezione: p.protection, controlli: p.checks, documenti: `${common}consegna-documenti.jpg`, diario: p.process };
  if (sector === "serramenti") {
    const detail = SERRAMENTI_DETAIL_IMAGES[blocks.modulo_intervento as keyof typeof SERRAMENTI_DETAIL_IMAGES];
    if (detail) suggestions.comeFunziona = detail;
  }
  // Some sectors have specific image semantics; keep a configured photo intact.
  for (const [key, url] of Object.entries(suggestions)) {
    if (blocks[key] && !hasPhoto(blocks[key])) blocks[key] = { ...record(blocks[key]), foto: [url], senzaFoto: false, nota: note };
  }
  const library = Array.isArray(blocks.modulo_foto) ? blocks.modulo_foto as { url: string; nome: string }[] : [];
  const used = new Set(Object.values(blocks).flatMap(v => Array.isArray(record(v).foto) ? record(v).foto as string[] : []));
  const closing = sector === "serramenti" ? "pagina_cta" : sector === "fotovoltaico" ? "pagina_decisione" : "pagina_chiusura";
  // Prefer an unused intervention photograph over an unrelated sector fallback.
  if (!hasPhoto(blocks[closing])) {
    const available = sector === "bagni" && blocks.modulo_intervento === "accessibilita"
      ? { url: BGN_ACCESSIBILITY_CLOSING_IMAGE }
      : library.find((photo, i) => i > 0 && !used.has(photo.url)) ?? library[0];
    if (available) blocks[closing] = { foto: [available.url], senzaFoto: false };
  }
  const actual = Object.values(blocks).flatMap(v => Array.isArray(record(v).foto) ? record(v).foto as string[] : []);
  blocks.modulo_foto = [...new Map([...library, ...actual.filter(url => !library.some(photo => photo.url === url)).map(url => ({ url, nome: "Foto editoriale · illustrativa" }))].map(photo => [photo.url, photo])).values()];
  blocks.modulo_foto_revisione = 2;
  return blocks;
}

/** Pure preview for an explicit update button. The optional ID must come from the
 * local module's outer context, never from editable titles. No persistence here. */
export function prepareModulePhotoRefresh(value: unknown, sector: string, knownModuleId?: string): { blocks: Blocks; added: number } {
  const blocks = structuredClone(record(value));
  const oldDefaults = record(blocks.modulo_defaults);
  if (!Object.keys(oldDefaults).length) return { blocks, added: 0 };
  const storedIds = [blocks.modulo_intervento, oldDefaults.modulo_intervento].filter(id => id != null && id !== "");
  // Conflicting identity is not safe to repair. Only accept a real intervention in this sector.
  if (storedIds.some(id => id !== storedIds[0]) || (knownModuleId && storedIds.some(id => id !== knownModuleId))) return { blocks, added: 0 };
  const contextualId = !storedIds.length && knownModuleId;
  if (contextualId && !SALES_AREAS.some(area => area.sourceModule === sector && area.interventions.some(item => item.id === contextualId))) return { blocks, added: 0 };
  const alreadyRefreshed = blocks.modulo_foto_revisione === 2;
  // New exact corrections may be released after a document reached revision 2.
  // Do not gate these on the revision: equality with the captured default is
  // the safety boundary. Generic fill-in below remains disabled for revision 2.
  const corrected = structuredClone(oldDefaults);
  const id = String(storedIds[0] ?? contextualId ?? "");
  if (id) corrected.modulo_intervento = id;
  const maps: Record<string, Record<string, Record<string, { oldUrl: string | null; newUrl: string | null }>>> = {
    serramenti: Object.fromEntries(Object.entries(SERRAMENTI_DETAIL_IMAGES).map(([id, newUrl]) => [id, {
      comeFunziona: { oldUrl: null as string | null, newUrl },
    }])),
    elettrico: { quadro: {
      comeFunziona: { oldUrl: "/pdf-stock/fotovoltaico/componenti-elettrici.jpg", newUrl: "/module-art/elettrico-quadro-dettaglio-v1.jpg" },
    } },
    bagni: BGN_EDITORIAL_PHOTO_REPLACEMENTS,
    tetti: TETTI_PHOTOGRAPHY_CORRECTIONS,
    ristrutturazione: RST_PHOTO_CORRECTIONS,
    climatizzazione: CLM_PHOTO_CORRECTIONS,
    termoidraulico: Object.fromEntries([...new Set(IDR_PHOTO_CORRECTIONS.map(change => change.moduleId))].map(id => [id, Object.fromEntries(IDR_PHOTO_CORRECTIONS.filter(change => change.moduleId === id).map(change => [change.key, change]))])),
    fotovoltaico: Object.fromEntries(["accumulo", "componenti", "nuovo", "ampliamento", "manutenzione"].map(module => [module, {
      diario: { oldUrl: "/pdf-stock/fotovoltaico/consegna-app.jpg", newUrl: ["accumulo", "componenti"].includes(module) ? "/pdf-stock/fotovoltaico/componenti-elettrici.jpg" : module === "manutenzione" ? "/pdf-stock/fotovoltaico/quadro-elettrico.jpg" : "/pdf-stock/fotovoltaico/installazione.jpg" },
      ...(["accumulo", "componenti"].includes(module) ? {
        protezione: { oldUrl: "/pdf-stock/fotovoltaico/sopralluogo.jpg", newUrl: "/pdf-stock/fotovoltaico/inverter-batteria-garage.jpg" },
        controlli: { oldUrl: "/pdf-stock/fotovoltaico/controllo-termografico.jpg", newUrl: "/pdf-stock/fotovoltaico/quadro-elettrico.jpg" },
      } : {}),
    }])),
  };
  const replacements = maps[sector]?.[id] ?? {};
  for (const [key, change] of Object.entries(replacements)) {
    const before = record(corrected[key]);
    if (JSON.stringify(before.foto ?? []) !== JSON.stringify(change.oldUrl ? [change.oldUrl] : [])) continue;
    corrected[key] = { ...before, foto: change.newUrl ? [change.newUrl] : [], senzaFoto: !change.newUrl };
  }
  // Revision 2 only retries exact mapped replacements;
  // never rerun generic fill-in over a document that was already refreshed.
  const nextDefaults = alreadyRefreshed ? corrected : completeModulePhotography(corrected, sector);
  const appliedDefaults = structuredClone(oldDefaults);
  let added = 0;
  for (const [key, candidate] of Object.entries(nextDefaults)) {
    if (!hasPhoto(candidate) && !replacements[key]) continue;
    if (JSON.stringify(record(candidate).foto ?? []) === JSON.stringify(record(oldDefaults[key]).foto ?? []) && record(candidate).senzaFoto === record(oldDefaults[key]).senzaFoto) continue;
    const before = record(oldDefaults[key]);
    // An explicitly deleted/null block is a removal, not an inherited default.
    if ((key in oldDefaults && !(key in blocks)) || (key in blocks && (!blocks[key] || typeof blocks[key] !== "object"))) continue;
    const current = record(blocks[key] ?? before);
    if ("foto" in before && !("foto" in current)) continue;
    // Check photo fields independently: editing a title must not prevent adding the missing photo.
    if (JSON.stringify(current.foto ?? []) !== JSON.stringify(before.foto ?? []) || current.senzaFoto !== before.senzaFoto) continue;
    // Captions are editable copy too: a photo refresh must not erase them.
    const caption = !key.startsWith("pagina_") && current.nota === before.nota ? { nota: note } : {};
    blocks[key] = { ...current, foto: record(candidate).foto, senzaFoto: record(candidate).senzaFoto ?? false, ...caption };
    appliedDefaults[key] = { ...record(candidate), ...caption };
    added++;
  }
  if (added) {
    if (id) blocks.modulo_intervento = appliedDefaults.modulo_intervento = id;
    const library = Array.isArray(nextDefaults.modulo_foto) ? nextDefaults.modulo_foto as { url: string; nome: string }[] : [];
    const urls = Object.values(nextDefaults).flatMap(value => Array.isArray(record(value).foto) ? record(value).foto as string[] : []);
    nextDefaults.modulo_foto = [...new Map([...library, ...urls.map(url => ({ url, nome: "Foto editoriale · illustrativa" }))].map(photo => [photo.url, photo])).values()];
    // Do not replace defaults beneath a removed/custom block while updating another one.
    appliedDefaults.modulo_foto = nextDefaults.modulo_foto;
    appliedDefaults.modulo_foto_revisione = 2;
    blocks.modulo_defaults = appliedDefaults;
    const currentLibrary = Array.isArray(blocks.modulo_foto) ? blocks.modulo_foto as { url: string; nome: string }[] : [];
    const freshLibrary = Array.isArray(nextDefaults.modulo_foto) ? nextDefaults.modulo_foto as { url: string; nome: string }[] : [];
    blocks.modulo_foto = [...new Map([...freshLibrary, ...currentLibrary].map(photo => [photo.url, photo])).values()];
    blocks.modulo_foto_revisione = 2;
  }
  return { blocks, added };
}
