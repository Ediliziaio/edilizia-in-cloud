/**
 * Computo metrico «strutturato»: il formato comune in cui finiscono il PDF di
 * PriMus e l'XPWE, con le righe di misura (libretto), la gerarchia
 * super-categoria › categoria › sotto-categoria e il controllo dei totali.
 *
 * Codice puro, senza import: lo usano la edge function `computo-ai-extract`
 * (Deno) e il frontend (re-export in src/lib/computo/).
 */

export interface ComputoMisura {
  descrizione: string;
  parti_uguali: number | null;
  lunghezza: number | null;
  larghezza: number | null;
  altezza_peso: number | null;
  quantita: number | null;
  /** Le formule scritte nella riga, es. «par.ug.=8*2407,80». */
  formula: string | null;
}

export interface ComputoLivello { numero: number | null; nome: string }

export interface ComputoVoceStrutturata {
  numero_ordine: string;
  /** Codici tariffa come stampati (PriMus ne mette 2-3: articolo, prezzario, codice breve). */
  codici: string[];
  codice_tariffa: string;
  descrizione: string;
  descrizione_troncata: boolean;
  unita_misura: string;
  quantita: number | null;
  prezzo_unitario: number | null;
  importo: number | null;
  sezione: string | null;
  super_categoria: ComputoLivello | null;
  categoria: ComputoLivello | null;
  sotto_categoria: ComputoLivello | null;
  is_sicurezza: boolean;
  is_detrazione: boolean;
  a_corpo: boolean;
  misure: ComputoMisura[];
  pagina: number | null;
  avvisi: string[];
}

export type ComputoLivelloRiepilogo = "super_categoria" | "categoria" | "sotto_categoria" | "strutturale";

export interface ComputoRigaRiepilogo {
  livello: ComputoLivelloRiepilogo;
  codice: string;
  nome: string;
  importo: number;
  /** Solo per il riepilogo strutturale: i numeri SpCat/Cat/SbCat del percorso. */
  percorso?: number[];
}

export interface ComputoStrutturato {
  formato: "primus_pdf" | "xpwe";
  metadata: { oggetto_lavori?: string | null; committente?: string | null; data_computo?: string | null; impresa?: string | null };
  voci: ComputoVoceStrutturata[];
  totale_dichiarato: number | null;
  riepiloghi: ComputoRigaRiepilogo[];
  prezzari: string[];
  avvisi: string[];
}

// ── Numeri ───────────────────────────────────────────────────────────────────

/** «1´500,00», «-31´484,17», «2.407,80», «0,030» → numero; altrimenti null. */
export function numeroComputo(value: string | null | undefined): number | null {
  if (value == null) return null;
  const text = String(value).trim().replace(/\s+/g, "");
  if (!/^[+-]?\d{1,3}(?:[´'’.]\d{3})*(?:,\d+)?$/.test(text) && !/^[+-]?\d+(?:,\d+)?$/.test(text)) return null;
  const n = Number(text.replace(/[´'’.]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export const arrotonda = (n: number, decimali = 2) => {
  const f = 10 ** decimali;
  return Math.round((n + Math.sign(n) * Number.EPSILON) * f) / f;
};

/**
 * Valuta un'espressione delle misure: numeri all'italiana (2407,80 o 2407.80),
 * + - * / e parentesi. Nient'altro: niente eval.
 */
export function valutaFormula(expr: string): number | null {
  const src = expr.replace(/\s+/g, "").replace(/x/gi, "*");
  let i = 0;
  const peek = () => src[i];
  const numero = (): number | null => {
    const m = /^\d+(?:[.,]\d+)?/.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0].replace(",", "."));
  };
  const fattore = (): number | null => {
    if (peek() === "+") { i++; return fattore(); }
    if (peek() === "-") { i++; const v = fattore(); return v === null ? null : -v; }
    if (peek() === "(") {
      i++; const v = somma();
      if (peek() !== ")") return null;
      i++; return v;
    }
    return numero();
  };
  const prodotto = (): number | null => {
    let v = fattore();
    while (v !== null && (peek() === "*" || peek() === "/")) {
      const op = src[i++]; const w = fattore();
      if (w === null) return null;
      if (op === "/" && w === 0) return null;
      v = op === "*" ? v * w : v / w;
    }
    return v;
  };
  const somma = (): number | null => {
    let v = prodotto();
    while (v !== null && (peek() === "+" || peek() === "-")) {
      const op = src[i++]; const w = prodotto();
      if (w === null) return null;
      v = op === "+" ? v + w : v - w;
    }
    return v;
  };
  if (!src) return null;
  const out = somma();
  return out !== null && i === src.length && Number.isFinite(out) ? out : null;
}

const CAMPI_FORMULA: Record<string, keyof Pick<ComputoMisura, "parti_uguali" | "lunghezza" | "larghezza" | "altezza_peso">> = {
  "par.ug.": "parti_uguali", "lung.": "lunghezza", "larg.": "larghezza", "h/peso": "altezza_peso",
};

/** Toglie dalla descrizione le formule «*(par.ug.=8*2407,80)» e le restituisce a parte. */
export function estraiFormule(testo: string): { descrizione: string; formule: Array<{ campo: keyof typeof CAMPI_FORMULA; espressione: string; valore: number | null }> } {
  const formule: Array<{ campo: keyof typeof CAMPI_FORMULA; espressione: string; valore: number | null }> = [];
  let out = "";
  let i = 0;
  const re = /\*?\(\s*(par\.ug\.|lung\.|larg\.|H\/peso)\s*=/gi;
  for (let m = re.exec(testo); m; m = re.exec(testo)) {
    // Parentesi bilanciate: la formula può contenerne altre.
    let depth = 1; let j = m.index + m[0].length;
    for (; j < testo.length && depth > 0; j++) {
      if (testo[j] === "(") depth++;
      else if (testo[j] === ")") depth--;
    }
    if (depth !== 0) break;
    const espressione = testo.slice(m.index + m[0].length, j - 1).trim();
    const campo = m[1].toLowerCase() as keyof typeof CAMPI_FORMULA;
    formule.push({ campo, espressione, valore: valutaFormula(espressione) });
    out += testo.slice(i, m.index);
    i = j; re.lastIndex = j;
  }
  out += testo.slice(i);
  return { descrizione: out.replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").trim(), formule };
}

export function eSicurezza(...nomi: Array<string | null | undefined>): boolean {
  return nomi.some(n => !!n && /(oneri|costi)\b.*\bsicurezza|\bsicurezza\b.*\b(oneri|costi)\b|\bper la sicurezza\b|^sicurezza$/i.test(n.trim()));
}

// ── Controllo dei totali ─────────────────────────────────────────────────────

export interface ControlloVoce {
  numero_ordine: string;
  tipo: "importo" | "misure" | "formula" | "dati_mancanti" | "numerazione";
  messaggio: string;
  atteso?: number | null;
  trovato?: number | null;
}

export interface ControlloCapitolo {
  livello: ComputoLivelloRiepilogo;
  codice: string;
  nome: string;
  dichiarato: number;
  calcolato: number;
  differenza: number;
  ok: boolean;
}

export interface ControlloTotali {
  ok: boolean;
  voci_lette: number;
  voci_detrazione: number;
  voci_sicurezza: number;
  righe_misura: number;
  totale_calcolato: number;
  totale_dichiarato: number | null;
  differenza_totale: number | null;
  oneri_sicurezza: number;
  voci: ControlloVoce[];
  capitoli: ControlloCapitolo[];
  voci_sospette: string[];
  /** Una frase da mostrare così com'è. */
  sintesi: string;
}

const TOLLERANZA_EURO = 0.011;

function quantitaRiga(m: ComputoMisura): number | null {
  const fattori = [m.parti_uguali, m.lunghezza, m.larghezza, m.altezza_peso].filter((v): v is number => v !== null);
  if (!fattori.length) return null;
  return fattori.reduce((a, b) => a * b, 1);
}

const formatEuro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Ricontrolla il computo come farebbe un tecnico con la calcolatrice:
 * quantità × prezzo = importo, righe di misura = quantità, capitoli = riepiloghi,
 * somma delle voci = totale del documento.
 */
export function controllaTotali(c: Pick<ComputoStrutturato, "voci" | "totale_dichiarato" | "riepiloghi">): ControlloTotali {
  const voci: ControlloVoce[] = [];
  let totale = 0; let righe = 0; let sicurezza = 0;
  for (const v of c.voci) {
    righe += v.misure.length;
    if (v.importo === null || v.quantita === null || v.prezzo_unitario === null) {
      voci.push({ numero_ordine: v.numero_ordine, tipo: "dati_mancanti", messaggio: "Quantità, prezzo o importo non letti: confronta con il documento." });
    }
    if (v.importo !== null) {
      totale += v.importo;
      if (v.is_sicurezza) sicurezza += v.importo;
    }
    if (v.importo !== null && v.quantita !== null && v.prezzo_unitario !== null) {
      // Con l'unità «%» il prezzo è una percentuale (sovrapprezzi, oneri).
      const atteso = arrotonda(v.quantita * v.prezzo_unitario / (v.unita_misura.trim() === "%" ? 100 : 1));
      if (Math.abs(atteso - v.importo) > TOLLERANZA_EURO) {
        voci.push({ numero_ordine: v.numero_ordine, tipo: "importo", atteso, trovato: v.importo,
          messaggio: `Quantità × prezzo fa ${formatEuro(atteso)} €, nel documento ${formatEuro(v.importo)} €.` });
      }
    }
    const misureConQuantita = v.misure.filter(m => m.quantita !== null);
    if (misureConQuantita.length && v.quantita !== null) {
      const somma = arrotonda(misureConQuantita.reduce((s, m) => s + (m.quantita ?? 0), 0), 3);
      // PriMus somma le righe non arrotondate: si ammette un centesimo per riga.
      const tolleranza = Math.max(TOLLERANZA_EURO, 0.005 * misureConQuantita.length);
      if (Math.abs(somma - v.quantita) > tolleranza) {
        voci.push({ numero_ordine: v.numero_ordine, tipo: "misure", atteso: v.quantita, trovato: somma,
          messaggio: `Le righe di misura sommano ${somma.toLocaleString("it-IT")}, la voce dice ${v.quantita.toLocaleString("it-IT")}.` });
      }
    }
    for (const m of v.misure) {
      const q = quantitaRiga(m);
      if (q === null || m.quantita === null) continue;
      const scarto = Math.abs(q - m.quantita);
      if (scarto > Math.max(0.011, Math.abs(m.quantita) * 0.002)) {
        voci.push({ numero_ordine: v.numero_ordine, tipo: "formula", atteso: arrotonda(q, 3), trovato: m.quantita,
          messaggio: `Riga «${m.descrizione || "senza descrizione"}»: i fattori danno ${arrotonda(q, 3).toLocaleString("it-IT")}, la riga dice ${m.quantita.toLocaleString("it-IT")}.` });
      }
    }
  }
  // Numerazione: buchi e doppioni nei numeri d'ordine interi.
  const numeri = c.voci.map(v => Number(v.numero_ordine)).filter(n => Number.isInteger(n) && n > 0);
  if (numeri.length === c.voci.length && numeri.length) {
    const visti = new Set<number>();
    for (const n of numeri) {
      if (visti.has(n)) voci.push({ numero_ordine: String(n), tipo: "numerazione", messaggio: `Il numero ${n} compare due volte.` });
      visti.add(n);
    }
    const max = Math.max(...numeri);
    const mancanti: number[] = [];
    for (let n = Math.min(...numeri); n <= max; n++) if (!visti.has(n)) mancanti.push(n);
    if (mancanti.length) voci.push({ numero_ordine: String(mancanti[0]), tipo: "numerazione",
      messaggio: `Mancano le voci numero ${mancanti.slice(0, 10).join(", ")}${mancanti.length > 10 ? "…" : ""}: forse non sono state lette.` });
  }

  const capitoli: ControlloCapitolo[] = [];
  const strutturale = c.riepiloghi.filter(r => r.livello === "strutturale" && r.percorso);
  const sommaDove = (pred: (v: ComputoVoceStrutturata) => boolean) => arrotonda(c.voci.reduce((s, v) => s + (pred(v) ? v.importo ?? 0 : 0), 0));
  const push = (r: ComputoRigaRiepilogo, calcolato: number) => {
    const differenza = arrotonda(calcolato - r.importo);
    capitoli.push({ livello: r.livello, codice: r.codice, nome: r.nome, dichiarato: r.importo, calcolato, differenza, ok: Math.abs(differenza) <= TOLLERANZA_EURO });
  };
  if (strutturale.length) {
    for (const r of strutturale) {
      const [sp, cat, sb] = r.percorso!;
      push(r, sommaDove(v =>
        (sp === undefined || v.super_categoria?.numero === sp) &&
        (cat === undefined || v.categoria?.numero === cat) &&
        (sb === undefined || v.sotto_categoria?.numero === sb)));
    }
  } else {
    const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    for (const r of c.riepiloghi) {
      if (r.livello === "strutturale") continue;
      const nessuna = /^<\s*nessuna\s*>$/i.test(r.nome.trim());
      const campo = r.livello;
      push(r, sommaDove(v => nessuna ? !v[campo] : norm(v[campo]?.nome) === norm(r.nome)));
    }
  }
  totale = arrotonda(totale);
  const differenza = c.totale_dichiarato === null ? null : arrotonda(totale - c.totale_dichiarato);
  const sospette = [...new Set(voci.filter(v => v.tipo !== "numerazione").map(v => v.numero_ordine))];
  const ok = voci.length === 0 && capitoli.every(x => x.ok) && (differenza === null || Math.abs(differenza) <= TOLLERANZA_EURO);
  const nDetr = c.voci.filter(v => v.is_detrazione).length;
  const lette = `${c.voci.length} voci lette${nDetr ? ` (di cui ${nDetr} in detrazione)` : ""}`;
  let sintesi: string;
  if (c.totale_dichiarato === null) sintesi = `${lette}, totale ${formatEuro(totale)} €. Il documento non dichiara un totale da confrontare.`;
  else if (differenza !== null && Math.abs(differenza) <= TOLLERANZA_EURO) sintesi = `${lette}, totale ${formatEuro(totale)} € = totale del documento ✓`;
  else sintesi = `${lette}, totale ${formatEuro(totale)} €: il documento dice ${formatEuro(c.totale_dichiarato)} € (differenza ${formatEuro(differenza ?? 0)} €).`;
  if (voci.length) sintesi += ` ${sospette.length} voci da ricontrollare.`;
  const capitoliKo = capitoli.filter(x => !x.ok).length;
  if (capitoliKo) sintesi += ` ${capitoliKo} capitoli non tornano con il riepilogo.`;
  return {
    ok, voci_lette: c.voci.length, voci_detrazione: nDetr, voci_sicurezza: c.voci.filter(v => v.is_sicurezza).length,
    righe_misura: righe, totale_calcolato: totale, totale_dichiarato: c.totale_dichiarato, differenza_totale: differenza,
    oneri_sicurezza: arrotonda(sicurezza), voci, capitoli, voci_sospette: sospette, sintesi,
  };
}

// ── Verso il formato delle voci estratte (preventivo e salvataggio) ─────────

/** Capitoli e voci nella forma che `computo-ai-extract` salva da sempre, più i campi nuovi. */
export function computoComeEstrazione(c: ComputoStrutturato, controllo = controllaTotali(c)) {
  const capitoli: Array<{ numero: number; nome: string; totale: number | null; voci: Array<Record<string, unknown>> }> = [];
  const perNome = new Map<string, (typeof capitoli)[number]>();
  const sospette = new Set(controllo.voci_sospette);
  for (const v of c.voci) {
    const nome = v.categoria?.nome || v.super_categoria?.nome || v.sezione || "Generale";
    let cap = perNome.get(nome);
    if (!cap) { cap = { numero: capitoli.length + 1, nome, totale: null, voci: [] }; perNome.set(nome, cap); capitoli.push(cap); }
    const avvisi = [...v.avvisi, ...controllo.voci.filter(x => x.numero_ordine === v.numero_ordine && x.tipo !== "numerazione").map(x => x.messaggio)];
    cap.voci.push({
      capitolo_numero: cap.numero, capitolo_nome: nome,
      codice_voce: v.numero_ordine, codice_prezzario: v.codice_tariffa,
      descrizione_breve: (v.descrizione || `Voce ${v.numero_ordine}`).slice(0, 100),
      descrizione_estesa: v.descrizione,
      unita_misura: v.unita_misura, quantita: v.quantita, prezzo_unitario: v.prezzo_unitario, importo: v.importo,
      confidence: sospette.has(v.numero_ordine) ? 0.69 : 0.99, warnings: avvisi,
      numero_ordine: v.numero_ordine, codice_tariffa: v.codice_tariffa,
      super_categoria: v.super_categoria?.nome ?? null, categoria: v.categoria?.nome ?? null, sotto_categoria: v.sotto_categoria?.nome ?? null,
      is_sicurezza: v.is_sicurezza, is_detrazione: v.is_detrazione, a_corpo: v.a_corpo,
      misure: v.misure,
    });
  }
  for (const cap of capitoli) cap.totale = arrotonda(cap.voci.reduce((s, v) => s + (Number(v.importo) || 0), 0));
  return {
    metadata: { ...c.metadata, totale_computo: c.totale_dichiarato },
    capitoli,
    formato: c.formato,
    controllo_totali: controllo,
    riepiloghi: c.riepiloghi,
    prezzari: c.prezzari,
  };
}
