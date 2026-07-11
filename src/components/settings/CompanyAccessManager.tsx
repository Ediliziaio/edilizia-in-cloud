/**
 * CompanyAccessManager — concessione accessi multi-azienda self-service (stile GHL).
 *
 * Permette a un admin di azienda (o a un produttore sui propri rivenditori) di
 * invitare/collegare utenti all'azienda corrente con un ruolo per-account, e di
 * gestirne il ciclo di vita (ruolo, sospendi/riattiva, revoca). Tutto passa dalla
 * edge function `company-access-manage`, che valida l'autorizzazione lato server.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, UserPlus, Ban, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

const ROLES: { value: string; label: string }[] = [
  { value: "company_admin", label: "Amministratore" },
  { value: "company_staff", label: "Staff" },
  { value: "salesperson", label: "Venditore" },
  { value: "call_center", label: "Call center" },
  { value: "employee", label: "Dipendente" },
  { value: "subcontractor", label: "Subappaltatore" },
];
const roleLabel = (v: string) => ROLES.find((r) => r.value === v)?.label ?? v;

interface AccessRow {
  id: string;
  user_id: string;
  access_role: string;
  status: "invited" | "active" | "suspended";
  expires_at: string | null;
  invited_email: string | null;
  created_at: string;
  profile: { first_name?: string; last_name?: string; email?: string } | null;
}

export function CompanyAccessManager() {
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("company_staff");

  const invoke = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("company-access-manage", {
      body: { company_id: companyId, ...payload },
    });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-access", companyId],
    queryFn: () => invoke({ action: "list" }),
    enabled: !!companyId,
  });
  const items: AccessRow[] = data?.items ?? [];

  const refetch = () => qc.invalidateQueries({ queryKey: ["company-access", companyId] });

  const inviteMut = useMutation({
    mutationFn: () => invoke({ action: "invite", email: email.trim().toLowerCase(), access_role: role }),
    onSuccess: (res) => {
      toast.success(res?.invited ? "Invito inviato" : "Accesso concesso", {
        description: res?.invited
          ? "L'utente riceverà un'email per impostare la password."
          : "L'utente ora può accedere a questa azienda dallo switcher.",
      });
      setEmail("");
      refetch();
    },
    onError: (e: Error) => toast.error("Impossibile concedere l'accesso", { description: e.message }),
  });

  const rowMut = useMutation({
    mutationFn: (p: Record<string, unknown>) => invoke(p),
    onSuccess: () => refetch(),
    onError: (e: Error) => toast.error("Operazione fallita", { description: e.message }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" /> Invita un utente a questa azienda
          </CardTitle>
          <CardDescription>
            Collega una persona a questa azienda con un ruolo dedicato. Potrà accedervi dal
            selettore azienda, mantenendo i propri accessi alle altre aziende.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@")) {
                toast.error("Inserisci un'email valida");
                return;
              }
              inviteMut.mutate();
            }}
          >
            <Input
              type="email"
              placeholder="email@azienda.it"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
            />
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={inviteMut.isPending || !companyId}>
              {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invita"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Accessi collegati
          </CardTitle>
          <CardDescription>Utenti con accesso a questa azienda oltre alla propria azienda primaria.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Caricamento…
            </div>
          ) : isError ? (
            <p className="py-6 text-sm text-destructive">Errore nel caricamento degli accessi.</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Nessun accesso collegato. Invita qualcuno qui sopra per iniziare.
            </p>
          ) : (
            <div className="divide-y">
              {items.map((row) => {
                const name = row.profile
                  ? `${row.profile.first_name ?? ""} ${row.profile.last_name ?? ""}`.trim() || row.profile.email
                  : row.invited_email ?? "Utente";
                const busy = rowMut.isPending;
                return (
                  <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.profile?.email ?? row.invited_email}
                      </p>
                    </div>
                    {row.status === "suspended" && <Badge variant="outline" className="text-amber-600 border-amber-300">Sospeso</Badge>}
                    {row.status === "invited" && <Badge variant="outline" className="text-blue-600 border-blue-300">Invitato</Badge>}
                    <Select
                      value={row.access_role}
                      onValueChange={(v) => rowMut.mutate({ action: "update-role", access_id: row.id, access_role: v })}
                      disabled={busy}
                    >
                      <SelectTrigger className="w-full sm:w-44 h-8"><SelectValue>{roleLabel(row.access_role)}</SelectValue></SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {row.status === "suspended" ? (
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => rowMut.mutate({ action: "set-status", access_id: row.id, status: "active" })}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={busy}
                        onClick={() => rowMut.mutate({ action: "set-status", access_id: row.id, status: "suspended" })}>
                        <Ban className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}
                      onClick={() => {
                        if (confirm(`Revocare l'accesso di ${name} a questa azienda?`)) {
                          rowMut.mutate({ action: "revoke", access_id: row.id });
                        }
                      }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
