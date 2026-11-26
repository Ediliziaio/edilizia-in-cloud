import { Suspense, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
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
import { useIsMobile } from "@/hooks/use-mobile";

/** Indirizzo proprio del calendario commerciale (voce «Calendario commerciale» in Marketing & Vendita). */
export const URL_CALENDARIO_COMMERCIALE = "/azienda/marketing/calendario";

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
 *
 * 25/11/2026 (Florin): da computer e tablet sono DUE calendari separati, ognuno con la sua voce nel menu.
 * «Calendario commerciale» ha il suo indirizzo (/azienda/marketing/calendario, `fisso="commerciali"`) e
 * mostra solo il commerciale; «Calendario» in Cantieri & Lavori mostra solo i lavori. Prima la voce
 * commerciale apriva /azienda/calendario?tipo=commerciali: il menu accendeva «Calendario» di Cantieri,
 * la testata diceva «Cantieri & Lavori» e c'era la scelta Lavori/Commerciali in alto. La scelta resta
 * solo sul telefono, dove il menu laterale non c'è.
 */
export default function CalendarioUnico({ fisso }: { fisso?: TipoCalendario } = {}) {
  const t = useT();
  const permissions = usePermissions();
  const crm = useFeatureAccess("crm_modulo");
  const [searchParams, setSearchParams] = useSearchParams();
  const telefono = useIsMobile();

  const pronto = !permissions.isLoading && !crm.isLoading;
  const vedeLavori = permissions.canViewCalendar;
  const vedeCommerciale = permissions.canViewMarketingAppointments && (crm.isEnabled || crm.isPreview);
  let ricordato: string | null = null;
  try { ricordato = localStorage.getItem(CHIAVE_TIPO_CALENDARIO); } catch { /* archivio non disponibile */ }
  const richiestoDaIndirizzo = searchParams.get("tipo");
  // Da computer l'indirizzo generico è il calendario dei lavori: l'ultima scelta ricordata non conta
  // (aprirebbe il commerciale sotto la voce «Calendario» di Cantieri).
  const tipo: TipoCalendario = fisso
    ?? (telefono
      ? tipoCalendario({ vedeLavori, vedeCommerciale, richiesto: richiestoDaIndirizzo, ricordato })
      : vedeLavori ? "lavori" : "commerciali");
  // Da computer un vecchio link «?tipo=commerciali» (o chi ha solo il CRM) va al calendario commerciale.
  const vaiAlCommerciale = !fisso && !telefono && pronto && vedeCommerciale
    && (richiestoDaIndirizzo === "commerciali" || !vedeLavori);

  // Il tipo sta sempre nell'indirizzo: la barra in basso ci legge se mostrare quella del
  // commerciale, e un link senza «?tipo=» la faceva cambiare sotto il pollice.
  const richiesto = searchParams.get("tipo");
  useEffect(() => {
    if (fisso || vaiAlCommerciale || !pronto || richiesto === tipo) return;
    setSearchParams((attuali) => {
      const prossimi = new URLSearchParams(attuali);
      prossimi.set("tipo", tipo);
      return prossimi;
    }, { replace: true });
  }, [fisso, vaiAlCommerciale, pronto, richiesto, tipo, setSearchParams]);

  if (vaiAlCommerciale) {
    const resto = new URLSearchParams(searchParams);
    resto.delete("tipo");
    const coda = resto.toString();
    return <Navigate to={`${URL_CALENDARIO_COMMERCIALE}${coda ? `?${coda}` : ""}`} replace />;
  }
  if (!pronto) return <Caricamento />;

  const scegli = (scelto: TipoCalendario) => {
    if (scelto === tipo) return;
    try { localStorage.setItem(CHIAVE_TIPO_CALENDARIO, scelto); } catch { /* resta per questa visita */ }
    // I parametri dell'altro calendario (vista, mappa, filtri) non valgono qui.
    setSearchParams({ tipo: scelto }, { replace: true });
  };

  return (
    <div className="space-y-3">
      {!fisso && telefono && vedeLavori && vedeCommerciale && (
        <div role="tablist" aria-label={t("Quale calendario")} className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-0.5 sm:inline-grid sm:w-auto">
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
                "flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs transition-colors",
                tipo === valore ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icona className="h-3.5 w-3.5" aria-hidden="true" />
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
