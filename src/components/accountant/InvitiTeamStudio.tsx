import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, MailPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { retryAuthorizedRead } from "@/lib/retryAuthorizedRead";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Invito { id: string; email: string; expires_at: string }
const dataIt = { format: (d: Date) => new Intl.DateTimeFormat(intlCampo(), { dateStyle: "medium" }).format(d) };

export function InvitiTeamStudio({ studioId }: { studioId: string }) {
  const t = useT();
  const client = useQueryClient();
  const confirm = useConfirm();
  const [email, setEmail] = useState("");
  const [link, setLink] = useState("");
  const [errore, setErrore] = useState("");
  const chiave = ["accountant", "team-inviti", studioId] as const;
  const stato = useQuery({
    queryKey: chiave,
    retry: retryAuthorizedRead,
    queryFn: async () => {
      const { data: permesso, error } = await supabase.rpc("studio_puo_invitare_team" as never, { p_studio: studioId } as never);
      if (error) throw new Error(error.message);
      if (!permesso) return { puoInvitare: false, inviti: [] as Invito[] };
      const risposta = await supabase.rpc("studio_lista_inviti_team" as never, { p_studio: studioId } as never);
      if (risposta.error) throw new Error(risposta.error.message);
      return { puoInvitare: true, inviti: (risposta.data ?? []) as Invito[] };
    },
  });
  const crea = useMutation({
    mutationFn: async (indirizzo: string) => {
      const { data, error } = await supabase.rpc("studio_crea_invito_team" as never,
        { p_studio: studioId, p_email: indirizzo } as never);
      if (error) throw new Error(error.message);
      const url = new URL("/commercialista/invito", window.location.origin);
      url.searchParams.set("invito", String(data));
      return url.toString();
    },
    onSuccess: (url) => {
      setLink(url);
      setEmail("");
      void client.invalidateQueries({ queryKey: chiave });
    },
    onError: error => setErrore(error.message),
  });
  const revoca = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("studio_revoca_invito_team" as never, { p_studio: studioId, p_invito: id } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { setLink(""); void client.invalidateQueries({ queryKey: chiave }); },
    onError: error => setErrore(error.message),
  });

  if (stato.isError) return <p role="alert" className="text-sm">{t("Impossibile caricare gli inviti.")} <Button size="sm" variant="outline" onClick={() => void stato.refetch()}>{t("Riprova")}</Button></p>;
  if (!stato.data?.puoInvitare) return null;
  return <Card>
    <CardHeader><CardTitle className="flex items-center gap-2 text-base"><MailPlus className="size-4" /> {t("Invita collaboratore")}</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault(); setErrore(""); setLink(""); crea.mutate(email.trim());
      }}>
        <div className="min-w-[15rem] flex-1">
          <label htmlFor="team-email" className="text-sm font-medium">{t("Email del collaboratore")}</label>
          <Input id="team-email" type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} />
        </div>
        <Button type="submit" disabled={crea.isPending}>{t("Genera link d’invito")}</Button>
      </form>
      <p className="text-xs text-muted-foreground">{t("Condividi il link con il collaboratore. Potrà usarlo entro 7 giorni con questa email.")}</p>
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
      {link && <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/40 p-3">
        <Input readOnly value={link} aria-label={t("Link d’invito")} className="min-w-[12rem] flex-1" onFocus={event => event.target.select()} />
        <Button variant="outline" onClick={async () => {
          try { await navigator.clipboard.writeText(link); toast.success(t("Link copiato")); }
          catch { setErrore(t("Seleziona il link e copialo manualmente.")); }
        }}><Copy className="size-4" /> {t("Copia link")}</Button>
      </div>}
      {stato.data.inviti.length > 0 && <ul className="divide-y rounded-lg border">
        {stato.data.inviti.map(invito => <li key={invito.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
          <span className="break-all">{invito.email}</span>
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t("Scadenza {data}", { data: dataIt.format(new Date(invito.expires_at)) })}</Badge>
            <Button variant="ghost" size="sm" disabled={revoca.isPending} onClick={async () => {
              if (await confirm({ title: t("Revocare l’invito per {email}?", { email: String(invito.email ?? "") }), confirmLabel: t("Revoca"), variant: "destructive" })) {
                setErrore(""); revoca.mutate(invito.id);
              }
            }}>{t("Revoca")}</Button>
          </span>
        </li>)}
      </ul>}
    </CardContent>
  </Card>;
}
