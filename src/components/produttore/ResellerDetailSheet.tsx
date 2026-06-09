import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { companyStatusLabelIt } from "@/lib/companyStatusLabel";
import {
  Mail, Users, Briefcase, Contact, Clock, Link2, Pencil, Check, X, Package,
  Factory, CreditCard, CircleCheck, CircleDashed, AlertCircle, Copy, Loader2,
} from "lucide-react";

interface DetailData {
  success?: boolean;
  error?: string;
  reseller: {
    id: string; name: string; email: string | null; status: string | null;
    billing_comped: boolean | null; payment_method: string | null; created_at: string;
    plan_name: string | null; plan_price: number;
  };
  invite: { email: string | null; confirmed: boolean; last_sign_in_at: string | null } | null;
  counts: { users: number | null; orders: number | null; customers: number | null };
  activity: { event_type: string; notes: string | null; created_at: string }[];
}

/**
 * Sheet di dettaglio/gestione di un rivenditore (aperto dalla dashboard).
 * Dati via edge function get-reseller-detail (service role + guardia anti-IDOR).
 * Azioni: rinomina (update-reseller) e link d'accesso (resend-reseller-invite).
 * Piano / chi paga / stato restano nel menù ⋮ dell'elenco.
 */
export function ResellerDetailSheet({
  target, onOpenChange, onMutated,
}: {
  target: { id: string; name: string } | null;
  onOpenChange: (open: boolean) => void;
  onMutated: () => void;
}) {
  const resellerId = target?.id ?? null;
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [accessLink, setAccessLink] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reseller-detail", resellerId],
    enabled: !!resellerId,
    queryFn: async (): Promise<DetailData> => {
      const { data, error } = await supabase.functions.invoke("get-reseller-detail", {
        body: { reseller_id: resellerId },
      });
      if (error) throw new Error(error.message);
      const r = data as DetailData | null;
      if (!r || r.success === false) throw new Error(r?.error ?? "Errore nel caricamento");
      return r;
    },
  });

  const rename = useMutation({
    mutationFn: async (name: string) => {
      const n = name.trim();
      if (!n) throw new Error("Il nome è obbligatorio");
      const { data: res, error } = await supabase.functions.invoke("update-reseller", {
        body: { reseller_id: resellerId, name: n },
      });
      if (error) throw new Error(error.message);
      const r = res as { success?: boolean; error?: string } | null;
      if (r && r.success === false) throw new Error(r.error ?? "Rinomina fallita");
    },
    onSuccess: () => { toast.success("Rivenditore rinominato"); setEditingName(false); refetch(); onMutated(); },
    onError: (e) => toast.error("Rinomina fallita", { description: (e as Error).message }),
  });

  const resend = useMutation({
    mutationFn: async () => {
      const { data: res, error } = await supabase.functions.invoke("resend-reseller-invite", {
        body: { reseller_id: resellerId },
      });
      if (error) throw new Error(error.message);
      const r = res as { success?: boolean; error?: string; action_link?: string } | null;
      if (!r || r.success === false) throw new Error(r?.error ?? "Operazione fallita");
      return r.action_link ?? null;
    },
    onSuccess: (link) => { setAccessLink(link); toast.success("Link d'accesso generato"); },
    onError: (e) => toast.error("Operazione fallita", { description: (e as Error).message }),
  });

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success("Copiato negli appunti"); }
    catch { toast.error("Impossibile copiare"); }
  };

  const reset = () => { setEditingName(false); setAccessLink(null); };
  const r = data?.reseller;

  return (
    <Sheet open={!!target} onOpenChange={(o) => { if (!o) { onOpenChange(false); reset(); } }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{target?.name}</SheetTitle>
          <SheetDescription>Dettaglio e gestione del rivenditore.</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="mt-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : isError ? (
          <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center text-sm">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-destructive opacity-70" />
            Errore nel caricamento.{" "}
            <Button variant="link" size="sm" className="px-1" onClick={() => refetch()}>Riprova</Button>
          </div>
        ) : r && data ? (
          <div className="mt-6 space-y-5">
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={r.status === "active" ? "default" : r.status === "suspended" ? "destructive" : "secondary"}>
                {companyStatusLabelIt(r.status)}
              </Badge>
              {r.plan_name && (
                <Badge variant="outline" className="gap-1">
                  <Package className="h-3.5 w-3.5" /> {r.plan_name}
                  {r.plan_price > 0 && <span className="text-muted-foreground">· €{r.plan_price}/mese</span>}
                </Badge>
              )}
              {r.billing_comped ? (
                <Badge variant="outline" className="gap-1 border-amber-200 text-amber-700"><Factory className="h-3.5 w-3.5" /> Paghi tu</Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-blue-200 text-blue-700"><CreditCard className="h-3.5 w-3.5" /> Paga lui</Badge>
              )}
            </div>

            <Section title="Nome">
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} className="h-8" autoFocus />
                  <Button size="icon" className="h-8 w-8 shrink-0" disabled={rename.isPending} onClick={() => rename.mutate(nameDraft)} aria-label="Salva nome">
                    {rename.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setEditingName(false)} aria-label="Annulla"><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm">{r.name}</span>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => { setNameDraft(r.name); setEditingName(true); }}>
                    <Pencil className="h-3.5 w-3.5" /> Rinomina
                  </Button>
                </div>
              )}
            </Section>

            <Section title="Contatto admin">
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{data.invite?.email ?? r.email ?? "—"}</span></div>
                <div className="flex items-center gap-2">
                  {data.invite?.confirmed
                    ? <><CircleCheck className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">Accesso attivo</span></>
                    : <><CircleDashed className="h-4 w-4 text-amber-600" /><span className="text-amber-700">Invito in attesa</span></>}
                </div>
                {data.invite?.last_sign_in_at && (
                  <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /> Ultimo accesso: {new Date(data.invite.last_sign_in_at).toLocaleDateString("it-IT")}</div>
                )}
              </div>
              <div className="mt-2.5">
                <Button size="sm" variant="outline" className="gap-1.5" disabled={resend.isPending} onClick={() => resend.mutate()}>
                  {resend.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  {data.invite?.confirmed ? "Genera link reset" : "Reinvita / Link d'accesso"}
                </Button>
                {accessLink && (
                  <div className="mt-2 flex items-center gap-1.5">
                    <Input readOnly value={accessLink} className="h-8 text-xs" onFocus={(e) => e.currentTarget.select()} />
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => copy(accessLink)} aria-label="Copia link"><Copy className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </Section>

            <Section title="Utilizzo">
              <div className="grid grid-cols-3 gap-2">
                <Stat icon={<Users className="h-4 w-4" />} label="Utenti" value={data.counts.users} />
                <Stat icon={<Briefcase className="h-4 w-4" />} label="Commesse" value={data.counts.orders} />
                <Stat icon={<Contact className="h-4 w-4" />} label="Clienti" value={data.counts.customers} />
              </div>
            </Section>

            {data.activity.length > 0 && (
              <Section title="Attività recente">
                <ul className="space-y-2">
                  {data.activity.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div>{a.notes ?? a.event_type}</div>
                        <div className="text-muted-foreground">{new Date(a.created_at).toLocaleString("it-IT")}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <p className="text-xs text-muted-foreground">
              Creato il {new Date(r.created_at).toLocaleDateString("it-IT")} · Per cambiare piano, chi paga o stato usa il menù ⋮ nell&apos;elenco.
            </p>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | null }) {
  return (
    <div className="rounded-lg border bg-card p-2.5 text-center">
      <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">{icon}</div>
      <div className="text-lg font-bold leading-none">{value ?? "—"}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
