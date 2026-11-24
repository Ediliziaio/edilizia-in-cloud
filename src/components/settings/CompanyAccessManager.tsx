/**
 * CompanyAccessManager — concessione accessi multi-azienda self-service (stile GHL).
 *
 * Permette a un admin di azienda (o a un produttore sui propri rivenditori) di
 * invitare/collegare utenti all'azienda corrente con un ruolo per-account, e di
 * gestirne il ciclo di vita (ruolo, sospendi/riattiva, revoca). Tutto passa dalla
 * edge function `company-access-manage`, che valida l'autorizzazione lato server.
 *
 * Nella pagina Persone & Accessi la scheda si chiama «Da altre aziende»: serve a
 * collegare chi ha già un account altrove (un consulente, un'altra tua società),
 * non a creare un utente nuovo (quello è «Utenti»).
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, UserPlus, Ban, RotateCcw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { messaggioErrorePersone } from "@/lib/users/erroriPersone";
import { NOME_RUOLO, ORDINE_RUOLO_PRINCIPALE, nomeRuolo } from "@/lib/permessi/ruoliUtente";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

// Stessi nomi e stesso ordine delle altre schermate delle persone.
const ROLES: { value: string; label: string }[] = ORDINE_RUOLO_PRINCIPALE.map((value) => ({
  value,
  label: NOME_RUOLO[value],
}));
const roleLabel = (v: string) => nomeRuolo(v) || v;

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

export function CompanyAccessManager({ soloLettura = false }: { soloLettura?: boolean } = {}) {
  const t = useT();
  const companyId = useEffectiveCompanyId();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("company_staff");

  const invoke = async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("company-access-manage", {
      body: { company_id: companyId, ...payload },
    });
    // Il messaggio vero sta nel corpo della risposta: error.message dice solo
    // «Edge Function returned a non-2xx status code».
    if (error) throw new Error(await edgeErrorMessage(error, ""));
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const { data, isLoading, isError, refetch: rileggi } = useQuery({
    queryKey: ["company-access", companyId],
    queryFn: () => invoke({ action: "list" }),
    enabled: !!companyId,
  });
  const items: AccessRow[] = data?.items ?? [];

  const refetch = () => qc.invalidateQueries({ queryKey: ["company-access", companyId] });

  const inviteMut = useMutation({
    mutationFn: () => invoke({ action: "invite", email: email.trim().toLowerCase(), access_role: role }),
    onSuccess: (res) => {
      toast.success(res?.invited ? t("Invito inviato") : t("Accesso concesso"), {
        description: res?.invited
          ? t("La persona riceverà un'email per impostare la password.")
          : t("Ora può entrare in questa azienda dal selettore delle aziende."),
      });
      setEmail("");
      refetch();
    },
    onError: (e: Error) =>
      toast.error(t("Non sono riuscito a dare l'accesso"), {
        description: messaggioErrorePersone(e, t("Riprova tra un attimo.")),
      }),
  });

  const rowMut = useMutation({
    mutationFn: (p: Record<string, unknown>) => invoke(p),
    onSuccess: () => refetch(),
    onError: (e: Error) =>
      toast.error(t("L'operazione non è riuscita"), {
        description: messaggioErrorePersone(e, t("Riprova tra un attimo.")),
      }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <UserPlus className="h-4 w-4" aria-hidden="true" /> {t("Persone di altre aziende")}
          </h2>
          <CardDescription>
            {t("Collega una persona che ha già un account in un'altra azienda (un consulente, un'altra tua società). Entra da qui con il ruolo che scegli e tiene gli accessi che ha già.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col sm:flex-row gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email.includes("@")) {
                toast.error(t("Scrivi un'email valida"));
                return;
              }
              inviteMut.mutate();
            }}
          >
            <Input
              type="email"
              placeholder="email@azienda.it"
              aria-label={t("Email della persona da collegare")}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1"
              disabled={soloLettura}
            />
            <Select value={role} onValueChange={setRole} disabled={soloLettura}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("Ruolo")}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={soloLettura || inviteMut.isPending || !companyId}>
              {inviteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-label={t("Invio in corso")} /> : t("Invita")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-base font-semibold leading-none tracking-tight">
            <Users className="h-4 w-4" aria-hidden="true" /> {t("Chi entra da altre aziende")}
          </h2>
          <CardDescription>{t("Le persone che hanno accesso a questa azienda oltre alla propria.")}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {t("Caricamento…")}
            </div>
          ) : isError ? (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-2 py-6 text-sm text-destructive">
              <span>{t("Non riesco a leggere gli accessi. Riprova tra un attimo.")}</span>
              <Button variant="outline" size="sm" onClick={() => void rileggi()}>{t("Riprova")}</Button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {t("Nessuno ancora. Invita qualcuno qui sopra per cominciare.")}
            </p>
          ) : (
            <div className="divide-y">
              {items.map((row) => {
                const name = row.profile
                  ? `${row.profile.first_name ?? ""} ${row.profile.last_name ?? ""}`.trim() || row.profile.email
                  : row.invited_email ?? t("Persona");
                const busy = soloLettura || rowMut.isPending;
                return (
                  <div key={row.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {row.profile?.email ?? row.invited_email}
                      </p>
                    </div>
                    {row.status === "suspended" && <Badge variant="outline" className="text-amber-600 border-amber-300">{t("Sospeso")}</Badge>}
                    {row.status === "invited" && <Badge variant="outline" className="text-blue-600 border-blue-300">{t("Invitato")}</Badge>}
                    <Select
                      value={row.access_role}
                      onValueChange={(v) => rowMut.mutate({ action: "update-role", access_id: row.id, access_role: v })}
                      disabled={busy}
                    >
                      <SelectTrigger className="w-full sm:w-44 h-8" aria-label={t("Ruolo di {name}", { name: String(name ?? "") })}>
                        <SelectValue>{roleLabel(row.access_role)}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {row.status === "suspended" ? (
                      <Button size="sm" variant="ghost" disabled={busy}
                        aria-label={t("Riattiva l'accesso di {name}", { name: String(name ?? "") })}
                        onClick={() => rowMut.mutate({ action: "set-status", access_id: row.id, status: "active" })}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                        <span className="ml-1.5 max-sm:sr-only">{t("Riattiva")}</span>
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" disabled={busy}
                        aria-label={t("Sospendi l'accesso di {name}", { name: String(name ?? "") })}
                        onClick={() => rowMut.mutate({ action: "set-status", access_id: row.id, status: "suspended" })}>
                        <Ban className="h-4 w-4" aria-hidden="true" />
                        <span className="ml-1.5 max-sm:sr-only">{t("Sospendi")}</span>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={busy}
                      aria-label={t("Revoca l'accesso di {name}", { name: String(name ?? "") })}
                      onClick={async () => {
                        const ok = await confirm({
                          title: t("Revocare l'accesso di {name}?", { name: String(name ?? "") }),
                          description: t("Non potrà più entrare in questa azienda. Gli accessi che ha alle altre aziende restano."),
                          confirmLabel: t("Revoca l'accesso"),
                          variant: "destructive",
                        });
                        if (ok) rowMut.mutate({ action: "revoke", access_id: row.id });
                      }}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      <span className="ml-1.5 max-sm:sr-only">{t("Revoca")}</span>
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
