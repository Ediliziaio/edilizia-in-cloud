import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { loadDashboardRows } from "@/lib/attivita/dashboardTasks";
import {
  calendarFinanceModel,
  type CalendarInstallment,
  type CalendarSal,
} from "@/lib/calendar/financeDetails";
import { buildInstallmentsFromLegacy } from "@/lib/orderUtils";
import { salMaturaValido } from "@/lib/orders/salMaturazione";
import {
  campoDayWindow,
  summarizeCampoTime,
  type CampoPunch,
  type CampoTimeSegment,
  type CampoClockState,
} from "@/lib/campo/timeSummary";
import { campoWorkDay, shiftWorkDay } from "@/lib/campo/workDay";
import type { CalendarScope } from "@/types/calendar";

async function requireOrder(
  company: string,
  user: string,
  id: string,
  restricted: boolean,
  signal: AbortSignal,
) {
  const { data, error } = await supabase
    .from("orders")
    .select("id,assigned_to,capomastro_user_id")
    .eq("company_id", company)
    .eq("id", id)
    .is("deleted_at", null)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Commessa non disponibile per questo account");
  if (
    !restricted ||
    data.assigned_to === user ||
    data.capomastro_user_id === user
  )
    return;
  const assignment = await supabase
    .from("order_campo_assignments")
    .select("id")
    .eq("company_id", company)
    .eq("order_id", id)
    .eq("user_id", user)
    .limit(1)
    .abortSignal(signal);
  if (assignment.error) throw assignment.error;
  if (!assignment.data?.length)
    throw new Error("Commessa non assegnata a questo account");
}

export function useCalendarOrderFinance(
  orderId: string | undefined,
  enabled = true,
) {
  const { effectiveCompany, user } = useAuth();
  const p = usePermissions();
  const company = effectiveCompany?.id;
  const allowed =
    enabled &&
    !!orderId &&
    !!company &&
    !!user?.id &&
    !p.isLoading &&
    p.canViewCalendar &&
    p.canViewOrders &&
    p.canViewScadenzario;
  const query = useQuery({
    queryKey: [
      "calendar-order-finance-v1",
      company,
      user?.id,
      orderId,
      p.onlyAssigned,
    ],
    enabled: allowed,
    staleTime: 0,
    refetchOnWindowFocus: true,
    queryFn: async ({ signal }) => {
      if (!allowed) throw new Error("Incassi non accessibili");
      await requireOrder(company!, user!.id, orderId!, p.onlyAssigned, signal);
      const [orderResult, rates, sals, variations, settings, invoiceLinks] =
        await Promise.all([
          supabase
            .from("orders")
            .select(
              "total_amount,vat_rate,financing_cost,payment_type,deposit_amount,deposit_paid,deposit_paid_date,deposit_expected_date,deposit_2_amount,deposit_2_paid,deposit_2_paid_date,deposit_2_expected_date,balance_amount,balance_paid,balance_paid_date,balance_expected_date,financing_amount,financing_paid,financing_paid_date,financing_expected_date",
            )
            .eq("id", orderId!)
            .eq("company_id", company!)
            .abortSignal(signal)
            .single(),
          loadDashboardRows<CalendarInstallment>((a, b) =>
            supabase
              .from("v_rate_commessa_stato")
              .select(
                "id,position,label,type,amount,is_paid,paid_date,data_attesa,stato_incasso,trigger_evento,trigger_numero",
              )
              .eq("order_id", orderId!)
              .eq("company_id", company!)
              .order("position")
              .order("id")
              .range(a, b)
              .abortSignal(signal),
          ),
          loadDashboardRows<CalendarSal>((a, b) =>
            supabase
              .from("sal_records")
              .select(
                "id,numero_sal,stato,data_emissione,importo_totale,installment_id",
              )
              .eq("company_id", company!)
              .eq("order_id", orderId!)
              .order("numero_sal")
              .order("id")
              .range(a, b)
              .abortSignal(signal),
          ),
          supabase
            .from("ordini_variazione")
            .select("status,impatto_economico")
            .eq("order_id", orderId!)
            .eq("company_id", company!)
            .abortSignal(signal),
          supabase
            .from("company_pagamenti_settings" as never)
            .select("sal_matura_quando")
            .eq("company_id", company!)
            .abortSignal(signal)
            .maybeSingle()
            .overrideTypes<{ sal_matura_quando: string }, { merge: false }>(),
          supabase
            .from("order_installments")
            .select("id,documento_fiscale_id,order:orders!inner(company_id)")
            .eq("order_id", orderId!)
            .eq("order.company_id", company!)
            .abortSignal(signal),
        ]);
      for (const result of [orderResult, variations, settings, invoiceLinks])
        if (result.error) throw result.error;
      const invoiceIds = [
        ...new Set(
          (invoiceLinks.data ?? [])
            .map((r) => r.documento_fiscale_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const invoices = new Map<
        string,
        { id: string; importo_pagato: number | null }
      >();
      if (invoiceIds.length) {
        const result = await supabase
          .from("documenti_fiscali")
          .select("id,importo_pagato")
          .eq("company_id", company!)
          .in("id", invoiceIds)
          .abortSignal(signal);
        if (result.error) throw result.error;
        for (const invoice of result.data ?? [])
          invoices.set(invoice.id, invoice);
      }
      const effectiveRates: CalendarInstallment[] = rates.length
        ? rates
        : buildInstallmentsFromLegacy(orderResult.data!).map((r) => ({
            id: `legacy-${r.position}`,
            position: r.position,
            label: r.label,
            type: r.type,
            amount: r.amount,
            is_paid: r.is_paid,
            paid_date: r.paid_date ?? null,
            data_attesa: r.expected_date ?? null,
            stato_incasso:
              r.expected_date && r.expected_date < campoWorkDay(new Date())
                ? "scaduta"
                : "prevista",
            trigger_evento: r.trigger_evento ?? null,
            trigger_numero: r.trigger_numero ?? null,
          }));
      return calendarFinanceModel({
        order: orderResult.data!,
        rates: effectiveRates.map((rate) => ({
          ...rate,
          fattura:
            invoices.get(
              invoiceLinks.data?.find((r) => r.id === rate.id)
                ?.documento_fiscale_id ?? "",
            ) ?? null,
        })),
        sals,
        variations: variations.data ?? [],
        maturity: salMaturaValido(settings.data?.sal_matura_quando),
      });
    },
  });
  return { ...query, allowed, data: allowed ? query.data : undefined };
}

interface CalendarPresencePerson {
  id: string;
  name: string;
  minutes: number;
  segments: CampoTimeSegment[];
  open: boolean;
  incomplete: boolean;
  state: CampoClockState;
  issues: number;
  provisional: boolean;
}
interface PersonPunch extends CampoPunch {
  id: string;
  user_id: string;
}
export function useCalendarOrderPresence(
  orderId: string | undefined,
  day: string,
  scope: CalendarScope = "personal",
  enabled = true,
) {
  const { effectiveCompany, user } = useAuth();
  const p = usePermissions();
  const company = effectiveCompany?.id;
  const team =
    scope === "team" &&
    !p.onlyAssigned &&
    p.canViewPersone &&
    (p.isAdmin || p.canViewAllTeamCalendar);
  const allowed =
    enabled &&
    !!orderId &&
    !!company &&
    !!user?.id &&
    !p.isLoading &&
    p.canViewCalendar &&
    p.canViewOrders;
  const query = useQuery({
    queryKey: [
      "calendar-order-presence-v1",
      company,
      user?.id,
      orderId,
      day,
      team,
      p.onlyAssigned,
    ],
    enabled: allowed,
    staleTime: 0,
    refetchInterval:
      allowed && day === campoWorkDay(new Date()) ? 60_000 : false,
    queryFn: async ({ signal }) => {
      if (!allowed) throw new Error("Presenze non accessibili");
      await requireOrder(company!, user!.id, orderId!, p.onlyAssigned, signal);
      const window = campoDayWindow(day),
        until = campoDayWindow(shiftWorkDay(day, 1)).end;
      const candidates: {
        id: string;
        user_id: string | null;
        timestamp_evento?: string;
      }[] = team
        ? await loadDashboardRows<{
            id: string;
            user_id: string | null;
            timestamp_evento: string;
          }>((a, b) =>
            supabase
              .from("campo_timbrature")
              .select("id,user_id,timestamp_evento")
              .eq("company_id", company!)
              .eq("order_id", orderId!)
              .gte("timestamp_evento", window.lookback.toISOString())
              .lt("timestamp_evento", window.end.toISOString())
              .order("id")
              .range(a, b)
              .abortSignal(signal),
          )
        : [{ id: "self", user_id: user!.id }];
      const unassignedCount = team
        ? candidates.filter(
            (r) =>
              !r.user_id &&
              r.timestamp_evento &&
              Date.parse(r.timestamp_evento) >= window.start.getTime() &&
              Date.parse(r.timestamp_evento) < window.end.getTime(),
          ).length
        : 0;
      const ids = [
        ...new Set(
          candidates
            .map((r) => r.user_id)
            .filter(
              (id): id is string =>
                typeof id === "string" && id.trim().length > 0,
            ),
        ),
      ];
      if (!ids.length)
        return {
          people: [] as CalendarPresencePerson[],
          unassignedCount,
        };
      const [punches, profiles] = await Promise.all([
        loadDashboardRows<PersonPunch>((a, b) =>
          supabase
            .from("campo_timbrature")
            .select("id,user_id,tipo,timestamp_evento,order_id,in_sede,sede_id")
            .eq("company_id", company!)
            .in("user_id", ids)
            .gte("timestamp_evento", window.lookback.toISOString())
            .lt("timestamp_evento", until.toISOString())
            .order("timestamp_evento")
            .order("id")
            .range(a, b)
            .abortSignal(signal),
        ),
        supabase
          .from("profiles")
          .select("id,first_name,last_name")
          .eq("company_id", company!)
          .in("id", ids)
          .abortSignal(signal),
      ]);
      if (profiles.error) throw profiles.error;
      const now = new Date();
      const people = ids.flatMap((id) => {
        const rows = punches.filter((r) => r.user_id === id);
        const summary = summarizeCampoTime(rows, {
          ...window,
          now,
          includeOpen: day === campoWorkDay(now),
        });
        const segments = summary.segments.filter((s) => s.orderId === orderId);
        const minutes = summary.byOrder.get(orderId!)?.workMinutes ?? 0;
        const dayPunches = rows.filter(
          (r) =>
            r.order_id === orderId &&
            Date.parse(r.timestamp_evento) >= window.start.getTime() &&
            Date.parse(r.timestamp_evento) < window.end.getTime(),
        );
        if (!segments.length && !dayPunches.length) return [];
        const profile = profiles.data?.find((r) => r.id === id);
        const open =
          summary.activeOrderId === orderId && summary.state !== "out";
        return [
          {
            id,
            name:
              [profile?.first_name, profile?.last_name]
                .filter(Boolean)
                .join(" ") || "Persona",
            minutes,
            segments,
            open: open && day === campoWorkDay(now),
            incomplete: open && day !== campoWorkDay(now),
            state: summary.state,
            issues: summary.issues.length,
            provisional: segments.some((s) => s.provisional),
          },
        ];
      });
      return { people, unassignedCount };
    },
  });
  return { ...query, allowed, team, data: allowed ? query.data : undefined };
}
