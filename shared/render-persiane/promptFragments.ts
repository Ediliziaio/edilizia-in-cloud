import type {
  AperturaLamelle,
  CassonettoPersiana,
  MaterialePersiana,
  MovimentoLamelle,
  NumeroAntePersiana,
  PersianaFerramentaFinitura,
  PersianaInstallazione,
  StatoApertura,
  TipoOperazione,
  TipoPersiana,
} from "./types.ts";

export const SHUTTER_TYPE_DESCRIPTIONS: Record<TipoPersiana, string> = {
  veneziana_classica:
    "traditional louvered shutters with articulated horizontal slats, frame stiles, closing overlap and classic side-mounted hinges",
  veneziana_esterna:
    "technical external venetian-style shading with more contemporary slats, guides/head detail and precise modern geometry",
  scuro_pieno:
    "solid panel shutters with full opaque leaves, no louvers, clear mass and a believable traditional shutter construction",
  scuro_cornice:
    "framed panel shutters with classic recessed or raised panel composition and stronger architectural character",
  gelosia:
    "fixed-louver shutters with dense inclined blades for privacy and ventilation, clearly distinct from operable venetian shutters",
  avvolgibile_esterno:
    "external roller shutter with slatted curtain, side guides and head box logic, not a hinged shutter",
  a_libro:
    "bi-fold shutters with multiple folding panels and visible hinge articulation, not a standard swing shutter",
  griglia_sicurezza:
    "real security grille system with robust metallic bars/members and plausible locking/support details",
  brise_soleil:
    "architectural brise-soleil shading with contemporary sun blades, support brackets and a clearly technical facade-shading language",
};

export const MATERIAL_DESCRIPTIONS: Record<MaterialePersiana, string> = {
  legno_naturale: "solid natural wood with authentic grain direction and slight tonal variation",
  legno_composito: "engineered wood-composite with cleaner repeatable finish and more uniform color behavior",
  alluminio: "powder-coated extruded aluminum with sharp edges and premium architectural precision",
  pvc: "smooth PVC with softer molded profile logic and uniform color finish",
  acciaio: "steel construction with stronger structural feel and robust metal detailing",
  fibra_vetro: "fiberglass composite with stable crisp surfaces and high-performance exterior finish",
};

export const OPERATION_DESCRIPTIONS: Record<TipoOperazione, string> = {
  sostituisci: "replace the current shutter system with the newly selected typology",
  cambia_colore: "change only the finish/color while preserving existing geometry and hardware logic",
  aggiungi: "add a new shutter system to openings that currently have no shutters",
  rimuovi: "remove the shutter system and restore the facade credibly without leaving hardware traces",
};

export const OPENING_STATE_DESCRIPTIONS: Record<StatoApertura, string> = {
  chiuso:
    "fully closed, leaves aligned in the closed position with no hybrid half-open reading",
  socchiuso:
    "ajar with a small controlled opening angle and subtle facade shadow response",
  aperto_45:
    "opened about 45 degrees with physically credible hinge rotation, wall distance and cast shadows",
  aperto_90:
    "opened about 90 degrees with believable contact to the wall plane or hold-open hardware where appropriate",
  anta_singola_aperta:
    "one leaf open and the other closed, producing a clearly asymmetric but plausible shutter state",
};

/**
 * Tapparella e veneziana esterna scorrono su guide: niente ante, niente angolo
 * di apertura. Prima ricevevano le frasi delle ante («opened about 45 degrees
 * with physically credible hinge rotation») accanto a «not a hinged shutter».
 * Stesse chiavi del form, lette come posizione del telo.
 */
export const TIPI_SU_GUIDE = new Set<TipoPersiana>(["avvolgibile_esterno", "veneziana_esterna"]);
/** Il brise-soleil è fisso: nessuna anta da aprire, le lame seguono la regola delle lamelle. */
export const TIPI_FISSI = new Set<TipoPersiana>(["brise_soleil"]);

export const GUIDED_STATE_DESCRIPTIONS: Record<StatoApertura, string> = {
  chiuso: "lowered fully down to the sill, slats closed into one continuous surface",
  socchiuso: "lowered down to the sill with the slats slightly parted, thin lines of light between them",
  aperto_45: "raised halfway: the bottom rail sits about halfway down the opening",
  aperto_90: "fully raised into the head box: the window is completely clear",
  anta_singola_aperta: "raised halfway: the bottom rail sits about halfway down the opening",
};

export const FIXED_STATE_DESCRIPTION =
  "fixed installation with no hinged leaves: the blades stay in their mounted position and only their tilt follows the slat rule";

/** Lo stato di apertura detto nel modo giusto per il tipo (ante, telo su guide, sistema fisso). */
export function describeOpeningState(type: TipoPersiana | null, state: StatoApertura): string {
  if (type && TIPI_SU_GUIDE.has(type)) return GUIDED_STATE_DESCRIPTIONS[state];
  if (type && TIPI_FISSI.has(type)) return FIXED_STATE_DESCRIPTION;
  return OPENING_STATE_DESCRIPTIONS[state];
}

/** Ha ante che ruotano su cardini (o non si sa: tipo esistente non riconosciuto)? */
export function hasHingedLeaves(type: TipoPersiana | null): boolean {
  return !type || (!TIPI_SU_GUIDE.has(type) && !TIPI_FISSI.has(type));
}

/**
 * Le tinte rapide del form. Il colore del profilo a contrasto si salva solo come
 * esadecimale e il prompt diceva «Outer frame/profile contrast color: #383E42»:
 * un codice che il modello immagine non sa leggere. Qui il nome e il RAL.
 */
export const TINTE_RAPIDE_PERSIANE = [
  { ral: "9010", nome: "Bianco puro", hex: "#F7F5EF" },
  { ral: "7016", nome: "Grigio antracite", hex: "#383E42" },
  { ral: "6005", nome: "Verde muschio", hex: "#0F4336" },
  { ral: "8017", nome: "Marrone cioccolato", hex: "#44322D" },
  { ral: "1013", nome: "Bianco perla", hex: "#E3D9C6" },
  { ral: "9005", nome: "Nero intenso", hex: "#101215" },
] as const;

/** «Grigio antracite (RAL 7016, #383E42)»; un esadecimale fuori elenco resta com'è. */
export function describeProfileColor(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const tinta = TINTE_RAPIDE_PERSIANE.find((t) => t.hex.toLowerCase() === hex.trim().toLowerCase());
  return tinta ? `${tinta.nome} (RAL ${tinta.ral}, ${tinta.hex})` : hex;
}

export const LOUVER_STATE_DESCRIPTIONS: Record<AperturaLamelle, string> = {
  chiuse:
    "louvers closed with correct overlap, opaque reading and continuous rhythm from top to bottom",
  parzialmente_aperte:
    "louvers partially open with light filtering and partial view-through behavior consistent with the selected typology",
  completamente_aperte:
    "louvers widely open with clear through-light and thin slat-edge appearance",
};

/** Numero di ante chiesto (B, 04/10): il riscrittore lo aspettava («the configured number of shutter panels») ma il form non lo chiedeva. */
export const LEAF_COUNT_DESCRIPTIONS: Record<NumeroAntePersiana, string> = {
  1: "exactly one leaf per opening, hinged on one jamb and covering the whole opening",
  2: "exactly two leaves per opening, one hinged on each jamb, meeting at the centre",
  4: "exactly four folding panels per opening, two hinged together on each side, folding back against the jambs",
  6: "exactly six folding panels per opening, three hinged together on each side, folding back against the jambs",
};

/** Lamelle fisse o orientabili (B, 04/10): la «linea» del listino persiane. */
export const LOUVER_MOVEMENT_DESCRIPTIONS: Record<MovimentoLamelle, string> = {
  fisse: "fixed slats set at one constant angle in the frame, with no tilt rod",
  orientabili: "adjustable slats that tilt together, linked by a slim vertical tilt rod on the inner face of the leaf",
};
/** Per il brise-soleil le lame sono grandi e non hanno asta. */
export const BLADE_MOVEMENT_DESCRIPTIONS: Record<MovimentoLamelle, string> = {
  fisse: "blades fixed at one constant angle on the side supports",
  orientabili: "blades pivoting on end pins so they tilt together, driven by a concealed side mechanism",
};

/** Cassonetto di tapparella e veneziana esterna (B, 04/10). */
export const HEAD_BOX_DESCRIPTIONS: Record<CassonettoPersiana, string> = {
  esterno_a_vista:
    "a visible external head box (cassonetto) mounted on the facade right above the opening, same finish as the curtain, the side guides running down from its ends",
  a_scomparsa:
    "no visible head box: the box is concealed inside the lintel or the wall and the curtain comes out of a narrow slot under the lintel",
};

export const HARDWARE_FINISH_DESCRIPTIONS: Record<PersianaFerramentaFinitura, string> = {
  verniciata_tinta: "hardware painted ton-sur-ton with the shutter system",
  nero_opaco: "matte black hardware",
  acciaio_satinato: "satin stainless hardware",
  ferro_micaceo: "textured micaceous iron hardware",
  bronzo_scuro: "dark bronze hardware",
};

export const INSTALLATION_DESCRIPTIONS: Record<PersianaInstallazione, string> = {
  cardini_tradizionali:
    "traditional side-hinged facade mounting with pintles/hinges appropriate to the selected shutter type",
  su_telaio:
    "mounted close to the window frame/reveal with compact installation logic",
  guide_laterali:
    "installed through visible lateral guides/tracks consistent with technical shading systems or roller shutters",
  brackets_architettonici:
    "mounted on visible architectural support brackets coherent with brise-soleil or technical systems",
};

export const DEFAULT_NEGATIVE_CONSTRAINTS = [
  "do not redesign the facade",
  "do not alter non-target openings",
  "do not move windows",
  "do not invent new openings",
  "do not stylize",
  "do not change wall finish unless explicitly requested",
  "do not leave mixed old/new shutter construction on the same target opening",
  "do not leave hinges, hold-open hardware, tracks or fixing plates visible after a removal if they should be gone",
];

export const DEFAULT_QUALITY_DIRECTIVES = [
  "professional architectural facade replacement render",
  "same-building realism",
  "photographic credibility over beautification",
  "selected shutter typology must be instantly recognizable",
];
