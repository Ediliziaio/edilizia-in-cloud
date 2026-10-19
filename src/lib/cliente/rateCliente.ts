/**
 * Le rate che il cliente vede nel portale, con la stessa regola della scheda commessa
 * (`public.cliente_rate_commesse` → rate_importi / rate_da_incassare / rate_incassi):
 *   · il saldo vale il residuo, varianti approvate comprese;
 *   · da ogni rata si toglie quanto è già pagato sulla fattura collegata (`residuo`);
 *   · la parte del totale che nessuna rata copre è una riga «Da pianificare», senza data;
 *   · totale e pagato della commessa vengono dal database, non dalla somma delle rate.
 * Il calcolo dei riepiloghi è puro, così si prova senza database.
 */
import { supabase } from "@/integrations/supabase/client";

export interface RataCliente {
  id: string;
  order_id: string;
  company_id: string;
  position: number;
  label: string;
  /** deposit / balance / financing / non_pianificato */
  type: string;
  /** Importo della rata secondo la regola (IVA inclusa). */
  amount: number;
  /** Quanto resta da pagare sulla rata. */
  residuo: number;
  is_paid: boolean;
  paid_date: string | null;
  expected_date: string | null;
  /** Rata pagata dalla finanziaria: non è mai uno scaduto del cliente. */
  finanziamento: boolean;
  order: {
    id: string;
    order_code: string;
    description: string;
    /** Contratto più varianti approvate, IVA inclusa. */
    totale: number;
    incassato: number;
  };
}

interface RigaRpc {
  order_id: string;
  company_id: string;
  order_code: string | null;
  description: string | null;
  installment_id: string | null;
  posizione: number;
  label: string;
  tipo: string;
  importo: number | string | null;
  residuo: number | string | null;
  is_paid: boolean | null;
  paid_date: string | null;
  expected_date: string | null;
  finanziamento: boolean | null;
  totale_commessa: number | string | null;
  incassato_commessa: number | string | null;
}

const num = (v: number | string | null | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function daRigheRpc(righe: ReadonlyArray<RigaRpc>): RataCliente[] {
  return righe.map((r) => ({
    id: r.installment_id ?? `non-pianificato-${r.order_id}`,
    order_id: r.order_id,
    company_id: r.company_id,
    position: r.posizione,
    label: r.label,
    type: r.tipo,
    amount: num(r.importo),
    residuo: num(r.residuo),
    is_paid: !!r.is_paid,
    paid_date: r.paid_date,
    expected_date: r.expected_date,
    finanziamento: !!r.finanziamento,
    order: {
      id: r.order_id,
      order_code: r.order_code ?? "",
      description: r.description ?? "",
      totale: num(r.totale_commessa),
      incassato: num(r.incassato_commessa),
    },
  }));
}

/** Le rate delle commesse del cliente collegato; con `orderId` solo quella commessa. */
export async function leggiRateCliente(orderId?: string): Promise<RataCliente[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("cliente_rate_commesse", { p_order_id: orderId ?? null });
  if (error) throw error;
  return daRigheRpc((data ?? []) as RigaRpc[]);
}

/** Una rata è chiusa quando è segnata pagata o quando non resta più niente da pagare. */
export const rataChiusa = (r: Pick<RataCliente, "is_paid" | "residuo">) => r.is_paid || r.residuo < 0.005;

/**
 * Totale, pagato e residuo per commessa e complessivi: dal database, una volta per commessa.
 * Il residuo è quanto paga il cliente; la rata della finanziaria è a parte (la paga la finanziaria).
 */
export function riepilogoCommesse(rate: ReadonlyArray<RataCliente>) {
  const commesse = new Map<string, RataCliente["order"]>();
  for (const r of rate) if (!commesse.has(r.order_id)) commesse.set(r.order_id, r.order);
  const totale = [...commesse.values()].reduce((s, o) => s + o.totale, 0);
  const pagato = [...commesse.values()].reduce((s, o) => s + o.incassato, 0);
  const aperte = rate.filter((r) => !rataChiusa(r));
  const residuo = aperte.reduce((s, r) => s + (r.finanziamento ? 0 : r.residuo), 0);
  const finanziamento = aperte.reduce((s, r) => s + (r.finanziamento ? r.residuo : 0), 0);
  return { totale, pagato, residuo, finanziamento };
}

/** La prossima rata da pagare: prima quelle con data, la più vicina; poi quelle senza data. */
export function prossimaRata(rate: ReadonlyArray<RataCliente>): RataCliente | undefined {
  return rate
    .filter((r) => !rataChiusa(r))
    .sort((a, b) => {
      if (!a.expected_date && !b.expected_date) return a.position - b.position;
      if (!a.expected_date) return 1;
      if (!b.expected_date) return -1;
      return a.expected_date.localeCompare(b.expected_date) || a.position - b.position;
    })[0];
}
