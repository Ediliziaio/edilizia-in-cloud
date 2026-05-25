/**
 * /commercialista/team — collaboratori dello studio.
 * Mostra i membri del firm (owner, admin, collaborator, viewer).
 * Per ora read-only; in iterazione successiva: invite member.
 */

import { useQuery } from "@tanstack/react-query";
import { Loader2, ShieldCheck, User, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSEO } from "@/hooks/useSEO";
import { supabase } from "@/integrations/supabase/client";
import { useAccountantFirm } from "@/hooks/accountant/useAccountantPortalData";

interface TeamMemberRow {
  id: string;
  firm_id: string;
  user_id: string;
  role: string;
  status: string;
  accepted_at: string | null;
  created_at: string;
  profile: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Titolare", color: "bg-blue-100 text-blue-800" },
  admin: { label: "Admin", color: "bg-purple-100 text-purple-800" },
  collaborator: { label: "Collaboratore", color: "bg-slate-100 text-slate-700" },
  viewer: { label: "Lettore", color: "bg-amber-50 text-amber-800" },
};

export default function AccountantTeam() {
  useSEO({ title: "Team studio", noindex: true });
  const { data: firm } = useAccountantFirm();
  const firmId = firm?.id ?? null;

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["accountant", "team", firmId],
    enabled: !!firmId,
    queryFn: async (): Promise<TeamMemberRow[]> => {
      if (!firmId) return [];
      const { data, error } = await supabase
        .from("accountant_firm_members")
        .select(
          `id, firm_id, user_id, role, status, accepted_at, created_at,
           profile:profiles!accountant_firm_members_user_id_fkey(id, first_name, last_name, email)`,
        )
        .eq("firm_id", firmId)
        .neq("status", "suspended")
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[AccountantTeam]", error);
        return [];
      }
      return (data || []) as unknown as TeamMemberRow[];
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team studio</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Collaboratori che hanno accesso ai dati di {firm?.name}.
          </p>
        </div>
        <Button variant="outline" disabled className="gap-2">
          <Users className="h-4 w-4" />
          Invita collaboratore
          <Badge variant="secondary" className="ml-1">Presto</Badge>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membri attivi</CardTitle>
          <CardDescription>{members.length} persone collegate</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Caricamento...
            </div>
          )}
          {!isLoading && members.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Nessun membro nello studio.
            </div>
          )}
          {members.length > 0 && (
            <div className="divide-y">
              {members.map((m) => {
                const roleInfo = ROLE_LABELS[m.role] ?? {
                  label: m.role,
                  color: "bg-slate-100 text-slate-700",
                };
                const name =
                  [m.profile?.first_name, m.profile?.last_name]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || m.profile?.email || "Utente";
                return (
                  <div key={m.id} className="flex items-center gap-3 p-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      {name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase())
                        .join("") || <User className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.profile?.email ?? "—"}
                      </p>
                    </div>
                    <Badge className={roleInfo.color}>
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {roleInfo.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
