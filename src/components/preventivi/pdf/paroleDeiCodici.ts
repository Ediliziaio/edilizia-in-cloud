/**
 * Dal codice salvato dal preventivatore alla parola che legge il cliente.
 *
 * I preventivatori edili salvano le scelte come codici («rifacimento_completo»,
 * «casa_indipendente», «pompa_calore»). Fino al 22/09/2026 il PDF li stampava
 * così com'erano: nella scheda dell'intervento, nel riepilogo del prezzo e in
 * copertina. Qui c'è la parola giusta per ognuno. Un codice che manca, o un
 * testo scritto a mano, esce ripulito dei trattini bassi; «altro» non esce.
 *
 * Le scelte stanno negli StepImmobile dei preventivatori: il test
 * `paroleDeiCodici.test.ts` controlla che ogni codice abbia qui la sua parola.
 */

export type Dizionario = Readonly<Record<string, string>>;

/** Il tipo di immobile, uguale per tutti i mestieri. */
export const IMMOBILI: Dizionario = {
  appartamento: "Appartamento",
  villa: "Villa",
  casa_indipendente: "Casa indipendente",
  ufficio: "Ufficio",
  negozio: "Negozio",
  capannone: "Capannone",
  hotel: "Struttura ricettiva",
  centro_sportivo: "Centro sportivo",
};

/** Il tipo di intervento: la stessa sigla vuol dire cose diverse in mestieri diversi. */
export const INTERVENTI: Readonly<Record<string, Dizionario>> = {
  bagni: {
    rifacimento_completo: "Rifacimento completo del bagno",
    rifacimento_parziale: "Rifacimento parziale del bagno",
    nuovo_bagno: "Nuovo bagno",
    sostituzione_sanitari: "Sostituzione di sanitari e rubinetteria",
    vasca_in_doccia: "Trasformazione della vasca in doccia",
    abbattimento_barriere: "Bagno senza barriere architettoniche",
  },
  ristrutturazione: {
    ristrutturazione_completa: "Ristrutturazione completa",
    ristrutturazione_parziale: "Ristrutturazione parziale",
    ristrutturazione_bagno: "Ristrutturazione del bagno",
    ristrutturazione_cucina: "Ristrutturazione della cucina",
    manutenzione_straordinaria: "Manutenzione straordinaria",
    efficientamento_energetico: "Efficientamento energetico",
    ampliamento: "Ampliamento",
  },
  tetti: {
    rifacimento_completo: "Rifacimento completo del tetto",
    rifacimento_parziale: "Rifacimento parziale del tetto",
    coibentazione: "Isolamento del tetto",
    sostituzione_manto: "Sostituzione del manto di copertura",
    lattoneria: "Rifacimento di grondaie e lattoneria",
    linee_vita: "Installazione della linea vita",
    manutenzione_straordinaria: "Manutenzione straordinaria del tetto",
  },
  climatizzazione: {
    nuovo_impianto: "Nuovo impianto di climatizzazione",
    sostituzione: "Sostituzione dell'impianto di climatizzazione",
    ampliamento: "Ampliamento dell'impianto di climatizzazione",
    manutenzione_straordinaria: "Manutenzione straordinaria dell'impianto",
    manutenzione_ordinaria: "Manutenzione e sanificazione dell'impianto",
  },
  elettrico: {
    nuovo_impianto: "Nuovo impianto elettrico",
    rifacimento: "Rifacimento dell'impianto elettrico",
    adeguamento_norma: "Adeguamento a norma dell'impianto elettrico",
    ampliamento: "Ampliamento dell'impianto elettrico",
    domotica: "Impianto domotico",
    manutenzione_straordinaria: "Manutenzione straordinaria dell'impianto elettrico",
  },
  termoidraulico: {
    nuovo_impianto: "Nuovo impianto termoidraulico",
    rifacimento: "Rifacimento dell'impianto termoidraulico",
    sostituzione_generatore: "Sostituzione del generatore di calore",
    ampliamento: "Ampliamento dell'impianto",
    manutenzione_straordinaria: "Manutenzione straordinaria dell'impianto",
  },
  pavimenti: {
    nuova_posa: "Posa del nuovo pavimento",
    rifacimento: "Rifacimento del pavimento",
    sovrapposizione: "Nuovo pavimento posato sull'esistente",
    resina_microcemento: "Pavimento in resina o microcemento",
    levigatura_lucidatura: "Levigatura e lucidatura del pavimento",
    manutenzione: "Manutenzione e ripristino del pavimento",
  },
  piscine: {
    nuova_costruzione: "Costruzione della piscina",
    ristrutturazione: "Ristrutturazione della piscina",
    impianto_trattamento: "Rifacimento dell'impianto di trattamento dell'acqua",
    copertura: "Copertura della piscina",
    manutenzione: "Manutenzione della piscina",
  },
};

/** I dati d'intervento propri di un mestiere (tipologia del clima, generatore, materiale…). */
export const TIPOLOGIE_CLIMA: Dizionario = {
  monosplit: "Monosplit",
  multisplit: "Multisplit",
  vrf: "VRF / VRV",
  canalizzato: "Canalizzato",
};

export const LIVELLI_IMPIANTO_ELETTRICO: Dizionario = {
  livello_1: "Livello 1, di base",
  livello_2: "Livello 2, standard",
  livello_3: "Livello 3, domotico",
};

export const GENERATORI: Dizionario = {
  caldaia_condensazione: "Caldaia a condensazione",
  pompa_calore: "Pompa di calore",
  ibrido: "Sistema ibrido, caldaia e pompa di calore",
  scaldabagno: "Scaldabagno",
};

export const MATERIALI_PAVIMENTO: Dizionario = {
  gres: "Gres porcellanato",
  parquet: "Parquet",
  laminato: "Laminato",
  resina: "Resina",
  microcemento: "Microcemento",
  pietra: "Pietra o marmo",
};

export const TIPI_PISCINA: Dizionario = {
  interrata: "Interrata",
  fuori_terra: "Fuori terra",
  skimmer: "A skimmer",
  sfioro: "A sfioro",
  idromassaggio: "Idromassaggio",
};

export const COSTRUZIONI_PISCINA: Dizionario = {
  cemento_armato: "Cemento armato",
  vetroresina: "Vetroresina",
  pannelli_acciaio: "Pannelli in acciaio",
  pannelli_pvc: "Pannelli in PVC",
  liner: "Liner",
};

/**
 * La parola per il cliente. Un codice sconosciuto (o un testo scritto a mano)
 * esce senza trattini bassi e con la maiuscola; «altro» e il vuoto non escono.
 */
export function parolaDelCodice(valore: string | null | undefined, dizionario: Dizionario): string | null {
  const v = String(valore ?? "").trim();
  if (!v || v.toLowerCase() === "altro") return null;
  const nota = dizionario[v];
  if (nota) return nota;
  const testo = v.replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

/** Il tipo di intervento del mestiere, in parole. */
export function interventoInParole(valore: string | null | undefined, mestiere: string): string | null {
  return parolaDelCodice(valore, INTERVENTI[mestiere] ?? {});
}

/** L'unità di misura come si scrive in un computo: «corpo» è «a corpo». */
export function unitaInParole(valore: string | null | undefined): string | null {
  const v = String(valore ?? "").trim();
  if (!v) return null;
  return v.toLowerCase() === "corpo" ? "a corpo" : v;
}
