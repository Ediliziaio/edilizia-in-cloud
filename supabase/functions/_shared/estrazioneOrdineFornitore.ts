/**
 * La lettura di un ordine d'acquisto su carta (24/11/2026): il modulo del fornitore
 * o l'ordine firmato che l'impresa carica nel popup «Nuovo ordine d'acquisto».
 *
 * Prima l'ordine «Su documento» si poteva scegliere ma il documento non si caricava da
 * nessuna parte: le righe si riscrivevano a mano dal PDF. Qui il modello TRASCRIVE
 * (fornitore, numero, date, righe con quantità e prezzo, IVA, totale) e chi crea la
 * bozza controlla e corregge: nessun campo si salva senza passare dal popup.
 *
 * Senza import: lo usano la edge function `oda-leggi-documento` e i test dell'app.
 */

export const ORDINE_FORNITORE_PROMPT = `Sei un impiegato dell'ufficio acquisti di un'impresa edile italiana. Hai davanti un ordine d'acquisto: il modulo d'ordine di un fornitore, una conferma d'ordine o un ordine firmato dall'impresa, in PDF o in foto.
Il tuo compito è solo TRASCRIVERE quello che c'è scritto. Non confrontare, non correggere, non completare.
Regole:
- Il fornitore è chi VENDE (chi riceve l'ordine o emette la conferma), non l'impresa che compra. Riporta ragione sociale e partita IVA del fornitore, non quelle dell'impresa.
- Una riga per ogni posizione d'ordine, anche se il documento le compatta. Spese di trasporto, imballo o posa con un importo sono righe anch'esse.
- Numeri italiani: il punto separa le migliaia, la virgola i decimali («1.234,50» → 1234.5). Nel JSON i numeri col punto decimale.
- prezzo_unitario è SENZA IVA e già al netto dello sconto di riga; se il documento dà solo l'importo di riga, prezzo_unitario = importo / quantità.
- iva_percentuale è l'aliquota della riga se scritta (22, 10, 4, 0 per reverse charge); se c'è un'aliquota sola per tutto il documento, ripetila su ogni riga; se non c'è, null.
- unita come la scrive il documento (pz, nr, ml, mq, mc, kg, conf, h…); null se manca.
- Date in formato YYYY-MM-DD. data_consegna è la consegna richiesta o prevista, se scritta.
- numero_documento è il numero dell'ordine o della conferma come scritto (es. «ORD 2026/145»).
- Un dato che non c'è o non si legge è null: non inventare mai. Se una pagina o una riga non si legge, dichiaralo in avvisi.
Rispondi SOLO con questo JSON:
{"fornitore":{"ragione_sociale":null,"partita_iva":null,"codice_fiscale":null},"numero_documento":null,"data_documento":null,"data_consegna":null,"pagamento":null,"righe":[{"codice_articolo":null,"descrizione":"","quantita":null,"unita":null,"prezzo_unitario":null,"sconto_percentuale":null,"importo":null,"iva_percentuale":null}],"imponibile":null,"iva":null,"totale":null,"note":null,"avvisi":[]}`;

export interface RigaOrdineLetta {
  codice: string | null;
  descrizione: string;
  quantita: number | null;
  unita: string | null;
  /** Senza IVA, al netto dello sconto di riga. */
  prezzo_unitario: number | null;
  iva: number | null;
}

export interface OrdineFornitoreLetto {
  fornitore: { nome: string | null; partita_iva: string | null; codice_fiscale: string | null };
  numero: string | null;
  data: string | null;
  consegna: string | null;
  pagamento: string | null;
  righe: RigaOrdineLetta[];
  imponibile: number | null;
  iva: number | null;
  totale: number | null;
  note: string | null;
  avvisi: string[];
}

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

const testo = (v: unknown, max = 500): string | null => {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

/** Un numero, anche se il modello l'ha lasciato scritto all'italiana («1.234,50»). */
export function numeroLetto(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = v.replace(/[€%\s]/g, "");
  if (!s) return null;
  if (/,/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Una data vera in YYYY-MM-DD, o null: «31/02/2026» letta male non entra nel campo. */
export function dataLetta(v: unknown): string | null {
  const s = testo(v, 40);
  if (!s) return null;
  let iso: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) iso = s;
  else {
    const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) iso = `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

const tondo = (n: number, cifre = 4) => Math.round(n * 10 ** cifre) / 10 ** cifre;

/**
 * La risposta del modello ridotta a una forma sola. Righe senza descrizione si scartano;
 * quantità o prezzi negativi diventano null (si correggono a mano, non si indovinano).
 */
export function normalizzaOrdineFornitore(v: unknown): OrdineFornitoreLetto {
  const r = rec(v);
  const f = rec(r.fornitore);
  const avvisi = (Array.isArray(r.avvisi) ? r.avvisi : []).map((a) => testo(a, 300)).filter((a): a is string => !!a).slice(0, 20);
  const righe: RigaOrdineLetta[] = [];
  for (const x of (Array.isArray(r.righe) ? r.righe : []).slice(0, 300)) {
    const l = rec(x);
    const descrizione = testo(l.descrizione) ?? testo(l.codice_articolo);
    if (!descrizione) continue;
    let quantita = numeroLetto(l.quantita);
    if (quantita !== null && !(quantita > 0)) quantita = null;
    let prezzo = numeroLetto(l.prezzo_unitario);
    const importo = numeroLetto(l.importo);
    const sconto = numeroLetto(l.sconto_percentuale);
    if (prezzo === null && importo !== null && quantita) prezzo = importo / quantita;
    else if (prezzo !== null && sconto && sconto > 0 && sconto < 100 && importo !== null && quantita
      && Math.abs(prezzo * quantita - importo) > 0.02 && Math.abs(prezzo * (1 - sconto / 100) * quantita - importo) <= 0.02) {
      // Il modello ha riportato il prezzo di listino: si prende quello scontato che torna con l'importo.
      prezzo = prezzo * (1 - sconto / 100);
    }
    if (prezzo !== null && prezzo < 0) prezzo = null;
    let iva = numeroLetto(l.iva_percentuale);
    if (iva !== null && (iva < 0 || iva > 100)) iva = null;
    righe.push({
      codice: testo(l.codice_articolo, 80),
      descrizione,
      quantita,
      unita: testo(l.unita, 20),
      prezzo_unitario: prezzo === null ? null : tondo(prezzo),
      iva,
    });
  }
  if (Array.isArray(r.righe) && r.righe.length > 0 && righe.length === 0) avvisi.push("Nessuna riga leggibile: inseriscile a mano.");
  return {
    fornitore: { nome: testo(f.ragione_sociale, 200), partita_iva: testo(f.partita_iva, 30), codice_fiscale: testo(f.codice_fiscale, 30) },
    numero: testo(r.numero_documento, 80),
    data: dataLetta(r.data_documento),
    consegna: dataLetta(r.data_consegna),
    pagamento: testo(r.pagamento, 200),
    righe,
    imponibile: numeroLetto(r.imponibile),
    iva: numeroLetto(r.iva),
    totale: numeroLetto(r.totale),
    note: testo(r.note, 1000),
    avvisi,
  };
}
