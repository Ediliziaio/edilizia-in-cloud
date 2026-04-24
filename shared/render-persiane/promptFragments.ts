import type {
  AperturaLamelle,
  MaterialePersiana,
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

export const LOUVER_STATE_DESCRIPTIONS: Record<AperturaLamelle, string> = {
  chiuse:
    "louvers closed with correct overlap, opaque reading and continuous rhythm from top to bottom",
  parzialmente_aperte:
    "louvers partially open with light filtering and partial view-through behavior consistent with the selected typology",
  completamente_aperte:
    "louvers widely open with clear through-light and thin slat-edge appearance",
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
