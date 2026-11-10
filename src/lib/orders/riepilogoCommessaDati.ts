/**
 * Dati del PDF «Riepilogo commessa» oltre a quelli che la pagina ha già.
 * Una lettura che fallisce non ferma il PDF ma resta scritta in `nonLette`: il
 * documento dice «non letta», non fa credere che la sezione sia vuota.
 * Niente @react-pdf qui: questo modulo non deve trascinarsi dietro la libreria.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = { from: (tabella: string) => any; storage?: any };
type Riga = Record<string, any>;

/** Le parti del documento che si possono togliere prima di scaricarlo. */
export const GRUPPI_RIEPILOGO = [
  { id: "programma", label: "Cronoprogramma e fasi" },
  { id: "articoli", label: "Articoli" },
  { id: "economia", label: "Grafici, conto economico e pagamenti" },
  { id: "fatture", label: "Fatture al cliente" },
  { id: "sal", label: "SAL e varianti" },
  { id: "subappalti", label: "Subappalti" },
  { id: "risorse", label: "Dipendenti, provvigioni e ordini di acquisto" },
  { id: "cantiere", label: "Ore, mezzi, bolle, sicurezza e segnalazioni" },
  { id: "giornale", label: "Giornale lavori" },
  { id: "agenda", label: "Attività, appuntamenti, firme e allegati" },
  { id: "foto", label: "Foto di cantiere" },
  { id: "diario", label: "Diario e note interne" },
] as const;
export type GruppoRiepilogo = (typeof GRUPPI_RIEPILOGO)[number]["id"];
export const GRUPPI_SINTETICO: GruppoRiepilogo[] = ["programma", "economia", "fatture", "sal"];

export interface AziendaRiepilogo {
  nome: string | null;
  righe: string[];
  logo: string | null;
  /** Il colore principale: l'accento dello stile unico dei documenti (10/11/2026). */
  colore?: string | null;
}

export interface PermessiRiepilogo {
  vedeCosti: boolean;
  vedeFatture: boolean;
  vedeSubappalti: boolean;
  vedeSicurezza: boolean;
}

export interface FatturaRiepilogo {
  numero: string;
  tipo: "fattura" | "nota_credito" | "proforma";
  data: string | null;
  scadenza: string | null;
  totale: number;
  pagato: number;
  pagataIl: string | null;
  stato: string;
}

export interface OreRapportini {
  rapportini: number;
  giornate: number;
  ore: number;
  straordinari: number;
  primo: string | null;
  ultimo: string | null;
  perPersona: Array<{ nome: string; giornate: number; ore: number }>;
}

export interface DatiRiepilogo {
  /** Cosa si è provato a leggere: una sezione negata non va dichiarata «senza dati». */
  permessi: PermessiRiepilogo;
  azienda: AziendaRiepilogo | null;
  fornitoriArticoli: Record<string, string>;
  fasi: Riga[];
  fatture: FatturaRiepilogo[];
  fattureAnnullate: number;
  contratti: Riga[];
  salSub: Riga[];
  ddt: Riga[];
  usciteMagazzino: Riga[];
  attivita: Riga[];
  appuntamenti: Riga[];
  sopralluoghi: Riga[];
  ticket: Riga[];
  rapportini: Riga[];
  ore: OreRapportini;
  mezzi: Array<{ nome: string; giornate: number; primo: string | null; ultimo: string | null }>;
  foto: Array<{ src: string; descrizione: string | null; data: string | null }>;
  fotoTotali: number;
  allegati: Riga[];
  sicurezzaPos: Riga[];
  sicurezzaDuvri: Riga[];
  sicurezzaVerbali: Riga[];
  firme: Riga[];
  storicoStati: Riga[];
  segnalazioni: Riga[];
  errori: Riga[];
  noteCantiere: Riga[];
  nonLette: string[];
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const tondo = (v: number) => Math.round(v * 100) / 100;
const nomePersona = (p?: { first_name?: string | null; last_name?: string | null } | null) =>
  `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();

/**
 * La stessa fattura può stare sia in documenti_fiscali sia in invoices (emessa
 * dal gestionale o importata): una riga per numero. Le annullate si contano e basta.
 */
export function fattureDiCommessa(documenti: Riga[], importate: Riga[]) {
  const per = new Map<string, FatturaRiepilogo>();
  const annullate = new Set<string>();
  for (const d of documenti) {
    if (d.tipo === "ddt" || !d.numero) continue;
    const numero = String(d.numero);
    if (d.stato === "annullata") { annullate.add(numero); continue; }
    per.set(numero, {
      numero, tipo: String(d.tipo).includes("nota") ? "nota_credito" : d.tipo === "proforma" ? "proforma" : "fattura",
      data: d.data_emissione ?? null, scadenza: d.data_scadenza ?? null, totale: num(d.totale_documento),
      pagato: num(d.importo_pagato), pagataIl: d.pagato_at ?? null, stato: String(d.stato ?? ""),
    });
  }
  for (const i of importate) {
    const numero = String(i.invoice_number ?? "");
    if (!numero || per.has(numero) || annullate.has(numero)) continue;
    if (i.status === "cancelled") { annullate.add(numero); continue; }
    per.set(numero, {
      numero, tipo: i.document_type === "credit_note" ? "nota_credito" : i.document_type === "proforma" ? "proforma" : "fattura",
      data: i.issue_date ?? null, scadenza: i.due_date ?? null, totale: num(i.total), pagato: num(i.paid_amount),
      pagataIl: i.payment_date ?? null, stato: i.status === "paid" ? "pagata" : i.status === "draft" ? "bozza" : i.status === "credited" ? "stornata" : "emessa",
    });
  }
  const fatture = [...per.values()].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  return { fatture, annullate: annullate.size };
}

/** Emesso e incassato: la nota di credito sottrae, la proforma non è un documento fiscale. */
export function totaliFatture(fatture: FatturaRiepilogo[]) {
  const t = { emesso: 0, incassato: 0 };
  for (const f of fatture) {
    if (f.tipo === "proforma" || f.stato === "bozza") continue;
    const segno = f.tipo === "nota_credito" ? -1 : 1;
    t.emesso += segno * f.totale;
    t.incassato += segno * f.pagato;
  }
  return { emesso: tondo(t.emesso), incassato: tondo(t.incassato), residuo: tondo(t.emesso - t.incassato) };
}

/**
 * Ore per persona dalle presenze del rapportino; senza presenze, le ore vanno a
 * chi l'ha compilato. I rifiutati non contano.
 */
export function oreDaRapportini(righe: Riga[]): OreRapportini {
  const buoni = righe.filter((r) => r.stato !== "rifiutato");
  const persone = new Map<string, { giorni: Set<string>; ore: number }>();
  const aggiungi = (nome: string, giorno: string, ore: number) => {
    const p = persone.get(nome) ?? { giorni: new Set<string>(), ore: 0 };
    p.giorni.add(giorno);
    p.ore += ore;
    persone.set(nome, p);
  };
  const giorni = new Set<string>();
  let ore = 0;
  let straordinari = 0;
  for (const r of buoni) {
    const giorno = String(r.data_lavoro ?? "");
    giorni.add(giorno);
    straordinari += num(r.ore_straordinario);
    const presenze = Array.isArray(r.presenze) ? r.presenze.filter((p: Riga) => p?.nome) : [];
    if (presenze.length > 0) {
      for (const p of presenze) { aggiungi(String(p.nome), giorno, num(p.ore)); ore += num(p.ore); }
    } else {
      const nome = nomePersona(r.operaio) || nomePersona(r.dipendente) || "Non indicato";
      aggiungi(nome, giorno, num(r.ore_lavorate));
      ore += num(r.ore_lavorate);
    }
  }
  const date = [...giorni].filter(Boolean).sort();
  return {
    rapportini: buoni.length, giornate: date.length, ore: tondo(ore), straordinari: tondo(straordinari),
    primo: date[0] ?? null, ultimo: date[date.length - 1] ?? null,
    perPersona: [...persone.entries()].map(([nome, p]) => ({ nome, giornate: p.giorni.size, ore: tondo(p.ore) })).sort((a, b) => b.ore - a.ore),
  };
}

/** Giornate di ogni mezzo sulla commessa. */
export function giornateMezzi(righe: Riga[]) {
  const per = new Map<string, Set<string>>();
  for (const r of righe) {
    if (r.usato === false) continue;
    const nome = [r.mezzo?.nome, r.mezzo?.targa].filter(Boolean).join(" · ") || "Mezzo";
    const g = per.get(nome) ?? new Set<string>();
    g.add(String(r.giorno));
    per.set(nome, g);
  }
  return [...per.entries()].map(([nome, g]) => {
    const date = [...g].sort();
    return { nome, giornate: g.size, primo: date[0] ?? null, ultimo: date[date.length - 1] ?? null };
  }).sort((a, b) => b.giornate - a.giornate);
}

/** Avanzamento di un SAL: la media delle voci pesata sull'importo contrattuale. */
export function avanzamentoSal(voci: Riga[] | null | undefined): number | null {
  const v = voci ?? [];
  const peso = v.reduce((s, x) => s + num(x.importo_contrattuale), 0);
  if (v.length === 0 || peso <= 0) return null;
  return tondo(v.reduce((s, x) => s + num(x.importo_contrattuale) * num(x.percentuale_avanzamento), 0) / peso);
}

/* ── Cronoprogramma ─────────────────────────────────────────────────── */
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const giornoUtc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));

export interface AsseTempo {
  mesi: Array<{ chiave: string; etichetta: string; sinistra: number; larghezza: number }>;
  /** Posizione di una data sull'asse, da 0 a 100. */
  pos: (d: string) => number;
}

/** Asse a mesi interi che contiene tutte le date; null se non ce n'è nessuna. */
export function asseTempo(date: Array<string | null | undefined>): AsseTempo | null {
  const valide = date.filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}/.test(d)).map((d) => d.slice(0, 10)).sort();
  if (valide.length === 0) return null;
  const primo = valide[0];
  const ultimo = valide[valide.length - 1];
  const inizio = Date.UTC(Number(primo.slice(0, 4)), Number(primo.slice(5, 7)) - 1, 1);
  const fine = Date.UTC(Number(ultimo.slice(0, 4)), Number(ultimo.slice(5, 7)), 1);
  const durata = fine - inizio;
  const mesi: AsseTempo["mesi"] = [];
  for (let c = new Date(inizio); c.getTime() < fine;) {
    const a = c.getTime();
    const dopo = Date.UTC(c.getUTCFullYear(), c.getUTCMonth() + 1, 1);
    mesi.push({
      chiave: `${c.getUTCFullYear()}-${String(c.getUTCMonth() + 1).padStart(2, "0")}`,
      etichetta: `${MESI[c.getUTCMonth()]} ${String(c.getUTCFullYear()).slice(2)}`,
      sinistra: ((a - inizio) / durata) * 100,
      larghezza: ((dopo - a) / durata) * 100,
    });
    c = new Date(dopo);
  }
  return { mesi, pos: (d) => Math.max(0, Math.min(100, ((giornoUtc(d.slice(0, 10)) - inizio) / durata) * 100)) };
}

/** Date di una fase: le sue, altrimenti quelle delle sottofasi. */
export function periodoFase(f: Riga): { inizio: string | null; fine: string | null } {
  const sotto = (f.sottofasi ?? []) as Riga[];
  const inizi = sotto.map((s) => s.data_inizio).filter(Boolean).sort();
  const fini = sotto.map((s) => s.data_fine ?? s.data_inizio).filter(Boolean).sort();
  const inizio = f.start_date ?? inizi[0] ?? f.end_date ?? null;
  const fine = f.end_date ?? fini[fini.length - 1] ?? f.start_date ?? inizio;
  return { inizio, fine };
}

/** Tempo trascorso sul periodo dei lavori, da mettere accanto all'avanzamento. */
export function tempoTrascorso(inizio: string | null | undefined, fine: string | null | undefined, oggi: string): number | null {
  if (!inizio || !fine) return null;
  const a = giornoUtc(inizio);
  const b = giornoUtc(fine);
  if (b <= a) return null;
  return Math.round(Math.max(0, Math.min(1, (giornoUtc(oggi) - a) / (b - a))) * 100);
}

/* ── Cassa mese per mese ────────────────────────────────────────────── */
export interface MeseCassa { mese: string; etichetta: string; entrate: number; uscite: number; saldo: number }

/**
 * Entrate e uscite per mese, col saldo progressivo: l'incassato e il pagato alla
 * loro data, il resto alla scadenza. Gli ordini senza fattura non sono ancora un debito.
 */
export function cassaPerMese(quadro: { rate: Riga[]; uscite: Riga[] } | null | undefined): { mesi: MeseCassa[]; senzaData: number } {
  const per = new Map<string, { entrate: number; uscite: number }>();
  let senzaData = 0;
  const metti = (data: unknown, campo: "entrate" | "uscite", importo: number) => {
    if (!importo) return;
    if (!data) { senzaData += importo; return; }
    const mese = String(data).slice(0, 7);
    const m = per.get(mese) ?? { entrate: 0, uscite: 0 };
    m[campo] += importo;
    per.set(mese, m);
  };
  for (const r of quadro?.rate ?? []) metti(r.is_paid ? r.paid_date ?? r.expected_date : r.expected_date, "entrate", num(r.amount));
  for (const u of quadro?.uscite ?? []) {
    if (u.stato === "fattura_da_arrivare" || u.stato === "da_maturare") continue;
    metti(u.pagato_il ?? u.scadenza, "uscite", num(u.pagato));
    metti(u.scadenza ?? u.pagato_il, "uscite", num(u.residuo));
  }
  // Anche i mesi senza movimenti: sull'asse il tempo deve scorrere uguale.
  const chiavi = [...per.keys()].sort();
  const tutti: string[] = [];
  if (chiavi.length > 0) {
    let [anno, numero] = chiavi[0].split("-").map(Number);
    const ultimo = chiavi[chiavi.length - 1];
    for (let c = chiavi[0]; c <= ultimo; c = `${anno}-${String(numero).padStart(2, "0")}`) {
      tutti.push(c);
      numero += 1;
      if (numero > 12) { numero = 1; anno += 1; }
    }
  }
  let saldo = 0;
  const mesi = tutti.map((mese) => {
    const m = per.get(mese) ?? { entrate: 0, uscite: 0 };
    saldo += m.entrate - m.uscite;
    return { mese, etichetta: `${MESI[Number(mese.slice(5, 7)) - 1]} ${mese.slice(2, 4)}`, entrate: tondo(m.entrate), uscite: tondo(m.uscite), saldo: tondo(saldo) };
  });
  return { mesi, senzaData: tondo(senzaData) };
}

/* ── Rapportini per settimana ───────────────────────────────────────── */
export interface SettimanaOre { lunedi: string; giornate: number; ore: number; lavori: string[] }

export function orePerSettimana(righe: Riga[]): SettimanaOre[] {
  const per = new Map<string, { giorni: Set<string>; ore: number; lavori: Set<string> }>();
  for (const r of righe) {
    if (r.stato === "rifiutato" || !r.data_lavoro) continue;
    const giorno = String(r.data_lavoro).slice(0, 10);
    const t = giornoUtc(giorno);
    const lunedi = new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86400000).toISOString().slice(0, 10);
    const s = per.get(lunedi) ?? { giorni: new Set<string>(), ore: 0, lavori: new Set<string>() };
    s.giorni.add(giorno);
    const presenze = Array.isArray(r.presenze) ? r.presenze.filter((p: Riga) => p?.nome) : [];
    s.ore += presenze.length > 0 ? presenze.reduce((x: number, p: Riga) => x + num(p.ore), 0) : num(r.ore_lavorate);
    if (r.descrizione_lavori) s.lavori.add(String(r.descrizione_lavori).trim());
    per.set(lunedi, s);
  }
  return [...per.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([lunedi, s]) => ({ lunedi, giornate: s.giorni.size, ore: tondo(s.ore), lavori: [...s.lavori] }));
}

const FOTO_MASSIME = 12;

/** Logo per la testata: sfondo bianco per i PNG trasparenti. Un SVG o un file illeggibile lascia il nome scritto. */
async function logoPerPdf(url: string | null | undefined): Promise<string | null> {
  if (!url || typeof document === "undefined") return null;
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) return null;
    const img = await createImageBitmap(await risposta.blob());
    const scala = Math.min(1, 500 / Math.max(img.width, img.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(img.width * scala);
    tela.height = Math.round(img.height * scala);
    const ctx = tela.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, tela.width, tela.height);
    ctx.drawImage(img, 0, 0, tela.width, tela.height);
    img.close();
    return tela.toDataURL("image/png");
  } catch {
    return null;
  }
}

/** Righe d'intestazione dell'azienda, solo con quello che c'è. */
export function righeAzienda(a: Riga | null | undefined): string[] {
  if (!a) return [];
  const luogo = [a.legal_postal_code, a.legal_city, a.legal_province ? `(${a.legal_province})` : null].filter(Boolean).join(" ");
  return [
    [a.legal_address, luogo].filter(Boolean).join(", "),
    [a.vat_number ? `P.IVA ${a.vat_number}` : null, a.phone, a.email, a.pec ? `PEC ${a.pec}` : null].filter(Boolean).join(" · "),
  ].filter(Boolean);
}

/** Foto rimpicciolita e dentro il PDF: dodici foto del telefono farebbero un file da decine di MB. */
async function fotoPerPdf(url: string): Promise<string | null> {
  try {
    const risposta = await fetch(url);
    if (!risposta.ok) return null;
    const img = await createImageBitmap(await risposta.blob());
    const scala = Math.min(1, 900 / Math.max(img.width, img.height));
    const tela = document.createElement("canvas");
    tela.width = Math.round(img.width * scala);
    tela.height = Math.round(img.height * scala);
    tela.getContext("2d")?.drawImage(img, 0, 0, tela.width, tela.height);
    img.close();
    return tela.toDataURL("image/jpeg", 0.72);
  } catch {
    return null;
  }
}

async function caricaFoto(db: Db, righe: Riga[], segna: (nome: string) => void) {
  const scelte = righe.filter((f) => f.thumbnail_path || f.storage_path).slice(0, FOTO_MASSIME);
  if (scelte.length === 0 || !db.storage || typeof document === "undefined") return [];
  const { data, error } = await db.storage.from("foto-cantiere").createSignedUrls(scelte.map((f) => f.thumbnail_path || f.storage_path), 600);
  if (error) { segna("Foto di cantiere"); return []; }
  const lette = await Promise.all(scelte.map(async (f, i) => {
    const url = data?.[i]?.signedUrl;
    const src = url ? await fotoPerPdf(url) : null;
    return src ? { src, descrizione: f.descrizione ?? null, data: f.taken_at ?? f.created_at ?? null } : null;
  }));
  return lette.filter((f): f is NonNullable<typeof f> => f !== null);
}

export async function caricaDatiRiepilogo(db: Db, orderId: string, permessi: PermessiRiepilogo, opzioni: { perCliente?: boolean; companyId?: string | null } = {}): Promise<DatiRiepilogo> {
  const nonLette: string[] = [];
  const leggi = async (nome: string, query: PromiseLike<{ data: unknown; error: unknown }>): Promise<Riga[]> => {
    try {
      const { data, error } = await query;
      if (error) { console.error(`[Riepilogo commessa] ${nome}:`, error); nonLette.push(nome); return []; }
      return (data as Riga[] | null) ?? [];
    } catch (e) {
      console.error(`[Riepilogo commessa] ${nome}:`, e);
      nonLette.push(nome);
      return [];
    }
  };
  const interno = !opzioni.perCliente;
  const seInterno = (nome: string, crea: () => PromiseLike<{ data: unknown; error: unknown }>, ammesso = true) =>
    interno && ammesso ? leggi(nome, crea()) : Promise.resolve([] as Riga[]);

  const [articoli, fasi, documenti, importate, contratti, salSub, verbaliSub, ddt, uscite, attivita, appuntamenti, sopralluoghi, ticket,
    rapportini, mezzi, foto, allegati, pos, duvri, verbali, firme, storico, segnalazioni, errori, note] = await Promise.all([
    seInterno("Fornitori degli articoli", () => db.from("order_items").select("id, supplier:suppliers(name)").eq("order_id", orderId)),
    leggi("Fasi di lavorazione", db.from("order_work_phases").select("id, name, position, status, start_date, end_date, percentuale, notes").eq("order_id", orderId).order("position")),
    permessi.vedeFatture ? leggi("Fatture", db.from("documenti_fiscali").select("tipo, numero, data_emissione, data_scadenza, stato, totale_documento, importo_pagato, pagato_at").eq("ordine_id", orderId).is("deleted_at", null)) : Promise.resolve([] as Riga[]),
    permessi.vedeFatture ? leggi("Fatture", db.from("invoices").select("invoice_number, document_type, status, issue_date, due_date, total, paid_amount, payment_date").eq("order_id", orderId).is("deleted_at", null)) : Promise.resolve([] as Riga[]),
    seInterno("Contratti di subappalto", () => db.from("contratti_subappalto").select("id, numero_contratto, descrizione_lavori, importo_contrattuale, ritenuta_garanzia_pct, data_inizio, data_fine_prevista, stato, firmato_il, subappaltatore:subappaltatori_sicurezza(ragione_sociale)").eq("order_id", orderId), permessi.vedeSubappalti),
    seInterno("SAL dei subappaltatori", () => db.from("sal_subappaltatori").select("id, contratto_id, numero_sal, data_emissione, importo_lordo, ritenuta_importo, importo_netto, stato, data_pagamento, subappaltatore:subappaltatori_sicurezza(ragione_sociale)").eq("order_id", orderId).order("data_emissione"), permessi.vedeSubappalti),
    seInterno("SAL dei subappaltatori", () => db.from("sal_sub_verbali").select("sal_id, accettato_il, accettato_da").eq("order_id", orderId), permessi.vedeSubappalti),
    seInterno("Bolle di consegna", () => db.from("ddt_ricezione").select("numero_ddt, data_ricezione, stato, destinazione, non_conformita, has_damages, supplier:suppliers(name)").eq("order_id", orderId).order("data_ricezione")),
    seInterno("Uscite di magazzino", () => db.from("warehouse_uscite").select("numero, data, stato, vettore, righe").eq("order_id", orderId).order("data")),
    seInterno("Attività", () => db.from("tasks").select("title, status, priority, due_date, completed_at, assegnata:profiles!tasks_assigned_to_fkey(first_name, last_name)").eq("order_id", orderId).order("due_date", { ascending: true, nullsFirst: false }).limit(200)),
    seInterno("Appuntamenti", () => db.from("appointments").select("title, appointment_date, appointment_time, appointment_type, status, is_completed").eq("order_id", orderId).order("appointment_date").limit(200)),
    seInterno("Sopralluoghi", () => db.from("surveys").select("code, status, scheduled_at, completed_at, address, city").eq("order_id", orderId).is("deleted_at", null)),
    seInterno("Assistenza", () => db.from("tickets").select("subject, titolo, status, priorita, created_at, data_intervento_prevista, data_intervento_effettiva").eq("order_id", orderId).order("created_at")),
    seInterno("Rapportini", () => db.from("campo_rapportini").select("data_lavoro, ore_lavorate, ore_straordinario, descrizione_lavori, stato, presenze, operaio:profiles!campo_rapportini_user_id_fkey(first_name, last_name), dipendente:employees!campo_rapportini_ufficio_employee_id_fkey(first_name, last_name)").eq("order_id", orderId).order("data_lavoro", { ascending: false }).limit(1000)),
    seInterno("Mezzi", () => db.from("mezzi_giornate").select("giorno, usato, mezzo:mezzi!mezzi_giornate_mezzo_id_fkey(nome, targa)").eq("order_id", orderId).limit(1000)),
    (() => {
      const q = db.from("foto_cantiere").select("storage_path, thumbnail_path, descrizione, taken_at, created_at").eq("order_id", orderId);
      return leggi("Foto di cantiere", (interno ? q : q.eq("visibile_cliente", true)).order("created_at", { ascending: false }).limit(300));
    })(),
    seInterno("Allegati", () => db.from("order_attachments").select("file_name, file_type, file_size, created_at").eq("order_id", orderId).order("created_at").limit(300)),
    seInterno("Sicurezza", () => db.from("pos_documents").select("document_type, version, revisione, status, firmato_il, approvato_il, valid_until, created_at").eq("order_id", orderId), permessi.vedeSicurezza),
    seInterno("Sicurezza", () => db.from("duvri_documents").select("status, firmato_committente_il, firmato_subappaltatore_il, created_at").eq("order_id", orderId), permessi.vedeSicurezza),
    seInterno("Sicurezza", () => db.from("verbali_sicurezza").select("data, tipo, esito, note").eq("order_id", orderId).order("data"), permessi.vedeSicurezza),
    seInterno("Firme", () => db.from("signature_requests").select("signer_name, tipo_documento, categoria, status, signed_at, created_at").eq("order_id", orderId).order("created_at")),
    seInterno("Storico degli stati", () => db.from("order_status_history").select("changed_at, stato:order_statuses(name)").eq("order_id", orderId).order("changed_at").limit(100)),
    seInterno("Segnalazioni di cantiere", () => db.from("cantiere_segnalazioni").select("descrizione, urgenza, tipo_problema, stato, created_at, resolved_at").eq("order_id", orderId).order("created_at")),
    seInterno("Errori e imprevisti", () => db.from("order_errors").select("error_type, error_category, description, amount, error_date, review_status").eq("order_id", orderId).order("error_date"), permessi.vedeCosti),
    seInterno("Note di cantiere", () => db.from("note_cantiere").select("testo, importante, created_at").eq("order_id", orderId).order("created_at")),
  ]);

  // Le sottofasi si leggono dopo le fasi: stanno sotto di loro, non sulla commessa.
  const idFasi = fasi.map((f) => f.id).filter(Boolean);
  const sottofasi = idFasi.length > 0
    ? await leggi("Fasi di lavorazione", db.from("order_work_subphases").select("id, phase_id, name, position, data_inizio, data_fine, fatta").in("phase_id", idFasi).order("position"))
    : [];
  const [aziendaRiga] = opzioni.companyId
    ? await leggi("Dati dell'azienda", db.from("companies").select("name, logo_url, brand_primary_color, vat_number, phone, email, pec, legal_address, legal_city, legal_province, legal_postal_code").eq("id", opzioni.companyId).limit(1))
    : [];

  const { fatture, annullate } = fattureDiCommessa(documenti, importate);
  const accettazioni = new Map(verbaliSub.map((v) => [v.sal_id, v]));
  return {
    permessi,
    azienda: aziendaRiga ? { nome: aziendaRiga.name ?? null, righe: righeAzienda(aziendaRiga), logo: await logoPerPdf(aziendaRiga.logo_url), colore: aziendaRiga.brand_primary_color ?? null } : null,
    fornitoriArticoli: Object.fromEntries(articoli.filter((a) => a.supplier?.name).map((a) => [a.id, a.supplier.name])),
    fasi: fasi.map((f) => ({ ...f, sottofasi: sottofasi.filter((s) => s.phase_id === f.id) })),
    fatture,
    fattureAnnullate: annullate,
    contratti,
    salSub: salSub.map((s) => ({ ...s, accettato_il: accettazioni.get(s.id)?.accettato_il ?? null })),
    ddt,
    usciteMagazzino: uscite,
    attivita,
    appuntamenti,
    sopralluoghi,
    ticket,
    rapportini,
    ore: oreDaRapportini(rapportini),
    mezzi: giornateMezzi(mezzi),
    foto: await caricaFoto(db, foto, (n) => nonLette.push(n)),
    fotoTotali: foto.length,
    allegati,
    sicurezzaPos: pos,
    sicurezzaDuvri: duvri,
    sicurezzaVerbali: verbali,
    firme,
    storicoStati: storico,
    segnalazioni,
    errori,
    noteCantiere: note,
    nonLette: [...new Set(nonLette)],
  };
}
