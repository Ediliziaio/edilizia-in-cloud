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
  { id: "pvc", label: "PVC", desc: "Profilo isolante classico 70-82 mm, adatto a sostituzione residenziale." },
  { id: "alluminio", label: "Alluminio", desc: "Estruso contemporaneo, proporzioni più snelle e lineari." },
  { id: "minimal", label: "Minimal", desc: "Nodo ridotto e sightline sottile, look premium." },
  { id: "legno", label: "Legno", desc: "Resa calda e tradizionale con profilo più materico." },
  { id: "legno_alluminio", label: "Legno-Alluminio", desc: "Legno interno e protezione alluminio esterna." },
] as const;

export const PROFILI_MANIGLIA_CENTRALE_COMPATIBILI = [
  "pvc",
  "alluminio",
  "minimal",
  "legno",
  "legno_alluminio",
] as const;

export const PROFILI_CERNIERE_NASCOSTE_COMPATIBILI = [
  "alluminio",
  "minimal",
  "legno_alluminio",
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
    hex: "#E8DCC8",
    grad: "linear-gradient(135deg,#F0E6D2,#D4C5A9)",
    grain: "rgba(128,115,93,0.22)",
    accent: "rgba(255,255,255,0.24)",
    fragment: "white ash wood-effect laminate with pale cream tone and subtle silver-grey grain",
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
  { id: "motorizzate", label: "Motorizzata", desc: "Nuova tapparella motorizzata con rimozione automatismi manuali.", icon: "⚡" },
  { id: "nuove", label: "Nuove + colore", desc: "Sostituisci la tapparella con nuovo colore/finitura.", icon: "🎨" },
] as const;

export const WIZARD_TRAVERSO_OPTIONS = [
  {
    id: "auto",
    label: "Automatico",
    desc: "Mantiene o rimuove il traverso solo quando la foto lo richiede.",
    badge: "Consigliato",
  },
  {
    id: "mantieni",
    label: "Mantieni traverso",
    desc: "Conserva il traverso orizzontale esistente, utile su portefinestre alte.",
  },
  {
    id: "rimuovi",
    label: "Vetro unico",
    desc: "Rimuove il traverso e pulisce la composizione, se tecnicamente plausibile.",
  },
  {
    id: "aggiungi",
    label: "Aggiungi traverso",
    desc: "Aggiunge un traverso coerente quando vuoi riprendere una scansione classica.",
  },
] as const;

export const WIZARD_CERNIERE_OPTIONS = [
  {
    id: "visibili",
    label: "Cerniere visibili",
    desc: "Cerniere coordinate alla maniglia, leggibili e coerenti con un serramento standard.",
  },
  {
    id: "scomparsa",
    label: "Cerniere a scomparsa",
    desc: "Look più pulito: nessuna cerniera laterale visibile quando il profilo lo permette.",
    upsell: true,
  },
] as const;

export type WizardTipo = (typeof WIZARD_TIPI)[number]["id"];
export type WizardProfilo = (typeof WIZARD_PROFILI)[number]["id"];
export type WizardHw = (typeof WIZARD_HW_COLORS)[number]["id"];
export type WizardHandleType = (typeof WIZARD_HANDLE_TYPES)[number]["id"];
export type WizardCassMat = (typeof WIZARD_CASS_MATERIALI)[number]["id"];
export type WizardTapp = (typeof WIZARD_TAPP_OPTIONS)[number]["id"];
export type WizardTraverso = (typeof WIZARD_TRAVERSO_OPTIONS)[number]["id"];
export type WizardCerniere = (typeof WIZARD_CERNIERE_OPTIONS)[number]["id"];

export interface WizardState {
  tipo: WizardTipo | "";
  profilo: WizardProfilo | "";
  manigliaCentrale: boolean;
  coloreInfisso: string;
  tipoManiglia: WizardHandleType;
  coloreHw: WizardHw;
  cass: boolean;
  cassMat: WizardCassMat;
  cassCol: string;
  tapp: WizardTapp;
  tappCol: string;
  traverso: WizardTraverso;
  cerniere: WizardCerniere;
}

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

export function getWizardTraversoMeta(traverso: WizardTraverso) {
  return WIZARD_TRAVERSO_OPTIONS.find((item) => item.id === traverso) ?? WIZARD_TRAVERSO_OPTIONS[0];
}

export function getWizardCerniereMeta(cerniere: WizardCerniere) {
  return WIZARD_CERNIERE_OPTIONS.find((item) => item.id === cerniere) ?? WIZARD_CERNIERE_OPTIONS[0];
}

export function profileSupportsHiddenHinges(profilo: WizardProfilo | "") {
  return (PROFILI_CERNIERE_NASCOSTE_COMPATIBILI as readonly string[]).includes(profilo);
}
