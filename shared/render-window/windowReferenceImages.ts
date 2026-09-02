// shared/render-window/windowReferenceImages.ts — v8.3.3 (2026-05-15)
//
// Costruisce l'elenco delle FOTO REFERENCE che vanno passate INSIEME alla foto
// sorgente al modello image-edit (Gemini Nano Banana / GPT-5 Image).
//
// Perché serve: Gemini è nativamente multi-image. Se gli passiamo SOLO la foto
// del cliente, tende a "ricolorare" la finestra esistente invece di sostituirla.
// Se invece gli passiamo ANCHE la mazzetta del colore target, la foto della
// maniglia, il sample del nodo asimmetrico, il sample cassonetto coordinato,
// l'AI ha ancore visive forti su cui agganciarsi e produce un vero replacement.
//
// L'edge function `generate-render` consuma questa lista per:
//   - fetchare le foto da public/render-references/<category>/<filename>
//   - convertirle in dataUrl base64
//   - passarle a editImage() come `referenceImages`
//
// Il prompt builder usa lo stesso array per generare una LEGENDA dichiarata
// ("Image 1 = source, Image 2 = frame color, Image 3 = handle model, …") che
// dice esplicitamente all'AI quale immagine è autoritativa per cosa.

import {
  WIZARD_CASS_MATERIALI,
  WIZARD_CERNIERE_OPTIONS,
  WIZARD_HANDLE_TYPES,
  WIZARD_NODO_OPTIONS,
  WIZARD_RAL,
  WIZARD_TAPP_COLORS,
  findWizardWood,
  getReferenceImageUrl,
  WIZARD_PROFILI,
  WIZARD_TRAVERSO_OPTIONS,
} from "./catalog.ts";
import type { WindowRenderConfig, WindowTechnicalSpecification } from "./types.ts";

export type RenderReferenceKind =
  | "frame_color"
  | "handle"
  | "node_profile"
  | "hidden_hinges"
  | "cassonetto"
  | "tapparella_color"
  | "profile"
  | "traverso";

export interface RenderReferenceImage {
  /** Categoria semantica (per logging / debug). */
  kind: RenderReferenceKind;
  /** Label descrittiva usata nel prompt LEGEND ("Frame finish — Grigio Ardesia"). */
  label: string;
  /** Filename del file in public/render-references/. */
  filename: string;
  /** URL completo (con dominio) — risolto da getReferenceImageUrl. */
  url: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolver per ogni tipo di reference
// ─────────────────────────────────────────────────────────────────────────────

function resolveFrameColorRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  const f = spec.finish;
  // Modalità legno: lookup per woodEffectId
  if (f.mode === "legno" && f.woodEffectId) {
    const wood = findWizardWood(f.woodEffectId);
    if (wood?.referenceImage) {
      return {
        kind: "frame_color",
        label: `FRAME COLOR TARGET — ${wood.nome} wood-effect`,
        filename: wood.referenceImage,
        url: getReferenceImageUrl(wood.referenceImage)!,
      };
    }
    return null;
  }
  // Modalità RAL: cerca per code (mapFrameFinish salva ral.code, non ral.id)
  if (f.ral) {
    const ral = WIZARD_RAL.find((r) => r.code === f.ral) ??
      WIZARD_RAL.find((r) => r.id === f.ral);
    if (ral?.referenceImage) {
      const codeLabel = ral.code ? ` (RAL ${ral.code})` : "";
      return {
        kind: "frame_color",
        label: `FRAME COLOR TARGET — ${ral.nome}${codeLabel}`,
        filename: ral.referenceImage,
        url: getReferenceImageUrl(ral.referenceImage)!,
      };
    }
  }
  // Bianco/avorio massa: cerca per nome match
  if (f.name) {
    const ral = WIZARD_RAL.find(
      (r) => r.nome.toLowerCase() === f.name.toLowerCase(),
    );
    if (ral?.referenceImage) {
      return {
        kind: "frame_color",
        label: `FRAME COLOR TARGET — ${ral.nome}`,
        filename: ral.referenceImage,
        url: getReferenceImageUrl(ral.referenceImage)!,
      };
    }
  }
  return null;
}

function resolveHandleRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  const handle = WIZARD_HANDLE_TYPES.find((h) => h.id === spec.handleStyle);
  if (!handle?.referenceImage) return null;
  return {
    kind: "handle",
    // La foto mostra il MODELLO in una sola finitura: se il cliente ne ha
    // scelta un'altra, il modello deve copiare la forma e applicare la finitura
    // richiesta, non quella della foto.
    label: `HANDLE MODEL TARGET — ${handle.label}: copy the SHAPE from this photo; apply the requested finish "${spec.handleFinish}" even if the photo shows a different finish`,
    filename: handle.referenceImage,
    url: getReferenceImageUrl(handle.referenceImage)!,
  };
}

function resolveNodeProfileRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  // Solo per casi non-standard: maniglia centrale o nodo asimmetrico ridotto
  if (spec.centralHandle) {
    const n = WIZARD_NODO_OPTIONS.find((x) => x.id === "maniglia_centrale");
    if (n?.referenceImage) {
      return {
        kind: "node_profile",
        label: "CENTRAL-HANDLE PROFILE REFERENCE (slim mullion ~30mm with single central handle)",
        filename: n.referenceImage,
        url: getReferenceImageUrl(n.referenceImage)!,
      };
    }
  } else if (spec.reducedNode) {
    const n = WIZARD_NODO_OPTIONS.find((x) => x.id === "asimmetrico");
    if (n?.referenceImage) {
      return {
        kind: "node_profile",
        label: "ASYMMETRIC REDUCED-NODE REFERENCE (palettone slim ~70mm, more glass)",
        filename: n.referenceImage,
        url: getReferenceImageUrl(n.referenceImage)!,
      };
    }
  }
  return null;
}

function resolveHiddenHingesRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  if (spec.hingeMode !== "hidden") return null;
  const cern = WIZARD_CERNIERE_OPTIONS.find((c) => c.id === "scomparsa");
  if (!cern?.referenceImage) return null;
  return {
    kind: "hidden_hinges",
    label: "HIDDEN HINGES REFERENCE — lateral stile is clean, no visible hinge knuckles",
    filename: cern.referenceImage,
    url: getReferenceImageUrl(cern.referenceImage)!,
  };
}

function resolveCassonettoRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  if (!spec.cassonetto.replace || !spec.cassonetto.materialId) return null;
  const cass = WIZARD_CASS_MATERIALI.find(
    (c) => c.id === spec.cassonetto.materialId,
  );
  if (!cass?.referenceImage) return null;
  return {
    kind: "cassonetto",
    label: `CASSONETTO MODEL TARGET — ${cass.label}${spec.cassonetto.colorLabel ? ` in ${spec.cassonetto.colorLabel}` : ""}`,
    filename: cass.referenceImage,
    url: getReferenceImageUrl(cass.referenceImage)!,
  };
}

function resolveTapparellaColorRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  // Per ora la maggior parte di WIZARD_TAPP_COLORS NON ha referenceImage (sono
  // colori RAL standard senza foto reale dedicata). Se in futuro carichi foto
  // su public/render-references/colors/ con prefisso "Tapparella-", aggiorna
  // qui. Lasciamo il branch attivo per coerenza con gli altri resolver.
  if (!spec.shutter.replace || !spec.shutter.colorLabel) return null;
  // Trova nella palette WIZARD_TAPP_COLORS o WIZARD_RAL per code
  const colorLabel = spec.shutter.colorLabel.toLowerCase();
  const tappMatch = WIZARD_TAPP_COLORS.find(
    (c) => c.nome.toLowerCase() === colorLabel,
  );
  if (tappMatch && "referenceImage" in tappMatch && (tappMatch as { referenceImage?: string }).referenceImage) {
    const filename = (tappMatch as { referenceImage: string }).referenceImage;
    return {
      kind: "tapparella_color",
      label: `TAPPARELLA COLOR TARGET — ${tappMatch.nome}`,
      filename,
      url: getReferenceImageUrl(filename)!,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profilo (materiale del telaio) e traverso — foto reali da Wikimedia Commons
// (crediti in public/render-references/CREDITS.md).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sezione reale del profilo scelto (PVC 5 camere, legno Euro 68,
 * legno-alluminio): dice al modello com'e' fatto il telaio — spessore a
 * vista, camere, fermavetro, guarnizioni — senza mostrare una finestra intera,
 * cosi' non porta con se' un numero di ante.
 */
function resolveProfileRef(
  spec: WindowTechnicalSpecification,
): RenderReferenceImage | null {
  const profilo = WIZARD_PROFILI.find((p) => p.id === spec.profileId);
  const filename = profilo && "referenceImage" in profilo
    ? (profilo as { referenceImage?: string }).referenceImage
    : undefined;
  if (!profilo || !filename) return null;
  return {
    kind: "profile",
    label: `FRAME PROFILE TARGET — ${profilo.label}: real cross-section of this frame system; take the visible frame depth, glazing bead, gasket and material construction from it. It is a cut sample, NOT a window: do not copy any sash count or layout from it`,
    filename,
    url: getReferenceImageUrl(filename)!,
  };
}

/**
 * Traverso: solo quando l'utente ha chiesto esplicitamente di aggiungerlo o
 * di toglierlo. "aggiungi" → foto di una finestra con UN traverso a meta'
 * altezza; "rimuovi" → foto di ante a vetro intero. Con "auto"/"mantieni" la
 * scena comanda e nessuna foto viene allegata.
 */
function resolveTraversoRef(
  traversoMode: string | null | undefined,
): RenderReferenceImage | null {
  if (traversoMode !== "aggiungi" && traversoMode !== "rimuovi") return null;
  const opt = WIZARD_TRAVERSO_OPTIONS.find((o) => o.id === traversoMode);
  const filename = opt && "referenceImage" in opt ? (opt as { referenceImage?: string | null }).referenceImage : undefined;
  if (!filename) return null;
  return {
    kind: "traverso",
    label: traversoMode === "aggiungi"
      ? "TRANSOM TARGET — the new window MUST have ONE horizontal transom bar at about mid-height, dividing each sash into an upper and a lower glass pane, exactly like this photo (copy the bar, not the building)"
      : "NO-TRANSOM TARGET — the new window has full-height sashes, each a single uninterrupted glass pane with NO horizontal bar, like this photo (copy the clean sash, not the room)",
    filename,
    url: getReferenceImageUrl(filename)!,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Costruisce la lista delle foto reference da passare al modello image-edit.
 * Deduplica per filename: se più spec condividono la stessa foto (caso comune
 * con multi-target che ha lo stesso colore frame), la foto è inviata una volta.
 *
 * Limite pratico: max 6 reference oltre alla foto sorgente, per non saturare
 * il context del modello e mantenere la priorità sulla scena.
 */
export function collectReferenceImages(
  config: WindowRenderConfig,
): RenderReferenceImage[] {
  const out: RenderReferenceImage[] = [];
  const seen = new Set<string>();
  const push = (ref: RenderReferenceImage | null) => {
    if (!ref) return;
    if (seen.has(ref.filename)) return;
    seen.add(ref.filename);
    out.push(ref);
  };

  // Usiamo il PRIMO spec (multi-opening con stesso config è il caso più comune;
  // se serve gestire spec diversi per opening, è facile estendere a forEach).
  const spec = config.technical_specification[0];
  if (!spec) return out;

  // v8.6.9 — Quando c'e' una composition change (sash count cambia), riduciamo
  // drasticamente le reference images. Motivo: le foto profilo/cassonetto/nodo
  // mostrano strutture con N-sashes — il modello image-edit le interpreta come
  // "preserve this structure" e tende a replicare il source sash count. Per
  // forzare la trasformazione 2→1 (o simili), passiamo SOLO frame color +
  // handle (neutre, non strutturali). Niente node/cassonetto/hidden_hinges
  // che mostrerebbero strutture multi-sash.
  const hasCompositionChange = spec.compositionChange != null;

  push(resolveFrameColorRef(spec));
  push(resolveHandleRef(spec));
  if (!hasCompositionChange) {
    push(resolveNodeProfileRef(spec));
    // Sezione reale del profilo: dopo il nodo (che decide la struttura a 2
    // ante) e prima delle cerniere. E' un campione tagliato, non porta ante.
    push(resolveProfileRef(spec));
    push(resolveHiddenHingesRef(spec));
    // Traverso solo su richiesta esplicita (aggiungi/rimuovi): e' un'istruzione
    // strutturale, viene prima di cassonetto e colore tapparella.
    const traversoMode = (config as { legacy_config?: { traverso_mode?: string } }).legacy_config?.traverso_mode;
    push(resolveTraversoRef(traversoMode));
    push(resolveCassonettoRef(spec));
    push(resolveTapparellaColorRef(spec));
  }

  // v8.5.6 — Cap 4 reference per velocità OpenAI.
  // v8.6.9 — Con composition change, naturalmente diventa max 2 (color+handle).
  return out.slice(0, 4);
}

/**
 * Costruisce il blocco di legenda da iniettare nel prompt PRIMA di tutto il
 * resto. Spiega al modello esattamente cosa rappresenta ogni immagine che sta
 * ricevendo, così aggancia il colore/profilo target alla foto reference invece
 * di "indovinare" guardando la finestra vecchia.
 */
export function buildReferenceImageLegend(
  refs: RenderReferenceImage[],
): string {
  if (refs.length === 0) return "";
  const lines: string[] = [];
  lines.push("[BLOCK 0 — IMAGE INPUTS LEGEND — READ FIRST]");
  lines.push(
    "You are receiving MULTIPLE images in this request. Each image has a SPECIFIC role. " +
      "DO NOT confuse them. Use them as described below:",
  );
  lines.push("");
  lines.push(
    "📷 IMAGE 1 = SOURCE SCENE PHOTO. This is the room with the OLD window currently installed. " +
      "Your job: preserve EVERY pixel of this image EXCEPT the target opening(s). The colors, " +
      "materials, geometry of the OLD window in this photo are NOT the target — they are what we " +
      "are REPLACING. DO NOT carry over the old window's color/handle/proportions into the new render.",
  );
  refs.forEach((r, i) => {
    lines.push(
      `🎨 IMAGE ${i + 2} = ${r.label}. ` +
        `This image is a SWATCH / PRODUCT REFERENCE — it is NOT a scene element. ` +
        `Extract its visual properties (color tone, finish texture, shape, proportions, hardware design) ` +
        `and APPLY them to the corresponding element of the NEW window inside the scene of Image 1. ` +
        `Do NOT paste, copy, or place this swatch image anywhere in the final output. ` +
        `Do NOT render a small swatch-like rectangle on the wall. The swatch is a TARGET, not an object.`,
    );
  });
  lines.push("");
  lines.push(
    "🔴 HARD RULE 1: when in doubt about a color or material of the NEW window, take the answer from the REFERENCE images (2, 3, …), NEVER from the OLD window visible in Image 1.",
  );
  lines.push(
    "🔴 HARD RULE 2: the reference images (2, 3, …) MUST NOT appear in the final render. They are invisible inputs. The final render is a single edited version of Image 1 with the new window installed.",
  );
  lines.push(
    "🔴 HARD RULE 3: the HANDLE in the final render MUST replicate the EXACT model shown in the HANDLE REFERENCE image (if provided): same shape, same mounting style, same finish. It MUST NOT keep the silhouette/model of the OLD handle visible in Image 1.",
  );
  return lines.join("\n");
}
