/**
 * Organizzare il listino: le regole dietro «+ Area», «+ Tipologia», «+ Linea»,
 * «Copia tipologia» e «Prezzi delle linee».
 *
 * Qui solo controlli, nomi e numeri, senza database, così si provano nei test:
 *  - il nome di una tipologia è unico nell'azienda (vincolo del database), e
 *    «Accessori» sta in tutte e tre le aree standard;
 *  - una linea-cartella che si chiama come la sua tipologia, o come l'inizio
 *    del nome di un prodotto, il listino la scambia per una cartella nata con
 *    quel prodotto e non la mostra (lineeListino.ts, nataConArticolo);
 *  - uno scostamento si scrive come lo si legge: «−8», «-8,5», «+3»;
 *  - due prodotti attivi non possono chiamarsi uguale: copiando una tipologia
 *    ai nomi si aggiunge un testo (il materiale, la serie);
 *  - colori e varianti valgono per la tipologia intera: ogni prodotto ha i suoi
 *    valori nel database, e da lì nascevano 22 finestre col colore fuori
 *    standard a zero e una sola a +15%.
 */
import type { FamilyWithAxes, MaggiorazioneTipo } from "@/types/articleFamily";
import { AREE_STANDARD, chiaveTesto, type AreaStandard } from "./areeStandard";
import type { AreaListino, LineaListino, TipologiaListino } from "./lineeListino";
import { formattaMaggiorazione } from "./maggiorazione";
import { problemaVoci, stesseVoci, vociDi } from "./scelteVariante";

/** listino_macrocategorie.tipologia come la leggono i preventivatori: «bagno», non «bagni». */
const TIPOLOGIA_DI_AREA: Record<string, string> = { bagni: "bagno", tetti: "tetto" };

export function tipologiaDiArea(chiaveArea: string): string {
  return TIPOLOGIA_DI_AREA[chiaveArea] ?? chiaveArea;
}

/** Le aree standard che l'azienda non ha ancora nel listino. */
export function areeDaAggiungere(aree: readonly Pick<AreaListino, "chiave">[]): AreaStandard[] {
  const presenti = new Set(aree.map((a) => a.chiave));
  return AREE_STANDARD.filter((a) => !presenti.has(a.chiave));
}

const chiaveNome = (nome: string) => nome.trim().toLocaleLowerCase("it-IT");

/**
 * Il nome con cui creare una tipologia senza scontrarsi con quelle che ci sono:
 * «Accessori» diventa «Accessori Fotovoltaico» se «Accessori» sta già nei serramenti.
 */
export function nomeTipologiaLibero(nome: string, esistenti: readonly { nome: string }[], nomeArea: string): string {
  const occupati = new Set(esistenti.map((m) => chiaveNome(m.nome)));
  const base = nome.trim();
  if (!occupati.has(chiaveNome(base))) return base;
  const conArea = `${base} ${nomeArea}`;
  if (!occupati.has(chiaveNome(conArea))) return conArea;
  for (let i = 2; ; i += 1) {
    const candidato = `${conArea} ${i}`;
    if (!occupati.has(chiaveNome(candidato))) return candidato;
  }
}

/**
 * Una tipologia con lo stesso nome che nel listino non si vede (vuota e senza
 * area, un resto di prove): si riusa invece di crearne un'altra col nome cambiato.
 * `aree` è il listino senza filtri di ricerca.
 */
export function tipologiaDaRiusare<T extends { id: string; nome: string }>(
  nome: string,
  macrocategorie: readonly T[],
  aree: readonly AreaListino[],
): T | null {
  const visibili = new Set(
    aree.flatMap((a) => a.tipologie.flatMap((t) => (t.macrocategoriaId ? [t.macrocategoriaId] : []))),
  );
  return macrocategorie.find((m) => chiaveNome(m.nome) === chiaveNome(nome) && !visibili.has(m.id)) ?? null;
}

/** Il nome è già usato da un'altra tipologia (maiuscole e spazi non contano). */
export function nomeTipologiaOccupato(nome: string, esistenti: readonly { id?: string; nome: string }[], tranneId?: string): boolean {
  return esistenti.some((m) => m.id !== tranneId && chiaveNome(m.nome) === chiaveNome(nome));
}

export function haLineeDaAsse(tipologia: TipologiaListino): boolean {
  return tipologia.linee.some((l) => l.fonte === "asse");
}

/** Le linee con gli stessi modelli (valori dell'asse Linea), nell'ordine del listino. */
export function lineeDaAsse(tipologia: TipologiaListino): LineaListino[] {
  return tipologia.linee.filter((l) => l.fonte === "asse");
}

/** La «Linea base» con cui nascono i modelli pronti: non è una linea vera. */
export function eLineaBaseDeiModelli(nome: string): boolean {
  return chiaveTesto(nome) === "linea_base";
}

/**
 * Quanti prodotti della tipologia non hanno le linee degli altri: quelli in
 * «Altri articoli» e quelli con la sola «Linea base» dei modelli pronti.
 */
export function prodottiSenzaLinee(tipologia: TipologiaListino): number {
  const vere = lineeDaAsse(tipologia).filter((l) => !eLineaBaseDeiModelli(l.nome));
  if (vere.length === 0) return 0;
  const conLineeVere = new Set(vere.flatMap((l) => l.righe.map((r) => r.famiglia.id)));
  const tutti = new Set(tipologia.linee.flatMap((l) => l.righe.map((r) => r.famiglia.id)));
  return [...tutti].filter((id) => !conLineeVere.has(id)).length;
}

/**
 * Perché un nome di linea non va bene, o null.
 *  - "asse": stessi modelli con un altro prezzo (Salamander 73 accanto a Salamander 76);
 *  - "categoria": prodotti diversi (tapparelle in PVC e in alluminio).
 */
export function problemaNomeLinea(nome: string, tipologia: TipologiaListino, modo: "asse" | "categoria"): string | null {
  const chiave = chiaveTesto(nome);
  if (!chiave) return "Scrivi il nome della linea.";
  const doppia = tipologia.linee.find((l) => l.fonte !== "altri" && chiaveTesto(l.nome) === chiave);
  if (doppia) return `In ${tipologia.nome} c'è già la linea «${doppia.nome}».`;
  if (modo === "categoria") {
    if (chiave === chiaveTesto(tipologia.nome)) {
      return "Una linea non può chiamarsi come la sua tipologia: aggiungi il materiale o la serie.";
    }
    const prodotto = tipologia.linee
      .flatMap((l) => l.righe)
      .map((r) => r.famiglia.nome)
      .find((n) => {
        const k = chiaveTesto(n);
        return k === chiave || k.startsWith(`${chiave}_`);
      });
    if (prodotto) {
      return `«${nome.trim()}» è l'inizio del nome di «${prodotto}»: il listino la scambierebbe per quel prodotto. Aggiungi il materiale o la serie.`;
    }
  }
  return null;
}

/** «−8», «-8,5», «+3», «3%» → numero. Null se non è un numero. */
export function leggiPercentuale(testo: string): number | null {
  const pulito = testo.trim().replace(/%$/, "").replace(/[−–]/g, "-").replace(/\s+/g, "").replace(",", ".");
  if (!/^[+-]?\d+(\.\d+)?$/.test(pulito)) return null;
  return Number(pulito);
}

/** «600», «600,50», «1.250», «1.250,50» → numero. Null se non è un numero positivo o zero. */
export function leggiImporto(testo: string): number | null {
  const pulito = testo.trim().replace(/[\s€]/g, "");
  if (pulito === "") return null;
  let normalizzato = pulito;
  if (pulito.includes(",")) normalizzato = pulito.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(pulito)) normalizzato = pulito.replace(/\./g, "");
  return /^\d+(\.\d+)?$/.test(normalizzato) ? Number(normalizzato) : null;
}

/** Uno scostamento da mostrare in un campo: «−8», «0», «+12,5». */
export function scriviPercentuale(valore: number | null | undefined): string {
  if (valore == null || !Number.isFinite(valore)) return "";
  if (valore === 0) return "0";
  const testo = Math.abs(valore).toLocaleString("it-IT", { maximumFractionDigits: 2 });
  return `${valore < 0 ? "−" : "+"}${testo}`;
}

/**
 * Il nome della linea da una serie della libreria:
 * PVC + Salamander + bluEvolution 73 → «PVC Salamander bluEvolution 73».
 * Il materiale non si ripete se la serie lo dice già, «Generico» non è una marca.
 */
export function nomeLineaDaSerie(materiale: string | null | undefined, marca: string, serie: string): string {
  const parti: string[] = [];
  const m = (materiale ?? "").trim();
  const s = serie.trim();
  if (m && !chiaveTesto(s).startsWith(chiaveTesto(m))) parti.push(m);
  if (chiaveTesto(marca) !== "generico") parti.push(marca.trim());
  parti.push(s);
  return parti.filter(Boolean).join(" ");
}

export interface CopiaTipologiaForm {
  nome: string;
  /** Il testo aggiunto al nome di ogni prodotto copiato: «Alluminio». */
  suffisso: string;
  /** Variazione dei prezzi della copia in percentuale; vuoto = uguali. */
  variazione: string;
  conProdotti: boolean;
}

/** Perché la copia non si può fare, o null. */
export function problemaCopiaTipologia(
  copia: CopiaTipologiaForm,
  origine: TipologiaListino,
  esistenti: readonly { nome: string }[],
): string | null {
  if (!copia.nome.trim()) return "Scrivi il nome della nuova tipologia.";
  if (nomeTipologiaOccupato(copia.nome, esistenti)) return `Esiste già una tipologia «${copia.nome.trim()}».`;
  if (origine.standard?.fvCategoria) {
    return "Le tipologie del fotovoltaico non si copiano: ognuna è un componente del configuratore.";
  }
  if (copia.conProdotti && origine.articoli > 0 && !copia.suffisso.trim()) {
    return "Scrivi cosa aggiungere ai nomi dei prodotti, per esempio il materiale: due prodotti attivi non possono chiamarsi uguale.";
  }
  if (copia.variazione.trim() !== "") {
    const v = leggiPercentuale(copia.variazione);
    if (v === null) return "Scrivi la variazione dei prezzi come numero, per esempio 10 o −5.";
    if (v <= -100) return "Una variazione del −100% o meno azzera i prezzi.";
  }
  return null;
}

export interface PrezzoLineaForm {
  nome: string;
  pct: string;
  attiva: boolean;
}

/** Perché i prezzi delle linee non si possono salvare, o null. */
export function problemaPrezziLinee(linee: readonly PrezzoLineaForm[], venditaMq: string, acquistoMq: string): string | null {
  if (!linee.some((l) => l.attiva)) return "Lascia accesa almeno una linea.";
  for (const l of linee) {
    const v = leggiPercentuale(l.pct);
    if (v === null) return `Scrivi lo scostamento di «${l.nome}» come numero, per esempio −8 o 0.`;
    if (v <= -100) return `«${l.nome}» azzererebbe il prezzo.`;
  }
  const vendita = venditaMq.trim() ? leggiImporto(venditaMq) : null;
  const acquisto = acquistoMq.trim() ? leggiImporto(acquistoMq) : null;
  if (venditaMq.trim() && (vendita === null || vendita <= 0)) {
    return "Il prezzo di vendita al metro quadro deve essere un numero maggiore di zero.";
  }
  if (acquistoMq.trim() && acquisto === null) return "Il prezzo di acquisto al metro quadro non è un numero.";
  if (vendita !== null && acquisto !== null && acquisto > vendita) {
    return "L'acquisto supera la vendita: il margine sarebbe negativo.";
  }
  return null;
}

/**
 * Il prezzo al metro quadro che hanno quasi tutti i prodotti a mq della
 * tipologia, per proporlo nel dialog. Null se non ce n'è uno prevalente.
 */
export function prezzoMqPrevalente(tipologia: TipologiaListino): { vendita: number | null; acquisto: number | null; prodotti: number } {
  const visti = new Map<string, { vendita: number; acquisto: number }>();
  for (const riga of tipologia.linee.flatMap((l) => l.righe)) {
    const f = riga.famiglia;
    if (f.modalita_prezzo_base !== "mq" || visti.has(f.id)) continue;
    visti.set(f.id, { vendita: Number(f.prezzo_base_vendita) || 0, acquisto: Number(f.prezzo_base_acquisto) || 0 });
  }
  const prevalente = (valori: number[]): number | null => {
    const conteggi = new Map<number, number>();
    for (const v of valori) if (v > 0) conteggi.set(v, (conteggi.get(v) ?? 0) + 1);
    let migliore: number | null = null;
    let volte = 0;
    for (const [v, n] of conteggi) {
      if (n > volte) {
        migliore = v;
        volte = n;
      }
    }
    return migliore;
  };
  const tutti = [...visti.values()];
  return {
    vendita: prevalente(tutti.map((p) => p.vendita)),
    acquisto: prevalente(tutti.map((p) => p.acquisto)),
    prodotti: tutti.length,
  };
}

// ─── Colori e varianti di una tipologia ─────────────────────────────────────
//
// Le chiavi sono quelle della funzione listino_varianti_tipologia: una
// variabile si riconosce dal codice (altrimenti dal nome), un valore dal nome
// (altrimenti dal codice). Le linee restano a «Prezzi delle linee».

/** Come si applica una maggiorazione, nelle parole del listino. */
export const MODI_MAGGIORAZIONE: ReadonlyArray<{ tipo: MaggiorazioneTipo; etichetta: string }> = [
  { tipo: "percentuale", etichetta: "% sul prezzo" },
  { tipo: "fisso_pz", etichetta: "€ al pezzo" },
  { tipo: "fisso_mq", etichetta: "€ al m²" },
  { tipo: "fisso_ml", etichetta: "€ al metro di larghezza" },
];

const ASSI_DELLE_LINEE = new Set(["linea", "serie"]);

export function chiaveAsse(asse: { codice?: string | null; nome: string }): string {
  return chiaveTesto(asse.codice) || chiaveTesto(asse.nome);
}

export function chiaveValore(valore: { label?: string | null; valore: string }): string {
  return chiaveTesto(valore.label?.trim() ? valore.label : valore.valore);
}

function eAsseDelleLinee(asse: { codice?: string | null; nome: string }): boolean {
  return ASSI_DELLE_LINEE.has(chiaveTesto(asse.codice)) || ASSI_DELLE_LINEE.has(chiaveTesto(asse.nome));
}

export interface ValoreVariante {
  chiave: string;
  nome: string;
  /** I codici con cui il valore compare nei prodotti («colore_fuori_standard»). */
  codici: string[];
  prodotti: number;
  /** La maggiorazione che hanno più prodotti. */
  tipo: MaggiorazioneTipo;
  vendita: number;
  acquisto: number;
  /** Vuoto se tutti i prodotti hanno la stessa; altrimenti quante per ciascuna. */
  diverse: Array<{ testo: string; prodotti: number }>;
  attivo: boolean;
  /** Acceso in alcuni prodotti e spento in altri. */
  attivoInParte: boolean;
  /** Il valore di serie della variabile (il più diffuso fra i prodotti). */
  base: boolean;
  /** Cosa comprende (i colori di «Colore Standard»): l'elenco che hanno più prodotti. */
  opzioni: string[];
  /** Quanti prodotti hanno un elenco diverso da quello. */
  opzioniDiverse: number;
}

export interface AsseVariante {
  chiave: string;
  nome: string;
  prodotti: number;
  obbligatorio: boolean;
  /** Prodotti con la variabile il cui valore di serie non è quello indicato qui. */
  baseDiversaIn: number;
  valori: ValoreVariante[];
}

export interface VariantiTipologia {
  prodotti: number;
  assi: AsseVariante[];
}

function testoMaggiorazione(tipo: MaggiorazioneTipo, vendita: number, acquisto: number): string {
  const v = formattaMaggiorazione(tipo, vendita);
  if (!v) return acquisto !== 0 ? `nessuna · acquisto ${formattaMaggiorazione(tipo, acquisto)}` : "nessuna";
  return acquisto === vendita ? v : `${v} · acquisto ${formattaMaggiorazione(tipo, acquisto) || "invariato"}`;
}

/** Le variabili dei prodotti di una tipologia (linee escluse), valore per valore. */
export function riepilogoVarianti(tipologia: TipologiaListino): VariantiTipologia {
  const famiglie = new Map<string, FamilyWithAxes>();
  for (const riga of tipologia.linee.flatMap((l) => l.righe)) famiglie.set(riga.famiglia.id, riga.famiglia);

  type Magg = { tipo: MaggiorazioneTipo; vendita: number; acquisto: number; prodotti: number };
  type Conta = {
    nomi: Map<string, number>;
    codici: Set<string>;
    ordine: number;
    prodotti: number;
    maggiorazioni: Map<string, Magg>;
    elenchi: Map<string, { voci: string[]; prodotti: number }>;
    accesi: number;
    base: number;
  };
  type ContaAsse = { nomi: Map<string, number>; ordine: number; prodotti: number; obbligatori: number; valori: Map<string, Conta> };
  const assi = new Map<string, ContaAsse>();
  const aggiungi = (mappa: Map<string, number>, nome: string) => mappa.set(nome, (mappa.get(nome) ?? 0) + 1);
  const piuFrequente = (mappa: Map<string, number>) =>
    [...mappa.entries()].reduce<[string, number] | null>((m, e) => (m && m[1] >= e[1] ? m : e), null)?.[0] ?? "";

  for (const famiglia of famiglie.values()) {
    const assiVisti = new Set<string>();
    for (const asse of famiglia.axes ?? []) {
      const chiave = chiaveAsse(asse);
      if (!chiave || eAsseDelleLinee(asse) || assiVisti.has(chiave)) continue;
      assiVisti.add(chiave);
      const voce: ContaAsse = assi.get(chiave) ?? { nomi: new Map(), ordine: asse.sort_order ?? 0, prodotti: 0, obbligatori: 0, valori: new Map() };
      voce.prodotti += 1;
      if (asse.obbligatorio) voce.obbligatori += 1;
      voce.ordine = Math.min(voce.ordine, asse.sort_order ?? 0);
      aggiungi(voce.nomi, asse.nome);
      const valoriVisti = new Set<string>();
      for (const v of asse.values ?? []) {
        const k = chiaveValore(v);
        if (!k || valoriVisti.has(k)) continue;
        valoriVisti.add(k);
        const c: Conta = voce.valori.get(k) ?? {
          nomi: new Map(),
          codici: new Set(),
          ordine: v.sort_order ?? 0,
          prodotti: 0,
          maggiorazioni: new Map(),
          elenchi: new Map(),
          accesi: 0,
          base: 0,
        };
        c.prodotti += 1;
        c.ordine = Math.min(c.ordine, v.sort_order ?? 0);
        aggiungi(c.nomi, (v.label?.trim() ? v.label : v.valore).trim());
        c.codici.add(v.valore);
        if (v.attivo) c.accesi += 1;
        if (v.is_default) c.base += 1;
        const vendita = Number(v.maggiorazione_valore) || 0;
        const acquisto = Number(v.maggiorazione_acquisto) || 0;
        const nessuna = v.maggiorazione_tipo === "none" || (vendita === 0 && acquisto === 0);
        const m: Omit<Magg, "prodotti"> = nessuna
          ? { tipo: "none", vendita: 0, acquisto: 0 }
          : { tipo: v.maggiorazione_tipo, vendita, acquisto };
        const km = `${m.tipo}|${m.vendita}|${m.acquisto}`;
        const esistente = c.maggiorazioni.get(km);
        c.maggiorazioni.set(km, { ...m, prodotti: (esistente?.prodotti ?? 0) + 1 });
        const voci = vociDi(v);
        const ke = JSON.stringify(voci);
        c.elenchi.set(ke, { voci, prodotti: (c.elenchi.get(ke)?.prodotti ?? 0) + 1 });
        voce.valori.set(k, c);
      }
      assi.set(chiave, voce);
    }
  }

  const risultato: AsseVariante[] = [...assi.entries()]
    .sort(([, a], [, b]) => a.ordine - b.ordine)
    .map(([chiave, voce]) => {
      const baseMax = Math.max(0, ...[...voce.valori.values()].map((c) => c.base));
      const chiaveBase = baseMax > 0 ? [...voce.valori.entries()].find(([, c]) => c.base === baseMax)?.[0] ?? null : null;
      const valori: ValoreVariante[] = [...voce.valori.entries()]
        .sort(([, a], [, b]) => a.ordine - b.ordine)
        .map(([k, c]) => {
          const gruppi = [...c.maggiorazioni.values()].sort((a, b) => b.prodotti - a.prodotti);
          const prevalente = gruppi[0];
          // A pari prodotti vince l'elenco scritto: uno vuoto è quasi sempre un prodotto rimasto indietro.
          const elenchi = [...c.elenchi.values()].sort((a, b) => b.prodotti - a.prodotti || b.voci.length - a.voci.length);
          return {
            chiave: k,
            nome: piuFrequente(c.nomi),
            codici: [...c.codici],
            prodotti: c.prodotti,
            tipo: prevalente.tipo,
            vendita: prevalente.vendita,
            acquisto: prevalente.acquisto,
            diverse:
              gruppi.length > 1
                ? gruppi.map((g) => ({ testo: testoMaggiorazione(g.tipo, g.vendita, g.acquisto), prodotti: g.prodotti }))
                : [],
            attivo: c.accesi * 2 >= c.prodotti,
            attivoInParte: c.accesi > 0 && c.accesi < c.prodotti,
            base: k === chiaveBase,
            opzioni: elenchi[0]?.voci ?? [],
            opzioniDiverse: c.prodotti - (elenchi[0]?.prodotti ?? 0),
          };
        });
      return {
        chiave,
        nome: piuFrequente(voce.nomi),
        prodotti: voce.prodotti,
        obbligatorio: voce.obbligatori > 0,
        baseDiversaIn: voce.prodotti - baseMax,
        valori,
      };
    });

  return { prodotti: famiglie.size, assi: risultato };
}

/**
 * Il nome di un valore dice ancora il suo codice: «Vetro Antisonoro» per
 * «antisonoro», «Bianco RAL 9010» per «bianco». Un valore rinominato
 * («pellicola solo un lato», nato come colore standard) è un'altra cosa, che
 * l'azienda ha deciso da sé: i modelli standard non lo toccano.
 */
export function nomeDiceCodice(nome: string | null | undefined, codice: string): boolean {
  const k = chiaveTesto(nome);
  return !k || k === codice || k.endsWith(`_${codice}`) || k.startsWith(`${codice}_`);
}

/**
 * La maggiorazione in percentuale di un valore, cercato per codice come fanno
 * i modelli standard («colore_fuori_standard»). Null se non c'è o non è in %.
 */
export function percentualeVariante(varianti: VariantiTipologia, chiaveDellAsse: string, codice: string): number | null {
  const asse = varianti.assi.find((a) => a.chiave === chiaveDellAsse);
  const valore =
    asse?.valori.find((v) => v.codici.includes(codice) && nomeDiceCodice(v.nome, codice)) ??
    asse?.valori.find((v) => v.chiave === chiaveTesto(codice));
  if (!valore) return null;
  if (valore.tipo === "none") return 0;
  return valore.tipo === "percentuale" ? valore.vendita : null;
}

export interface VarianteForm {
  /** Null per un valore nuovo, che non c'è ancora in nessun prodotto. */
  chiave: string | null;
  nome: string;
  tipo: MaggiorazioneTipo;
  vendita: string;
  acquisto: string;
  attivo: boolean;
  base: boolean;
  prodotti: number;
  /** Cosa comprende: i colori di «Colore Standard». Vuoto = è già una scelta sola. */
  opzioni: string[];
}

export function formVarianti(asse: AsseVariante): VarianteForm[] {
  return asse.valori.map((v) => ({
    chiave: v.chiave,
    nome: v.nome,
    tipo: v.tipo === "none" ? "percentuale" : v.tipo,
    vendita: scriviPercentuale(v.vendita),
    acquisto: scriviPercentuale(v.acquisto),
    attivo: v.attivo,
    base: v.base,
    prodotti: v.prodotti,
    opzioni: v.opzioni,
  }));
}

/** Una variante che quasi ogni serramento ha, da aggiungere a una tipologia in un clic. */
export interface VariantePronta {
  chiave: string;
  nome: string;
  valori: ReadonlyArray<{ nome: string; base?: boolean }>;
}

/**
 * I nomi e i codici sono quelli dei modelli pronti («colore_standard»,
 * «tipologia_vetro»): così l'impostazione del listino infissi li ritrova.
 */
export const VARIANTI_PRONTE_SERRAMENTI: readonly VariantePronta[] = [
  {
    chiave: "colore",
    nome: "Colore",
    valori: [{ nome: "Bianco", base: true }, { nome: "Colore Standard" }, { nome: "Colore Fuori Standard" }],
  },
  {
    chiave: "tipologia_vetro",
    nome: "Tipologia Vetro",
    valori: [{ nome: "Vetro Standard", base: true }, { nome: "Vetro Antisonoro" }, { nome: "Vetro Antisfondamento" }],
  },
  { chiave: "maniglia", nome: "Maniglia", valori: [{ nome: "Standard", base: true }, { nome: "Con chiave" }] },
  { chiave: "soglia", nome: "Soglia", valori: [{ nome: "Standard", base: true }, { nome: "Ribassata" }] },
];

/** Perché non si può aggiungere una variante con questo nome, o null. */
export function problemaNuovaVariante(nome: string, esistenti: readonly { chiave: string; nome: string }[]): string | null {
  const k = chiaveTesto(nome);
  if (!k) return "Scrivi il nome della variante, per esempio Maniglia.";
  if (ASSI_DELLE_LINEE.has(k)) return "Le linee si aggiungono con «+ Linea».";
  const doppia = esistenti.find((a) => a.chiave === k || chiaveTesto(a.nome) === k);
  return doppia ? `C'è già la variante «${doppia.nome}».` : null;
}

/** Le righe con cui parte una variante nuova: quelle del modello pronto, o una da scrivere. */
export function formVariantePronta(pronta: VariantePronta | null): VarianteForm[] {
  const valori = pronta?.valori ?? [{ nome: "", base: true }];
  return valori.map((v): VarianteForm => ({
    chiave: null,
    nome: v.nome,
    tipo: "percentuale",
    vendita: "0",
    acquisto: "0",
    attivo: true,
    base: !!v.base,
    prodotti: 0,
    opzioni: [],
  }));
}

const numeroDi = (testo: string): number | null => (testo.trim() === "" ? 0 : leggiPercentuale(testo));

/** Perché i valori di una variabile non si possono salvare, o null. */
export function problemaVarianti(
  asse: Pick<AsseVariante, "nome" | "prodotti">,
  iniziali: readonly VarianteForm[],
  valori: readonly VarianteForm[],
  completa: boolean,
  /** Il valore di serie va messo uguale in tutti anche se non è cambiato. */
  forzaBase = false,
): string | null {
  if (valori.length === 0) return `${asse.nome}: serve almeno un valore.`;
  const visti = new Set<string>();
  for (const v of valori) {
    const nome = v.nome.trim();
    const k = v.chiave ?? chiaveTesto(nome);
    if (!k) return `${asse.nome}: scrivi il nome del valore nuovo.`;
    if (visti.has(k)) return `${asse.nome}: «${nome}» c'è due volte.`;
    visti.add(k);
    const vendita = numeroDi(v.vendita);
    const acquisto = numeroDi(v.acquisto);
    if (vendita === null) return `«${nome}»: scrivi la maggiorazione di vendita come numero, per esempio 15 o 0.`;
    if (acquisto === null) return `«${nome}»: scrivi la maggiorazione sull'acquisto come numero, per esempio 15 o 0.`;
    if (v.tipo === "percentuale" && (vendita <= -100 || acquisto <= -100)) return `«${nome}» azzererebbe il prezzo.`;
    const elenco = problemaVoci(nome, v.opzioni);
    if (elenco) return elenco;
  }
  if (!valori.some((v) => v.attivo)) return `${asse.nome}: lascia acceso almeno un valore.`;
  const base = valori.find((v) => v.base);
  if (base && !base.attivo) return `${asse.nome}: il valore di serie «${base.nome.trim()}» è spento.`;
  if (!completa) {
    const nuovo = valori.find((v) => v.prodotti === 0);
    if (nuovo) {
      return `«${nuovo.nome.trim()}» non c'è ancora in nessun prodotto: spunta «Metti i valori mancanti in tutti i prodotti».`;
    }
    const baseIniziale = iniziali.find((v) => v.base)?.chiave ?? null;
    if (base && (forzaBase || base.chiave !== baseIniziale) && base.prodotti < asse.prodotti) {
      const mancano = asse.prodotti - base.prodotti;
      return `«${base.nome.trim()}» manca in ${mancano} ${mancano === 1 ? "prodotto" : "prodotti"}: non può essere il valore di serie, a meno di metterlo in tutti.`;
    }
  }
  return null;
}

export interface ValoreVariantiDati {
  nome: string;
  tipo: MaggiorazioneTipo;
  vendita: number;
  acquisto: number;
  attivo: boolean;
  /** False: il valore c'è solo per essere aggiunto dove manca, senza toccare gli altri prodotti. */
  aggiorna: boolean;
  /** L'elenco di cosa comprende: scritto dove il valore si aggiunge, e dove c'è se `aggiornaOpzioni`. */
  opzioni: string[];
  aggiornaOpzioni: boolean;
}

export interface AsseVariantiDati {
  chiave: string;
  nome: string;
  /** Il valore di serie per i valori aggiunti e, se `allineaBase`, per tutti. */
  base: string | null;
  allineaBase: boolean;
  /** Mette variabile e valori nei prodotti che non li hanno. */
  completa: boolean;
  valori: ValoreVariantiDati[];
}

/** Cosa mandare al database per una variabile: solo quello che cambia. Null se niente. */
export function datiAsseVarianti(
  asse: AsseVariante,
  iniziali: readonly VarianteForm[],
  valori: readonly VarianteForm[],
  completa: boolean,
  prodottiTipologia: number,
  forzaBase = false,
): AsseVariantiDati | null {
  const prima = new Map(iniziali.flatMap((v) => (v.chiave ? [[v.chiave, v] as const] : [])));
  const baseRiga = valori.find((v) => v.base) ?? null;
  const baseIniziale = iniziali.find((v) => v.base)?.chiave ?? null;
  const allineaBase =
    baseRiga !== null && (forzaBase || (baseRiga.chiave ?? chiaveTesto(baseRiga.nome)) !== baseIniziale);
  const asseIncompleto = asse.prodotti < prodottiTipologia;
  const stesso = (a: string, b: string) => numeroDi(a) === numeroDi(b);

  const dati: ValoreVariantiDati[] = [];
  for (const v of valori) {
    const iniziale = v.chiave ? prima.get(v.chiave) : undefined;
    const cambiato =
      !iniziale ||
      iniziale.tipo !== v.tipo ||
      !stesso(iniziale.vendita, v.vendita) ||
      !stesso(iniziale.acquisto, v.acquisto) ||
      iniziale.attivo !== v.attivo;
    const elencoCambiato = !iniziale || !stesseVoci(iniziale.opzioni, v.opzioni);
    const daCompletare = completa && (asseIncompleto || v.prodotti < asse.prodotti);
    if (!cambiato && !elencoCambiato && !daCompletare) continue;
    const vendita = numeroDi(v.vendita) ?? 0;
    const acquisto = numeroDi(v.acquisto) ?? 0;
    dati.push({
      nome: v.nome.trim(),
      tipo: vendita === 0 && acquisto === 0 ? "none" : v.tipo,
      vendita,
      acquisto,
      attivo: v.attivo,
      aggiorna: cambiato,
      opzioni: v.opzioni,
      aggiornaOpzioni: elencoCambiato,
    });
  }
  if (dati.length === 0 && !allineaBase) return null;
  return {
    chiave: asse.chiave,
    nome: asse.nome,
    base: baseRiga?.nome.trim() ?? null,
    allineaBase,
    completa,
    valori: dati,
  };
}
