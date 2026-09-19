/**
 * Facebook e Instagram per i brand della piattaforma (19/09/2026).
 *
 * «I lead delle mie sponsorizzate vorrei che finissero nell'area del
 * superadmin, per il brand mio, separata dalle aziende.» Il collegamento
 * Facebook esisteva solo nelle impostazioni di un'azienda: la pagina «Flo»
 * era rimasta agganciata a Demo Azienda, col collegamento scaduto dall'08/06,
 * e i lead si fermavano lì.
 *
 * Qui lo stesso wizard delle aziende (login Facebook → pagine → moduli →
 * pipeline) lavora per il CRM della piattaforma: i lead diventano contatti e
 * opportunità in /admin/marketing, nella pipeline del brand scelta per ogni
 * modulo.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { MetaAssetLogo } from "@/components/integrations/brand-logos";
import { MetaIntegrationWizard } from "@/components/integrations/MetaIntegrationWizard";
import { MetaTroubleshootDialog } from "@/components/integrations/MetaTroubleshootDialog";
import { MetaCompanyProvider } from "@/components/integrations/metaCompanyContext";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import type { Integration, MetaWizardStep } from "@/types/integrations";

const PIATTAFORMA = PLATFORM_ADMIN_COMPANY_ID;

function statoCollegamento(i: Integration | null): { testo: string; tono: "ok" | "attenzione" | "spento" } {
  if (!i) return { testo: "Non collegato", tono: "spento" };
  if (i.status === "connected") return { testo: "Collegato", tono: "ok" };
  if (i.status === "token_expired") return { testo: "Collegamento scaduto", tono: "attenzione" };
  if (i.status === "error") return { testo: "Collegamento in errore", tono: "attenzione" };
  return { testo: "Non collegato", tono: "spento" };
}

export default function AdminMetaLeadsCard() {
  // null = wizard chiuso; altrimenti il passo da cui aprirlo.
  const [passo, setPasso] = useState<MetaWizardStep | null>(null);
  // «Risolvi problemi»: permessi, pagine mancanti e recupero dei lead degli
  // ultimi giorni — quelli rimasti fermi mentre la pagina era altrove.
  const [problemiAperto, setProblemiAperto] = useState(false);

  const integrazioneQ = useQuery({
    queryKey: ["integrations", PIATTAFORMA, "meta"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integrations")
        .select("*")
        .eq("company_id", PIATTAFORMA)
        .eq("provider", "meta")
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Integration | null;
    },
  });
  const integrazione = integrazioneQ.data ?? null;

  const collegamentoQ = useQuery({
    queryKey: ["meta-piattaforma-pagine-moduli", integrazione?.id],
    enabled: !!integrazione?.id,
    queryFn: async () => {
      const [pagine, moduli] = await Promise.all([
        supabase.from("meta_assets").select("asset_name")
          .eq("company_id", PIATTAFORMA).eq("asset_type", "page").eq("selected", true),
        supabase.from("meta_lead_forms").select("form_name")
          .eq("company_id", PIATTAFORMA).eq("status", "active"),
      ]);
      if (pagine.error) throw pagine.error;
      if (moduli.error) throw moduli.error;
      return {
        pagine: (pagine.data ?? []).map((p) => p.asset_name as string | null).filter(Boolean) as string[],
        moduliAttivi: (moduli.data ?? []).length,
      };
    },
  });

  const stato = statoCollegamento(integrazione);
  const collegato = integrazione?.status === "connected";
  const aggiorna = () => {
    void integrazioneQ.refetch();
    void collegamentoQ.refetch();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <MetaAssetLogo className="h-9 w-9 shrink-0" />
            <div>
              <CardTitle className="text-base">Facebook e Instagram — lead dei tuoi brand</CardTitle>
              <CardDescription>
                I lead delle sponsorizzate delle tue pagine arrivano qui, nel CRM della piattaforma, non in un'azienda cliente.
              </CardDescription>
            </div>
          </div>
          <Badge
            variant={stato.tono === "ok" ? "default" : stato.tono === "attenzione" ? "destructive" : "secondary"}
            className="shrink-0"
          >
            {stato.testo}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {integrazioneQ.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Controllo il collegamento…
          </div>
        ) : integrazioneQ.isError ? (
          <p className="text-sm text-destructive">
            Non riesco a leggere il collegamento: {(integrazioneQ.error as Error)?.message}
          </p>
        ) : integrazione ? (
          <dl className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-muted-foreground">Pagine</dt>
            <dd>
              {collegamentoQ.data?.pagine.length
                ? collegamentoQ.data.pagine.join(", ")
                : "nessuna pagina scelta"}
            </dd>
            <dt className="text-muted-foreground">Moduli attivi</dt>
            <dd>{collegamentoQ.data ? collegamentoQ.data.moduliAttivi : "—"}</dd>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            Accedi con Facebook, scegli le pagine dei tuoi brand e i moduli: per ogni modulo decidi in quale pipeline
            entrano i lead (Marketing Edile, Edilizia.io, Florin Andriciuc…).
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {!collegato ? (
            <Button size="sm" onClick={() => setPasso("oauth")} disabled={integrazioneQ.isLoading}>
              {integrazione ? "Ricollega Facebook" : "Collega con Facebook"}
            </Button>
          ) : (
            <>
              <Button size="sm" onClick={() => setPasso("pages")}>Pagine</Button>
              <Button size="sm" variant="outline" onClick={() => setPasso("forms")}>Moduli e pipeline</Button>
              <Button size="sm" variant="outline" onClick={() => setProblemiAperto(true)}>
                Recupera lead e risolvi problemi
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPasso("oauth")}>Ricollega</Button>
            </>
          )}
        </div>
      </CardContent>

      <MetaCompanyProvider companyId={PIATTAFORMA}>
        <MetaIntegrationWizard
          open={passo !== null}
          onOpenChange={(aperto) => { if (!aperto) setPasso(null); }}
          integration={integrazione}
          initialStep={passo ?? undefined}
          onComplete={aggiorna}
        />
        <MetaTroubleshootDialog
          open={problemiAperto}
          onOpenChange={setProblemiAperto}
          integration={integrazione}
          onReconnect={() => { setProblemiAperto(false); setPasso("oauth"); }}
        />
      </MetaCompanyProvider>
    </Card>
  );
}
