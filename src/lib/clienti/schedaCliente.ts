/**
 * I dati della scheda cliente come li restituisce `scheda_cliente` (23/10/2026)
 * e i conti che ne derivano: rate col residuo, totale da incassare e scaduto.
 * Il residuo è quello della scheda commessa e del cruscotto
 * (cruscotto_rate_da_incassare): varianti comprese, IVA inclusa.
 */
import type {
  AppuntamentoRow, FatturaRow, OrderRow, PreventivoRow, RapportinoRow, RataRow, TicketRow,
} from "@/components/clients/CustomerBusinessTabs";

export interface RataSalvata {
  id: string;
  order_id: string;
  label: string | null;
  tipo: string | null;
  importo: number | null;
  is_paid: boolean | null;
  paid_date: string | null;
  expected_date: string | null;
}

export interface ResiduoDaIncassare {
  /** L'id della rata, oppure «non-pianificato-<commessa>» per la parte non ancora in rate. */
  id: string;
  order_id: string;
  residuo: number | null;
  expected_date: string | null;
  finanziamento: boolean | null;
}

export interface SchedaCliente {
  ordini: OrderRow[];
  anagrafica: { id: string; ragione_sociale: string | null; partita_iva: string | null } | null;
  fatture: FatturaRow[];
  preventivi: PreventivoRow[];
  ticket: TicketRow[];
  interventi: RapportinoRow[];
  appuntamenti: AppuntamentoRow[];
  rate: RataSalvata[];
  /** null = chi guarda non può vedere gli incassi. */
  da_incassare: ResiduoDaIncassare[] | null;
}

export function oggiRoma(adesso = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(adesso);
}

/** Le rate con quanto resta da incassare su ciascuna, più la parte non ancora pianificata. */
export function rateConResiduo(scheda: SchedaCliente | null | undefined, oggi = oggiRoma()): RataRow[] {
  if (!scheda) return [];
  const residui = new Map((scheda.da_incassare ?? []).map((r) => [r.id, r]));
  const codice = new Map(scheda.ordini.map((o) => [o.id, o.order_code]));
  const righe: RataRow[] = scheda.rate.map((r) => {
    const residuo = scheda.da_incassare == null ? null : Number(residui.get(r.id)?.residuo ?? 0);
    const scadenza = residui.get(r.id)?.expected_date ?? r.expected_date;
    return {
      id: r.id, order_id: r.order_id, order_code: codice.get(r.order_id) ?? null,
      label: r.label, importo: r.importo == null ? null : Number(r.importo),
      residuo, scadenza, pagata: residuo === 0 || (residuo == null && !!r.is_paid),
      scaduta: residuo != null && residuo > 0 && !!scadenza && scadenza < oggi && r.tipo !== "financing",
    };
  });
  for (const r of scheda.da_incassare ?? []) {
    if (!r.id.startsWith("non-pianificato-")) continue;
    righe.push({
      id: r.id, order_id: r.order_id, order_code: codice.get(r.order_id) ?? null,
      label: "Da pianificare", importo: Number(r.residuo ?? 0), residuo: Number(r.residuo ?? 0),
      scadenza: r.expected_date, pagata: false,
      scaduta: !!r.expected_date && r.expected_date < oggi && !r.finanziamento,
    });
  }
  return righe;
}

/** Totale da incassare e quanto è già scaduto; null se chi guarda non può vederlo. */
export function totaleDaIncassare(scheda: SchedaCliente | null | undefined, oggi = oggiRoma()): { totale: number; scaduto: number } | null {
  if (!scheda || scheda.da_incassare == null) return null;
  let totale = 0, scaduto = 0;
  for (const r of scheda.da_incassare) {
    const importo = Number(r.residuo ?? 0);
    totale += importo;
    if (!r.finanziamento && r.expected_date && r.expected_date < oggi) scaduto += importo;
  }
  return { totale, scaduto };
}

/**
 * «€ 8.200» e «€ 5.000,00»: col formato italiano del browser sotto i 10.000
 * il punto delle migliaia sparisce («€ 8200»). Qui c'è sempre.
 */
export function euro(n: number | null | undefined, decimali = false): string {
  const v = Number(n ?? 0);
  return `€ ${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: decimali ? 2 : 0, maximumFractionDigits: decimali ? 2 : 0,
    useGrouping: "always" as unknown as boolean,
  }).format(Number.isFinite(v) ? v : 0)}`;
}
