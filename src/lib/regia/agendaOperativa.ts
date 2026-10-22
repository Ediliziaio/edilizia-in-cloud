/**
 * L'agenda operativa: lavori (inizio, in corso, posa), merce in arrivo e
 * appuntamenti in una finestra di giorni, una riga per evento.
 *
 * Era dentro useCompanyDashboardData, insieme ai numeri economici della vecchia
 * Dashboard Gestione: la regia operativa ne usa solo questa parte (i numeri
 * economici stanno nel Cruscotto).
 */
import { differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { loadArchivedOrderIds, excludeArchivedOrders } from "@/lib/orders/archivedOrderScope";

export type TipoEvento = "lavoro" | "merce" | "appuntamento";

export interface EventoAgenda {
  id: string;
  tipo: TipoEvento;
  /** giorno, yyyy-MM-dd */
  giorno: string;
  /** «Inizio lavori», «Posa prevista», «Arrivo da Rossi»… */
  cosa: string;
  /** codice o descrizione della commessa, o numero dell'ordine fornitore */
  riferimento: string;
  cliente: string | null;
  /** materiali in arrivo, riassunti */
  dettaglio?: string | null;
  orderId?: string | null;
}

type Persona = { first_name: string | null; last_name: string | null } | null | undefined;

const APPUNTAMENTI_DI_LAVORO = new Set(["inizio_lavori", "fine_lavori", "posa_prova", "collaudo", "verifica_cantiere"]);

const nome = (p: Persona) => [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || null;
const giorno = (v?: string | null) => (v ? v.slice(0, 10) : null);
const dentro = (g: string | null, da: string, a: string) => !!g && g >= da && g <= a;
const etichettaCommessa = (o: { order_code: string | null; description: string | null } | null | undefined) =>
  o?.order_code || o?.description || "Commessa";

export function giorniDaOggi(g: string, oggi = new Date()): number {
  return differenceInCalendarDays(new Date(`${g}T00:00:00`), oggi);
}

export async function leggiAgendaOperativa(companyId: string, da: string, a: string, signal?: AbortSignal): Promise<EventoAgenda[]> {
  const archiviate = await loadArchivedOrderIds(companyId);

  let commesse = supabase
    .from("orders")
    .select("id, order_code, description, expected_date, work_start_date, work_end_date, warehouse_arrival_date, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .or(`work_start_date.lte.${a},expected_date.lte.${a},warehouse_arrival_date.lte.${a}`)
    .or(`work_end_date.gte.${da},work_start_date.gte.${da},expected_date.gte.${da},warehouse_arrival_date.gte.${da}`)
    .order("work_start_date", { ascending: true })
    .limit(300);
  let appuntamenti = excludeArchivedOrders(supabase
    .from("appointments")
    .select("id, title, appointment_date, appointment_type, status, order_id, order:orders!appointments_order_id_fkey(order_code, description, customer:profiles!orders_customer_id_fkey(first_name, last_name)), contact:marketing_contacts!appointments_contact_id_fkey(first_name, last_name)")
    .eq("company_id", companyId)
    .eq("is_blocked_slot", false)
    .gte("appointment_date", da)
    .lte("appointment_date", a)
    .order("appointment_date", { ascending: true })
    .limit(300), archiviate, "order_id");
  let oda = supabase
    .from("purchase_orders")
    .select("id, oda_number, expected_delivery_date, order_id, status, suppliers(name), orders(order_code, description, customer:profiles!orders_customer_id_fkey(first_name, last_name)), purchase_order_items(description, quantity, quantity_received, unit_of_measure)")
    .eq("company_id", companyId)
    // solo merce che deve ancora arrivare: ricevuti e annullati non sono «in arrivo»
    .in("status", ["inviato", "confermato", "parziale"])
    .gte("expected_delivery_date", da)
    .lte("expected_delivery_date", a)
    .order("expected_delivery_date", { ascending: true })
    .limit(200);
  if (signal) {
    commesse = commesse.abortSignal(signal);
    appuntamenti = appuntamenti.abortSignal(signal);
    oda = oda.abortSignal(signal);
  }
  const [rc, ra, ro] = await Promise.all([commesse, appuntamenti, oda]);
  if (rc.error) throw rc.error;
  if (ra.error) throw ra.error;
  if (ro.error) throw ro.error;

  const eventi = new Map<string, EventoAgenda>();
  const merceDaOda = new Set<string>();

  type RigaOda = {
    id: string; oda_number: string | null; expected_delivery_date: string | null; order_id: string | null;
    suppliers?: { name: string | null } | null;
    orders?: { order_code: string | null; description: string | null; customer?: Persona } | null;
    purchase_order_items?: Array<{ description: string | null; quantity: number | null; quantity_received: number | null; unit_of_measure: string | null }> | null;
  };
  for (const r of (ro.data ?? []) as unknown as RigaOda[]) {
    const g = giorno(r.expected_delivery_date);
    if (!g) continue;
    if (r.order_id) merceDaOda.add(`${r.order_id}-${g}`);
    // le righe con un residuo: quelle già arrivate non sono «in arrivo»
    const righe = (r.purchase_order_items ?? []).filter((x) => Number(x.quantity || 0) > Number(x.quantity_received || 0));
    const materiali = righe.slice(0, 3).map((x) => {
      const resto = Math.max(0, Number(x.quantity || 0) - Number(x.quantity_received || 0));
      return `${resto}${x.unit_of_measure ? ` ${x.unit_of_measure}` : ""} ${x.description || "materiale"}`.trim();
    }).join(" · ");
    eventi.set(`oda-${r.id}`, {
      id: `oda-${r.id}`, tipo: "merce", giorno: g,
      cosa: r.suppliers?.name ? `Arrivo da ${r.suppliers.name}` : "Arrivo merce",
      riferimento: r.orders ? etichettaCommessa(r.orders) : r.oda_number || "Ordine fornitore",
      cliente: nome(r.orders?.customer),
      dettaglio: materiali ? `${materiali}${righe.length > 3 ? ` · +${righe.length - 3} righe` : ""}` : null,
      orderId: r.order_id,
    });
  }

  type RigaCommessa = {
    id: string; order_code: string | null; description: string | null; expected_date: string | null;
    work_start_date: string | null; work_end_date: string | null; warehouse_arrival_date: string | null; customer?: Persona;
  };
  for (const o of (rc.data ?? []) as unknown as RigaCommessa[]) {
    const cliente = nome(o.customer);
    const rif = etichettaCommessa(o);
    const inizio = giorno(o.work_start_date);
    const fine = giorno(o.work_end_date) || inizio;
    const posa = giorno(o.expected_date);
    const merce = giorno(o.warehouse_arrival_date);
    if (inizio && fine && inizio <= a && fine >= da) {
      // un cantiere già aperto compare il primo giorno della finestra
      const g = inizio < da ? da : inizio;
      eventi.set(`lavoro-${o.id}`, { id: `lavoro-${o.id}`, tipo: "lavoro", giorno: g, cosa: inizio < da ? "Lavori in corso" : "Inizio lavori", riferimento: rif, cliente, orderId: o.id });
    }
    if (dentro(posa, da, a) && posa !== inizio) {
      eventi.set(`posa-${o.id}`, { id: `posa-${o.id}`, tipo: "lavoro", giorno: posa!, cosa: "Posa prevista", riferimento: rif, cliente, orderId: o.id });
    }
    if (dentro(merce, da, a) && !merceDaOda.has(`${o.id}-${merce}`)) {
      eventi.set(`merce-${o.id}`, { id: `merce-${o.id}`, tipo: "merce", giorno: merce!, cosa: "Arrivo materiali", riferimento: rif, cliente, dettaglio: "Data sulla commessa, senza ordine fornitore collegato", orderId: o.id });
    }
  }

  type RigaAppuntamento = {
    id: string; title: string | null; appointment_date: string | null; appointment_type: string | null; status: string | null; order_id: string | null;
    order?: { order_code: string | null; description: string | null; customer?: Persona } | null;
    contact?: Persona;
  };
  for (const ap of (ra.data ?? []) as unknown as RigaAppuntamento[]) {
    const g = giorno(ap.appointment_date);
    if (!g) continue;
    if (["cancelled", "canceled", "annullato", "annullata", "riprogrammato"].includes((ap.status || "").toLowerCase())) continue;
    eventi.set(`app-${ap.id}`, {
      id: `app-${ap.id}`, tipo: "appuntamento", giorno: g,
      cosa: APPUNTAMENTI_DI_LAVORO.has(ap.appointment_type || "") ? "Appuntamento di cantiere" : "Appuntamento",
      riferimento: ap.order ? etichettaCommessa(ap.order) : ap.title || "Appuntamento",
      cliente: nome(ap.order?.customer) ?? nome(ap.contact),
      orderId: ap.order_id,
    });
  }

  return [...eventi.values()].sort((x, y) => x.giorno.localeCompare(y.giorno) || x.tipo.localeCompare(y.tipo));
}
