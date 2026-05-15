// shared/render-window/catalog.ts — v8 (2026-05-14)
// CHANGELOG v8:
//   + WIZARD_TRAVERSO_OPTIONS (auto | mantieni | rimuovi | aggiungi)
//   + WIZARD_CERNIERE_OPTIONS (visibili | scomparsa)
//   + WizardState.traverso + WizardState.cerniere
//   + Profili compatibili con cerniere a scomparsa
//   + Nuovo profilo "alluminio_minimal_premium" come variante upsell

export const WIZARD_TIPI = [
  { id: "F1A", label: "Finestra 1 anta", shortLabel: "F1A", desc: "Finestra battente a un'anta, vano standard." },
  { id: "F2A", label: "Finestra 2 ante", shortLabel: "F2A", desc: "Finestra battente a due ante, configurazione più comune." },
  { id: "F3A", label: "Finestra 3 ante", shortLabel: "F3A", desc: "Finestra a tre ante per aperture ampie." },
  { id: "PF1A", label: "Portafinestra 1 anta", shortLabel: "PF1A", desc: "Portafinestra a un'anta con soglia bassa." },
  { id: "PF2A", label: "Portafinestra 2 ante", shortLabel: "PF2A", desc: "Portafinestra a due ante per balconi e terrazzi." },
  { id: "PF3A", label: "Portafinestra 3 ante", shortLabel: "PF3A", desc: "Portafinestra a tre ante per vani molto ampi." },
  { id: "SCORR", label: "Scorrevole / Alzante", shortLabel: "SCORR", desc: "Scorrevole o alzante scorrevole con profilo dedicato." },
] as const;

export const WIZARD_PROFILI = [
  { id: "pvc", label: "PVC", desc: "Profilo isolante classico 70-80 mm, adatto a sostituzione residenziale." },
  { id: "alluminio", label: "Alluminio", desc: "Estruso 55 mm, proporzioni più snelle, thermal break a vista." },
  { id: "minimal", label: "Alluminio Minimal", desc: "Profilo architettonico ultra-sottile 45 mm con sightline minimale (look premium, non da confondere con nodo ridotto)." },
  { id: "legno", label: "Legno", desc: "Resa calda e tradizionale con profilo 82 mm più materico." },
  { id: "legno_alluminio", label: "Legno-Alluminio", desc: "Legno interno 82 mm + protezione alluminio esterna." },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// v8.1 — NODO (configurazione delle ante centrali)
// In edilizia italiana il "nodo" è il punto di incontro tra due ante.
// Tre configurazioni standard:
//   - simmetrico:   2 ante uguali con doppio montante centrale (~110 mm visibili)
//   - asimmetrico:  anta principale + anta secondaria con palettone che copre
//                   il bordo. Il nodo visibile è ridotto (~70-80 mm).
//                   Questa è la configurazione comunemente detta "nodo ridotto".
//   - maniglia_centrale: variante asimmetrica dove la maniglia è montata sul
//                   palettone al centro, anziché lateralmente sull'anta principale.
//                   Solo per finestre/portefinestre a 2 ante.
// ─────────────────────────────────────────────────────────────────────────────

export const WIZARD_NODO_OPTIONS = [
  {
    id: "simmetrico",
    label: "Nodo simmetrico (classico)",
    desc: "Ante uguali, doppio montante centrale spesso (~110 mm). Soluzione standard residenziale.",
    icon: "◧◨",
  },
  {
    id: "asimmetrico",
    label: "Nodo asimmetrico (ridotto)",
    desc: "Anta principale + anta secondaria con palettone. Nodo centrale visibilmente più sottile (~70 mm). Più vetro, look pulito.",
    icon: "▎▌",
    upsell: true,
  },
  {
    id: "maniglia_centrale",
    label: "Maniglia centrale",
    desc: "Variante asimmetrica con UNA SOLA maniglia montata sul palettone al centro. Solo per finestre/portefinestre a 2 ante.",
    icon: "◯",
    upsell: true,
  },
] as const;

/** Profili compatibili con nodo asimmetrico / maniglia centrale.
 *  Tutti i profili moderni supportano l'asimmetrico. Il legno classico
 *  spesso resta su simmetrico per fedeltà al disegno tradizionale. */
export const PROFILI_NODO_ASIMMETRICO_COMPATIBILI = [
  "pvc",
  "alluminio",
  "minimal",
  "legno_alluminio",
  // "legno",  // attivare solo se vuoi proporre il nodo ridotto anche su legno classico
] as const;

/** @deprecated v8.1 — usa PROFILI_NODO_ASIMMETRICO_COMPATIBILI + WizardState.nodo === "maniglia_centrale". */
export const PROFILI_MANIGLIA_CENTRALE_COMPATIBILI = PROFILI_NODO_ASIMMETRICO_COMPATIBILI;

/** v8 — Profili compatibili con cerniere a scomparsa.
 *  Tipicamente solo profili di gamma media-alta supportano le cerniere nascoste
 *  (richiede telai più rigidi e geometrie precise). Il PVC base entry-level
 *  NORMALMENTE non le supporta. Se vuoi attivarle anche su PVC base, aggiungi
 *  "pvc" qui (occhio: serve PVC top di gamma 80mm+). */
export const PROFILI_CERNIERE_NASCOSTE_COMPATIBILI = [
  "alluminio",
  "minimal",
  "legno_alluminio",
  // "pvc",     // attivare solo per PVC premium 80mm+
  // "legno",   // legno classico tende ad avere cerniere a vista decorative
] as const;

export const WIZARD_RAL = [
  { id: "9016", nome: "Bianco Traffico", hex: "#F1F0EA" },
  { id: "9010", nome: "Bianco Puro", hex: "#F7F5E8" },
  { id: "7016", nome: "Grigio Antracite", hex: "#383E42" },
  { id: "7035", nome: "Grigio Luce", hex: "#C5C7C4" },
  { id: "9005", nome: "Nero", hex: "#0E0E10" },
  { id: "8019", nome: "Marrone Tabacco", hex: "#3E3332" },
  { id: "6005", nome: "Verde Muschio", hex: "#0F4336" },
  { id: "5010", nome: "Blu Genziana", hex: "#004F7C" },
  { id: "3005", nome: "Rosso Vino", hex: "#5E2028" },
  { id: "1013", nome: "Bianco Perla", hex: "#E3DBC9" },
] as const;

export const WIZARD_LEGNO = [
  {
    id: "noce",
    nome: "Noce",
    hex: "#6B4226",
    grad: "linear-gradient(135deg,#8B5E3C,#5C3317)",
    grain: "rgba(67,39,21,0.35)",
    accent: "rgba(181,132,87,0.22)",
    fragment: "walnut wood-effect laminate with dark brown tone and visible longitudinal grain",
  },
  {
    id: "golden_oak",
    nome: "Golden Oak",
    hex: "#B8860B",
    grad: "linear-gradient(135deg,#DAA520,#9B7600)",
    grain: "rgba(126,78,0,0.3)",
    accent: "rgba(255,221,122,0.2)",
    fragment: "golden oak wood-effect laminate with warm amber tone and pronounced grain",
  },
  {
    id: "bianco_frassino",
    nome: "Bianco Frassino",
    hex: "#ECEAE2",
    grad: "linear-gradient(135deg,#F1EFE7,#DAD6CB)",
    grain: "rgba(165,158,148,0.28)",
    accent: "rgba(255,255,255,0.32)",
    fragment: "white ash wood-effect Touch finish (embossed/brushed): warm bright off-white tone close to RAL 9010, with vertical fine ash grain visible as soft pale-grey embossed lines. Subtle 3D textured surface, not flat plastic. Wood grain is dense, mostly straight, lightly variegated. Reference: 'bianco frassino' colore commerciale standard.",
  },
  {
    id: "ciliegio",
    nome: "Ciliegio",
    hex: "#9B3D12",
    grad: "linear-gradient(135deg,#B5451C,#7A2E0A)",
    grain: "rgba(98,37,13,0.28)",
    accent: "rgba(205,102,56,0.2)",
    fragment: "cherry wood-effect laminate with reddish brown tone and fine straight grain",
  },
  {
    id: "douglas",
    nome: "Douglas",
    hex: "#C4956A",
    grad: "linear-gradient(135deg,#D4A574,#A07848)",
    grain: "rgba(122,84,42,0.24)",
    accent: "rgba(255,221,179,0.18)",
    fragment: "douglas fir wood-effect laminate with honey tone and clear growth-ring pattern",
  },
  {
    id: "rovere",
    nome: "Rovere Naturale",
    hex: "#A0845C",
    grad: "linear-gradient(135deg,#B89A6B,#8A6D44)",
    grain: "rgba(114,88,52,0.26)",
    accent: "rgba(228,197,139,0.18)",
    fragment: "natural oak wood-effect laminate with golden brown tone and open grain texture",
  },
  {
    id: "castagno",
    nome: "Castagno",
    hex: "#5C3A1E",
    grad: "linear-gradient(135deg,#7A4E2A,#4A2C14)",
    grain: "rgba(56,31,13,0.3)",
    accent: "rgba(167,106,60,0.2)",
    fragment: "chestnut wood-effect laminate with warm dark brown tone and wavy grain",
  },
  {
    id: "grigio_quarzo",
    nome: "Grigio Quarzo",
    hex: "#6B6B6B",
    grad: "linear-gradient(135deg,#808080,#5A5A5A)",
    grain: "rgba(56,56,56,0.28)",
    accent: "rgba(205,205,205,0.18)",
    fragment: "quartz grey wood-effect laminate with neutral grey tone and faint wood texture",
  },
] as const;

export const WIZARD_HW_COLORS = [
  { id: "cromo", nome: "Cromo", hex: "#C0C0C0", hw_id: "cromo_lucido", finish: "polished chrome" },
  { id: "inox", nome: "Cromo satinato / inox", hex: "#A8A8A8", hw_id: "inox_spazzolato", finish: "brushed stainless steel" },
  { id: "nero_opaco", nome: "Nero Opaco", hex: "#2A2A2A", hw_id: "nero_opaco", finish: "matte black powder coat" },
  { id: "bronzo", nome: "Bronzo", hex: "#8B6914", hw_id: "bronzo_anticato", finish: "antique bronze patina" },
  { id: "oro", nome: "Oro", hex: "#D4A017", hw_id: "oro_pvd", finish: "polished gold PVD coating" },
  { id: "titanio", nome: "Titanio", hex: "#6B7B8D", hw_id: "titanio", finish: "titanium anodized" },
] as const;

export const WIZARD_HANDLE_TYPES = [
  { id: "classica_dritta", label: "Standard dritta", desc: "La maniglia più neutra e residenziale.", family: "lineare" },
  { id: "q_moderna", label: "Squadrata", desc: "Look più tecnico e contemporaneo.", family: "squadrata" },
  { id: "toulon", label: "Ergonomica", desc: "Curva morbida, premium e confortevole.", family: "curva" },
  { id: "con_rosetta", label: "Con rosetta", desc: "Leva con rosetta visibile, più classica.", family: "rosetta" },
  { id: "pomolo", label: "Pomolo / pull", desc: "Scelta decorativa o da contesto speciale.", family: "pomolo" },
  { id: "alzante", label: "Alzante scorrevole", desc: "Corpo maniglia dedicato agli scorrevoli.", family: "alzante" },
] as const;

export const WIZARD_CASS_MATERIALI = [
  { id: "stesso_colore", label: "Stesso colore infisso", desc: "Cassonetto coordinato al nuovo serramento.", icon: "🎨" },
  { id: "pvc_bianco", label: "PVC Bianco", desc: "Cassonetto PVC bianco standard.", icon: "⬜" },
  { id: "alluminio", label: "Alluminio", desc: "Cassonetto coibentato in alluminio.", icon: "🔲" },
  { id: "colore_custom", label: "Altro RAL", desc: "Cassonetto con colore dedicato.", icon: "🎯" },
] as const;

export const WIZARD_TAPP_OPTIONS = [
  { id: "no", label: "Mantieni attuali", desc: "Lascia invariato il sistema oscurante esistente.", icon: "—" },
  { id: "motorizzate", label: "Motorizzata", desc: "Nuova tapparella motorizzata. Rimuovo la cinghia manuale e installo il bottone elettrico al suo posto.", icon: "⚡" },
  { id: "nuove", label: "Nuove + colore", desc: "Sostituisci la tapparella con nuovo colore/finitura.", icon: "🎨" },
] as const;

// ── v8 NEW ─────────────────────────────────────────────────────────────────

export const WIZARD_TRAVERSO_OPTIONS = [
  {
    id: "auto",
    label: "Automatico",
    desc: "Se nella foto c'è un traverso, lo mantengo. Altrimenti, anta intera completamente vetrata.",
    icon: "✨",
  },
  {
    id: "mantieni",
    label: "Mantieni traverso",
    desc: "Mantengo il montante orizzontale a metà altezza (vetro sopra + vetro/pannello sotto).",
    icon: "═",
  },
  {
    id: "rimuovi",
    label: "Rimuovi traverso",
    desc: "Anta intera completamente vetrata, senza divisori orizzontali. Look pulito e contemporaneo.",
    icon: "▭",
  },
  {
    id: "aggiungi",
    label: "Aggiungi traverso",
    desc: "Aggiungo un traverso orizzontale a metà altezza (look classico stile francese).",
    icon: "╋",
  },
] as const;

export const WIZARD_CERNIERE_OPTIONS = [
  {
    id: "visibili",
    label: "Cerniere a vista",
    desc: "Cerniere classiche visibili sul lato dell'anta. Soluzione standard, costo contenuto.",
    icon: "◖",
  },
  {
    id: "scomparsa",
    label: "Cerniere a scomparsa",
    desc: "Cerniere completamente nascoste nel telaio. L'anta sembra fluttuare contro il telaio quando chiusa. Look premium architettonico.",
    icon: "▢",
    upsell: true,
  },
] as const;

// ── Type exports ──────────────────────────────────────────────────────────

export type WizardTipo = (typeof WIZARD_TIPI)[number]["id"];
export type WizardProfilo = (typeof WIZARD_PROFILI)[number]["id"];
export type WizardHw = (typeof WIZARD_HW_COLORS)[number]["id"];
export type WizardHandleType = (typeof WIZARD_HANDLE_TYPES)[number]["id"];
export type WizardCassMat = (typeof WIZARD_CASS_MATERIALI)[number]["id"];
export type WizardTapp = (typeof WIZARD_TAPP_OPTIONS)[number]["id"];
export type WizardTraverso = (typeof WIZARD_TRAVERSO_OPTIONS)[number]["id"];
export type WizardCerniere = (typeof WIZARD_CERNIERE_OPTIONS)[number]["id"];
/** v8.1 — Nodo (configurazione ante centrali). */
export type WizardNodo = (typeof WIZARD_NODO_OPTIONS)[number]["id"];

export interface WizardState {
  tipo: WizardTipo | "";
  profilo: WizardProfilo | "";
  /** @deprecated v8.1 — usa `nodo: "maniglia_centrale"` invece. Manteniamo per backward-compat UI. */
  manigliaCentrale: boolean;
  coloreInfisso: string;
  tipoManiglia: WizardHandleType;
  coloreHw: WizardHw;
  cass: boolean;
  cassMat: WizardCassMat;
  cassCol: string;
  tapp: WizardTapp;
  tappCol: string;

  // ── v8 ───────────────────────────────────────────────────────────────
  traverso: WizardTraverso;
  cerniere: WizardCerniere;

  // ── v8.1 ─────────────────────────────────────────────────────────────
  /** Configurazione del nodo centrale (solo per 2 ante).
   *  - "simmetrico"        → 2 ante uguali, doppio montante (default tradizionale)
   *  - "asimmetrico"       → palettone + palettino, nodo ridotto (~70 mm)
   *  - "maniglia_centrale" → asimmetrico + maniglia singola sul palettone */
  nodo: WizardNodo;
}

// ── Helpers (existing + v8) ───────────────────────────────────────────────

export function findWizardRal(id: string) {
  return WIZARD_RAL.find((item) => item.id === id) ?? null;
}

export function findWizardWood(id: string) {
  return WIZARD_LEGNO.find((item) => item.id === id) ?? null;
}

export function getWizardColorById(id: string) {
  return findWizardRal(id) ?? findWizardWood(id) ?? null;
}

export function getWizardTipoMeta(tipo: WizardTipo | "") {
  return WIZARD_TIPI.find((item) => item.id === tipo) ?? null;
}

export function getWizardProfiloMeta(profilo: WizardProfilo | "") {
  return WIZARD_PROFILI.find((item) => item.id === profilo) ?? null;
}

export function getWizardHardwareMeta(hw: WizardHw) {
  return WIZARD_HW_COLORS.find((item) => item.id === hw) ?? WIZARD_HW_COLORS[0];
}

export function getWizardHandleTypeMeta(handleType: WizardHandleType) {
  return WIZARD_HANDLE_TYPES.find((item) => item.id === handleType) ?? WIZARD_HANDLE_TYPES[0];
}

export function getWizardCassonettoMeta(cass: WizardCassMat) {
  return WIZARD_CASS_MATERIALI.find((item) => item.id === cass) ?? WIZARD_CASS_MATERIALI[0];
}

export function getWizardTapparellaMeta(tapp: WizardTapp) {
  return WIZARD_TAPP_OPTIONS.find((item) => item.id === tapp) ?? WIZARD_TAPP_OPTIONS[0];
}

/** v8 — Helper traverso */
export function getWizardTraversoMeta(traverso: WizardTraverso) {
  return WIZARD_TRAVERSO_OPTIONS.find((item) => item.id === traverso) ?? WIZARD_TRAVERSO_OPTIONS[0];
}

/** v8 — Helper cerniere */
export function getWizardCerniereMeta(cerniere: WizardCerniere) {
  return WIZARD_CERNIERE_OPTIONS.find((item) => item.id === cerniere) ?? WIZARD_CERNIERE_OPTIONS[0];
}

/** v8 — Verifica se il profilo selezionato supporta cerniere a scomparsa. */
export function profileSupportsHiddenHinges(profilo: WizardProfilo | ""): boolean {
  return PROFILI_CERNIERE_NASCOSTE_COMPATIBILI.includes(profilo as never);
}

/** v8.1 — Helper nodo */
export function getWizardNodoMeta(nodo: WizardNodo) {
  return WIZARD_NODO_OPTIONS.find((item) => item.id === nodo) ?? WIZARD_NODO_OPTIONS[0];
}

/** v8.1 — Verifica se il profilo selezionato supporta nodo asimmetrico / maniglia centrale. */
export function profileSupportsAsymmetricNode(profilo: WizardProfilo | ""): boolean {
  return PROFILI_NODO_ASIMMETRICO_COMPATIBILI.includes(profilo as never);
}
