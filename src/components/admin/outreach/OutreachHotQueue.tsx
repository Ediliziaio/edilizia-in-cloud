/**
 * OutreachHotQueue — coda calda unificata per "Oggi": risposte interessate
 * di ENTRAMBI i canali (email outreach + WhatsApp Locale), in un'unica
 * lista ordinata per calore, con lo stato "già un'opportunità" visibile a
 * colpo d'occhio. Sostituisce OutreachInboxPreview (solo email, ordinata
 * per non-letto invece che per interesse) + OutreachActivityFeed (log
 * piatto, cieco su WhatsApp): "non letto" non è il criterio giusto — una
 * risposta interessata già letta da qualcuno resta prioritaria finché non
 * è stata gestita.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Flame, ArrowRight, AlertTriangle, MailOpen, Mail, MessageCircle, Sparkles } from "lucide-react";
import { OutreachConvertContactDialog } from "./OutreachConvertContactDialog";

interface VoceCalda {
  id: string;
  canale: "email" | "whatsapp";
  contactId: string;
  nome: string;
  frammento: string | null;
  intento: "interessato" | "domanda";
  quando: string;
  opportunitaId: string | null;
}

async function contattiEOpportunita(companyId: string, contactIds: string[]) {
  if (contactIds.length === 0) {
    return {
      contattoById: new Map<string, { first_name: string; last_name: string | null; company_name: string | null }>(),
      oppByContatto: new Map<string, string>(),
    };
  }
  const [{ data: contatti }, { data: opp }] = await Promise.all([
    supabase.from("marketing_contacts").select("id, first_name, last_name, company_name").in("id", contactIds),
    supabase.from("marketing_opportunities").select("id, contact_id").eq("company_id", companyId).eq("status", "open").in("contact_id", contactIds),
  ]);
  const contattoById = new Map((contatti ?? []).map((c) => [c.id, c] as const));
  const oppByContatto = new Map((opp ?? []).map((o) => [o.contact_id, o.id] as const));
  return { contattoById, oppByContatto };
}

function nomeContatto(c: { first_name?: string | null; last_name?: string | null; company_name?: string | null } | undefined): string {
  if (!c) return "Contatto";
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company_name || "Contatto";
}

function useVociEmail(companyId: string) {
  return useQuery({
    queryKey: ["outreach-hot-queue", "email", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<VoceCalda[]> => {
      // outreach_replies non è ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("outreach_replies")
        .select("id, contact_id, snippet, intent, received_at")
        .eq("company_id", companyId)
        .in("intent", ["interested", "question"])
        .order("received_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ id: string; contact_id: string | null; snippet: string | null; intent: string; received_at: string }>;
      const contactIds = [...new Set(righe.map((r) => r.contact_id).filter((id): id is string => !!id))];
      const { contattoById, oppByContatto } = await contattiEOpportunita(companyId, contactIds);
      return righe
        .filter((r): r is typeof r & { contact_id: string } => !!r.contact_id)
        .map((r) => ({
          id: `email-${r.id}`,
          canale: "email" as const,
          contactId: r.contact_id,
          nome: nomeContatto(contattoById.get(r.contact_id)),
          frammento: r.snippet,
          intento: r.intent === "interested" ? ("interessato" as const) : ("domanda" as const),
          quando: r.received_at,
          opportunitaId: oppByContatto.get(r.contact_id) ?? null,
        }));
    },
  });
}

function useVociWhatsapp(companyId: string) {
  return useQuery({
    queryKey: ["outreach-hot-queue", "whatsapp", companyId],
    staleTime: 30_000,
    queryFn: async (): Promise<VoceCalda[]> => {
      // openwa_* non è ancora nei tipi generati.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const db = supabase as any;
      const { data, error } = await db
        .from("openwa_campagna_destinatari")
        .select("id, contact_id, esito, esito_at")
        .in("esito", ["appuntamento", "da_ricontattare"])
        .order("esito_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const righe = (data ?? []) as Array<{ id: string; contact_id: string | null; esito: string; esito_at: string | null }>;
      const contactIds = [...new Set(righe.map((r) => r.contact_id).filter((id): id is string => !!id))];
      if (contactIds.length === 0) return [];
      const [{ contattoById, oppByContatto }, { data: msgs }] = await Promise.all([
        contattiEOpportunita(companyId, contactIds),
        db.from("openwa_messages").select("contact_id, body, created_at")
          .in("contact_id", contactIds).eq("direction", "inbound").order("created_at", { ascending: false }),
      ]);
      const ultimoMsgPerContatto = new Map<string, string>();
      for (const m of (msgs ?? []) as Array<{ contact_id: string | null; body: string | null }>) {
        if (m.contact_id && m.body && !ultimoMsgPerContatto.has(m.contact_id)) ultimoMsgPerContatto.set(m.contact_id, m.body);
      }
      return righe
        .filter((r): r is typeof r & { contact_id: string } => !!r.contact_id)
        .map((r) => ({
          id: `whatsapp-${r.id}`,
          canale: "whatsapp" as const,
          contactId: r.contact_id,
          nome: nomeContatto(contattoById.get(r.contact_id)),
          frammento: ultimoMsgPerContatto.get(r.contact_id) ?? null,
          intento: r.esito === "appuntamento" ? ("interessato" as const) : ("domanda" as const),
          quando: r.esito_at ?? new Date(0).toISOString(),
          opportunitaId: oppByContatto.get(r.contact_id) ?? null,
        }));
    },
  });
}

export function OutreachHotQueue({ companyId, onOpenMailbox }: { companyId: string; onOpenMailbox: () => void }) {
  const email = useVociEmail(companyId);
  const whatsapp = useVociWhatsapp(companyId);
  const isLoading = email.isLoading || whatsapp.isLoading;
  const errored = !!email.error || !!whatsapp.error;

  const voci = useMemo(() => {
    const tutte = [...(email.data ?? []), ...(whatsapp.data ?? [])];
    return tutte.sort((a, b) => {
      if (a.intento !== b.intento) return a.intento === "interessato" ? -1 : 1;
      return new Date(b.quando).getTime() - new Date(a.quando).getTime();
    });
  }, [email.data, whatsapp.data]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Flame className="h-4 w-4 text-primary" />
          </span>
          Risposte calde
          {voci.length > 0 && <Badge className="h-5 min-w-5 justify-center bg-primary px-1.5 tabular-nums">{voci.length}</Badge>}
        </CardTitle>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={onOpenMailbox}>
          Apri la Posta <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-1/3" /><Skeleton className="h-3 w-2/3" /></div>
              </div>
            ))}
          </div>
        ) : errored ? (
          <div className="flex items-center gap-2 px-5 py-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Errore nel caricamento delle risposte calde.
          </div>
        ) : voci.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MailOpen className="h-6 w-6 text-muted-foreground/60" />
            </span>
            <p className="text-sm font-medium">Tutto sotto controllo</p>
            <p className="text-xs text-muted-foreground">Nessuna risposta calda al momento, su nessuno dei due canali.</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {voci.slice(0, 8).map((v) => (
              <li key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className={cn("text-xs", v.canale === "email" ? "bg-primary/10 text-primary" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300")}>
                    {v.canale === "email" ? <Mail className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{v.nome}</span>
                    <Badge
                      variant="outline"
                      className={cn("shrink-0 text-[10px]", v.intento === "interessato" && "border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400")}
                    >
                      {v.intento === "interessato" ? "Interessato" : "Domanda"}
                    </Badge>
                  </div>
                  {v.frammento && <p className="truncate text-xs text-muted-foreground">«{v.frammento}»</p>}
                </div>
                <div className="shrink-0 text-right">
                  {v.opportunitaId ? (
                    <Link
                      to={`/admin/marketing/opportunita?apri=${v.opportunitaId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                    >
                      <Sparkles className="h-3 w-3" /> Opportunità
                    </Link>
                  ) : (
                    <OutreachConvertContactDialog
                      companyId={companyId}
                      initialContactId={v.contactId}
                      trigger={<Button size="sm" variant="outline" className="h-7 px-2 text-xs">Crea opportunità</Button>}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
