import type { ConfigurazionePavimento, EssenzaLegno } from "@/modules/render-pavimento/lib/types";

type TipoBattiscopa = NonNullable<NonNullable<ConfigurazionePavimento["battiscopa"]>["tipo"]>;

/**
 * Scelte del pavimento usate da due form: il render pavimento e il pavimento del render
 * stanza. Stesse chiavi, stessi nomi, stessi colori: le stesse foto nel motore.
 */
export const WOOD_ESSENCES: Array<{ value: EssenzaLegno; label: string; color: string }> = [
  { value: "rovere_naturale", label: "Rovere naturale", color: "#c49a63" },
  { value: "rovere_sbiancato", label: "Rovere sbiancato", color: "#d8cdbb" },
  { value: "rovere_miele", label: "Rovere miele", color: "#c88f45" },
  { value: "noce", label: "Noce", color: "#6d442b" },
  { value: "teak", label: "Teak", color: "#a66b34" },
  { value: "wenghe", label: "Wenge", color: "#2d2119" },
  { value: "frassino_bianco", label: "Frassino bianco", color: "#eadfc9" },
];

export const BATTISCOPA_TIPI: Array<{ value: TipoBattiscopa; label: string }> = [
  { value: "coordinato_pavimento", label: "Coordinato al pavimento" },
  { value: "bianco", label: "Bianco" },
  { value: "legno", label: "Legno" },
  { value: "alluminio", label: "Alluminio" },
];
