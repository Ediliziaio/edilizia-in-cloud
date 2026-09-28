/**
 * Gli avvisi automatici del bot operativo (28/09/2026): logica pura che, dai dati
 * grezzi restituiti da `bot_avvisi_valuta`, compone i messaggi da mandare al
 * titolare/ufficio. Un messaggio per categoria (non uno per riga) per non
 * intasare il telefono; la chiave contiene il giorno così non si ripete.
 */

export interface FatturaScaduta {
  id: string;
  order_code?: string | null;
  client_name?: string | null;
  label?: string | null;
  amount: number;
  giorni: number;
}

export interface PreventivoFermo {
  id: string;
  quote_number?: string | null;
  client_name?: string | null;
  total: number;
  giorni: number;
}

export interface SottoScortaItem {
  nome: string;
  quantita: number;
  minimo: number;
}

export interface DatiAvvisi {
  fatture_scadute?: FatturaScaduta[] | null;
  preventivi_fermi?: PreventivoFermo[] | null;
  sotto_scorta?: { n?: number; items?: SottoScortaItem[] | null } | null;
}

export interface AvvisoOperativo {
  /** chiave anti-ripetizione: categoria + giorno */
  chiave: string;
  testo: string;
}

export function euro(n: number): string {
  const v = Math.round(Number(n) || 0);
  // useGrouping "always": in italiano i numeri di 4 cifre non sarebbero raggruppati
  // (1500 → "1500"); qui vogliamo sempre il punto delle migliaia (1.500).
  return `€ ${v.toLocaleString("it-IT", { useGrouping: "always", maximumFractionDigits: 0 })}`;
}

function giorniLabel(g: number): string {
  const n = Math.max(0, Math.round(Number(g) || 0));
  if (n === 0) return "oggi";
  if (n === 1) return "da 1 giorno";
  return `da ${n} giorni`;
}

/** Compone gli avvisi (uno per categoria) dai dati del giorno. */
export function componiAvvisi(dati: DatiAvvisi, oggi: string): AvvisoOperativo[] {
  const out: AvvisoOperativo[] = [];

  const fatture = (dati.fatture_scadute ?? []).filter((f) => f && (Number(f.amount) || 0) > 0);
  if (fatture.length > 0) {
    const tot = fatture.reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const righe = fatture.slice(0, 6).map((f) => {
      const chi = [f.order_code, f.client_name].filter(Boolean).join(" · ");
      return `• ${euro(f.amount)} — ${chi || "commessa"} (${giorniLabel(f.giorni)})`;
    });
    const extra = fatture.length > 6 ? `\n…e altre ${fatture.length - 6}.` : "";
    out.push({
      chiave: `avviso_fatture:${oggi}`,
      testo: `⚠️ *Incassi in ritardo*\nHai ${fatture.length} pagament${fatture.length === 1 ? "o" : "i"} da incassare, in tutto ${euro(tot)}:\n${righe.join("\n")}${extra}`,
    });
  }

  const preventivi = (dati.preventivi_fermi ?? []).filter(Boolean);
  if (preventivi.length > 0) {
    const righe = preventivi.slice(0, 6).map((p) => {
      const chi = [p.quote_number, p.client_name].filter(Boolean).join(" · ");
      return `• ${chi || "preventivo"} — ${euro(p.total)} (visto ${giorniLabel(p.giorni)}, senza risposta)`;
    });
    const extra = preventivi.length > 6 ? `\n…e altri ${preventivi.length - 6}.` : "";
    out.push({
      chiave: `avviso_preventivi:${oggi}`,
      testo: `👀 *Preventivi da ricontattare*\nQuesti preventivi il cliente li ha aperti ma non ha ancora risposto:\n${righe.join("\n")}${extra}\nForse è il momento di una chiamata.`,
    });
  }

  const scorta = dati.sotto_scorta;
  const items = (scorta?.items ?? []).filter(Boolean);
  const nScorta = Number(scorta?.n ?? items.length) || 0;
  if (nScorta > 0) {
    const righe = items.slice(0, 6).map((i) => `• ${i.nome} — ne restano ${i.quantita} (minimo ${i.minimo})`);
    const extra = nScorta > righe.length ? `\n…e altri ${nScorta - righe.length}.` : "";
    out.push({
      chiave: `avviso_scorta:${oggi}`,
      testo: `📦 *Materiale sotto scorta*\n${righe.join("\n")}${extra}\nMeglio riordinare per non fermare i cantieri.`,
    });
  }

  return out;
}
