/**
 * Il confronto fra quello che abbiamo chiesto e quello che ha scritto il fornitore (08/11/2026).
 *
 * L'AI legge soltanto: il verdetto lo danno queste regole fisse, così l'AI non può dire
 * «va bene» se non va bene. Una lettura incerta non è mai verde: resta «da controllare».
 * Il codice è senza dipendenze: gira nella edge function e nei test.
 */
export type Esito = "verde" | "giallo" | "rosso" | "da_controllare";
export type Categoria = "serramenti" | "piastrelle" | "pergole" | "generico";

export interface Misure {
  larghezza?: number | null;
  altezza?: number | null;
  profondita?: number | null;
  mq?: number | null;
  ml?: number | null;
  metri?: number | null;
  pezzi?: number | null;
}

/** Una posizione come l'abbiamo chiesta: riga dell'ordine o voce dell'offerta. */
export interface RigaChiesta {
  chiave: string;
  riferimento?: string | null;
  descrizione: string;
  sku?: string | null;
  quantita: number;
  unita?: string | null;
  prezzo?: number | null;
  misure?: Misure | null;
  colore?: string | null;
  apertura?: string | null;
  /** Il testo completo della riga: da qui si ricavano colore, materiale e formato se non hanno un campo. */
  dettagli?: string | null;
}

/** Una riga come l'ha letta l'AI dal documento. Niente verdetti, solo quello che c'è scritto. */
export interface RigaLetta {
  riferimento?: string | null;
  descrizione?: string | null;
  codice_articolo?: string | null;
  quantita?: number | null;
  unita?: string | null;
  larghezza_mm?: number | null;
  altezza_mm?: number | null;
  profondita_mm?: number | null;
  mq?: number | null;
  colore?: string | null;
  apertura?: string | null;
  materiale?: string | null;
  formato?: string | null;
  lotto?: string | null;
  prezzo_unitario?: number | null;
  /** Quanto è sicura la lettura, da 0 a 100. */
  confidenza?: number | null;
  /** I campi che l'AI non ha letto con sicurezza. */
  incerti?: string[] | null;
}

export interface EsitoCampo {
  campo: string;
  chiesto: string | null;
  letto: string | null;
  esito: Esito;
  nota?: string;
}

export interface RigaConfronto {
  chiave: string;
  riferimento: string | null;
  descrizione: string;
  categoria: Categoria;
  stato: "abbinata" | "mancante" | "in_piu";
  esito: Esito;
  chiesto: string;
  letto: string;
  campi: EsitoCampo[];
  /** Una persona ha controllato a mano una lettura incerta. */
  deciso_da_persona?: boolean;
  /** Identica a una riga dell'offerta già controllata: non si rifà il lavoro. */
  da_offerta?: boolean;
}

export interface OpzioniConfronto {
  /** Scarto massimo sulle misure, in millimetri. Di partenza 5. */
  tolleranzaMm?: number;
  /** Sotto questa confidenza la lettura non vale. Di partenza 60. */
  confidenzaMinima?: number;
}

const ORDINE: Record<Esito, number> = { verde: 0, giallo: 1, da_controllare: 2, rosso: 3 };
export const peggiore = (esiti: Esito[]): Esito =>
  esiti.reduce<Esito>((a, b) => (ORDINE[b] > ORDINE[a] ? b : a), "verde");

const norm = (v?: string | null) =>
  (v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const numero = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : String(Math.round(n * 1000) / 1000).replace(".", ",");

export function categoriaRiga(r: Pick<RigaChiesta, "descrizione" | "dettagli" | "unita" | "misure">): Categoria {
  const t = norm(`${r.descrizione} ${r.dettagli ?? ""}`);
  if (/\b(pergol|tenda|tende|bioclimatic)/.test(t)) return "pergole";
  if (/\b(piastrell|gres|rivestiment|pavimento|mosaico|parquet|laminato)/.test(t)) return "piastrelle";
  if (/\b(serrament|finestr|portafinestr|infiss|persian|tapparell|zanzarier|cassonett|scuro|scuri|porta|porte|blindat)/.test(t)) return "serramenti";
  return "generico";
}

/** Apertura in forma confrontabile: tipo e mano, come parole in ordine fisso. */
export function aperturaNormalizzata(testo?: string | null): string | null {
  const t = norm(testo);
  if (!t) return null;
  const tipo = /anta ?ribalta|ribalta/.test(t) ? "anta-ribalta"
    : /alzante/.test(t) ? "alzante-scorrevole"
    : /scorrevole/.test(t) ? "scorrevole"
    : /vasistas|wasistas/.test(t) ? "vasistas"
    : /bilico/.test(t) ? "bilico"
    : /libro/.test(t) ? "a-libro"
    : /fisso|fissa/.test(t) ? "fisso"
    : /battente|anta/.test(t) ? "battente"
    : null;
  const mano = /\b(dx|destra|destro)\b/.test(t) ? "dx" : /\b(sx|sinistra|sinistro)\b/.test(t) ? "sx" : null;
  if (!tipo && !mano) return null;
  return [tipo, mano].filter(Boolean).join(" ");
}

export function ralDaTesto(testo?: string | null): string | null {
  return /\bral\s*(\d{4})\b/i.exec(testo ?? "")?.[1] ?? null;
}

const COLORI = ["bianco", "avorio", "crema", "nero", "grigio", "antracite", "marrone", "testa di moro", "noce", "rovere", "ciliegio", "douglas", "verde", "rosso", "blu", "sabbia", "tortora", "bronzo", "argento", "corten"];
const MATERIALI = ["pvc", "alluminio", "legno alluminio", "legno", "acciaio", "ferro", "ceramica", "gres", "marmo"];

/** Il colore che si capisce dal testo: il RAL se c'è, altrimenti i nomi di colore in ordine fisso. */
export function coloreDaTesto(testo?: string | null): string | null {
  const ral = ralDaTesto(testo);
  if (ral) return `ral ${ral}`;
  const t = ` ${norm(testo)} `;
  const trovati = COLORI.filter((c) => t.includes(` ${c} `));
  return trovati.length ? [...new Set(trovati)].sort().join(" ") : null;
}

export function materialeDaTesto(testo?: string | null): string | null {
  const t = ` ${norm(testo)} `;
  return MATERIALI.find((m) => t.includes(` ${m} `)) ?? null;
}

export function formatoDaTesto(testo?: string | null): string | null {
  const m = /(\d{1,3}(?:[.,]\d)?)\s*[x×*]\s*(\d{1,3}(?:[.,]\d)?)(?:\s*cm)?/i.exec(testo ?? "");
  if (!m) return null;
  return [m[1], m[2]].map((n) => n.replace(",", ".")).sort((a, b) => Number(a) - Number(b)).join("x");
}

const incerta = (l: RigaLetta, campo: string, minima: number) =>
  (numero(l.confidenza) ?? 0) < minima || (l.incerti ?? []).includes(campo);

function campoDaControllare(campo: string, chiesto: string | null, letto: string | null, nota = "Letto con incertezza: controlla il documento"): EsitoCampo {
  return { campo, chiesto, letto, esito: "da_controllare", nota };
}

/** Una misura: uguale verde, dentro la tolleranza giallo, oltre rosso, illeggibile da controllare. */
function confrontaMisura(campo: string, chiesta: number, letta: number | null | undefined, sicura: boolean, toll: number): EsitoCampo {
  const l = numero(letta);
  if (l == null) return campoDaControllare(campo, `${fmt(chiesta)} mm`, null, "Il documento non riporta questa misura");
  if (!sicura) return campoDaControllare(campo, `${fmt(chiesta)} mm`, `${fmt(l)} mm`);
  const scarto = Math.abs(l - chiesta);
  if (scarto === 0) return { campo, chiesto: `${fmt(chiesta)} mm`, letto: `${fmt(l)} mm`, esito: "verde" };
  return {
    campo, chiesto: `${fmt(chiesta)} mm`, letto: `${fmt(l)} mm`,
    esito: scarto <= toll ? "giallo" : "rosso",
    nota: `Scarto di ${fmt(scarto)} mm${scarto <= toll ? ", dentro la tolleranza" : ", oltre la tolleranza"}`,
  };
}

function confrontaTesto(campo: string, chiesto: string | null, letto: string | null, sicura: boolean, mostraChiesto: string | null, mostraLetto: string | null): EsitoCampo | null {
  if (!chiesto) return null;
  if (!letto) return campoDaControllare(campo, mostraChiesto, null, "Il documento non lo riporta");
  if (!sicura) return campoDaControllare(campo, mostraChiesto, mostraLetto);
  return chiesto === letto
    ? { campo, chiesto: mostraChiesto, letto: mostraLetto, esito: "verde" }
    : { campo, chiesto: mostraChiesto, letto: mostraLetto, esito: "rosso", nota: "Diverso da quanto chiesto" };
}

function confrontaQuantita(r: RigaChiesta, l: RigaLetta, categoria: Categoria, minima: number): EsitoCampo {
  const u = r.unita || "pz";
  const chiesto = `${fmt(r.quantita)} ${u}`;
  const lettaN = numero(l.quantita) ?? (categoria === "piastrelle" ? numero(l.mq) : null);
  if (lettaN == null) return campoDaControllare("Quantità", chiesto, null, "Il documento non riporta la quantità");
  const letto = `${fmt(lettaN)} ${l.unita || u}`;
  if (incerta(l, "quantita", minima)) return campoDaControllare("Quantità", chiesto, letto);
  if (lettaN === r.quantita) return { campo: "Quantità", chiesto, letto, esito: "verde" };
  // Le piastrelle si vendono a scatole: entro il 2% è l'arrotondamento della scatola.
  const quasi = categoria === "piastrelle" && Math.abs(lettaN - r.quantita) / (r.quantita || 1) <= 0.02;
  return { campo: "Quantità", chiesto, letto, esito: quasi ? "giallo" : "rosso", nota: quasi ? "Differenza entro il 2%" : "Quantità diversa" };
}

function confrontaArticolo(r: RigaChiesta, l: RigaLetta, minima: number): EsitoCampo {
  const chiesto = r.sku || r.descrizione;
  const letto = l.codice_articolo || l.descrizione || null;
  if (!letto) return campoDaControllare("Articolo", chiesto, null, "Il documento non riporta l'articolo");
  if (incerta(l, "descrizione", minima)) return campoDaControllare("Articolo", chiesto, letto);
  if (r.sku && l.codice_articolo) {
    return norm(r.sku) === norm(l.codice_articolo)
      ? { campo: "Articolo", chiesto, letto, esito: "verde" }
      : { campo: "Articolo", chiesto, letto, esito: "rosso", nota: "Codice diverso" };
  }
  const parole = (t: string) => new Set(norm(t).split(" ").filter((p) => p.length > 2));
  const a = parole(r.descrizione);
  const b = parole(letto);
  const comuni = [...a].filter((p) => b.has(p)).length;
  const simile = a.size > 0 && comuni / a.size >= 0.5;
  return simile
    ? { campo: "Articolo", chiesto, letto, esito: "verde" }
    : { campo: "Articolo", chiesto, letto, esito: "rosso", nota: "Articolo diverso da quanto chiesto" };
}

function confrontaPrezzo(r: RigaChiesta, l: RigaLetta, minima: number): EsitoCampo | null {
  const chiesto = numero(r.prezzo);
  const letto = numero(l.prezzo_unitario);
  if (chiesto == null || chiesto <= 0 || letto == null) return null;
  const mostra = (n: number) => `${fmt(n)} €`;
  if (incerta(l, "prezzo_unitario", minima)) return campoDaControllare("Prezzo", mostra(chiesto), mostra(letto));
  if (Math.abs(letto - chiesto) <= Math.max(0.01, chiesto * 0.005)) return { campo: "Prezzo", chiesto: mostra(chiesto), letto: mostra(letto), esito: "verde" };
  return { campo: "Prezzo", chiesto: mostra(chiesto), letto: mostra(letto), esito: "giallo", nota: "Prezzo diverso: si guarda e si accetta" };
}

function testoChiesto(r: RigaChiesta): string {
  const m = r.misure ?? {};
  const dimensioni = m.larghezza != null && m.altezza != null
    ? `L ${fmt(m.larghezza)}${m.profondita != null ? ` × P ${fmt(m.profondita)}` : ""} × H ${fmt(m.altezza)} mm`
    : m.mq != null ? `${fmt(m.mq)} mq` : null;
  return [`${fmt(r.quantita)} ${r.unita || "pz"}`, dimensioni, r.colore, r.apertura].filter(Boolean).join(" · ");
}

function testoLetto(l: RigaLetta): string {
  const dimensioni = l.larghezza_mm != null && l.altezza_mm != null
    ? `L ${fmt(l.larghezza_mm)}${l.profondita_mm != null ? ` × P ${fmt(l.profondita_mm)}` : ""} × H ${fmt(l.altezza_mm)} mm`
    : l.mq != null ? `${fmt(l.mq)} mq` : null;
  return [l.quantita != null ? `${fmt(l.quantita)} ${l.unita || "pz"}` : null, dimensioni, l.colore, l.apertura, l.formato].filter(Boolean).join(" · ") || "—";
}

export function confrontaRiga(r: RigaChiesta, l: RigaLetta, op: OpzioniConfronto = {}): RigaConfronto {
  const toll = op.tolleranzaMm ?? 5;
  const minima = op.confidenzaMinima ?? 60;
  const categoria = categoriaRiga(r);
  const testoRiga = `${r.descrizione} ${r.dettagli ?? ""}`;
  const campi: EsitoCampo[] = [];
  const aggiungi = (c: EsitoCampo | null) => { if (c) campi.push(c); };

  aggiungi(confrontaQuantita(r, l, categoria, minima));

  if (categoria === "serramenti" || categoria === "pergole") {
    const m = r.misure ?? {};
    if (m.larghezza != null) aggiungi(confrontaMisura("Larghezza", m.larghezza, l.larghezza_mm, !incerta(l, "larghezza_mm", minima), toll));
    if (m.altezza != null) aggiungi(confrontaMisura("Altezza", m.altezza, l.altezza_mm, !incerta(l, "altezza_mm", minima), toll));
    if (m.profondita != null) aggiungi(confrontaMisura("Profondità", m.profondita, l.profondita_mm, !incerta(l, "profondita_mm", minima), toll));
    if (m.larghezza == null && m.altezza == null && m.mq == null) {
      campi.push({ campo: "Misure", chiesto: null, letto: testoLetto(l), esito: "da_controllare", nota: "Nell'ordine non ci sono misure da confrontare" });
    }
  }

  if (categoria === "serramenti") {
    const chiesta = aperturaNormalizzata(r.apertura) ?? aperturaNormalizzata(r.dettagli);
    const letta = aperturaNormalizzata(l.apertura);
    aggiungi(confrontaTesto("Apertura", chiesta, letta, !incerta(l, "apertura", minima), r.apertura ?? chiesta, l.apertura ?? null));
    const colChiesto = coloreDaTesto(r.colore) ?? coloreDaTesto(r.dettagli);
    const colLetto = coloreDaTesto(l.colore);
    aggiungi(confrontaTesto("Colore", colChiesto, colLetto, !incerta(l, "colore", minima), r.colore ?? colChiesto, l.colore ?? null));
    const matChiesto = materialeDaTesto(testoRiga);
    const matLetto = materialeDaTesto(l.materiale ?? l.descrizione);
    aggiungi(confrontaTesto("Materiale", matChiesto, matLetto, !incerta(l, "materiale", minima), matChiesto, l.materiale ?? matLetto));
  }

  if (categoria === "pergole") {
    const ralChiesto = ralDaTesto(r.colore) ?? ralDaTesto(r.dettagli) ?? ralDaTesto(r.descrizione);
    const ralLetto = ralDaTesto(l.colore) ?? ralDaTesto(l.descrizione);
    aggiungi(confrontaTesto("RAL", ralChiesto, ralLetto, !incerta(l, "colore", minima), ralChiesto, ralLetto ?? l.colore ?? null));
  }

  if (categoria === "piastrelle") {
    aggiungi(confrontaArticolo(r, l, minima));
    const fChiesto = formatoDaTesto(testoRiga);
    const fLetto = formatoDaTesto(l.formato ?? l.descrizione);
    aggiungi(confrontaTesto("Formato", fChiesto, fLetto, !incerta(l, "formato", minima), fChiesto, l.formato ?? fLetto));
    if (r.misure?.mq != null) {
      const mq = numero(l.mq) ?? numero(l.quantita);
      if (mq == null) campi.push(campoDaControllare("Metri quadri", `${fmt(r.misure.mq)} mq`, null, "Il documento non riporta i mq"));
      else if (incerta(l, "mq", minima)) campi.push(campoDaControllare("Metri quadri", `${fmt(r.misure.mq)} mq`, `${fmt(mq)} mq`));
      else {
        const quasi = Math.abs(mq - r.misure.mq) / r.misure.mq <= 0.02;
        campi.push({ campo: "Metri quadri", chiesto: `${fmt(r.misure.mq)} mq`, letto: `${fmt(mq)} mq`, esito: mq === r.misure.mq ? "verde" : quasi ? "giallo" : "rosso", nota: mq === r.misure.mq ? undefined : quasi ? "Differenza entro il 2%" : "Metri quadri diversi" });
      }
    }
    if (!l.lotto) campi.push({ campo: "Lotto", chiesto: null, letto: null, esito: "giallo", nota: "Il documento non indica il lotto" });
  }

  if (categoria === "generico") aggiungi(confrontaArticolo(r, l, minima));
  aggiungi(confrontaPrezzo(r, l, minima));

  return {
    chiave: r.chiave,
    riferimento: r.riferimento ?? null,
    descrizione: r.descrizione,
    categoria,
    stato: "abbinata",
    esito: peggiore(campi.map((c) => c.esito)),
    chiesto: testoChiesto(r),
    letto: testoLetto(l),
    campi,
  };
}

const vicina = (r: RigaChiesta, l: RigaLetta, toll: number) => {
  const a = numero(r.misure?.larghezza);
  const b = numero(r.misure?.altezza);
  return a != null && b != null && numero(l.larghezza_mm) != null && numero(l.altezza_mm) != null
    && Math.abs(a - Number(l.larghezza_mm)) <= toll && Math.abs(b - Number(l.altezza_mm)) <= toll;
};

/** Abbina posizione e riga letta: prima il Rif., poi il codice, poi le misure vicine, mai per caso. */
export function confrontaDocumento(chieste: RigaChiesta[], lette: RigaLetta[], op: OpzioniConfronto = {}): { righe: RigaConfronto[]; esito: Esito } {
  const toll = op.tolleranzaMm ?? 5;
  const libere = new Set(lette.map((_, i) => i));
  const abbinate = new Map<string, number>();
  const prendi = (r: RigaChiesta, trova: (l: RigaLetta) => boolean) => {
    if (abbinate.has(r.chiave)) return;
    const candidate = [...libere].filter((i) => trova(lette[i]));
    if (candidate.length >= 1) { abbinate.set(r.chiave, candidate[0]); libere.delete(candidate[0]); }
  };

  for (const r of chieste) if (r.riferimento) prendi(r, (l) => !!l.riferimento && norm(l.riferimento) === norm(r.riferimento));
  for (const r of chieste) if (r.sku) prendi(r, (l) => !!l.codice_articolo && norm(l.codice_articolo) === norm(r.sku));
  for (const r of chieste) prendi(r, (l) => vicina(r, l, toll));
  for (const r of chieste) {
    if (abbinate.has(r.chiave) || r.riferimento) continue;
    prendi(r, (l) => !l.riferimento && categoriaRiga({ descrizione: l.descrizione ?? "", dettagli: null, unita: l.unita, misure: null }) === categoriaRiga(r)
      && confrontaArticolo(r, { ...l, confidenza: 100, incerti: [] }, 0).esito === "verde");
  }

  // Rimasti lo stesso numero da entrambe le parti: si abbinano in ordine, ma lo decide una persona.
  const senzaCoppia = chieste.filter((r) => !abbinate.has(r.chiave));
  const inOrdine = senzaCoppia.length > 0 && senzaCoppia.length === libere.size;
  const inAttesa = new Set<string>();
  if (inOrdine) {
    const restanti = [...libere].sort((a, b) => a - b);
    senzaCoppia.forEach((r, i) => { abbinate.set(r.chiave, restanti[i]); libere.delete(restanti[i]); inAttesa.add(r.chiave); });
  }

  const righe: RigaConfronto[] = chieste.map((r) => {
    const i = abbinate.get(r.chiave);
    if (i == null) {
      return {
        chiave: r.chiave, riferimento: r.riferimento ?? null, descrizione: r.descrizione, categoria: categoriaRiga(r),
        stato: "mancante", esito: "rosso", chiesto: testoChiesto(r), letto: "—",
        campi: [{ campo: "Posizione", chiesto: r.riferimento ?? r.descrizione, letto: null, esito: "rosso", nota: "Posizione mancante nel documento" }],
      };
    }
    const c = confrontaRiga(r, lette[i], op);
    if (inAttesa.has(r.chiave)) {
      c.campi.unshift(campoDaControllare("Abbinamento", r.riferimento ?? r.descrizione, lette[i].riferimento ?? lette[i].descrizione ?? null, "Abbinata solo per ordine di riga: controlla che sia la stessa posizione"));
      c.esito = peggiore(c.campi.map((x) => x.esito));
    }
    return c;
  });

  for (const i of [...libere].sort((a, b) => a - b)) {
    const l = lette[i];
    righe.push({
      chiave: `in_piu:${i}`, riferimento: l.riferimento ?? null, descrizione: l.descrizione ?? "Riga non riconosciuta", categoria: "generico",
      stato: "in_piu", esito: "rosso", chiesto: "—", letto: testoLetto(l),
      campi: [{ campo: "Posizione", chiesto: null, letto: l.riferimento ?? l.descrizione ?? null, esito: "rosso", nota: "Riga in più: non l'abbiamo chiesta" }],
    });
  }
  return { righe, esito: righe.length ? peggiore(righe.map((r) => r.esito)) : "da_controllare" };
}

/** La consegna fuori dalla data chiesta non è un errore di produzione: si guarda e si accetta. */
export function esitoConsegna(chiesta?: string | null, letta?: string | null): EsitoCampo | null {
  if (!chiesta || !letta) return null;
  if (letta.slice(0, 10) <= chiesta.slice(0, 10)) return { campo: "Consegna", chiesto: chiesta, letto: letta, esito: "verde" };
  return { campo: "Consegna", chiesto: chiesta, letto: letta, esito: "giallo", nota: "Consegna dopo la data chiesta" };
}

/** Se la conferma dice le stesse cose dell'offerta già controllata, quella riga non si rifà. */
export function ereditaDaOfferta(conferma: RigaConfronto[], offerta: RigaConfronto[] | null | undefined): RigaConfronto[] {
  if (!offerta?.length) return conferma;
  const perChiave = new Map(offerta.map((r) => [r.chiave, r]));
  return conferma.map((r) => {
    const o = perChiave.get(r.chiave);
    if (!o || o.stato !== "abbinata" || r.stato !== "abbinata" || o.letto !== r.letto) return r;
    if (r.esito === "rosso" || r.esito === "da_controllare") {
      if (!o.deciso_da_persona) return r;
    }
    return { ...r, esito: o.esito === "rosso" ? "giallo" : o.esito, da_offerta: true };
  });
}
