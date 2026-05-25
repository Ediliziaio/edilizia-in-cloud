import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays, differenceInHours, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type AdminActionSeverity = "critical" | "high" | "medium" | "low";
export type AdminActionSource = "support" | "trial" | "sync" | "revenue" | "system";

export interface AdminActionItem {
  id: string;
  title: string;
  description: string;
  source: AdminActionSource;
  severity: AdminActionSeverity;
  href: string;
  cta: string;
  companyId?: string;
  companyName?: string;
  createdAt?: string;
  meta?: string;
}

export interface AdminCommandCenterData {
  items: AdminActionItem[];
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    support: number;
    trials: number;
    sync: number;
    revenue: number;
  };
  updatedAt: string;
}

const ACTIVE_SUPPORT_STATUSES = new Set(["open", "in_progress"]);
const CLOSED_SUPPORT_STATUSES = new Set(["resolved", "closed"]);

function truncate(value: string | null | undefined, max = 130) {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text || "Nessun dettaglio disponibile";
  return `${text.slice(0, max - 1)}…`;
}

function getSeverityRank(severity: AdminActionSeverity) {
  const rank: Record<AdminActionSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return rank[severity];
}

export function useAdminCommandCenterData() {
  return useQuery({
    queryKey: ["admin-command-center-data"],
    queryFn: async (): Promise<AdminCommandCenterData> => {
      const sevenDaysAgo = subDays(new Date(), 7).toISOString();

      const [companiesRes, supportRes, messagesRes, syncLogsRes] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, status, trial_ends_at, created_at")
          .order("created_at", { ascending: false })
          .limit(300),
        supabase
          .from("support_conversations")
          .select("company_id, status, priority, updated_at, resolved_at")
          .order("updated_at", { ascending: false })
          .limit(250),
        supabase
          .from("support_messages")
          .select("company_id, sender_role, message, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("google_calendar_sync_log")
          .select("id, status, started_at, error_message, connections_failed")
          .gte("started_at", sevenDaysAgo)
          .order("started_at", { ascending: false })
          .limit(50),
      ]);

      if (companiesRes.error) throw companiesRes.error;
      if (supportRes.error) throw supportRes.error;
      if (messagesRes.error) throw messagesRes.error;
      if (syncLogsRes.error) throw syncLogsRes.error;

      const companies = companiesRes.data ?? [];
      const companyMap = new Map(companies.map((company) => [company.id, company.name]));
      const latestMessageByCompany = new Map<string, NonNullable<typeof messagesRes.data>[number]>();

      for (const message of messagesRes.data ?? []) {
        if (!latestMessageByCompany.has(message.company_id)) {
          latestMessageByCompany.set(message.company_id, message);
        }
      }

      const items: AdminActionItem[] = [];

      for (const conversation of supportRes.data ?? []) {
        if (CLOSED_SUPPORT_STATUSES.has(conversation.status || "")) continue;
        if (!ACTIVE_SUPPORT_STATUSES.has(conversation.status || "open")) continue;

        const latestMessage = latestMessageByCompany.get(conversation.company_id);
        const lastDate = latestMessage?.created_at || conversation.updated_at;
        const agingHours = lastDate ? differenceInHours(new Date(), new Date(lastDate)) : 0;
        const unanswered = latestMessage?.sender_role !== "super_admin";
        const priority = conversation.priority || "normal";

        const severity: AdminActionSeverity =
          priority === "urgent" || (unanswered && agingHours >= 24)
            ? "critical"
            : priority === "high" || (unanswered && agingHours >= 8)
              ? "high"
              : unanswered
                ? "medium"
                : "low";

        items.push({
          id: `support-${conversation.company_id}`,
          source: "support",
          severity,
          title: unanswered ? "Risposta assistenza richiesta" : "Conversazione assistenza aperta",
          description: `${companyMap.get(conversation.company_id) || "Azienda"}: ${truncate(latestMessage?.message)}`,
          href: "/admin/ticket",
          cta: "Apri assistenza",
          companyId: conversation.company_id,
          companyName: companyMap.get(conversation.company_id) || "Azienda",
          createdAt: lastDate || undefined,
          meta: priority === "urgent" ? "Urgente" : `${Math.max(0, agingHours)}h`,
        });
      }

      const now = new Date();
      for (const company of companies) {
        if (company.status === "trial" && company.trial_ends_at) {
          const daysLeft = differenceInCalendarDays(new Date(company.trial_ends_at), now);
          if (daysLeft >= 0 && daysLeft <= 7) {
            items.push({
              id: `trial-${company.id}`,
              source: "trial",
              severity: daysLeft <= 1 ? "critical" : daysLeft <= 3 ? "high" : "medium",
              title: "Trial in scadenza",
              description: `${company.name} scade ${daysLeft === 0 ? "oggi" : `tra ${daysLeft} giorni`}. Verifica attivazione e prossima azione commerciale.`,
              href: `/admin/aziende/${company.id}`,
              cta: "Apri azienda",
              companyId: company.id,
              companyName: company.name,
              createdAt: company.trial_ends_at,
              meta: `${daysLeft}g`,
            });
          }
        }

        if (company.status === "expired" || company.status === "suspended") {
          items.push({
            id: `status-${company.id}`,
            source: "revenue",
            severity: "high",
            title: company.status === "suspended" ? "Azienda sospesa" : "Trial scaduto",
            description: `${company.name} richiede una decisione su recupero, estensione o chiusura.`,
            href: `/admin/aziende/${company.id}`,
            cta: "Gestisci azienda",
            companyId: company.id,
            companyName: company.name,
            createdAt: company.trial_ends_at || company.created_at,
          });
        }
      }

      for (const log of syncLogsRes.data ?? []) {
        if (log.status !== "failed" && (log.connections_failed ?? 0) <= 0) continue;
        const ageHours = log.started_at ? differenceInHours(now, new Date(log.started_at)) : 0;
        items.push({
          id: `sync-${log.id}`,
          source: "sync",
          severity: ageHours <= 24 ? "high" : "medium",
          title: "Sincronizzazione da verificare",
          description: truncate(log.error_message || `Connessioni fallite: ${log.connections_failed ?? 0}`),
          href: "/admin/sync-logs",
          cta: "Apri log",
          createdAt: log.started_at || undefined,
          meta: ageHours <= 24 ? "Ultime 24h" : "Ultimi 7g",
        });
      }

      const sortedItems = items.sort((a, b) => {
        const severityDelta = getSeverityRank(a.severity) - getSeverityRank(b.severity);
        if (severityDelta !== 0) return severityDelta;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      return {
        items: sortedItems,
        summary: {
          total: sortedItems.length,
          critical: sortedItems.filter((item) => item.severity === "critical").length,
          high: sortedItems.filter((item) => item.severity === "high").length,
          medium: sortedItems.filter((item) => item.severity === "medium").length,
          low: sortedItems.filter((item) => item.severity === "low").length,
          support: sortedItems.filter((item) => item.source === "support").length,
          trials: sortedItems.filter((item) => item.source === "trial").length,
          sync: sortedItems.filter((item) => item.source === "sync").length,
          revenue: sortedItems.filter((item) => item.source === "revenue").length,
        },
        updatedAt: new Date().toISOString(),
      };
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}
