import { Suspense, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Handshake, HardHat } from "lucide-react";
import { lazyWithRetry as lazy } from "@/lib/lazyWithRetry";
import { usePermissions } from "@/hooks/usePermissions";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { FeatureRoute } from "@/components/auth/FeatureRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { tipoCalendario, CHIAVE_TIPO_CALENDARIO, type TipoCalendario } from "@/lib/calendar/calendarioUnico";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const CalendarioLavori = lazy(() => import("@/pages/azienda/Calendar"));
const CalendarioCommerciale = lazy(() => import("@/pages/azienda/marketing/MarketingCalendar"));

function Caricamento() {
  const t = useT();
  return (
    <div className="space-y-3" aria-busy="true" aria-label={t("Caricamento calendario")}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/**
 * Un solo «Calendario» (decisione del founder, 23/11/2026). Prima c'erano due voci,
 * «Calendario» (lavori: cantieri, squadre, appuntamenti di cantiere) e «Calendario CRM»
 * (appuntamenti commerciali, esito, venditori), con due testate e due modi di lavorare.
 *
 * Ognuno vede il suo: chi ha solo il CRM vede gli appuntamenti commerciali, chi ha solo i
 * lavori vede i lavori; chi li ha entrambi sceglie in alto, e la scelta resta ricordata.
 * I due calendari restano due motori: qui si sceglie quale mostrare, con un indirizzo solo.
 */
export default function CalendarioUnico() {
  const t = useT();
  const permissions = usePermissions();
  const crm = useFeatureAccess("crm_modulo");
  const [searchParams, setSearchParams] = useSearchParams();

  const pronto = !permissions.isLoading && !crm.isLoading;
  const vedeLavori = permissions.canViewCalendar;
  const vedeCommerciale = permissions.canViewMarketingAppointments && (crm.isEnabled || crm.isPreview);
  let ricordato: string | null = null;
  try { ricordato = localStorage.getItem(CHIAVE_TIPO_CALENDARIO); } catch { /* archivio non disponibile */ }
  const tipo = tipoCalendario({ vedeLavori, vedeCommerciale, richiesto: searchParams.get("tipo"), ricordato });

  // Il tipo sta sempre nell'indirizzo: la barra in basso ci legge se mostrare quella del
  // commerciale, e un link senza «?tipo=» la faceva cambiare sotto il pollice.
  const richiesto = searchParams.get("tipo");
  useEffect(() => {
    if (!pronto || richiesto === tipo) return;
    setSearchParams((attuali) => {
      const prossimi = new URLSearchParams(attuali);
      prossimi.set("tipo", tipo);
      return prossimi;
    }, { replace: true });
  }, [pronto, richiesto, tipo, setSearchParams]);

  if (!pronto) return <Caricamento />;

  const scegli = (scelto: TipoCalendario) => {
    if (scelto === tipo) return;
    try { localStorage.setItem(CHIAVE_TIPO_CALENDARIO, scelto); } catch { /* resta per questa visita */ }
    // I parametri dell'altro calendario (vista, mappa, filtri) non valgono qui.
    setSearchParams({ tipo: scelto }, { replace: true });
  };

  return (
    <div className="space-y-3">
      {vedeLavori && vedeCommerciale && (
        <div role="tablist" aria-label={t("Quale calendario")} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:inline-grid sm:w-auto">
          {([
            ["lavori", "Lavori", HardHat],
            ["commerciali", "Commerciali", Handshake],
          ] as const).map(([valore, etichetta, Icona]) => (
            <button
              key={valore}
              type="button"
              role="tab"
              aria-selected={tipo === valore}
              onClick={() => scegli(valore)}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 rounded-md px-4 text-sm transition-colors",
                tipo === valore ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icona className="h-4 w-4" aria-hidden="true" />
              {t(etichetta)}
            </button>
          ))}
        </div>
      )}
      <Suspense fallback={<Caricamento />}>
        {tipo === "commerciali" ? (
          <FeatureRoute featureKey="crm_modulo"><CalendarioCommerciale /></FeatureRoute>
        ) : (
          <ErrorBoundary title={t("Errore nel caricamento calendario")}><CalendarioLavori /></ErrorBoundary>
        )}
      </Suspense>
    </div>
  );
}
