/**
 * Le aree del listino e le tipologie standard di ciascuna.
 *
 * L'area è il «cappello»: Area Serramenti, Area Fotovoltaico, Area Bagni. Non
 * è un titolo e basta: è il valore che il preventivatore cerca in
 * listino_macrocategorie.verticali_abilitati per decidere quali prodotti
 * mostrare. Una tipologia dell'area Serramenti compare nel preventivatore
 * serramenti; una con i verticali vuoti compare in tutti.
 *
 * Le tipologie standard sono quelle che ogni azienda del settore vende:
 * nessun serramentista si inventa le tapparelle. Si propongono già pronte e si
 * riconoscono anche quando l'azienda le ha chiamate in un altro modo
 * («Avvolgibili» sono le tapparelle, «Tapparelle PVC» pure).
 */

/** Lo slot del configuratore fotovoltaico (listino_macrocategorie.fv_categoria). */
export type SlotFotovoltaico = "pannello" | "inverter" | "accumulo" | "ottimizzatore" | "wallbox" | "struttura";

export interface TipologiaStandard {
  nome: string;
  /** Altri nomi con cui le aziende la chiamano. */
  sinonimi: string[];
  /** Va in fondo all'area e nel preventivo sta fra accessori e complementi. */
  accessorio: boolean;
  fvCategoria: SlotFotovoltaico | null;
}

export interface AreaStandard {
  chiave: string;
  nome: string;
  /** Il valore da scrivere in verticali_abilitati per le tipologie di quest'area. */
  verticale: string;
  /** Tutti i modi in cui il verticale compare nei dati di articoli e macrocategorie. */
  sinonimi: string[];
  /** Il preventivatore che legge queste tipologie dal listino, se c'è. */
  preventivatore: string | null;
  tipologie: TipologiaStandard[];
}

function tipologia(nome: string, extra: Partial<TipologiaStandard> = {}): TipologiaStandard {
  return { nome, sinonimi: [], accessorio: false, fvCategoria: null, ...extra };
}

export const AREE_STANDARD: AreaStandard[] = [
  {
    chiave: "serramenti",
    nome: "Serramenti",
    // Il preventivatore serramenti filtra su «serramentista» (ListinoPickerDialog, AccessoriSection).
    verticale: "serramentista",
    sinonimi: ["serramentista", "serramentisti", "serramenti", "infissi"],
    preventivatore: "Preventivatore serramenti",
    tipologie: [
      tipologia("Serramenti", { sinonimi: ["infissi", "finestre"] }),
      tipologia("Tapparelle", { sinonimi: ["tapparella", "avvolgibili", "avvolgibile"] }),
      tipologia("Zanzariere", { sinonimi: ["zanzariera"] }),
      tipologia("Cassonetti", { sinonimi: ["cassonetto"] }),
      tipologia("Persiane e scuri", { sinonimi: ["persiane", "persiana", "scuri", "oscuranti"] }),
      tipologia("Porte da interno", { sinonimi: ["porte interne", "porta interna"] }),
      tipologia("Porte blindate", { sinonimi: ["portoncini blindati", "porta blindata", "blindati"] }),
      tipologia("Accessori", { sinonimi: ["motori", "motorini"], accessorio: true }),
    ],
  },
  {
    chiave: "fotovoltaico",
    nome: "Fotovoltaico",
    verticale: "fotovoltaico",
    sinonimi: ["fotovoltaico"],
    preventivatore: "Preventivatore fotovoltaico",
    tipologie: [
      tipologia("Moduli fotovoltaici", { sinonimi: ["moduli", "pannelli"], fvCategoria: "pannello" }),
      tipologia("Inverter", { fvCategoria: "inverter" }),
      tipologia("Sistemi di accumulo", { sinonimi: ["accumulo", "batterie"], fvCategoria: "accumulo" }),
      tipologia("Ottimizzatori", { fvCategoria: "ottimizzatore" }),
      tipologia("Colonnine di ricarica", { sinonimi: ["wallbox", "colonnine"], fvCategoria: "wallbox" }),
      tipologia("Strutture e zavorre", { sinonimi: ["strutture", "zavorre"], fvCategoria: "struttura" }),
      tipologia("Accessori", { accessorio: true }),
    ],
  },
  {
    chiave: "bagni",
    nome: "Bagni",
    verticale: "bagno",
    sinonimi: ["bagno", "bagni"],
    preventivatore: null,
    tipologie: [
      tipologia("Vasche", { sinonimi: ["vasca"] }),
      tipologia("Box doccia", { sinonimi: ["docce", "doccia"] }),
      tipologia("Piatti doccia", { sinonimi: ["piatto doccia"] }),
      tipologia("Sanitari", { sinonimi: ["vasi", "bidet"] }),
      tipologia("Mobili bagno", { sinonimi: ["arredo bagno", "mobili"] }),
      tipologia("Rubinetteria", { sinonimi: ["rubinetti", "miscelatori"] }),
      tipologia("Rivestimenti", { sinonimi: ["piastrelle"] }),
      tipologia("Accessori", { accessorio: true }),
    ],
  },
];

const NOMI_AREE_ALTRE: Record<string, string> = {
  tetti: "Tetti",
  ristrutturazione: "Ristrutturazioni",
  climatizzazione: "Climatizzazione",
  pompe_calore: "Pompe di calore",
  termoidraulico: "Termoidraulico",
  elettrico: "Elettrico",
  pavimenti: "Pavimenti",
  piscine: "Piscine",
  cappotto: "Cappotto",
  generale: "Generale",
};

/** "Tapparelle PVC" → "tapparelle_pvc": per confrontare nomi scritti in modi diversi. */
export function chiaveTesto(testo: string | null | undefined): string {
  return (testo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** L'area di un verticale scritto nei dati. Null se generico o vuoto. */
export function areaDiVerticale(verticale: string | null | undefined): string | null {
  const chiave = chiaveTesto(verticale);
  if (chiave === "" || chiave === "generico" || chiave === "altro" || chiave === "generale") return null;
  const standard = AREE_STANDARD.find((a) => a.sinonimi.some((s) => chiaveTesto(s) === chiave));
  return standard ? standard.chiave : chiave;
}

/**
 * I modi in cui un verticale compare nelle etichette delle macrocategorie.
 * Il preventivatore serramenti cercava solo «serramentista», e una tipologia
 * etichettata «serramenti» (Demo Azienda 2, standard infissi) non compariva.
 */
export function sinonimiVerticale(verticale: string): string[] {
  const area = areaStandard(areaDiVerticale(verticale) ?? "");
  return area ? [...new Set([verticale, ...area.sinonimi])] : [verticale];
}

export function areaStandard(chiave: string): AreaStandard | null {
  return AREE_STANDARD.find((a) => a.chiave === chiave) ?? null;
}

export function nomeArea(chiave: string): string {
  const standard = areaStandard(chiave);
  if (standard) return standard.nome;
  const noto = NOMI_AREE_ALTRE[chiave];
  if (noto) return noto;
  const testo = chiave.replace(/_/g, " ");
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

/** La tipologia standard che un gruppo esistente rappresenta, se ne rappresenta una. */
export function riconosciTipologiaStandard(
  area: AreaStandard,
  nome: string,
  fvCategoria: string | null | undefined,
): TipologiaStandard | null {
  if (fvCategoria) {
    const perSlot = area.tipologie.find((t) => t.fvCategoria === fvCategoria);
    if (perSlot) return perSlot;
  }
  const chiave = chiaveTesto(nome);
  return (
    area.tipologie.find((t) =>
      [t.nome, ...t.sinonimi].some((s) => {
        const k = chiaveTesto(s);
        return chiave === k || chiave.startsWith(`${k}_`);
      }),
    ) ?? null
  );
}
