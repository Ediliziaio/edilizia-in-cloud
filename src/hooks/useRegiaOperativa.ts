/**
 * Regia operativa (la home /azienda da computer): cosa succede oggi e nei
 * prossimi giorni, cosa è fermo, quali commesse seguire. Niente soldi: venduto,
 * incassi e costi stanno nel Cruscotto, con le loro regole.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useDocumentiDaConfermareCount } from "@/lib/email-ai/hooks";
import { useCruscottoWorkOrders } from "@/hooks/useCruscottoWorkOrders";
import { faseConclusiva, isLateWork } from "@/lib/cruscottoMetrics";
import { leggiAgendaOperativa } from "@/lib/regia/agendaOperativa";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { totaleDaApprovare, useDaApprovareCantieri, usePuoApprovareCantiere } from "@/components/campo/DaApprovareCantieri";

/** Giorni dell'agenda, oggi compreso. */
export const GIORNI_AGENDA = 14;

export interface CommessaDaSeguire {
  id: string;
  codice: string;
  cliente: string | null;
  fase: string | null;
  /** fine lavori superata: giorni di ritardo */
  ritardo: number | null;
  /** prossima data di lavoro (inizio o posa), yyyy-MM-dd */
  prossima: string | null;
  /** fine lavori che oggi fa il ritardo, yyyy-MM-dd */
  scadenza: string | null;
}

export function useRegiaOperativa() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const oggi = format(new Date(), "yyyy-MM-dd");
  const fine = format(addDays(new Date(), GIORNI_AGENDA - 1), "yyyy-MM-dd");

  const agenda = useQuery({
    queryKey: ["regia-operativa", "agenda", companyId, oggi],
    enabled: !!companyId,
    staleTime: 2 * 60_000,
    queryFn: ({ signal }) => leggiAgendaOperativa(companyId!, oggi, fine, signal),
  });

  const ticket = useQuery({
    queryKey: ["regia-operativa", "ticket", companyId],
    enabled: !!companyId,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      // aperti = non ancora risolti né chiusi («in lavorazione» compreso); lo stato è l’enum ticket_status
      const { count, error } = await supabase.from("tickets").select("id", { count: "exact", head: true })
        .eq("company_id", companyId!).not("status", "in", "(risolto,chiuso,annullato)");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // merce che doveva arrivare e non è ancora stata ricevuta
  const merceInRitardo = useQuery({
    queryKey: ["regia-operativa", "merce-in-ritardo", companyId, oggi],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error, count } = await supabase.from("purchase_orders")
        .select("id, oda_number, expected_delivery_date, suppliers(name)", { count: "exact" })
        .eq("company_id", companyId!)
        // anche «parziale»: arrivata una parte, il resto è proprio quello da sollecitare
        .in("status", ["inviato", "confermato", "parziale"])
        .lt("expected_delivery_date", oggi)
        .order("expected_delivery_date", { ascending: true })
        .limit(3);
      if (error) throw error;
      return { totale: count ?? 0, voci: (data ?? []) as unknown as Array<{ id: string; oda_number: string | null; expected_delivery_date: string; suppliers?: { name: string | null } | null }> };
    },
  });

  // la fase in cui «Segna finita» porta una commessa: la stessa che il Cruscotto conta come finita
  const faseFinale = useQuery({
    queryKey: ["regia-operativa", "fase-finale", companyId],
    enabled: !!companyId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_statuses").select("id, name, position, is_support_phase")
        .eq("company_id", companyId!);
      if (error) throw error;
      const f = faseConclusiva(data ?? []);
      return f ? { id: f.id, nome: f.name as string } : null;
    },
  });

  // Documenti letti dagli allegati delle email che aspettano una conferma: solo per chi vede le email.
  const permessi = usePermissions();
  const documenti = useDocumentiDaConfermareCount(companyId, !!permessi.canViewMarketingEmail);

  const puoApprovare = usePuoApprovareCantiere();
  const approvare = useDaApprovareCantieri(puoApprovare);

  const lavori = useCruscottoWorkOrders(companyId);

  // commesse da seguire: prima quelle oltre la fine lavori, poi le prossime a partire
  const daSeguireBase = useMemo(() => {
    const aperte = (lavori.data ?? []).filter((o) => o.work_state === "open");
    const oggiData = new Date();
    const conRitardo = aperte.filter((o) => isLateWork(o, oggiData)).map((o) => {
      const scad = o.work_end_date || o.expected_date!;
      return { o, ritardo: Math.round((oggiData.getTime() - new Date(`${scad}T12:00:00`).getTime()) / 86_400_000), prossima: null as string | null, scadenza: scad };
    }).sort((a, b) => b.ritardo - a.ritardo);
    const prossime = aperte.filter((o) => !isLateWork(o, oggiData)).map((o) => {
      const date = [o.work_start_date, o.expected_date].filter((d): d is string => !!d && d >= oggi).sort();
      return { o, ritardo: null as number | null, prossima: date[0] ?? null, scadenza: null as string | null };
    }).filter((x) => x.prossima).sort((a, b) => a.prossima!.localeCompare(b.prossima!));
    return { inRitardo: conRitardo.length, elenco: [...conRitardo.slice(0, 4), ...prossime].slice(0, 8) };
  }, [lavori.data, oggi]);

  // cliente e fase solo per le otto commesse mostrate
  const ids = daSeguireBase.elenco.map((x) => x.o.id);
  const dettagli = useQuery({
    queryKey: ["regia-operativa", "commesse", companyId, ids],
    enabled: !!companyId && ids.length > 0,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [righe, fasi] = await Promise.all([
        readAllOrderRows<{ id: string; current_status_id: string | null; customer: { first_name: string | null; last_name: string | null } | null }>((da, a) => supabase
          .from("orders").select("id, current_status_id, customer:profiles!orders_customer_id_fkey(first_name, last_name)")
          .eq("company_id", companyId!).in("id", ids).order("id").range(da, a)),
        supabase.from("order_statuses").select("id, name").eq("company_id", companyId!),
      ]);
      if (fasi.error) throw fasi.error;
      const nomiFasi = new Map((fasi.data ?? []).map((f) => [f.id, f.name as string]));
      return new Map(righe.map((r) => [r.id, {
        cliente: [r.customer?.first_name, r.customer?.last_name].filter(Boolean).join(" ").trim() || null,
        fase: r.current_status_id ? nomiFasi.get(r.current_status_id) ?? null : null,
      }]));
    },
  });

  const daSeguire = useMemo<CommessaDaSeguire[]>(() => daSeguireBase.elenco.map(({ o, ritardo, prossima, scadenza }) => ({
    id: o.id,
    codice: o.order_code || o.description || "Commessa",
    cliente: dettagli.data?.get(o.id)?.cliente ?? null,
    fase: dettagli.data?.get(o.id)?.fase ?? null,
    ritardo,
    prossima,
    scadenza,
  })), [daSeguireBase.elenco, dettagli.data]);

  const eventi = agenda.data ?? [];
  const settimana = format(addDays(new Date(), 6), "yyyy-MM-dd");
  const nellaSettimana = eventi.filter((e) => e.giorno <= settimana);

  return {
    isLoading: agenda.isLoading || lavori.isLoading,
    error: agenda.error || lavori.error || ticket.error || merceInRitardo.error,
    agenda: eventi,
    numeri: {
      lavori: nellaSettimana.filter((e) => e.tipo === "lavoro").length,
      merce: nellaSettimana.filter((e) => e.tipo === "merce").length,
      appuntamenti: nellaSettimana.filter((e) => e.tipo === "appuntamento").length,
      ticket: ticket.data ?? 0,
    },
    daApprovare: puoApprovare ? totaleDaApprovare(approvare.data) : null,
    documentiDaConfermare: documenti.data ?? 0,
    cantieriInRitardo: daSeguireBase.inRitardo,
    merceInRitardo: merceInRitardo.data ?? { totale: 0, voci: [] },
    daSeguire,
    faseFinale: faseFinale.data ?? null,
  };
}
