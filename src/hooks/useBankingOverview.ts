import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BankingOverviewRow {
  company_id: string;
  company_name: string;
  bank_name: string | null;
  connection_status: "connected" | "expired" | "error" | "not_connected";
  connected_at: string | null;
  expires_at: string | null;
  last_sync: string | null;
  accounts_count: number;
  error_message: string | null;
}

export interface BankingOverviewStats {
  connected: number;
  not_connected: number;
  expired: number;
  error: number;
}

function deriveStatus(
  status: string | null,
  errorMessage: string | null,
  updatedAt: string | null
): BankingOverviewRow["connection_status"] {
  if (!status || status === "pending" || status === "not_connected") return "not_connected";
  if (status === "active" || status === "linked") return "connected";
  if (status === "expired" || status === "revoked") return "expired";
  if (status === "error" || errorMessage) return "error";
  // Check if connection expired (GoCardless requisitions expire after 90 days)
  if (updatedAt) {
    const daysSinceUpdate =
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceUpdate > 90) return "expired";
  }
  return "not_connected";
}

export function useBankingOverview() {
  return useQuery({
    queryKey: ["admin", "banking-overview"],
    queryFn: async (): Promise<BankingOverviewRow[]> => {
      // Get all companies
      const { data: companies, error: companiesError } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (companiesError) throw new Error(companiesError.message);

      // Get all bank connections
      const { data: connections, error: connectionsError } = await supabase
        .from("bank_connections" as never)
        .select("company_id, institution_name, status, error_message, last_sync_at, accounts_count, created_at, updated_at" as never)
        .order("created_at" as never, { ascending: false });
      if (connectionsError) throw new Error(connectionsError.message);

      type ConnectionRow = {
        company_id: string;
        institution_name: string;
        status: string | null;
        error_message: string | null;
        last_sync_at: string | null;
        accounts_count: number;
        created_at: string;
        updated_at: string | null;
      };

      const connectionMap = new Map<string, ConnectionRow>();
      for (const conn of (connections ?? []) as ConnectionRow[]) {
        // Keep only the most recent connection per company
        if (!connectionMap.has(conn.company_id)) {
          connectionMap.set(conn.company_id, conn);
        }
      }

      return ((companies ?? []) as Array<{ id: string; name: string }>).map(
        (company) => {
          const conn = connectionMap.get(company.id);
          if (!conn) {
            return {
              company_id: company.id,
              company_name: company.name,
              bank_name: null,
              connection_status: "not_connected" as const,
              connected_at: null,
              expires_at: null,
              last_sync: null,
              accounts_count: 0,
              error_message: null,
            };
          }

          const status = deriveStatus(conn.status, conn.error_message, conn.updated_at);
          // GoCardless requisitions expire after 90 days
          const expiresAt =
            conn.created_at
              ? new Date(
                  new Date(conn.created_at).getTime() + 90 * 24 * 60 * 60 * 1000
                ).toISOString()
              : null;

          return {
            company_id: company.id,
            company_name: company.name,
            bank_name: conn.institution_name,
            connection_status: status,
            connected_at: conn.created_at,
            expires_at: expiresAt,
            last_sync: conn.last_sync_at,
            accounts_count: conn.accounts_count ?? 0,
            error_message: conn.error_message,
          };
        }
      );
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useBankingOverviewStats(data: BankingOverviewRow[]): BankingOverviewStats {
  return {
    connected: data.filter((r) => r.connection_status === "connected").length,
    not_connected: data.filter((r) => r.connection_status === "not_connected").length,
    expired: data.filter((r) => r.connection_status === "expired").length,
    error: data.filter((r) => r.connection_status === "error").length,
  };
}
