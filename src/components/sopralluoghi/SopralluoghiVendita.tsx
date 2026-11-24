/**
 * I sopralluoghi nelle Vendite: scheda dell'opportunità e del contatto (piano sopralluoghi, lotto 3).
 *
 * Prima il rilievo poteva essere legato a contatto e opportunità ma in Vendite non si vedeva:
 * stava solo sotto Commesse. Qui si vedono quelli dell'opportunità e, sotto, gli altri dello
 * stesso contatto; da qui si crea quello commerciale (o il tecnico, se serve già preciso).
 */
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { ClipboardCheck, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { usePermissions } from "@/hooks/usePermissions";
import { Button } from "@/components/ui/button";
import { TipoSopralluogoBadge } from "@/components/sopralluoghi/TipoSopralluogoBadge";
import { SURVEY_STATUS } from "@/lib/surveys/report";
import { ordinaRilieviVendita, percorsoNuovoSopralluogo, type RilievoVendita } from "@/lib/sopralluoghi/vendita";

const giorno = (v: string | null) => (v ? format(new Date(v), "d MMM yyyy", { locale: it }) : null);

export function SopralluoghiVendita({ companyId, contactId, opportunityId }: {
  companyId: string; contactId: string | null; opportunityId?: string | null;
}) {
  const navigate = useNavigate();
  const { isFeatureEnabled } = useFeatureFlags();
  const { canViewSopralluoghi, solaLettura } = usePermissions();
  const attivo = isFeatureEnabled("surveys_module") && canViewSopralluoghi && !!(contactId || opportunityId);
  const rilievi = useQuery({
    queryKey: ["sopralluoghi-vendita", companyId, contactId, opportunityId],
    enabled: attivo,
    queryFn: async (): Promise<RilievoVendita[]> => {
      const filtri = [contactId ? `contact_id.eq.${contactId}` : "", opportunityId ? `opportunity_id.eq.${opportunityId}` : ""].filter(Boolean).join(",");
      const { data, error } = await supabase.from("surveys")
        .select("id, code, status, tipo, scheduled_at, completed_at, opportunity_id, order_id, estimate_id, created_at")
        .eq("company_id", companyId).is("deleted_at", null).or(filtri).limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RilievoVendita[];
    },
  });
  if (!attivo) return null;
  const righe = ordinaRilieviVendita(rilievi.data ?? [], opportunityId);
  return (
    <section aria-label="Sopralluoghi" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-orange-500" />Sopralluoghi</h3>
        {/* La bacheca non ha una voce nelle Vendite (scelta del menu, test sidebarMenuStability):
            ci si arriva da qui, già filtrata sui commerciali. */}
        <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => navigate("/azienda/sopralluoghi?sop_tipo=commerciali")}>Tutti i sopralluoghi</Button>
        {!solaLettura && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => navigate(percorsoNuovoSopralluogo(contactId, opportunityId, "commerciale"))}>
              <Plus className="mr-1.5 h-4 w-4" />Sopralluogo commerciale
            </Button>
            <Button size="sm" variant="outline" onClick={() => navigate(percorsoNuovoSopralluogo(contactId, opportunityId, "tecnico"))}>
              Rilievo tecnico
            </Button>
          </div>
        )}
      </div>
      {rilievi.isLoading && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carico i sopralluoghi…</p>}
      {rilievi.isError && <p role="alert" className="text-sm text-amber-800">Sopralluoghi non disponibili. Riprova tra poco.</p>}
      {!rilievi.isLoading && !rilievi.isError && righe.length === 0 && (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nessun sopralluogo. Fissalo da «Appuntamento» con il rilievo pronto, oppure crealo qui.
        </p>
      )}
      {righe.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {righe.map((r) => (
            <li key={r.id}>
              <button type="button" className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left hover:bg-muted/40"
                onClick={() => navigate(`/azienda/sopralluoghi/${r.id}`)}>
                <span className="font-mono text-xs font-semibold text-primary">{r.code ?? "Sopralluogo"}</span>
                <TipoSopralluogoBadge tipo={r.tipo} />
                <span className="text-xs text-muted-foreground">{SURVEY_STATUS[r.status as keyof typeof SURVEY_STATUS] ?? r.status}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {r.completed_at ? `Fatto il ${giorno(r.completed_at)}` : r.scheduled_at ? `Fissato il ${giorno(r.scheduled_at)}` : "Da fissare"}
                </span>
                {(opportunityId && r.opportunity_id !== opportunityId) && <span className="w-full text-[11px] text-muted-foreground">Dello stesso contatto, su un'altra trattativa</span>}
                {(r.estimate_id || r.order_id) && <span className="w-full text-[11px] text-emerald-700">{r.order_id ? "Collegato a una commessa" : "Ha già un preventivo"}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
