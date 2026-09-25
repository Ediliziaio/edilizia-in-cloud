import { findSalesArea } from "./areas";
import type { ModuleDocument } from "./moduleDocuments";
import { archivioModelliAzienda } from "./archivioModelli";
type StoragePort = Pick<Storage, "getItem" | "setItem">;
export interface SavedModuleDocument {
  version: 1;
  savedAt: string;
  document: ModuleDocument;
}
export const documentKey = (
  companyId: string,
  area: string,
  module: string,
) => {
  if (
    !companyId ||
    !findSalesArea(area)?.interventions.some((m) => m.id === module)
  )
    throw new Error("Azienda o modulo non valido.");
  return `eic:module-document:v1:${encodeURIComponent(companyId)}:${area}:${module}`;
};
export function validateModuleDocument(
  value: unknown,
  company: string,
  area: string,
  module: string,
): asserts value is ModuleDocument {
  const d = value as ModuleDocument | null;
  const string = (v: unknown, limit: number) =>
    typeof v === "string" && v.length <= limit;
  if (
    !d ||
    d.version !== 1 ||
    d.companyId !== company ||
    d.areaId !== area ||
    d.moduleId !== module ||
    !string(d.title, 120) ||
    !d.title.trim() ||
    !string(d.subtitle, 400) ||
    !/^#[0-9a-f]{6}$/i.test(d.color) ||
    !(
      d.image === null ||
      (typeof d.image === "string" &&
        (/^\/module-art\/[a-z0-9-]+\.jpg$/.test(d.image) ||
          (d.image.length <= 1500000 &&
            /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
              d.image,
            ))))
    ) ||
    !string(d.imageCaption, 350) ||
    !d.company ||
    [d.company.name, d.company.address, d.company.email, d.company.phone].some(
      (v) => !string(v, 250),
    ) ||
    !Array.isArray(d.pages) ||
    d.pages.length < 1 ||
    d.pages.length > 12 ||
    new Set(d.pages.map((p) => p?.id)).size !== d.pages.length ||
    d.pages.some(
      (p) =>
        !p ||
        !string(p.id, 60) ||
        !/^[a-z0-9-]+$/.test(p.id) ||
        p.id === "copertina" ||
        !string(p.title, 120) ||
        !p.title.trim() ||
        !string(p.intro, 800) ||
        typeof p.visible !== "boolean" ||
        !Array.isArray(p.items) ||
        p.items.length > 8 ||
        p.items.some(
          (v) => !v || !string(v.title, 140) || !string(v.text, 1800),
        ),
    )
  ) {
    throw new Error(
      "Il modello contiene dati non validi o appartiene a un'altra azienda. Nessun dato è stato sovrascritto.",
    );
  }
}
export function loadModuleDocument(
  company: string,
  area: string,
  module: string,
  storage: StoragePort = archivioModelliAzienda,
): SavedModuleDocument | null {
  const raw = storage.getItem(documentKey(company, area, module));
  if (raw === null) return null;
  let r: SavedModuleDocument;
  try {
    r = JSON.parse(raw);
  } catch {
    throw new Error(
      "Copia locale danneggiata. Conserva i dati: non verranno sovrascritti.",
    );
  }
  if (
    r?.version !== 1 ||
    typeof r.savedAt !== "string" ||
    !Number.isFinite(Date.parse(r.savedAt))
  )
    throw new Error("Copia locale non leggibile.");
  validateModuleDocument(r.document, company, area, module);
  return r;
}
export function saveModuleDocument(
  document: ModuleDocument,
  expectedRevision: string | null,
  storage: StoragePort = archivioModelliAzienda,
): SavedModuleDocument {
  const { companyId, areaId, moduleId } = document;
  validateModuleDocument(document, companyId, areaId, moduleId);
  const old = loadModuleDocument(companyId, areaId, moduleId, storage);
  if ((old?.savedAt ?? null) !== expectedRevision)
    throw new Error(
      "Questo modulo è cambiato in un'altra scheda. Riaprilo prima di salvare.",
    );
  const record: SavedModuleDocument = {
    version: 1,
    savedAt: new Date(
      Math.max(Date.now(), old ? Date.parse(old.savedAt) + 1 : 0),
    ).toISOString(),
    document,
  };
  try {
    storage.setItem(
      documentKey(companyId, areaId, moduleId),
      JSON.stringify(record),
    );
  } catch {
    throw new Error(
      "Spazio locale esaurito o browser non disponibile. Riduci l'immagine oppure esporta una copia: la bozza rimane aperta.",
    );
  }
  return record;
}
