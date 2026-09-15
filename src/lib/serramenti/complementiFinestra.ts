/**
 * I complementi di una finestra nel preventivo serramenti: tapparella,
 * zanzariera, cassonetto, persiana.
 *
 * Stanno nel box della loro finestra. «+ Tapparella» la aggiunge con le misure
 * e i pezzi della finestra e col modello già usato nel preventivo: su cinque
 * finestre si sceglie una volta, e sulla finestra che vuole la tapparella
 * blindata lo si cambia dalla sua riga. Il cassonetto prende dalla finestra la
 * larghezza; altezza e profondità sono sue. Se la finestra cambia misure, i
 * complementi che avevano le sue le seguono.
 *
 * Porte, finestre e quello che si vende da solo (anche un ordine di sole
 * persiane) arrivano invece da «Aggiungi dal listino».
 *
 * Senza React: la usano StepBom, ComplementiFinestra e AccessoriSection.
 */
import type { SupplierProductLine } from "@/features/serramenti-listini/types";
import type { AreaListino, RigaListino, TipologiaListino } from "@/lib/listino/lineeListino";
import { comeListinoFamily, selezioneIniziale } from "@/lib/serramenti/pickerListino";
import { applyMaggiorazioniAssi, calcolaPosaInclusa, calcolaPrezzoProdotto } from "@/lib/serramenti/pricing";
import { tipoAccessorioDaNome } from "@/lib/serramenti/sintesiIntervento";
import type { FamilyWithAxes } from "@/types/articleFamily";
import { SR_ACCESSORI_TIPI, type SrAccessorioRow, type SrSerramentoRow } from "@/types/serramenti";

type Griglia = Parameters<typeof calcolaPrezzoProdotto>[4];

const testoDi = (t: Pick<TipologiaListino, "nome" | "standard">) => `${t.nome} ${t.standard?.nome ?? ""}`.toLowerCase();

const PERSIANE = /persian|scur[oi]\b/;
/** Porte e portoncini: si vendono da soli e non prendono una tapparella. La porta-finestra e la porta balcone sì. */
const PORTE = /blindat|portonc|port[ae]\b.*\b(intern[aeo]|ingresso)|garage|sezional|basculant/;
/** Un prodotto che è già un complemento, riconosciuto dal nome quando il listino non lo propone più. */
const COMPLEMENTO_NEL_NOME = /tapparell|avvolgibil|zanzarier|cassonett|persian|scur[oi]\b/;

/** Si lega a una finestra: le tipologie da accessorio (tapparelle, zanzariere, cassonetti) e le persiane, che si vendono anche da sole. */
export function eComplemento(t: TipologiaListino): boolean {
  return t.accessorio || t.categoriaTipo === "accessorio" || PERSIANE.test(testoDi(t));
}

const ORDINE = [/tapparell|avvolgibil/, /zanzarier/, /cassonett/, PERSIANE];
const rango = (t: TipologiaListino) => {
  const i = ORDINE.findIndex((re) => re.test(testoDi(t)));
  return i === -1 ? ORDINE.length : i;
};

/** I bottoni nel box di una finestra: tapparelle, zanzariere, cassonetti, persiane, poi il resto. */
export function tipologieComplemento(area: AreaListino | null): TipologiaListino[] {
  return (area?.tipologie ?? [])
    .filter((t) => t.collegamento !== "nessuno" && eComplemento(t) && t.linee.some((l) => l.righe.length > 0))
    .sort((a, b) => rango(a) - rango(b));
}

const SINGOLARI: ReadonlyArray<readonly [RegExp, string]> = [
  [/zanzarier/, "Zanzariera"],
  [/tapparell/, "Tapparella"],
  [/avvolgibil/, "Avvolgibile"],
  [/cassonett/, "Cassonetto"],
  [/persian/, "Persiana"],
  [/scur[oi]\b/, "Scuro"],
  [/inferriat|grat[ae]\b/, "Inferriata"],
  [/davanzal/, "Davanzale"],
  [/controtelai|monoblocc/, "Controtelaio"],
  [/motor/, "Motore"],
  [/accessor/, "Accessorio"],
];

/** Il nome al singolare della parola che viene prima: «Cassonetto per tapparella» è un cassonetto. */
const singolare = (testo: string | null | undefined) => {
  const n = (testo ?? "").toLowerCase();
  let scelto: { indice: number; nome: string } | null = null;
  for (const [re, nome] of SINGOLARI) {
    const indice = n.search(re);
    if (indice !== -1 && (!scelto || indice < scelto.indice)) scelto = { indice, nome };
  }
  return scelto?.nome ?? null;
};

/** Il nome sul bottone, al singolare e con la parola dell'azienda: «Tapparella», «Avvolgibile». */
export function nomeBottone(t: TipologiaListino): string {
  return singolare(t.nome) ?? singolare(t.standard?.nome) ?? t.nome;
}

const TIPI = new Set<string>(SR_ACCESSORI_TIPI.map((t) => t.value));

/**
 * Il tipo salvato sulla riga, che la sintesi del PDF conta: dal nome del
 * prodotto se lo dice (uno scuro fra le persiane), altrimenti dalla tipologia
 * (la «Blindata alluminio» fra le tapparelle).
 */
export function tipoComplemento(t: TipologiaListino | null | undefined, nomeProdotto: string): string {
  const dalProdotto = singolare(nomeProdotto)?.toLowerCase();
  if (dalProdotto && TIPI.has(dalProdotto)) return dalProdotto;
  const dallaTipologia = t ? nomeBottone(t).toLowerCase() : null;
  return dallaTipologia && TIPI.has(dallaTipologia) ? dallaTipologia : tipoAccessorioDaNome(nomeProdotto);
}

/** Il nome breve di un tipo: «Cassonetto», non «Sostituzione cassonetto». */
export function nomeBreve(tipo: string): string {
  return singolare(tipo) ?? SR_ACCESSORI_TIPI.find((t) => t.value === tipo)?.label ?? tipo;
}

/**
 * Come si chiama un complemento: dal nome del prodotto se lo dice, altrimenti
 * dal tipo. Le righe vecchie hanno spesso il tipo sbagliato (una «Tapparella
 * PVC» salvata come avvolgibile o come scuro).
 */
export function nomeComplemento(c: Pick<SrAccessorioRow, "tipo" | "descrizione">): string {
  return singolare(c.descrizione) ?? nomeBreve(c.tipo);
}

/** «Tapparella · Zanzariera ×2»: i complementi di una finestra in una riga, per la sua testata. */
export function riepilogoComplementi(complementi: ReadonlyArray<Pick<SrAccessorioRow, "tipo" | "descrizione">>): string {
  const conta = new Map<string, number>();
  for (const c of complementi) {
    const nome = nomeComplemento(c);
    conta.set(nome, (conta.get(nome) ?? 0) + 1);
  }
  return [...conta].map(([nome, volte]) => (volte > 1 ? `${nome} ×${volte}` : nome)).join(" · ");
}

/** Il cassonetto si misura anche in profondità, e la sua altezza non è quella della finestra. */
export function chiedeProfondita(t: TipologiaListino | null | undefined, nomeProdotto?: string | null): boolean {
  return /cassonett/.test(`${t ? testoDi(t) : ""} ${nomeProdotto ?? ""}`.toLowerCase());
}

/** La riga ha il campo profondità: un cassonetto, o una riga che ne ha già una. */
export function haProfondita(c: Pick<SrAccessorioRow, "tipo" | "descrizione"> & { profondita_mm?: number | null }): boolean {
  return c.tipo === "cassonetto" || /cassonett/i.test(c.descrizione ?? "") || c.profondita_mm != null;
}

/** I prodotti di una tipologia, una volta sola anche se stanno in più linee. */
export function prodottiDellaTipologia(t: TipologiaListino): RigaListino[] {
  const visti = new Map<string, RigaListino>();
  for (const linea of t.linee) {
    for (const riga of linea.righe) if (!visti.has(riga.famiglia.id)) visti.set(riga.famiglia.id, riga);
  }
  return [...visti.values()];
}

/** La tipologia di un prodotto, per riaprire il listino su di lei. */
export function tipologiaDelProdotto(
  tipologie: readonly TipologiaListino[],
  familyId: string | null | undefined,
): TipologiaListino | null {
  if (!familyId) return null;
  return tipologie.find((t) => t.linee.some((l) => l.righe.some((r) => r.famiglia.id === familyId))) ?? null;
}

/** La tipologia di un complemento: quella del suo prodotto, o quella del suo tipo per una riga scritta a mano. */
export function tipologiaDelComplemento(
  tipologie: readonly TipologiaListino[],
  c: Pick<SrAccessorioRow, "family_id" | "tipo">,
): TipologiaListino | null {
  return tipologiaDelProdotto(tipologie, c.family_id) ?? tipologie.find((t) => nomeBottone(t).toLowerCase() === c.tipo) ?? null;
}

/** La finestra ha già un complemento di questa tipologia, anche scritto a mano. */
export function haGiaComplemento(
  complementi: ReadonlyArray<Pick<SrAccessorioRow, "family_id" | "tipo">>,
  t: TipologiaListino,
): boolean {
  const prodotti = new Set(prodottiDellaTipologia(t).map((r) => r.famiglia.id));
  const tipo = nomeBottone(t).toLowerCase();
  return complementi.some((c) => (!!c.family_id && prodotti.has(c.family_id)) || c.tipo === tipo);
}

/**
 * Le posizioni col box dei complementi: finestre, porte-finestre, scorrevoli, e
 * le voci scritte a mano. Non le voci a corpo, non le porte, e non un
 * complemento venduto da solo (un ordine di sole persiane). `tipologie` sono
 * tutte quelle dell'area, per riconoscere la tipologia della posizione.
 */
export function accettaComplementi(
  riga: Pick<SrSerramentoRow, "tipologia" | "tipologia_label" | "family_id">,
  tipologie: readonly TipologiaListino[],
): boolean {
  if (riga.tipologia === "a_corpo") return false;
  const nome = (riga.tipologia_label ?? "").toLowerCase();
  if (PORTE.test(nome)) return false;
  const t = tipologiaDelProdotto(tipologie, riga.family_id);
  if (!t) return !(riga.family_id && COMPLEMENTO_NEL_NOME.test(nome));
  return !eComplemento(t) && !PORTE.test(testoDi(t));
}

type ComplementoSalvato = Pick<SrAccessorioRow, "family_id" | "valori_assi" | "position" | "tipo" | "altezza_mm"> & {
  scelte_assi?: Record<string, string> | null;
  profondita_mm?: number | null;
};

export interface ModelloRipreso {
  riga: RigaListino;
  valori: Record<string, string>;
  voci: Record<string, string>;
  /**
   * Le misure proprie del cassonetto, dall'ultimo del preventivo che le ha: i
   * cassonetti di una casa sono uguali. Null per gli altri complementi, che
   * prendono quelle della finestra.
   */
  misure: { altezza_mm: number | null; profondita_mm: number | null };
}

const coppie = (o: Record<string, string> | null | undefined) =>
  Object.entries(o ?? {})
    .filter(([, v]) => !!v)
    .sort(([a], [b]) => a.localeCompare(b));

/**
 * Il modello da aggiungere senza chiedere. Fra i complementi della stessa
 * tipologia già nel preventivo, la configurazione (prodotto e varianti) usata
 * più volte; a pari merito la prima scelta: la tapparella blindata messa su una
 * finestra sola non diventa quella di tutte le altre. Se la tipologia ha un solo
 * prodotto, quello con le varianti di serie. Null se c'è da scegliere.
 */
export function modelloDaRiprendere(
  tipologia: TipologiaListino,
  complementi: readonly ComplementoSalvato[],
): ModelloRipreso | null {
  const prodotti = prodottiDellaTipologia(tipologia);
  const perId = new Map(prodotti.map((r) => [r.famiglia.id, r]));
  const dellaTipologia = complementi.filter((c) => !!c.family_id && perId.has(c.family_id));

  const cassonetto = chiedeProfondita(tipologia);
  const recenti = complementi
    .filter((c) => (!!c.family_id && perId.has(c.family_id)) || (cassonetto && c.tipo === "cassonetto"))
    .sort((a, b) => (b.position ?? 0) - (a.position ?? 0));
  const misure = cassonetto
    ? {
        altezza_mm: recenti.find((c) => (c.altezza_mm ?? 0) > 0)?.altezza_mm ?? null,
        profondita_mm: recenti.find((c) => (c.profondita_mm ?? 0) > 0)?.profondita_mm ?? null,
      }
    : { altezza_mm: null, profondita_mm: null };

  const gruppi = new Map<string, { volte: number; prima: number; esempio: ComplementoSalvato }>();
  for (const c of dellaTipologia) {
    const firma = JSON.stringify([c.family_id, coppie(c.valori_assi), coppie(c.scelte_assi)]);
    const posizione = c.position ?? 0;
    const gruppo = gruppi.get(firma);
    if (!gruppo) gruppi.set(firma, { volte: 1, prima: posizione, esempio: c });
    else {
      gruppo.volte += 1;
      gruppo.prima = Math.min(gruppo.prima, posizione);
    }
  }
  const scelto = [...gruppi.values()].sort((a, b) => b.volte - a.volte || a.prima - b.prima)[0];
  const riga = scelto ? perId.get(scelto.esempio.family_id ?? "") : undefined;
  if (scelto && riga) {
    return { riga, valori: { ...(scelto.esempio.valori_assi ?? {}) }, voci: { ...(scelto.esempio.scelte_assi ?? {}) }, misure };
  }
  if (prodotti.length === 1) {
    const iniziale = selezioneIniziale(prodotti[0]);
    return { riga: prodotti[0], valori: iniziale.valori, voci: iniziale.voci, misure };
  }
  return null;
}

export type MotivoSenzaPrezzo = "misure" | "fuori_listino" | "linea_fornitore" | "senza_prezzo";

export type EsitoPrezzo =
  | { unitario: number; voce: string | null; supplierCatalogId: string | null; supplierProductLineId: string | null }
  | { errore: string; motivo: MotivoSenzaPrezzo };

/**
 * Il prezzo unitario di un complemento dal listino: prodotto (a pezzo, a m², a
 * griglia) con le varianti e la posa, se non è in sola fornitura. Le misure
 * contano solo per chi si vende a m² o a griglia.
 */
export function prezzoComplemento(opts: {
  famiglia: FamilyWithAxes;
  valori: Record<string, string>;
  larghezza: number | null;
  altezza: number | null;
  quantita: number;
  posaEsclusa: boolean;
  griglia: Griglia;
  tariffePrezzi: Map<string, number>;
  supplierLines: Map<string, SupplierProductLine>;
  lineaFornitore?: string | null;
}): EsitoPrezzo {
  const famiglia = comeListinoFamily(opts.famiglia);
  const modalita = famiglia.modalita_prezzo_base;
  const conMisure = modalita === "mq" || modalita === "griglia";
  const q = opts.quantita > 0 ? opts.quantita : 1;
  const L = conMisure ? opts.larghezza : null;
  const H = conMisure ? opts.altezza : null;
  if (conMisure && (!L || !H)) return { errore: `${famiglia.nome}: servono larghezza e altezza`, motivo: "misure" };
  if (modalita === "griglia" && opts.griglia.length === 0) {
    return { errore: `${famiglia.nome}: la griglia prezzi del listino è vuota`, motivo: "senza_prezzo" };
  }
  const lineeGriglia = [...new Set(opts.griglia.map((g) => g.supplier_product_line_id).filter((v): v is string => !!v))];
  const linea = opts.lineaFornitore ?? (lineeGriglia.length === 1 ? lineeGriglia[0] : null);
  const calcolo = calcolaPrezzoProdotto(famiglia, L, H, q, opts.griglia, {
    supplierProductLineId: linea,
    supplierLines: opts.supplierLines,
  });
  if (calcolo.fuoriRange) return { errore: `${famiglia.nome}: ${calcolo.note ?? "misura fuori dal listino"}`, motivo: "fuori_listino" };
  if (calcolo.requiresSupplierLine || calcolo.missingSupplierLinePricing) {
    return { errore: `${famiglia.nome}: ${calcolo.note ?? "scegli la linea del fornitore"}`, motivo: "linea_fornitore" };
  }
  const prodotto = applyMaggiorazioniAssi(calcolo.prezzo, opts.valori, opts.famiglia.axes, L, H, q);
  const posa = opts.posaEsclusa ? 0 : calcolaPosaInclusa(famiglia, q, opts.tariffePrezzi);
  return {
    unitario: Number(((prodotto + posa) / q).toFixed(2)),
    voce: calcolo.matchedGrigliaId ?? null,
    supplierCatalogId: calcolo.supplierCatalogId ?? null,
    supplierProductLineId: calcolo.supplierProductLineId ?? linea,
  };
}

const modalitaPrezzo = (m: string | null | undefined): SrAccessorioRow["modalita_prezzo"] =>
  m === "pz" || m === "mq" || m === "griglia" || m === "misura_libera" ? m : null;

type FinestraDelComplemento = Pick<SrSerramentoRow, "id" | "larghezza_mm" | "altezza_mm" | "quantita" | "posa_esclusa">;

/**
 * Il complemento pronto da salvare per una finestra: pezzi e misure della
 * finestra (il cassonetto solo la larghezza), il modello ripreso e il prezzo
 * del listino. Un cassonetto senza la sua altezza si aggiunge lo stesso e si
 * completa sulla riga: `daCompletare` dice cosa manca.
 */
export function complementoPerFinestra(opts: {
  modello: ModelloRipreso;
  tipologia: TipologiaListino | null;
  finestra: FinestraDelComplemento;
  griglia: Griglia;
  tariffePrezzi: Map<string, number>;
  supplierLines: Map<string, SupplierProductLine>;
  position: number;
}): { riga: Partial<SrAccessorioRow>; daCompletare: string | null } | { errore: string; motivo: MotivoSenzaPrezzo } {
  const { modello, finestra } = opts;
  const famiglia = modello.riga.famiglia;
  const quantita = finestra.quantita && finestra.quantita > 0 ? finestra.quantita : 1;
  const posaEsclusa = finestra.posa_esclusa ?? false;
  const cassonetto = chiedeProfondita(opts.tipologia, famiglia.nome);
  const larghezza = finestra.larghezza_mm ?? null;
  const altezza = cassonetto ? modello.misure.altezza_mm : (finestra.altezza_mm ?? null);
  const profondita = cassonetto ? modello.misure.profondita_mm : null;
  const riga: Partial<SrAccessorioRow> = {
    tipo: tipoComplemento(opts.tipologia, famiglia.nome),
    descrizione: famiglia.nome,
    quantita,
    larghezza_mm: larghezza,
    altezza_mm: altezza,
    profondita_mm: profondita,
    family_id: famiglia.id,
    valori_assi: { ...modello.valori },
    scelte_assi: { ...modello.voci },
    modalita_prezzo: modalitaPrezzo(famiglia.modalita_prezzo_base),
    posa_esclusa: posaEsclusa,
    serramento_id: finestra.id,
    position: opts.position,
  };
  const conMisure = famiglia.modalita_prezzo_base === "mq" || famiglia.modalita_prezzo_base === "griglia";
  if (cassonetto && conMisure && (!larghezza || !altezza)) {
    return {
      riga: { ...riga, prezzo_unitario: null, prezzo_totale: null },
      daCompletare: `${famiglia.nome}: scrivi altezza e profondità, il prezzo si calcola da lì`,
    };
  }
  const esito = prezzoComplemento({
    famiglia,
    valori: modello.valori,
    larghezza,
    altezza,
    quantita,
    posaEsclusa,
    griglia: opts.griglia,
    tariffePrezzi: opts.tariffePrezzi,
    supplierLines: opts.supplierLines,
  });
  if ("errore" in esito) return esito;
  if (esito.unitario <= 0) return { errore: `${famiglia.nome}: nel listino non ha un prezzo`, motivo: "senza_prezzo" };
  return {
    riga: {
      ...riga,
      prezzo_unitario: esito.unitario,
      prezzo_totale: Number((esito.unitario * quantita).toFixed(2)),
      listino_voce_id: esito.voce,
      supplier_catalog_id: esito.supplierCatalogId,
      supplier_product_line_id: esito.supplierProductLineId,
    },
    daCompletare: cassonetto && !profondita ? `${famiglia.nome}: scrivi la profondità` : null,
  };
}

/** Il prodotto scelto nel listino, come arriva da «Aggiungi dal listino». */
interface SceltaDalListino {
  family_id: string;
  family_nome: string;
  larghezza_mm: number | null;
  altezza_mm: number | null;
  quantita: number;
  prezzo_unitario: number | null;
  prezzo_posa: number | null;
  griglia_id?: string | null;
  supplier_catalog_id?: string | null;
  supplier_product_line_id?: string | null;
  valori_assi: Record<string, string>;
  scelte_assi?: Record<string, string>;
  modalita_prezzo: SrAccessorioRow["modalita_prezzo"];
}

/**
 * Il complemento dal prodotto scelto nel listino. Il listino mette sempre la
 * posa nel prezzo: per una finestra in sola fornitura la si toglie, come fa la
 * riga quando si spegne la posa.
 */
export function complementoDaScelta(
  scelta: SceltaDalListino,
  tipologia: TipologiaListino | null,
  posaEsclusa: boolean,
): Partial<SrAccessorioRow> {
  const unitario = scelta.prezzo_unitario == null
    ? null
    : Number((posaEsclusa ? scelta.prezzo_unitario - (scelta.prezzo_posa ?? 0) : scelta.prezzo_unitario).toFixed(2));
  return {
    tipo: tipoComplemento(tipologia, scelta.family_nome),
    descrizione: scelta.family_nome,
    quantita: scelta.quantita,
    larghezza_mm: scelta.larghezza_mm,
    altezza_mm: scelta.altezza_mm,
    prezzo_unitario: unitario,
    prezzo_totale: unitario == null ? null : Number((unitario * scelta.quantita).toFixed(2)),
    family_id: scelta.family_id,
    listino_voce_id: scelta.griglia_id ?? null,
    supplier_catalog_id: scelta.supplier_catalog_id ?? null,
    supplier_product_line_id: scelta.supplier_product_line_id ?? null,
    valori_assi: { ...scelta.valori_assi },
    scelte_assi: { ...(scelta.scelte_assi ?? {}) },
    modalita_prezzo: scelta.modalita_prezzo,
    posa_esclusa: posaEsclusa,
  };
}

type Misure = Pick<SrSerramentoRow, "larghezza_mm" | "altezza_mm" | "quantita">;

/**
 * Quello che un complemento prende dalla finestra che cambia: ogni misura che
 * era uguale a quella della finestra la segue, quella ritoccata a mano (o
 * l'altezza di un cassonetto) resta. Null se non cambia niente.
 */
export function misureCheSeguono(c: Misure, prima: Misure, dopo: Misure): Partial<Misure> | null {
  const patch: Partial<Misure> = {};
  if (dopo.larghezza_mm !== prima.larghezza_mm && c.larghezza_mm === prima.larghezza_mm) patch.larghezza_mm = dopo.larghezza_mm;
  if (dopo.altezza_mm !== prima.altezza_mm && c.altezza_mm === prima.altezza_mm) patch.altezza_mm = dopo.altezza_mm;
  if (dopo.quantita !== prima.quantita && c.quantita === prima.quantita) patch.quantita = dopo.quantita;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** La modifica di una riga col totale rifatto quando cambiano prezzo o pezzi: un prezzo svuotato vale zero. */
export function conTotale(
  riga: Pick<SrAccessorioRow, "prezzo_unitario" | "quantita">,
  patch: Partial<SrAccessorioRow>,
): Partial<SrAccessorioRow> {
  if (patch.prezzo_unitario === undefined && patch.quantita === undefined) return patch;
  const prossima = { ...riga, ...patch };
  return { ...patch, prezzo_totale: Number(((prossima.prezzo_unitario ?? 0) * (prossima.quantita ?? 1)).toFixed(2)) };
}

/** Il complemento copiato su un'altra finestra, quando la si duplica: tutto, tranne dove sta. */
export function copiaComplemento(c: SrAccessorioRow, serramentoId: string, position: number): Partial<SrAccessorioRow> {
  return {
    tipo: c.tipo,
    descrizione: c.descrizione,
    quantita: c.quantita,
    larghezza_mm: c.larghezza_mm,
    altezza_mm: c.altezza_mm,
    profondita_mm: c.profondita_mm ?? null,
    prezzo_unitario: c.prezzo_unitario,
    prezzo_totale: c.prezzo_totale,
    listino_voce_id: c.listino_voce_id,
    note: c.note,
    posa_esclusa: c.posa_esclusa,
    family_id: c.family_id,
    valori_assi: c.valori_assi,
    scelte_assi: c.scelte_assi ?? {},
    modalita_prezzo: c.modalita_prezzo,
    supplier_catalog_id: c.supplier_catalog_id,
    supplier_product_line_id: c.supplier_product_line_id,
    serramento_id: serramentoId,
    position,
  };
}
