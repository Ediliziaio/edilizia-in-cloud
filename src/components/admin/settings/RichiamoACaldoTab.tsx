/**
 * RichiamoACaldoTab — l'interruttore generale del richiamo vocale ai lead.
 *
 * Sta spento e ci resta finché non lo si accende da qui. Accanto
 * all'interruttore c'è quello che succederà davvero premendolo: quanti lead
 * hanno dato il consenso e stanno aspettando, e quante aziende hanno un agente
 * pronto a chiamarli. Un interruttore che non dice cosa accende è un
 * interruttore che nessuno osa toccare.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PhoneOutgoing, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

const CHIAVE = "richiamo_a_caldo_attivo";

export function RichiamoACaldoTab() {
  const qc = useQueryClient();
  const [inCorso, setInCorso] = useState(false);

  const stato = useQuery({
    queryKey: ["admin", "richiamo-a-caldo", "interruttore"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", CHIAVE)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // Assente vale spento: se la riga sparisce non si riparte per sbaglio.
      return String(data?.value ?? "false").trim().toLowerCase() === "true";
    },
  });

  // Cosa troverà acceso: lead che hanno detto sì e aziende con un agente pronto.
  const pronti = useQuery({
    queryKey: ["admin", "richiamo-a-caldo", "pronti"],
    staleTime: 30_000,
    queryFn: async () => {
      const settegiorni = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const [lead, agenti] = await Promise.all([
        supabase
          .from("marketing_opportunities")
          .select("id, marketing_contacts!inner(marketing_consent, optout_call, phone)", { count: "exact", head: false })
          .in("status", ["open", "new"])
          .is("deleted_at", null)
          .gte("created_at", settegiorni)
          .eq("marketing_contacts.marketing_consent", true)
          .limit(500),
        supabase
          .from("ai_agents_v2")
          .select("company_id")
          .eq("stato", "attivo")
          .not("elevenlabs_agent_id", "is", null)
          .limit(200),
      ]);
      const leadPronti = (lead.data ?? []).filter((r) => {
        const c = (r as { marketing_contacts?: { optout_call?: boolean; phone?: string | null } }).marketing_contacts;
        return c && c.optout_call !== true && (c.phone ?? "").replace(/\s/g, "").length >= 9;
      }).length;
      const aziendeConAgente = new Set((agenti.data ?? []).map((a) => a.company_id as string)).size;
      return { leadPronti, aziendeConAgente };
    },
  });

  const cambia = useMutation({
    mutationFn: async (acceso: boolean) => {
      const { data, error } = await supabase
        .from("platform_settings")
        .upsert({ key: CHIAVE, value: acceso ? "true" : "false", updated_at: new Date().toISOString() }, { onConflict: "key" })
        .select("key");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("Salvataggio bloccato (0 righe). Verifica di essere super admin.");
      return acceso;
    },
    onSuccess: (acceso) => {
      toast.success(
        acceso
          ? "Richiamo a caldo acceso: da ora l'assistente propone le chiamate ai lead che hanno dato il consenso."
          : "Richiamo a caldo spento: nessuna chiamata verrà più proposta.",
      );
      void qc.invalidateQueries({ queryKey: ["admin", "richiamo-a-caldo"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const acceso = stato.data === true;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PhoneOutgoing className="h-4 w-4" /> Richiamo a caldo
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Quando un lead lascia una richiesta, l'assistente vocale lo richiama entro pochi minuti, gli fa le domande
            di qualifica e passa la chiamata a un collega libero.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{stato.isLoading ? "…" : acceso ? "Acceso" : "Spento"}</p>
                {!stato.isLoading && (
                  <Badge variant={acceso ? "default" : "secondary"}>
                    {acceso ? "Le chiamate vengono proposte" : "Non viene chiamato nessuno"}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {acceso
                  ? "Ogni cinque minuti il sistema cerca i lead nuovi da richiamare."
                  : "Il sistema non guarda nemmeno i lead. Accendilo quando vuoi che cominci."}
              </p>
            </div>
            <Switch
              checked={acceso}
              disabled={stato.isLoading || inCorso}
              onCheckedChange={(v) => {
                setInCorso(true);
                cambia.mutate(v, { onSettled: () => setInCorso(false) });
              }}
              aria-label="Richiamo a caldo attivo"
            />
          </div>

          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Cosa trova acceso, adesso
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold tabular-nums">{pronti.data?.leadPronti ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  lead degli ultimi 7 giorni che hanno dato il consenso e hanno un numero
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-2xl font-semibold tabular-nums">{pronti.data?.aziendeConAgente ?? "—"}</p>
                <p className="text-xs text-muted-foreground">aziende con un agente vocale pronto a chiamare</p>
              </div>
            </div>
            {pronti.data && pronti.data.aziendeConAgente === 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-500">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Nessuna azienda ha ancora un agente vocale collegato a un numero: acceso, il sistema non chiamerebbe
                comunque nessuno. Serve prima la chiave ElevenLabs e un numero Telnyx.
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" /> Chi viene chiamato, e chi no
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Solo chi ha dato un consenso esplicito a essere ricontattato. Una voce automatica che chiama senza
              operatore richiede l'opt-in preventivo: non basta l'assenza dal Registro delle Opposizioni, che vale per
              le telefonate fatte da una persona. Chi non ha dato il consenso resta lavorabile a mano dal commerciale.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
