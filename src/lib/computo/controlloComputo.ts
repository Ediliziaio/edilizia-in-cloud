/**
 * Il controllo del computo prima dei materiali e degli ordini (17/11/2026).
 *
 * Un computo vero contiene errori che, letti alla lettera, diventano ordini sbagliati. Su un PriMus
 * di 226 voci un'analisi fatta a mano ne ha trovati una ventina; il gestionale li trasformava in
 * materiali senza dire niente. Qui le regole che si vedono dai numeri, una per tipo, con la voce,
 * il motivo e, quando si può calcolare, l'importo in gioco. Non si corregge niente da soli:
 * l'impresa decide (rimisura, chiede la voce integrale, chiarisce col progettista).
 *
 * Regole:
 * - metri_come_mq: la lunghezza in metri di una voce ripresa come m² da quelle dopo (spallette);
 * - pezzi_frazionari: unità a pezzi con decimali (inverter 0,88; cicogne 767,40);
 * - barre_in_metri: pezzi descritti come barre da N m con la lunghezza dentro la misura;
 * - misura_diversa: «larghezza 15 cm» nella descrizione, 0,30 nella misura;
 * - a_corpo_non_uno: un «a corpo» con quantità diversa da 1;
 * - pezzi_come_superficie: unità di superficie, ma la misura conta pezzi («N° cassonetti»);
 * - sovrapprezzo_cm: la quantità di un sovrapprezzo «per ogni cm» è m²×cm, non superficie;
 * - descrizione_abbreviata: la descrizione stampata è tagliata («…»).
 */

export type RegolaComputo =
  | "metri_come_mq" | "pezzi_frazionari" | "barre_in_metri" | "misura_diversa"
  | "a_corpo_non_uno" | "pezzi_come_superficie" | "sovrapprezzo_cm" | "descrizione_abbreviata";

export interface MisuraControllo {
  descrizione: string;
  parti: number | null;
  lunghezza: number | null;
  larghezza: number | null;
  altezza: number | null;
  quantita: number | null;
}

export interface VoceControllo {
  id: string;
  /** Il numero d'ordine del computo, per ritrovarla. */
  numero: string;
  descrizione: string;
  unita: string;
  quantita: number | null;
  prezzo: number | null;
  aCorpo?: boolean;
  /** Detrazione o voce che sposta importi (prezzo 1): non è una lavorazione da misurare. */
  detrazione?: boolean;
  misure: MisuraControllo[];
}

export interface Incongruenza {
  voce_id: string;
  numero: string;
  regola: RegolaComputo;
  /** «verifica»: cambia le quantità da comprare; «nota»: da sapere prima dell'offerta. */
  gravita: "verifica" | "nota";
  titolo: string;
  messaggio: string;
  /** Importo del computo in gioco, se si può calcolare. */
  importo?: number;
}

const LINEARI = /^(m|ml|mt|m\.?l\.?|metri?)$/i;
const SUPERFICI = /^(m2|mq|m²|metri quadri)$/i;
const PEZZI = /^(cad|cad\.|cadauno|cadauna|pz|pezz[oi]|n|n\.|nr|nr\.|numero)$/i;
const vicini = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;
const euro = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (n: number) => n.toLocaleString("it-IT", { maximumFractionDigits: 2 });
const centesimi = (n: number) => Math.round(n * 100) / 100;
const pulita = (u: string) => u.trim().replace(/\s+/g, " ");

/** «della larghezza media di 30 cm», «larghezza 15 cm» → 30, 15. */
function larghezzaDescritta(testo: string): number | null {
  const m = /larghezza(?:\s+media)?(?:\s+(?:di|pari a))?\s+(\d+(?:[.,]\d+)?)\s*cm/i.exec(testo);
  return m ? Number(m[1].replace(",", ".")) : null;
}

/** «lunghezza pari a 3000,00 mm», «barra da 3 m» → 3 (metri). */
function barraDescritta(testo: string): number | null {
  const mm = /lunghezza(?:\s+pari\s+a)?\s+(\d{3,5}(?:[.,]\d+)?)\s*mm/i.exec(testo);
  if (mm) return Number(mm[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")) / 1000;
  const m = /barr[ae]\s+(?:da|di)\s+(\d+(?:[.,]\d+)?)\s*m\b/i.exec(testo);
  return m ? Number(m[1].replace(",", ".")) : null;
}

export function controllaComputo(voci: VoceControllo[]): Incongruenza[] {
  const fuori: Incongruenza[] = [];
  const abbreviate: VoceControllo[] = [];

  voci.forEach((v, i) => {
    // Una detrazione, o una voce che sposta un importo (prezzo 1 €), non si misura e non si compra.
    if (v.detrazione || (v.prezzo != null && Math.abs(Math.abs(v.prezzo) - 1) < 0.0001)) return;
    const unita = pulita(v.unita);
    const q = v.quantita;
    const testo = v.descrizione;

    // Metri ripresi come m² nelle voci successive (stesso numero, unità diversa).
    if (LINEARI.test(unita) && q && q > 0) {
      const largCm = larghezzaDescritta(testo);
      for (const w of voci.slice(i + 1, i + 7)) {
        if (!SUPERFICI.test(pulita(w.unita))) continue;
        const ripresa = w.misure.find((m) => m.quantita != null && vicini(m.quantita, q) && m.larghezza == null && m.lunghezza == null);
        if (!ripresa) continue;
        const area = largCm ? centesimi(q * largCm / 100) : null;
        const importo = area != null && w.prezzo ? centesimi((q - area) * w.prezzo) : undefined;
        fuori.push({
          voce_id: w.id, numero: w.numero, regola: "metri_come_mq", gravita: "verifica",
          titolo: "Metri contati come metri quadri",
          messaggio: `«${ripresa.descrizione || "una misura"}» riprende ${num(q)}, la lunghezza in metri della voce ${v.numero}, e qui la conta come m².`
            + (area != null ? ` Con la larghezza di ${num(largCm!)} cm l'area è ${num(area)} m²: ${num(centesimi(q - area))} m² in più.` : " Rimisura l'area prima di ordinare."),
          importo,
        });
      }
    }

    // Pezzi con i decimali.
    if (PEZZI.test(unita) && q != null && Math.abs(q - Math.round(q)) > 0.001) {
      fuori.push({
        voce_id: v.id, numero: v.numero, regola: "pezzi_frazionari", gravita: "verifica",
        titolo: "Pezzi con i decimali",
        messaggio: `${num(q)} ${unita}: un pezzo non si compra a frazioni. Chiarisci la quantità reale (${Math.floor(q)} o ${Math.ceil(q)}, o un'altra unità).`,
      });
    }

    // Barre contate a pezzi ma misurate in metri.
    const barra = PEZZI.test(unita) ? barraDescritta(testo) : null;
    if (barra && v.misure.some((m) => m.lunghezza != null && vicini(m.lunghezza, barra) && (m.parti ?? 0) > 1)) {
      const m = v.misure.find((x) => x.lunghezza != null && vicini(x.lunghezza, barra))!;
      fuori.push({
        voce_id: v.id, numero: v.numero, regola: "barre_in_metri", gravita: "verifica",
        titolo: "Barre contate in metri",
        messaggio: `La descrizione parla di barre da ${num(barra)} m e la misura moltiplica ${num(m.parti ?? 0)} × ${num(barra)}: ${num(q ?? 0)} ${unita} sono metri, non pezzi. Sono ${num(m.parti ?? 0)} barre o ${num(q ?? 0)} barre?`,
      });
    }

    // Larghezza della descrizione diversa da quella della misura.
    const largCm = SUPERFICI.test(unita) ? larghezzaDescritta(testo) : null;
    if (largCm) {
      const diversa = v.misure.find((m) => m.larghezza != null && m.larghezza > 0 && Math.abs(m.larghezza * 100 - largCm) > 0.5);
      if (diversa) {
        const giusta = diversa.lunghezza != null ? centesimi((diversa.parti || 1) * diversa.lunghezza * largCm / 100) : null;
        const contata = diversa.quantita ?? null;
        fuori.push({
          voce_id: v.id, numero: v.numero, regola: "misura_diversa", gravita: "verifica",
          titolo: "Misura diversa dalla descrizione",
          messaggio: `La descrizione dice larghezza ${num(largCm)} cm, la misura usa ${num(centesimi(diversa.larghezza! * 100))} cm.`
            + (giusta != null && contata != null ? ` Con ${num(largCm)} cm sarebbero ${num(giusta)} ${unita} invece di ${num(contata)}.` : ""),
          importo: giusta != null && contata != null && v.prezzo ? centesimi((contata - giusta) * v.prezzo) : undefined,
        });
      }
    }

    // «A corpo» con una quantità diversa da 1.
    if ((v.aCorpo || /^a\s*corpo$/i.test(unita)) && q != null && !vicini(q, 1, 0.0001) && q > 0) {
      fuori.push({
        voce_id: v.id, numero: v.numero, regola: "a_corpo_non_uno", gravita: "verifica",
        titolo: "«A corpo» che non vale 1",
        messaggio: `Una voce a corpo con quantità ${num(q)}: chiarisci cosa comprende (${v.misure.map((m) => m.descrizione).filter(Boolean).join(", ") || "le righe di misura"}).`,
      });
    }

    // Superficie, ma la misura conta pezzi.
    if (SUPERFICI.test(unita)) {
      const pezzi = v.misure.find((m) => /^(n[°ºo.]?\s|n\.\s?|numero\b|nr\.?\s)/i.test(m.descrizione.trim()) && m.lunghezza == null && m.larghezza == null);
      if (pezzi) {
        fuori.push({
          voce_id: v.id, numero: v.numero, regola: "pezzi_come_superficie", gravita: "verifica",
          titolo: "Pezzi contati come superficie",
          messaggio: `L'unità è ${unita}, ma la misura «${pezzi.descrizione}» conta pezzi (${num(pezzi.quantita ?? 0)}). Ordina per pezzo con le misure reali dei vani.`,
        });
      }
    }

    // Sovrapprezzo per ogni centimetro: quantità in m²×cm.
    if (SUPERFICI.test(unita) && /per ogni (?:cm|centimetro)/i.test(testo)) {
      fuori.push({
        voce_id: v.id, numero: v.numero, regola: "sovrapprezzo_cm", gravita: "nota",
        titolo: "Sovrapprezzo per centimetro",
        messaggio: `${num(q ?? 0)} ${unita} sono m² × cm di spessore in più, non superficie da comprare: cambia lo spessore del materiale della voce principale.`,
      });
    }

    if (/\s(?:\.\.\.|…)\s/.test(testo)) abbreviate.push(v);
  });

  if (abbreviate.length) {
    fuori.push({
      voce_id: abbreviate[0].id, numero: abbreviate.map((v) => v.numero).slice(0, 6).join(", ") + (abbreviate.length > 6 ? "…" : ""),
      regola: "descrizione_abbreviata", gravita: "nota",
      titolo: `${abbreviate.length} descrizioni abbreviate`,
      messaggio: "Il PDF stampa la voce tagliata («…»): materiale, spessore o prestazione possono mancare. Per l'offerta chiedi la voce integrale o il file PriMus.",
    });
  }
  return fuori;
}

/** L'importo totale in gioco delle incongruenze che lo dicono. */
export function importoInGioco(incongruenze: Incongruenza[]): number {
  return centesimi(incongruenze.reduce((t, x) => t + (x.importo ?? 0), 0));
}

// ── Adattatori ────────────────────────────────────────────────────────────────

/** Una voce del computo della commessa (computo_voci_estratte con le misure). */
export function voceDaCommessa(v: {
  id: string; numero_ordine?: string | null; ordine?: number | null; descrizione_breve: string; descrizione_estesa?: string | null;
  unita_misura?: string | null; quantita?: number | null; prezzo_unitario_computo?: number | null; a_corpo?: boolean | null; is_detrazione?: boolean | null;
  misure?: { descrizione?: string | null; parti_uguali?: number | null; lunghezza?: number | null; larghezza?: number | null; altezza_peso?: number | null; quantita?: number | null }[];
}): VoceControllo {
  return {
    id: v.id, numero: v.numero_ordine || String((v.ordine ?? 0) + 1),
    descrizione: [v.descrizione_breve, v.descrizione_estesa].filter(Boolean).join(" "),
    unita: v.unita_misura ?? "", quantita: v.quantita ?? null, prezzo: v.prezzo_unitario_computo ?? null, aCorpo: !!v.a_corpo, detrazione: !!v.is_detrazione,
    misure: (v.misure ?? []).map((m) => ({
      descrizione: m.descrizione ?? "", parti: m.parti_uguali ?? null, lunghezza: m.lunghezza ?? null,
      larghezza: m.larghezza ?? null, altezza: m.altezza_peso ?? null, quantita: m.quantita ?? null,
    })),
  };
}

