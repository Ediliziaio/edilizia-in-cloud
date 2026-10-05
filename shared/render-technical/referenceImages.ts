// shared/render-technical/referenceImages.ts
//
// Foto di riferimento condivise per i moduli tecnici. Una sola edge
// (generate-technical-render) serve cinque moduli: qui si decide, PER MODULO,
// quale libreria di foto può entrare. Una foto di porta non deve mai finire nel
// render di un giardino, né una pavimentazione in quello di una porta: ogni
// modulo legge solo le proprie tabelle.
//
// Il collector riceve la configurazione RICCA — quella che il ponte costruisce
// dal preset (bridge.ts) o che arriva già strutturata per le porte — cioè lo
// stesso oggetto da cui nasce il prompt. Così il gating della foto (finitura
// soltanto, bordo soltanto, scorrevole non costruibile…) coincide con quello che
// il prompt chiede.
//
// Ristrutturazioni: nessuna foto. Il preset abbraccia più domini nella stessa
// scena (bagno, involucro, outdoor) e la libreria di prompt non è importabile
// dall'edge: senza una configurazione strutturata non c'è un elemento preciso a
// cui legare una foto.

import {
  collectInteriorDoorReferenceImages,
  collectSecurityDoorReferenceImages,
} from "../render-references/doorReferences.ts";
import {
  collectExteriorFloorReferenceImages,
  collectGardenReferenceImages,
} from "../render-references/exteriorReferences.ts";
import type { SharedReferenceImage } from "../render-references/referenceUrl.ts";
import type { PhotoEntry } from "../render-references/referencePicker.ts";
import { bridgeTechnicalConfig, type BridgedModule } from "./bridge.ts";

export function collectTechnicalReferenceImages(
  moduleType: string,
  configRicca: Record<string, unknown> | null | undefined,
): SharedReferenceImage[] {
  if (!configRicca || typeof configRicca !== "object") return [];
  switch (moduleType) {
    case "porte-interne":
      return collectInteriorDoorReferenceImages(configRicca);
    case "porte-blindate":
      return collectSecurityDoorReferenceImages(configRicca);
    case "pavimenti-esterni":
      return collectExteriorFloorReferenceImages(configRicca);
    case "giardini":
      return collectGardenReferenceImages(configRicca);
    default:
      return [];
  }
}

// ── Miniature del form ──────────────────────────────────────────────────────
//
// Il form mostra accanto a preset e opzioni la STESSA foto che il motore
// allegherebbe: le funzioni qui sotto non hanno una tabella loro, costruiscono
// la configurazione ricca col ponte e chiedono al collector. Se una scelta non
// porta foto (o il gating la esclude), il form non mostra niente.

type FotoForm = Pick<PhotoEntry, "folder" | "filename">;

const MODULI_COL_PONTE: BridgedModule[] = ["giardini", "pavimenti-esterni", "porte-interne", "porte-blindate"];

function fotoPer(modulo: string, generica: Record<string, unknown>): SharedReferenceImage[] {
  if (!MODULI_COL_PONTE.includes(modulo as BridgedModule)) return [];
  return collectTechnicalReferenceImages(modulo, bridgeTechnicalConfig(modulo as BridgedModule, generica));
}

/** La foto che il motore allega per questo preset, senza altre scelte (la più importante). */
export function fotoDelPreset(modulo: string, preset: string): FotoForm | null {
  const [ref] = fotoPer(modulo, { interventionPreset: preset });
  return ref ? { folder: ref.folder, filename: ref.filename } : null;
}

/**
 * La foto che entra PER QUESTO valore dell'opzione: quella la cui chiave, nell'etichetta
 * «RUOLO — chiave: …», è il valore scelto (o finisce con «/valore», per le foto legate a
 * una posa). Un valore che non porta una foto sua (es. una posa che riusa la foto del
 * materiale) non ha miniatura: mostrerebbe una cosa diversa da quella scelta.
 */
export function fotoDellOpzione(modulo: string, preset: string, chiave: string, valore: string): FotoForm | null {
  const refs = fotoPer(modulo, { interventionPreset: preset, opzioni: { [chiave]: valore } });
  const ref = refs.find((r) => r.label.includes(` — ${valore}: `) || r.label.includes(`/${valore}: `));
  return ref ? { folder: ref.folder, filename: ref.filename } : null;
}
