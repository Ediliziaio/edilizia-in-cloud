import type { ComponentType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict, format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ArrowRight, CalendarX, ChevronRight, FileClock, Gauge, UserX } from "lucide-react";
import type { DashboardFiltersState } from "@/hooks/useMarketingDashboard";
import { fmt, fmtCur } from "@/components/marketing/dashboard/utils";

/*
 * Tab «Commerciale»: le cose da fare adesso, con il nome e il link.
 *
 * Prima erano quattro numeri di Sales OS fissi sugli ultimi 30 giorni, che
 * ignoravano commerciale e pipeline scelti nella pagina. Ora sono le quattro
 * liste su cui agire (marketing_da_fare, 20281021223000): opportunità ferme,
 * lead mai contattati, appuntamenti senza esito, preventivi senza risposta —
 * le prime 10 di ciascuna, col totale. Le regole sono quelle di Sales OS.
 */

interface Lista<T> { totale: number; valore?: number; voci: T[] }
interface DaFare {
  opportunita_ferme: Lista<{ id: string; nome: string | null; fase: string; giorni: number; valore: number | null; contact_id: string | null; commerciale: string | null }>;
  lead_da_contattare: Lista<{ id: string; nome: string | null; fonte: string | null; arrivato_il: string; commerciale: string | null }>;
  appuntamenti_da_esitare: Lista<{ id: string; titolo: string | null; data: string; contact_id: string | null; commerciale: string | null }>;
  preventivi_in_attesa: Lista<{ id: string; titolo: string | null; imponibile: number; inviato_il: string; contact_id: string | null; commerciale: string | null }>;
}

interface Props {
  filters: DashboardFiltersState;
  assignedUserIds: string[] | null;
}

const fa = (iso: string) => {
  try { return formatDistanceToNowStrict(parseISO(iso), { locale: it, addSuffix: true }); } catch { return ""; }
};

function Riquadro({ icona: Icona, tono, titolo, totale, sotto, vuoto, tutti, children }: {
  icona: ComponentType<{ className?: string }>;
  tono: string;
  titolo: string;
  totale: number;
  sotto?: string;
  vuoto: string;
  tutti?: () => void;
  children: ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Icona className={`h-4 w-4 ${tono}`} />
          <span className="truncate">{titolo}</span>
          <span className="ml-auto text-lg font-bold tabular-nums">{fmt(totale)}</span>
        </CardTitle>
        {sotto && <p className="text-xs text-muted-foreground">{sotto}</p>}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        {totale === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{vuoto}</p>
        ) : (
          <div className="divide-y divide-slate-100">{children}</div>
        )}
        {tutti && totale > 0 && (
          <Button variant="ghost" size="sm" className="mt-auto h-8 justify-between px-2 text-xs" onClick={tutti}>
            Vedi tutti <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Voce({ titolo, dettaglio, destra, onClick }: { titolo: string; dettaglio: string; destra?: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 py-2 text-left hover:bg-slate-50">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{titolo}</span>
        <span className="block truncate text-xs text-muted-foreground">{dettaglio}</span>
      </span>
      {destra && <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-700">{destra}</span>}
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
    </button>
  );
}

export function TabCommerciale({ filters, assignedUserIds }: Props) {
  const { effectiveCompany } = useAuth();
  const permissions = usePermissions();
  const navigate = useNavigate();
  const companyId = effectiveCompany?.id ?? null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketing-da-fare", companyId, assignedUserIds, filters.pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("marketing_da_fare" as never, {
        p_company_id: companyId,
        p_assigned_user_ids: assignedUserIds,
        p_pipeline_id: filters.pipelineId,
      } as never);
      if (error) throw error;
      return data as unknown as DaFare;
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  // un errore non è un caricamento: prima lo scheletro restava lì per sempre
  if (error) {
    return <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">Non riesco a caricare le cose da fare. Riprova tra poco.</p>;
  }
  if (isLoading || !data) {
    return (
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
      </div>
    );
  }

  const chi = (c: string | null) => c ?? "Non assegnato";

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Riquadro
          icona={UserX} tono="text-red-600" titolo="Lead mai contattati"
          totale={data.lead_da_contattare.totale}
          sotto="Arrivati negli ultimi 30 giorni, nessun contatto da oltre 2 ore"
          vuoto="Tutti i lead sono stati contattati."
          tutti={() => navigate("/azienda/marketing/contatti?filter=stale")}
        >
          {data.lead_da_contattare.voci.map((l) => (
            <Voce key={l.id} titolo={l.nome || "Senza nome"} dettaglio={`${l.fonte ?? "Fonte non indicata"} · ${chi(l.commerciale)}`}
              destra={fa(l.arrivato_il)} onClick={() => navigate(`/azienda/marketing/contatti/${l.id}`)} />
          ))}
        </Riquadro>

        <Riquadro
          icona={CalendarX} tono="text-amber-600" titolo="Appuntamenti da esitare"
          totale={data.appuntamenti_da_esitare.totale}
          sotto="Passati (ultimi 60 giorni) e ancora «confermati»: senza esito lo show rate non dice niente"
          vuoto="Tutti gli appuntamenti passati hanno un esito."
          tutti={() => navigate("/azienda/marketing/calendario")}
        >
          {data.appuntamenti_da_esitare.voci.map((a) => (
            <Voce key={a.id} titolo={a.titolo || "Appuntamento"} dettaglio={chi(a.commerciale)}
              destra={format(parseISO(a.data), "d MMM", { locale: it })}
              onClick={() => navigate(a.contact_id ? `/azienda/marketing/contatti/${a.contact_id}` : "/azienda/marketing/calendario")} />
          ))}
        </Riquadro>

        <Riquadro
          icona={AlertTriangle} tono="text-red-600" titolo="Opportunità ferme"
          totale={data.opportunita_ferme.totale}
          sotto={`Oltre la soglia della fase senza attività · ${fmtCur(data.opportunita_ferme.valore ?? 0)} in tutto · le più grandi prima`}
          vuoto="Nessuna opportunità ferma."
          tutti={() => navigate("/azienda/marketing/opportunita")}
        >
          {data.opportunita_ferme.voci.map((o) => (
            <Voce key={o.id} titolo={o.nome || "Opportunità"} dettaglio={`${o.fase} · ferma da ${o.giorni} gg · ${chi(o.commerciale)}`}
              destra={o.valore ? fmtCur(o.valore) : undefined} onClick={() => navigate(`/azienda/marketing/opportunita?apri=${o.id}`)} />
          ))}
        </Riquadro>

        <Riquadro
          icona={FileClock} tono="text-blue-600" titolo="Preventivi senza risposta"
          totale={data.preventivi_in_attesa.totale}
          sotto={`Inviati e non ancora firmati né rifiutati · ${fmtCur(data.preventivi_in_attesa.valore ?? 0)} IVA esclusa`}
          vuoto="Nessun preventivo in attesa di risposta."
          tutti={() => navigate("/azienda/marketing/preventivi")}
        >
          {data.preventivi_in_attesa.voci.map((q) => (
            <Voce key={q.id} titolo={q.titolo || "Preventivo"} dettaglio={`${chi(q.commerciale)} · inviato ${fa(q.inviato_il)}`}
              destra={fmtCur(q.imponibile)} onClick={() => navigate(`/azienda/marketing/preventivi/${q.id}`)} />
          ))}
        </Riquadro>
      </div>

      {permissions.canViewSalesOs && (
        <Button variant="outline" className="h-auto w-full justify-between py-3 text-left max-sm:hidden" onClick={() => navigate("/azienda/marketing/sales-os")}>
          <span className="flex items-center gap-3">
            <Gauge className="h-5 w-5 text-primary shrink-0" />
            <span>
              <span className="block font-medium">Sales OS</span>
              <span className="block text-xs font-normal text-muted-foreground">Forecast, velocity e lead caldi per priorità</span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0" />
        </Button>
      )}
    </div>
  );
}
