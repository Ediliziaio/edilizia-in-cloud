/**
 * Una finestra del listino come la scrivono i serramentisti (varianti e voci VERE dei listini di Salamander):
 * «Colore» a fasce con i colori dentro, telaio a L o a Z con le sue alette, apertura, vetro. Serve alle prove
 * della scelta dei colori interno/esterno, del telaio a Z e del disegno nel popup e nella riga del preventivo.
 */
import { articoloEsempio, asseEsempio, valoreEsempio } from "@/lib/listino/esempiListino";
import type { MacroListino } from "@/lib/listino/lineeListino";
import type { FamilyWithAxes } from "@/types/articleFamily";

export const COLORI_STANDARD = [
  "21 - Nussbaum (noce)",
  "51 - Golden Oak (rovere dorato)",
  "55 - Anthrazitgrau (grigio antracite)",
];
export const COLORI_FUORI_STANDARD = [
  "97 - mattGrey_cleanCOOL (grigio opaco)",
  "98 - Schwarz Ulti-Matt - Premium plus (nero ultra opaco)",
];

/** Gli id dei valori: leggibili nelle prove. */
export const idColore = (famiglia: string) => ({
  bianco: `${famiglia}-bianco`,
  standard: `${famiglia}-standard`,
  fuori: `${famiglia}-fuori`,
  unLato: `${famiglia}-unlato`,
});

export const MACRO_SERRAMENTI = {
  id: "es-serramenti",
  nome: "Serramenti",
  verticali_abilitati: ["serramentista"],
  categoria_tipo: "principale",
  attivo: true,
  sort_order: 0,
} as unknown as MacroListino;

/** La finestra: «Colore» con Bianco (di serie), Standard +10%, Fuori Standard +15%, pellicola su un lato +12%. */
export function finestraSalamander(id = "f2a", extra: Partial<FamilyWithAxes> = {}): FamilyWithAxes {
  const c = idColore(id);
  return articoloEsempio(id, "Finestra 2 Ante", {
    macrocategoria_id: MACRO_SERRAMENTI.id,
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 600,
    disegno_tipologia: "finestra_2_ante",
    ...extra,
    axes: [
      asseEsempio(
        `${id}-colore`,
        "Colore",
        [
          valoreEsempio(c.bianco, "Bianco", { is_default: true, sort_order: 0 }),
          valoreEsempio(c.standard, "Colore Standard", { maggiorazione_tipo: "percentuale", maggiorazione_valore: 10, sort_order: 1, opzioni: COLORI_STANDARD }),
          valoreEsempio(c.fuori, "Colore Fuori Standard", { maggiorazione_tipo: "percentuale", maggiorazione_valore: 15, sort_order: 2, opzioni: COLORI_FUORI_STANDARD }),
          valoreEsempio(c.unLato, "pellicola solo un lato", { maggiorazione_tipo: "percentuale", maggiorazione_valore: 12, sort_order: 3, opzioni: COLORI_STANDARD }),
        ],
        { sort_order: 0, obbligatorio: true },
      ),
      asseEsempio(
        `${id}-telaio`,
        "Telaio",
        [
          valoreEsempio(`${id}-telaio-l`, "Telaio a L", { is_default: true, sort_order: 0 }),
          valoreEsempio(`${id}-telaio-z`, "Telaio a Z", { sort_order: 1, opzioni: ["Aletta 35 mm Salamander", "Aletta 60 mm Salamander"] }),
        ],
        { sort_order: 1, obbligatorio: true },
      ),
    ],
  });
}

/** Un prodotto senza la variabile «Colore» (una zanzariera, una porta blindata): i colori si scrivono a mano. */
export function prodottoSenzaColore(id = "zanz"): FamilyWithAxes {
  return articoloEsempio(id, "Zanzariera a molla", {
    macrocategoria_id: MACRO_SERRAMENTI.id,
    modalita_prezzo_base: "mq",
    prezzo_base_vendita: 70,
    axes: [
      asseEsempio(`${id}-rete`, "Rete", [
        valoreEsempio(`${id}-rete-std`, "Rete standard", { is_default: true }),
        valoreEsempio(`${id}-rete-pollini`, "Rete antipolline", { sort_order: 1 }),
      ]),
    ],
  });
}
