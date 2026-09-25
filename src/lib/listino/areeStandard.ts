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
  /** Esempi di prodotti da configurare: non sono articoli o prezzi già importati. */
  esempi?: string[];
  /** Altri nomi con cui le aziende la chiamano. */
  sinonimi: string[];
  /**
   * Nel preventivatore si aggiunge alla finestra (sezione Accessori) invece di
   * stare da solo: tapparelle, zanzariere, cassonetti, motori. Nel listino va
   * in fondo all'area.
   */
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
      tipologia("Tapparelle", { sinonimi: ["tapparella", "avvolgibili", "avvolgibile"], accessorio: true }),
      tipologia("Zanzariere", { sinonimi: ["zanzariera"], accessorio: true }),
      tipologia("Cassonetti", { sinonimi: ["cassonetto"], accessorio: true }),
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
      tipologia("Sanitari", { sinonimi: ["vasi", "bidet"], esempi: ["WC sospeso", "WC a terra", "Bidet", "Cassette e telai"] }),
      tipologia("Lavabi", { sinonimi: ["lavabo"], esempi: ["Da appoggio", "Sospeso", "Da incasso", "Lavatoio"] }),
      tipologia("Mobili bagno", { sinonimi: ["arredo bagno", "mobili"] }),
      tipologia("Rubinetteria", { sinonimi: ["rubinetti", "miscelatori"] }),
      tipologia("Rivestimenti", { sinonimi: ["piastrelle"], esempi: ["Ceramica", "Gres porcellanato", "Mosaico", "Grandi lastre"] }),
      tipologia("Pavimenti", { esempi: ["Gres", "Pietra", "SPC", "Laminato idoneo all'ambiente"] }),
      tipologia("Sistemi doccia", { esempi: ["Colonne", "Soffioni", "Canaline", "Scarichi e sifoni"] }),
      tipologia("Specchi e illuminazione", { esempi: ["Specchi", "Specchiere", "Applique", "Luci integrate"] }),
      tipologia("Termoarredi", { sinonimi: ["scaldasalviette"], esempi: ["Idraulici", "Elettrici", "Misti"] }),
      tipologia("Materiali di posa", { esempi: ["Collanti", "Stucchi", "Impermeabilizzanti", "Profili"] }),
      tipologia("Accessori", { accessorio: true }),
    ],
  },
  {
    chiave: "tetti", nome: "Tetti", verticale: "tetti", sinonimi: ["tetti", "tetto"], preventivatore: null,
    tipologie: [
      tipologia("Manti di copertura", { esempi: ["Coppi", "Tegole", "Lastre", "Pannelli sandwich"] }),
      tipologia("Isolanti per coperture", { esempi: ["Lana minerale", "Fibra di legno", "Pannelli sintetici"] }),
      tipologia("Membrane e teli", { esempi: ["Impermeabilizzanti", "Freni al vapore", "Teli traspiranti"] }),
      tipologia("Orditure e supporti", { esempi: ["Travi", "Tavolati", "Listelli", "Pannelli di supporto"] }),
      tipologia("Lattoneria", { esempi: ["Canali di gronda", "Pluviali", "Scossaline", "Raccordi"] }),
      tipologia("Finestre da tetto", { esempi: ["Finestre", "Lucernari", "Raccordi di posa", "Oscuranti"] }),
      tipologia("Sicurezza in copertura", { esempi: ["Linee vita", "Ancoraggi", "Accessi"] }),
      tipologia("Accessori copertura", { accessorio: true, esempi: ["Colmi", "Fermaneve", "Aeratori", "Fissaggi"] }),
    ],
  },
  {
    chiave: "ristrutturazione", nome: "Ristrutturazioni", verticale: "ristrutturazione", sinonimi: ["ristrutturazione", "ristrutturazioni"], preventivatore: null,
    // Le forniture specialistiche restano nei loro listini: non duplicare gli articoli.
    tipologie: [
      tipologia("Murature e divisori", { esempi: ["Laterizi", "Blocchi", "Elementi per tramezzi"] }),
      tipologia("Sistemi a secco", { esempi: ["Lastre", "Profili", "Controsoffitti", "Isolanti per pareti"] }),
      tipologia("Leganti e sottofondi", { esempi: ["Malte", "Massetti", "Autolivellanti", "Aggregati"] }),
      tipologia("Intonaci e rasanti", { esempi: ["Intonaci di fondo", "Rasanti", "Reti", "Paraspigoli"] }),
      tipologia("Pitture e finiture", { esempi: ["Primer", "Idropitture", "Smalti", "Finiture decorative"] }),
      tipologia("Materiali di protezione", { esempi: ["Teli", "Nastri", "Protezioni per pavimenti"] }),
    ],
  },
  {
    chiave: "climatizzazione", nome: "Climatizzazione", verticale: "climatizzazione", sinonimi: ["climatizzazione", "clima"], preventivatore: null,
    tipologie: [
      tipologia("Climatizzatori monosplit", { esempi: ["Unità interna ed esterna abbinate"] }),
      tipologia("Sistemi multisplit", { esempi: ["Unità esterne", "Unità interne", "Combinazioni compatibili"] }),
      tipologia("Sistemi canalizzati", { esempi: ["Unità canalizzate", "Plenum", "Bocchette", "Canali"] }),
      tipologia("Ventilazione meccanica", { esempi: ["VMC puntuale", "VMC centralizzata", "Recuperatori", "Filtri"] }),
      tipologia("Linee e scarichi", { esempi: ["Tubazioni frigorifere", "Coibentazioni", "Scarichi condensa", "Pompe condensa"] }),
      tipologia("Regolazione clima", { esempi: ["Comandi", "Sonde", "Gateway"] }),
      tipologia("Accessori climatizzazione", { accessorio: true, esempi: ["Staffe", "Supporti", "Antivibranti", "Canaline"] }),
    ],
  },
  {
    chiave: "termoidraulico", nome: "Termoidraulica e riscaldamento", verticale: "termoidraulico", sinonimi: ["termoidraulico", "termoidraulica", "caldaie", "pompe_calore"], preventivatore: null,
    tipologie: [
      tipologia("Caldaie", { esempi: ["Murali", "A basamento", "Accessori fumi"] }),
      tipologia("Pompe di calore", { esempi: ["Monoblocco", "Split", "Componenti idraulici"] }),
      tipologia("Sistemi ibridi", { esempi: ["Generatori abbinati", "Moduli idraulici", "Regolazione coordinata"] }),
      tipologia("Acqua calda sanitaria", { esempi: ["Scaldacqua", "Bollitori", "Accumuli", "Ricircolo"] }),
      tipologia("Sistemi radianti", { esempi: ["Pannelli", "Tubazioni", "Collettori", "Testine"] }),
      tipologia("Radiatori e terminali", { esempi: ["Radiatori", "Termoarredi", "Ventilconvettori", "Valvole"] }),
      tipologia("Reti idrico-sanitarie", { esempi: ["Tubi", "Raccordi", "Scarichi", "Collettori"] }),
      tipologia("Trattamento acqua", { esempi: ["Filtri", "Addolcitori", "Dosatori"] }),
      tipologia("Regolazione e sicurezza", { esempi: ["Cronotermostati", "Circolatori", "Vasi di espansione", "Valvole di sicurezza"] }),
    ],
  },
  {
    chiave: "elettrico", nome: "Elettrico e domotica", verticale: "elettrico", sinonimi: ["elettrico", "domotica"], preventivatore: null,
    tipologie: [
      tipologia("Serie civili", { esempi: ["Prese", "Interruttori", "Placche", "Supporti"] }),
      tipologia("Cavi e canalizzazioni", { esempi: ["Cavi", "Corrugati", "Canaline", "Scatole"] }),
      tipologia("Quadri e protezioni", { esempi: ["Centralini", "Interruttori", "Scaricatori", "Accessori quadro"] }),
      tipologia("Illuminazione", { esempi: ["Apparecchi LED", "Alimentatori", "Luci di emergenza"] }),
      tipologia("Domotica e automazioni", { esempi: ["Attuatori", "Sensori", "Gateway", "Motorizzazioni"] }),
      tipologia("Videocitofonia", { esempi: ["Postazioni esterne", "Monitor", "Alimentatori"] }),
      tipologia("Ricarica veicoli", { esempi: ["Wallbox", "Colonnine", "Gestione carichi"] }),
      tipologia("Reti dati e sicurezza", { esempi: ["Prese dati", "Armadi rete", "Allarmi", "Telecamere"] }),
    ],
  },
  {
    chiave: "pavimenti", nome: "Pavimenti e rivestimenti", verticale: "pavimenti", sinonimi: ["pavimenti"], preventivatore: null,
    tipologie: [
      tipologia("Ceramica e gres", { esempi: ["Piastrelle", "Mosaici", "Grandi lastre"] }),
      tipologia("Parquet", { esempi: ["Massello", "Prefinito", "Finiture di recupero"] }),
      tipologia("Laminati e vinilici", { esempi: ["Laminato", "LVT", "SPC"] }),
      tipologia("Resine e microcementi", { esempi: ["Primer", "Strati di fondo", "Finiture", "Protettivi"] }),
      tipologia("Pietre e pavimenti esterni", { esempi: ["Pietra naturale", "Masselli", "Gres da esterno", "Decking"] }),
      tipologia("Sottofondi e posa", { esempi: ["Massetti", "Autolivellanti", "Materassini", "Collanti"] }),
      tipologia("Profili e finiture", { accessorio: true, esempi: ["Battiscopa", "Soglie", "Giunti", "Stucchi"] }),
    ],
  },
  {
    chiave: "piscine", nome: "Piscine", verticale: "piscine", sinonimi: ["piscine", "piscina"], preventivatore: null,
    tipologie: [
      tipologia("Strutture piscina", { esempi: ["Vasche", "Pannelli", "Casseri"] }),
      tipologia("Rivestimenti piscina", { esempi: ["Liner", "Membrane", "Mosaici", "Impermeabilizzanti"] }),
      tipologia("Filtrazione e circolazione", { esempi: ["Pompe", "Filtri", "Skimmer", "Bocchette"] }),
      tipologia("Trattamento acqua piscina", { esempi: ["Dosatori", "Elettrolisi", "Centraline", "Prodotti trattamento"] }),
      tipologia("Riscaldamento piscina", { esempi: ["Pompe di calore", "Scambiatori"] }),
      tipologia("Coperture piscina", { esempi: ["Coperture estive", "Invernali", "Automatiche"] }),
      tipologia("Bordi e dotazioni", { esempi: ["Bordi", "Scale", "Illuminazione", "Robot pulitori"] }),
    ],
  },
  {
    chiave: "cappotto", nome: "Facciate e isolamento", verticale: "cappotto", sinonimi: ["cappotto", "facciate"], preventivatore: null,
    tipologie: [
      tipologia("Sistemi a cappotto", { esempi: ["Pannelli isolanti", "Collanti di sistema", "Tasselli", "Reti e rasanti compatibili"] }),
      tipologia("Isolamento interno", { esempi: ["Pannelli", "Contropareti", "Membrane", "Componenti del sistema"] }),
      tipologia("Finiture per facciate", { esempi: ["Primer", "Rivestimenti", "Pitture per esterni"] }),
      tipologia("Ripristini e balconi", { esempi: ["Malte da ripristino", "Passivanti", "Impermeabilizzanti"] }),
      tipologia("Profili e raccordi facciata", { accessorio: true, esempi: ["Profili di partenza", "Gocciolatoi", "Angolari", "Giunti"] }),
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
