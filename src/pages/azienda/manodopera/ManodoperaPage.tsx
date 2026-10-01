/**
 * /azienda/manodopera — Manodopera e Mezzi (26/09/2026, richiesta di Florin).
 *
 * Una voce di menu al posto di due (Subappaltatori, Mezzi e attrezzature) e
 * una scheda nuova (Operai): chi lavora nei cantieri, con cosa. La scheda
 * aperta sta nell'indirizzo (?tab=operai|subappaltatori|mezzi); le schede di
 * dettaglio restano dove erano (/azienda/subappaltatori/:id, /azienda/mezzi/:id).
 */
import { lazy, Suspense } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { HardHat, Truck, Users } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { useSchedeManodopera } from "@/hooks/useSchedeManodopera";
import { useStatoPiano } from "@/hooks/useStatoPiano";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { SCHEDE_MANODOPERA, schedaDaAprire, type SchedaManodopera } from "@/lib/manodopera/schede";
import { cn } from "@/lib/utils";

const OperaiTab = lazy(() => import("./OperaiTab"));
const SubappaltatoriPage = lazy(() => import("@/pages/azienda/SubappaltatoriPage"));
const MezziList = lazy(() => import("@/pages/azienda/MezziList"));

const ICONE: Record<SchedaManodopera, typeof Users> = {
  operai: Users,
  subappaltatori: HardHat,
  mezzi: Truck,
};

function Attesa() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Caricamento">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

export default function ManodoperaPage() {
  const { schede, inCaricamento } = useSchedeManodopera();
  const { isScopriPlan } = useStatoPiano();
  const [searchParams, setSearchParams] = useSearchParams();
  const attiva = schedaDaAprire(schede, searchParams.get("tab"));

  if (inCaricamento) {
    return (
      <div className="space-y-6 max-sm:space-y-3">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-11 w-full max-w-md rounded-2xl" />
        <Attesa />
      </div>
    );
  }

  // Piano Scopri: la voce ha il lucchetto, la pagina invita a passare di piano.
  if (isScopriPlan) return <UpgradeScopriWall type="generic" inline />;
  if (!attiva) return <Navigate to="/azienda" replace />;

  const cambia = (v: string) => {
    const next = new URLSearchParams();
    next.set("tab", v);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6 max-sm:space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 max-sm:text-lg max-sm:leading-6">Manodopera e Mezzi</h1>
        <p className="mt-0.5 text-sm text-slate-500 max-sm:hidden">
          Chi lavora nei tuoi cantieri e con cosa: operai, ditte in subappalto, mezzi e attrezzi.
        </p>
      </div>

      <Tabs value={attiva} onValueChange={cambia} className="w-full">
        {schede.length > 1 && (
          <TabsList
            className={cn(
              "flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm scrollbar-none",
              "max-sm:grid max-sm:rounded-lg max-sm:p-1 max-sm:shadow-none",
              schede.length === 3 ? "max-sm:grid-cols-3" : "max-sm:grid-cols-2",
            )}
          >
            {SCHEDE_MANODOPERA.filter((s) => schede.includes(s.chiave)).map((s) => {
              const Icona = ICONE[s.chiave];
              return (
                <TabsTrigger
                  key={s.chiave}
                  value={s.chiave}
                  className="tap-compact shrink-0 gap-1.5 data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700 max-sm:h-8 max-sm:px-1 max-sm:text-xs"
                >
                  <Icona className="h-4 w-4 max-sm:hidden" aria-hidden="true" />
                  {s.chiave === "mezzi"
                    ? <><span className="sm:hidden">Mezzi</span><span className="hidden sm:inline">{s.etichetta}</span></>
                    : s.etichetta}
                </TabsTrigger>
              );
            })}
          </TabsList>
        )}

        {schede.includes("operai") && (
          <TabsContent value="operai" className="mt-4 max-sm:mt-3">
            <ErrorBoundary title="Errore nella scheda Operai">
              <Suspense fallback={<Attesa />}><OperaiTab /></Suspense>
            </ErrorBoundary>
          </TabsContent>
        )}
        {schede.includes("subappaltatori") && (
          <TabsContent value="subappaltatori" className="mt-4 max-sm:mt-3">
            <ErrorBoundary title="Errore nella scheda Subappaltatori">
              <Suspense fallback={<Attesa />}><SubappaltatoriPage incorporata /></Suspense>
            </ErrorBoundary>
          </TabsContent>
        )}
        {schede.includes("mezzi") && (
          <TabsContent value="mezzi" className="mt-4 max-sm:mt-3">
            <ErrorBoundary title="Errore nella scheda Mezzi">
              <Suspense fallback={<Attesa />}><MezziList incorporata /></Suspense>
            </ErrorBoundary>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
