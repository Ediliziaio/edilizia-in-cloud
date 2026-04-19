// configMapper.ts — Map wizard v2 state → RenderConfig v6 (consumed by generate-render edge function)
//
// Wizard state shape:
//   tipo:          "F1A" | "F2A" | "F3A" | "PF1A" | "PF2A" | "PF3A" | "SCORR"
//   profilo:       "pvc" | "alluminio" | "minimal" | "legno" | "legno_alluminio"
//   manigliaCentrale: boolean — toggle applicabile a qualsiasi profilo compatibile
//                               (upgrade stile_telaio a "nodo_ridotto_maniglia_centrale").
//   coloreInfisso: RAL id ("9016", "7016", ...) OR LEGNO id ("noce", "rovere", ...)
//   coloreHw:      "cromo" | "inox" | "nero_opaco" | "bronzo" | "oro" | "titanio"
//   cass:          boolean
//   cassMat:       "stesso_colore" | "pvc_bianco" | "alluminio" | "colore_custom"
//   cassCol:       RAL id (only when cassMat === "colore_custom")
//   tapp:          "no" | "motorizzate" | "nuove"
//   tappCol:       "stesso" | RAL id
//
// A3 Fix (Supermaster Render): `maniglia_centrale` era un valore di `profilo` che
// forzava erroneamente `materiale: 'alluminio'`. Ora è un flag booleano ortogonale
// (`manigliaCentrale`) applicabile a PVC / alluminio / legno.

// ─── Wizard-side dictionaries (mirror the mockup) ────────────────────────────
export const WIZARD_TIPI = [
  { id: "F1A",   label: "F1A",        desc: "Finestra 1 Anta" },
  { id: "F2A",   label: "F2A",        desc: "Finestra 2 Ante" },
  { id: "F3A",   label: "F3A",        desc: "Finestra 3 Ante" },
  { id: "PF1A",  label: "PF1A",       desc: "Portafinestra 1 Anta" },
  { id: "PF2A",  label: "PF2A",       desc: "Portafinestra 2 Ante" },
  { id: "PF3A",  label: "PF3A",       desc: "Portafinestra 3 Ante" },
  { id: "SCORR", label: "Scorrevole", desc: "Scorrevole / Alzante" },
] as const;

export const WIZARD_PROFILI = [
  { id: "pvc",               label: "PVC",               desc: "Profilo classico 70-82mm" },
  { id: "alluminio",         label: "Alluminio",         desc: "Estruso, profilo slim" },
  { id: "minimal",           label: "Minimal",           desc: "Nodo ristretto, sight-line minima" },
  { id: "legno",             label: "Legno",             desc: "Profilo legno massello" },
  { id: "legno_alluminio",   label: "Legno-Alluminio",   desc: "Legno interno, alluminio esterno" },
] as const;

// Profili compatibili con il flag maniglia centrale (nodo ridotto).
// acciaio_corten / acciaio_minimale non sono supportati oggi nel wizard ma
// sono nel dizionario MATERIAL_PHYSICS e andrebbero esclusi se aggiunti.
export const PROFILI_MANIGLIA_CENTRALE_COMPATIBILI: ReadonlyArray<string> = [
  "pvc",
  "alluminio",
  "minimal",
  "legno",
  "legno_alluminio",
];

export const WIZARD_RAL = [
  { id: "9016", nome: "Bianco",            hex: "#F1F0EA" },
  { id: "9010", nome: "Bianco Puro",       hex: "#F7F5E8" },
  { id: "7016", nome: "Grigio Antracite",  hex: "#383E42" },
  { id: "7035", nome: "Grigio Chiaro",     hex: "#C5C7C4" },
  { id: "9005", nome: "Nero",              hex: "#0E0E10" },
  { id: "8019", nome: "Marrone Tabacco",   hex: "#3E3332" },
  { id: "6005", nome: "Verde Muschio",     hex: "#0F4336" },
  { id: "5010", nome: "Blu Genziana",      hex: "#004F7C" },
  { id: "3005", nome: "Rosso Vino",        hex: "#5E2028" },
  { id: "1013", nome: "Bianco Perla",      hex: "#E3DBC9" },
] as const;

export const WIZARD_LEGNO = [
  { id: "noce",            nome: "Noce",            hex: "#6B4226", grad: "linear-gradient(135deg,#8B5E3C,#5C3317)", fragment: "walnut wood-grain laminate — dark brown with distinct longitudinal grain lines" },
  { id: "golden_oak",      nome: "Golden Oak",      hex: "#B8860B", grad: "linear-gradient(135deg,#DAA520,#9B7600)", fragment: "golden oak wood-grain laminate — warm amber tone with prominent grain pattern" },
  { id: "bianco_frassino", nome: "Bianco Frassino", hex: "#E8DCC8", grad: "linear-gradient(135deg,#F0E6D2,#D4C5A9)", fragment: "white ash wood-grain laminate — pale cream with subtle silver-grey grain" },
  { id: "ciliegio",        nome: "Ciliegio",        hex: "#9B3D12", grad: "linear-gradient(135deg,#B5451C,#7A2E0A)", fragment: "cherry wood-grain laminate — reddish-brown with fine straight grain" },
  { id: "douglas",         nome: "Douglas",         hex: "#C4956A", grad: "linear-gradient(135deg,#D4A574,#A07848)", fragment: "douglas fir wood-grain laminate — warm honey tone with clear growth rings" },
  { id: "rovere",          nome: "Rovere Naturale", hex: "#A0845C", grad: "linear-gradient(135deg,#B89A6B,#8A6D44)", fragment: "natural oak wood-grain laminate — golden-brown with pronounced open grain" },
  { id: "castagno",        nome: "Castagno",        hex: "#5C3A1E", grad: "linear-gradient(135deg,#7A4E2A,#4A2C14)", fragment: "chestnut wood-grain laminate — dark warm brown with wavy grain figure" },
  { id: "grigio_quarzo",   nome: "Grigio Quarzo",   hex: "#6B6B6B", grad: "linear-gradient(135deg,#808080,#5A5A5A)", fragment: "quartz grey wood-grain laminate — neutral grey with faint wood texture" },
] as const;

export const WIZARD_HW_COLORS = [
  { id: "cromo",      nome: "Cromo",            hex: "#C0C0C0", hw_id: "cromo_lucido",     finish: "polished chrome — bright specular reflection" },
  { id: "inox",       nome: "Inox Spazzolato",  hex: "#A8A8A8", hw_id: "inox_spazzolato",  finish: "brushed stainless steel — directional satin micro-lines" },
  { id: "nero_opaco", nome: "Nero Opaco",       hex: "#2A2A2A", hw_id: "nero_opaco",       finish: "matte black powder coat — no specular highlight" },
  { id: "bronzo",     nome: "Bronzo",           hex: "#8B6914", hw_id: "bronzo_anticato",  finish: "antique bronze patina — warm irregular oxidized surface" },
  { id: "oro",        nome: "Oro",              hex: "#D4A017", hw_id: "oro_pvd",          finish: "polished gold PVD coating — warm yellow specular reflection" },
  { id: "titanio",    nome: "Titanio",          hex: "#6B7B8D", hw_id: "titanio",          finish: "titanium anodized — cool grey with subtle metallic depth" },
] as const;

export const WIZARD_CASS_MATERIALI = [
  { id: "stesso_colore",  label: "Stesso colore infisso", desc: "Coordinato con il serramento",       icon: "🎨" },
  { id: "pvc_bianco",     label: "PVC Bianco",            desc: "Cassonetto standard PVC bianco",     icon: "⬜" },
  { id: "alluminio",      label: "Alluminio",             desc: "Cassonetto coibentato in alluminio", icon: "🔲" },
  { id: "colore_custom",  label: "Altro colore RAL",      desc: "Scegli un colore diverso",           icon: "🎯" },
] as const;

export const WIZARD_TAPP_OPTIONS = [
  { id: "no",          label: "Non cambiare", desc: "Mantieni attuali",               icon: "—" },
  { id: "motorizzate", label: "Motorizzate",  desc: "Rimuove cinghia, aggiunge motore", icon: "⚡" },
  { id: "nuove",       label: "Nuove + colore", desc: "Sostituisci con nuovo colore",  icon: "🎨" },
] as const;

// ─── Types ───────────────────────────────────────────────────────────────────
export type WizardTipo = typeof WIZARD_TIPI[number]["id"];
export type WizardProfilo = typeof WIZARD_PROFILI[number]["id"];
export type WizardHw = typeof WIZARD_HW_COLORS[number]["id"];
export type WizardCassMat = typeof WIZARD_CASS_MATERIALI[number]["id"];
export type WizardTapp = typeof WIZARD_TAPP_OPTIONS[number]["id"];

export interface WizardState {
  tipo: WizardTipo | "";
  profilo: WizardProfilo | "";
  /**
   * A3 fix — flag ortogonale: upgrade `stile_telaio` a
   * "nodo_ridotto_maniglia_centrale" indipendentemente dal materiale.
   * Applicabile solo se `profilo` è in PROFILI_MANIGLIA_CENTRALE_COMPATIBILI.
   * Default: false.
   */
  manigliaCentrale: boolean;
  coloreInfisso: string; // RAL id or LEGNO id
  coloreHw: WizardHw;
  cass: boolean;
  cassMat: WizardCassMat;
  cassCol: string; // RAL id (only when cassMat === "colore_custom")
  tapp: WizardTapp;
  tappCol: string; // "stesso" or RAL id
}

// ─── Mapping helpers ─────────────────────────────────────────────────────────
function mapTipoToApertura(tipo: WizardTipo): { apertura: string; num_ante: number } {
  switch (tipo) {
    case "F1A":   return { apertura: "battente_1_anta",   num_ante: 1 };
    case "F2A":   return { apertura: "battente_2_ante",   num_ante: 2 };
    case "F3A":   return { apertura: "battente_3_ante",   num_ante: 3 };
    case "PF1A":  return { apertura: "portafinestra",     num_ante: 1 };
    case "PF2A":  return { apertura: "portafinestra",     num_ante: 2 };
    case "PF3A":  return { apertura: "portafinestra",     num_ante: 3 };
    case "SCORR": return { apertura: "scorrevole_alzante", num_ante: 2 };
  }
}

function mapProfiloToMateriale(profilo: WizardProfilo): {
  materiale: string;
  stile_telaio: string;
  profilo_dim: string;
  profilo_forma: string;
} {
  // A3 fix: rimosso il case "maniglia_centrale" che forzava erroneamente
  // materiale=alluminio. Ora è gestito come flag ortogonale in mapWizardToConfig.
  switch (profilo) {
    case "pvc":
      return { materiale: "pvc", stile_telaio: "europeo_classico", profilo_dim: "70mm", profilo_forma: "europeo" };
    case "alluminio":
      return { materiale: "alluminio", stile_telaio: "europeo_classico", profilo_dim: "70mm", profilo_forma: "squadrato" };
    case "minimal":
      return { materiale: "alluminio", stile_telaio: "minimal_squadrato", profilo_dim: "70mm", profilo_forma: "squadrato" };
    case "legno":
      return { materiale: "legno", stile_telaio: "classico_arrotondato", profilo_dim: "82mm", profilo_forma: "arrotondato" };
    case "legno_alluminio":
      return { materiale: "legno_alluminio", stile_telaio: "europeo_classico", profilo_dim: "82mm", profilo_forma: "europeo" };
  }
}

function findRal(id: string) { return WIZARD_RAL.find(c => c.id === id); }
function findLegno(id: string) { return WIZARD_LEGNO.find(c => c.id === id); }

function mapColore(coloreInfissoId: string): {
  colore_mode: "ral" | "legno";
  colore: { nome: string; ral?: string; hex?: string; finitura: string };
  colore_wood_effect?: { id: string; name: string; prompt_fragment: string };
} {
  const legno = findLegno(coloreInfissoId);
  if (legno) {
    return {
      colore_mode: "legno",
      colore: { nome: legno.nome, hex: legno.hex, finitura: "venatura_legno" },
      colore_wood_effect: { id: legno.id, name: legno.nome, prompt_fragment: legno.fragment },
    };
  }
  const ral = findRal(coloreInfissoId) ?? WIZARD_RAL[0];
  return {
    colore_mode: "ral",
    colore: { nome: ral.nome, ral: ral.id, hex: ral.hex, finitura: "liscio_opaco" },
  };
}

function mapHardware(hwId: WizardHw) {
  const hw = WIZARD_HW_COLORS.find(c => c.id === hwId) ?? WIZARD_HW_COLORS[0];
  return {
    ferramenta: {
      maniglia_stile: "classica_dritta",
      colore_hardware_id: hw.hw_id,
      colore_hardware_finish: hw.finish,
    },
    cerniera_colore: hwId === "nero_opaco" ? "nero_opaco"
                   : hwId === "bronzo" ? "bronzo"
                   : hwId === "oro" ? "oro"
                   : hwId === "inox" ? "inox"
                   : "argento",
  };
}

function mapCassonetto(state: WizardState, infissoColor: ReturnType<typeof mapColore>) {
  if (!state.cass) {
    return {
      sostituzione_cass: false,
      cassonetto: { azione: "mantieni" as const },
      cass_colore_mode: undefined as "ral" | "legno" | undefined,
      cass_colore: null as null | { name: string; ral: string; hex: string },
      cass_wood_effect: null as null | { id: string; name: string; prompt_fragment: string },
    };
  }

  let materiale: string = "pvc_tradizionale";
  let cass_colore_mode: "ral" | "legno" = "ral";
  let cass_colore: { name: string; ral: string; hex: string } | null = null;
  let cass_wood_effect: { id: string; name: string; prompt_fragment: string } | null = null;

  if (state.cassMat === "alluminio") materiale = "alluminio_coibentato";

  if (state.cassMat === "stesso_colore") {
    if (infissoColor.colore_mode === "legno" && infissoColor.colore_wood_effect) {
      cass_colore_mode = "legno";
      cass_wood_effect = infissoColor.colore_wood_effect;
    } else {
      cass_colore = {
        name: infissoColor.colore.nome,
        ral: infissoColor.colore.ral ?? "",
        hex: infissoColor.colore.hex ?? "",
      };
    }
  } else if (state.cassMat === "pvc_bianco") {
    cass_colore = { name: "Bianco", ral: "9016", hex: "#F1F0EA" };
  } else if (state.cassMat === "alluminio") {
    // alluminio coibentato — same as infisso color by default
    if (infissoColor.colore_mode === "legno" && infissoColor.colore_wood_effect) {
      cass_colore_mode = "legno";
      cass_wood_effect = infissoColor.colore_wood_effect;
    } else {
      cass_colore = {
        name: infissoColor.colore.nome,
        ral: infissoColor.colore.ral ?? "",
        hex: infissoColor.colore.hex ?? "",
      };
    }
  } else if (state.cassMat === "colore_custom" && state.cassCol) {
    const r = findRal(state.cassCol);
    if (r) cass_colore = { name: r.nome, ral: r.id, hex: r.hex };
  }

  return {
    sostituzione_cass: true,
    cassonetto: {
      azione: "sostituisci" as const,
      materiale,
      colore_mode: cass_colore_mode,
    },
    cass_colore_mode,
    cass_colore,
    cass_wood_effect,
  };
}

function mapTapparella(state: WizardState, infissoColor: ReturnType<typeof mapColore>) {
  if (state.tapp === "no") {
    return {
      sostituzione_tapp: false,
      tapparella: { azione: "mantieni" as const },
      tap_colore_mode: undefined as "ral" | "legno" | undefined,
      tap_colore: null as null | { name: string; ral: string; hex: string },
      tap_wood_effect: null as null | { id: string; name: string; prompt_fragment: string },
    };
  }

  const cinghia = state.tapp === "motorizzate" ? "senza_cinghia" : "con_cinghia";

  let tap_colore_mode: "ral" | "legno" = "ral";
  let tap_colore: { name: string; ral: string; hex: string } | null = null;
  let tap_wood_effect: { id: string; name: string; prompt_fragment: string } | null = null;

  if (state.tappCol === "stesso") {
    if (infissoColor.colore_mode === "legno" && infissoColor.colore_wood_effect) {
      tap_colore_mode = "legno";
      tap_wood_effect = infissoColor.colore_wood_effect;
    } else {
      tap_colore = {
        name: infissoColor.colore.nome,
        ral: infissoColor.colore.ral ?? "",
        hex: infissoColor.colore.hex ?? "",
      };
    }
  } else {
    const r = findRal(state.tappCol);
    if (r) tap_colore = { name: r.nome, ral: r.id, hex: r.hex };
  }

  return {
    sostituzione_tapp: true,
    tapparella: {
      azione: "sostituisci" as const,
      materiale: "pvc_avvolgibile",
      cinghia,
      colore_mode: tap_colore_mode,
    },
    tap_colore_mode,
    tap_colore,
    tap_wood_effect,
  };
}

// ─── Main mapper ─────────────────────────────────────────────────────────────
export interface MapperOutput {
  nuovo_infisso: Record<string, unknown>;
  apertura_default: string;
  notes: string;
}

export function mapWizardToConfig(state: WizardState, notes = ""): MapperOutput {
  if (!state.tipo || !state.profilo || !state.coloreInfisso) {
    throw new Error("Wizard incompleto: tipo, profilo e colore infisso sono obbligatori");
  }

  const { apertura, num_ante } = mapTipoToApertura(state.tipo);
  const prof = mapProfiloToMateriale(state.profilo);
  const col = mapColore(state.coloreInfisso);
  const hw = mapHardware(state.coloreHw);
  const cass = mapCassonetto(state, col);
  const tapp = mapTapparella(state, col);

  // A3 fix: applica il flag manigliaCentrale SOLO se il profilo è compatibile.
  // Upgrade stile_telaio a "nodo_ridotto_maniglia_centrale" mantenendo il
  // materiale scelto dall'utente (bug originale: forzava alluminio).
  const stileTelaio =
    state.manigliaCentrale && PROFILI_MANIGLIA_CENTRALE_COMPATIBILI.includes(state.profilo)
      ? "nodo_ridotto_maniglia_centrale"
      : prof.stile_telaio;

  return {
    apertura_default: apertura,
    notes,
    nuovo_infisso: {
      materiale: prof.materiale,
      stile_telaio: stileTelaio,
      num_ante,
      colore: col.colore,
      colore_mode: col.colore_mode,
      colore_wood_effect: col.colore_wood_effect ?? null,
      profilo: { dimensione: prof.profilo_dim, forma: prof.profilo_forma },
      vetro: { tipo: "trasparente", prompt_fragment: "double glazed clear glass" },
      ferramenta: hw.ferramenta,
      cerniere: { tipo: "europea", colore: hw.cerniera_colore, num_per_anta: 2 },
      sostituzione: {
        infissi: true,
        cassonetto: cass.sostituzione_cass,
        tapparella: tapp.sostituzione_tapp,
      },
      cassonetto: cass.cassonetto,
      tapparella: tapp.tapparella,
      cass_colore_mode: cass.cass_colore_mode,
      cass_colore: cass.cass_colore,
      cass_wood_effect: cass.cass_wood_effect,
      tap_colore_mode: tapp.tap_colore_mode,
      tap_colore: tapp.tap_colore,
      tap_wood_effect: tapp.tap_wood_effect,
    },
  };
}

// ─── Helper: lookup by id for summary display ────────────────────────────────
export function getColorById(id: string) {
  return findRal(id) ?? findLegno(id) ?? null;
}
