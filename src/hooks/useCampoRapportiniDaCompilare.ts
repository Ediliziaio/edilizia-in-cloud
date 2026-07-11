/**
 * useCampoRapportiniDaCompilare — GAP 5b
 *
 * Restituisce la lista di cantieri in cui l'operaio loggato HA TIMBRATO oggi
 * (o è stato assegnato esplicitamente) ma per cui NON ha ancora compilato
 * un rapportino_intervento per la giornata.
 *
 * Strategia:
 *   1. Query campo_timbrature di oggi WHERE user_id = me, distinct order_id
 *   2. Query campo_rapportini di oggi (data_lavoro = today) WHERE user_id = me
 *      → mappa Set<order_id> già coperti
 *   3. Diff: order_id in (1) MA NOT in (2) → da compilare
 *   4. Se le timbrature sono generiche ma l'operaio ha un solo cantiere attivo,
 *      lo usa come inferenza pratica per non perdere il rapportino.
 *
 * Usato in CampoHome per la card "Crea i rapportini di oggi".
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface RapportinoMancante {
  order_id: string;
  order_code: string | null;
  description: string | null;
  prima_timbratura_at: string;
  prossima_timbratura_at: string | null;
  ore_in_cantiere_stimate: number;
}

interface TimbraturaRow {
  order_id: string | null;
  timestamp_evento: string;
  tipo: string;
  orders: { order_code: string | null; description: string | null } | null;
}

interface RapportinoExistRow {
  order_id: string;
}

interface AssignmentOrderRow {
  id: string;
  order_code: string | null;
  description: string | null;
  status: string | null;
}

interface OrderAssignmentRow {
  order_id: string | null;
  order: AssignmentOrderRow | null;
}

export function useCampoRapportiniDaCompilare(userId: string | undefined) {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  return useQuery({
    queryKey: ["campo-rapportini-da-compilare", userId, companyId],
    enabled: !!userId && !!companyId,
    staleTime: 60_000, // refetch ogni minuto
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<RapportinoMancante[]> => {
      // Giornata LOCALE: mezzanotte locale → mezzanotte locale successiva.
      // Con le stringhe UTC la sera (UTC+2) le timbrature finivano nel giorno sbagliato.
      const today = new Date().toLocaleDateString("en-CA");
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);
      const todayStartIso = startOfDay.toISOString();
      const tomorrowStartIso = endOfDay.toISOString();

      // 1) Timbrature di oggi (con order_id + dati cantiere)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: timbrature, error: tErr } = await (supabase as any)
        .from("campo_timbrature")
        .select("order_id, timestamp_evento, tipo, orders(order_code, description)")
        .eq("user_id", userId!)
        .gte("timestamp_evento", todayStartIso)
        .lt("timestamp_evento", tomorrowStartIso)
        .order("timestamp_evento", { ascending: true });

      if (tErr || !timbrature || timbrature.length === 0) return [];

      // 2) Rapportini di oggi (already created)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: rapportini } = await (supabase as any)
        .from("campo_rapportini")
        .select("order_id")
        .eq("user_id", userId!)
        .eq("data_lavoro", today);
      const coverti = new Set(((rapportini ?? []) as RapportinoExistRow[]).map((r) => r.order_id));

      // 3) Aggrega timbrature per cantiere (per stimare ore in cantiere)
      const byOrder = new Map<string, RapportinoMancante>();
      for (const t of timbrature as TimbraturaRow[]) {
        if (!t.order_id || coverti.has(t.order_id)) continue;
        const existing = byOrder.get(t.order_id);
        if (!existing) {
          byOrder.set(t.order_id, {
            order_id: t.order_id,
            order_code: t.orders?.order_code ?? null,
            description: t.orders?.description ?? null,
            prima_timbratura_at: t.timestamp_evento,
            prossima_timbratura_at: t.timestamp_evento,
            ore_in_cantiere_stimate: 0,
          });
        } else {
          existing.prossima_timbratura_at = t.timestamp_evento;
        }
      }

      const hasGenericTimbrature = (timbrature as TimbraturaRow[]).some((t) => !t.order_id);
      if (byOrder.size === 0 && hasGenericTimbrature && companyId) {
        const { data: employee } = await supabase
          .from("employees")
          .select("id")
          .eq("user_id", userId!)
          .eq("company_id", companyId)
          .maybeSingle();

        if (employee?.id) {
          const { data: assignments } = await supabase
            .from("order_employees")
            .select(`
              order_id,
              order:orders(id, order_code, description, status)
            `)
            .eq("employee_id", employee.id);

          const activeOrders = ((assignments ?? []) as OrderAssignmentRow[]).filter((a) => {
            if (!a.order?.id || coverti.has(a.order.id)) return false;
            const status = String(a.order.status ?? "").toLowerCase();
            return status !== "annullato" && status !== "chiuso";
          });

          if (activeOrders.length === 1) {
            const inferred = activeOrders[0].order;
            if (inferred) {
              const genericTimbrature = timbrature as TimbraturaRow[];
              const first = genericTimbrature[0];
              const last = genericTimbrature[genericTimbrature.length - 1] ?? first;
              byOrder.set(inferred.id, {
                order_id: inferred.id,
                order_code: inferred.order_code ?? null,
                description: inferred.description ?? null,
                prima_timbratura_at: first.timestamp_evento,
                prossima_timbratura_at: last.timestamp_evento,
                ore_in_cantiere_stimate: 0,
              });
            }
          }
        }
      }

      // Stima ore = differenza tra prima e ultima timbratura (rough)
      for (const r of byOrder.values()) {
        const start = new Date(r.prima_timbratura_at).getTime();
        const end = r.prossima_timbratura_at
          ? new Date(r.prossima_timbratura_at).getTime()
          : start;
        r.ore_in_cantiere_stimate = Math.max(
          0.5,
          Math.round(((end - start) / 3_600_000) * 2) / 2, // round 0.5h
        );
      }

      return Array.from(byOrder.values());
    },
  });
}
