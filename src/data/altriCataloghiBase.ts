import type { BaseArticleTemplateSeed, BaseAxis } from "./baseArticleTemplates";

type Voce = {
  codice: string;
  nome: string;
  categoria: string;
  unita: string;
  descrizione: string;
  assi?: BaseAxis[];
};

function varianti(nome: string, codice: string, valori: string[]): BaseAxis {
  return {
    nome,
    codice,
    obbligatorio: true,
    values: valori.map((label, index) => ({
      valore: String(index + 1),
      label,
      sort_order: index,
    })),
  };
}

function catalogo(verticale: string, voci: Voce[]): BaseArticleTemplateSeed[] {
  return voci.map<BaseArticleTemplateSeed>(({ codice, nome, categoria, unita, descrizione, assi }, index) => ({
    nome,
    descrizione,
    vertical_slug: verticale,
    categoria_slug: categoria,
    tipologia: codice,
    materiale: null,
    tags: ["Base"],
    modalita_prezzo_base: unita === "mq" ? "mq" : "pz",
    prezzo_base_vendita: 0,
    vat_rate: 22,
    unit_of_measure: unita,
    griglia_asse_x_label: null,
    griglia_asse_y_label: null,
    griglia_unita: null,
    griglia_default: null,
    assi_default: assi ?? [],
    image_url: null,
    is_active: false,
    sort_order: (index + 1) * 10,
  }));
}

export const CATALOGO_EDILIZIA = catalogo("ristrutturazione", [
  { codice: "ed-lastra-standard", nome: "Lastra cartongesso standard", categoria: "cartongesso", unita: "mq", descrizione: "Per pareti e controsoffitti. Una lastra da 1.200 × 2.000 mm copre 2,40 m². Indicare il formato e la quantità di lastre o confezioni nell’ordine.", assi: [varianti("Spessore", "spessore", ["9,5 mm", "12,5 mm", "15 mm"])] },
  { codice: "ed-lastra-idro", nome: "Lastra cartongesso idrorepellente", categoria: "cartongesso", unita: "mq", descrizione: "Lastra per ambienti umidi. Specificare spessore, formato e sistema di posa." },
  { codice: "ed-lastra-antincendio", nome: "Lastra cartongesso per sistemi resistenti al fuoco", categoria: "cartongesso", unita: "mq", descrizione: "Indicare prodotto, spessore e sistema certificato previsto dal progetto." },
  { codice: "ed-profilo-guida", nome: "Profilo guida in acciaio zincato", categoria: "cartongesso", unita: "ml", descrizione: "Profilo a U. Specificare sezione, spessore e lunghezza della barra all’ordine.", assi: [varianti("Larghezza", "larghezza", ["50 mm", "75 mm", "100 mm"])] },
  { codice: "ed-profilo-montante", nome: "Profilo montante in acciaio zincato", categoria: "cartongesso", unita: "ml", descrizione: "Montante per pareti a secco. Associare una guida compatibile." },
  { codice: "ed-nastro", nome: "Nastro per giunti cartongesso", categoria: "cartongesso", unita: "rotolo", descrizione: "Specificare materiale, larghezza e metri per rotolo." },
  { codice: "ed-viti", nome: "Viti per lastre di cartongesso", categoria: "cartongesso", unita: "scatola", descrizione: "Indicare lunghezza della vite e pezzi per scatola." },
  { codice: "ed-cemento", nome: "Cemento in sacchi da 25 kg", categoria: "malte-e-leganti", unita: "sacco", descrizione: "Un sacco contiene 25 kg. Indicare il tipo e la classe di resistenza richiesti." },
  { codice: "ed-malta", nome: "Malta premiscelata da muratura", categoria: "malte-e-leganti", unita: "sacco", descrizione: "Indicare classe, peso per sacco e impiego previsto." },
  { codice: "ed-rasante", nome: "Rasante per interni", categoria: "malte-e-leganti", unita: "sacco", descrizione: "Specificare fondo, finitura e resa riportata sulla scheda tecnica." },
  { codice: "ed-blocco", nome: "Blocco in laterizio per tramezza", categoria: "murature", unita: "pz", descrizione: "Specificare formato, spessore e quantità per pallet." },
  { codice: "ed-lana", nome: "Pannello in lana minerale per pareti a secco", categoria: "isolanti", unita: "mq", descrizione: "Indicare spessore, formato e prestazioni del prodotto selezionato." },
]);

export const CATALOGO_TERMOIDRAULICA = catalogo("termoidraulico", [
  { codice: "ti-multistrato", nome: "Tubo multistrato in rotolo", categoria: "tubi-e-raccordi", unita: "ml", descrizione: "Specificare spessore, isolamento e metri per rotolo.", assi: [varianti("Diametro esterno", "diametro", ["16 mm", "20 mm", "26 mm", "32 mm"])] },
  { codice: "ti-raccordo", nome: "Raccordo a pressare", categoria: "tubi-e-raccordi", unita: "pz", descrizione: "Indicare diametro, profilo di pressatura e tubo compatibile." },
  { codice: "ti-collettore", nome: "Collettore di distribuzione idraulica", categoria: "tubi-e-raccordi", unita: "pz", descrizione: "Indicare numero di uscite, attacchi e dotazione." },
  { codice: "ti-valvola", nome: "Valvola di intercettazione a sfera", categoria: "valvole", unita: "pz", descrizione: "Indicare attacchi, pressione di esercizio e fluido compatibile." },
  { codice: "ti-filtro", nome: "Filtro defangatore magnetico", categoria: "ricambi-e-accessori", unita: "pz", descrizione: "Indicare dimensione degli attacchi e compatibilità con l’impianto." },
  { codice: "ti-circolatore", nome: "Circolatore elettronico", categoria: "ricambi-e-accessori", unita: "pz", descrizione: "Indicare interasse, portata, prevalenza e codice del ricambio." },
  { codice: "ti-pdc", nome: "Pompa di calore aria-acqua", categoria: "riscaldamento", unita: "pz", descrizione: "Indicare modello, potenza alle condizioni di progetto e accessori abbinati." },
  { codice: "ti-clima", nome: "Climatizzatore monosplit", categoria: "climatizzazione", unita: "pz", descrizione: "Specificare i codici di unità interna ed esterna e registrare i seriali al ricevimento." },
]);

export const CATALOGO_FOTOVOLTAICO = catalogo("fotovoltaico", [
  { codice: "fv-modulo", nome: "Modulo fotovoltaico", categoria: "moduli", unita: "pz", descrizione: "Indicare codice modello, potenza di picco, ingombro e seriale." },
  { codice: "fv-inverter", nome: "Inverter fotovoltaico", categoria: "inverter", unita: "pz", descrizione: "Indicare potenza AC, numero di MPPT e compatibilità con i moduli.", assi: [varianti("Alimentazione", "alimentazione", ["Monofase", "Trifase"])] },
  { codice: "fv-accumulo", nome: "Batteria di accumulo", categoria: "accumulo", unita: "pz", descrizione: "Indicare capacità utile, compatibilità con inverter e BMS, e codice modello." },
  { codice: "fv-ottimizzatore", nome: "Ottimizzatore per modulo", categoria: "ottimizzatori", unita: "pz", descrizione: "Verificare la compatibilità con modulo, inverter e stringa." },
  { codice: "fv-profilo", nome: "Profilo di montaggio per moduli", categoria: "strutture", unita: "ml", descrizione: "Indicare lunghezza barra, tipo di fissaggio e morsetti compatibili." },
  { codice: "fv-cavo", nome: "Cavo solare", categoria: "cablaggio", unita: "ml", descrizione: "Specificare sezione, colore e metri per bobina." },
]);

export const CATALOGO_TETTI = catalogo("tetti", [
  { codice: "tet-tegola", nome: "Tegola per copertura", categoria: "coperture", unita: "pz", descrizione: "Indicare modello, materiale, colore e pezzi per m²." },
  { codice: "tet-colmo", nome: "Elemento di colmo", categoria: "coperture", unita: "pz", descrizione: "Specificare sistema di copertura e passo di posa." },
  { codice: "tet-membrana", nome: "Membrana sottotegola", categoria: "membrane", unita: "mq", descrizione: "Indicare tipo, formato del rotolo e sormonto previsto." },
  { codice: "tet-gronda", nome: "Canale di gronda", categoria: "lattoneria", unita: "ml", descrizione: "Indicare sviluppo, spessore, lunghezza del pezzo e raccordi.", assi: [varianti("Materiale", "materiale", ["Alluminio", "Rame", "Acciaio zincato"])] },
  { codice: "tet-pluviale", nome: "Tubo pluviale", categoria: "lattoneria", unita: "ml", descrizione: "Indicare forma, diametro e lunghezze da ordinare." },
  { codice: "tet-finestra", nome: "Finestra da tetto", categoria: "accessori-copertura", unita: "pz", descrizione: "Indicare misura, apertura e kit di raccordo compatibile con la copertura." },
]);

export const CATALOGO_ISOLAMENTO = catalogo("cappotto", [
  { codice: "iso-pannello", nome: "Pannello isolante per cappotto", categoria: "isolanti", unita: "mq", descrizione: "Indicare spessore, formato e prestazioni dalla scheda tecnica del prodotto.", assi: [varianti("Materiale", "materiale", ["EPS", "Lana minerale", "Fibra di legno"])] },
  { codice: "iso-collante", nome: "Collante e rasante per cappotto", categoria: "collanti-e-rasanti", unita: "sacco", descrizione: "Indicare il sistema compatibile, la resa e il peso per sacco." },
  { codice: "iso-rete", nome: "Rete di armatura per rasatura", categoria: "accessori-cappotto", unita: "rotolo", descrizione: "Indicare altezza, lunghezza e grammatura del rotolo." },
  { codice: "iso-tassello", nome: "Tassello per cappotto", categoria: "accessori-cappotto", unita: "pz", descrizione: "Indicare supporto, lunghezza, ancoraggio e pezzi per confezione." },
  { codice: "iso-profilo", nome: "Profilo di partenza per cappotto", categoria: "accessori-cappotto", unita: "ml", descrizione: "Specificare larghezza e lunghezza dei profili in base allo spessore del pannello." },
]);
