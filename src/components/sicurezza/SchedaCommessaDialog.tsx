import {
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createPath,
  parsePath,
  Route,
  Routes,
  UNSAFE_NavigationContext,
  UNSAFE_RouteContext,
  type Location,
  type To,
} from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { FeatureRoute } from "@/components/auth/FeatureRoute";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import {
  ContestoSchedaCommessa,
  intercettaScheda,
  type DestinazioneScheda,
} from "./ContestoSchedaCommessa";

const Impresa = lazy(() => import("@/pages/azienda/SubappaltatoreDetail"));
const Mezzo = lazy(() => import("@/pages/azienda/MezzoDetail"));
const Pos = lazy(() => import("@/pages/azienda/sicurezza/PosEditor"));
const Sds = lazy(() =>
  import("./SdsAziendali").then((m) => ({ default: m.SdsAziendali })),
);
const Sicurezza = lazy(() => import("@/pages/azienda/SicurezzaCantiere"));
const Fornitore = lazy(
  () => import("@/pages/azienda/settings/SettingsSuppliers"),
);
const Commessa = lazy(() => import("@/pages/azienda/OrderDetail"));

const posizione = (d: DestinazioneScheda): Location => ({
  pathname: "/",
  search: "",
  hash: "",
  ...parsePath(d.to),
  state: d.state ?? null,
  key: crypto.randomUUID(),
});

/**
 * Riusa le vere schede senza un secondo layout o iframe. Solo la navigazione
 * di questo sottoalbero è locale: URL, filtri e popup della commessa restano vivi.
 * RouteContext azzerato evita che Routes erediti /ordini/:id come base;
 * NavigationContext sostituisce push/replace/go, senza creare un Router annidato.
 */
export function SchedaCommessaDialog({
  destinazione,
  companyId,
  orderId,
  onClose,
  contestoOrigine = "commessa",
}: {
  destinazione: DestinazioneScheda;
  companyId: string;
  orderId: string;
  onClose: () => void;
  contestoOrigine?: "commessa" | "impresa";
}) {
  const [origine] = useState(() =>
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const scorrimento = useRef<HTMLDivElement>(null);
  const p = usePermissions();
  const nav = useContext(UNSAFE_NavigationContext);
  const [storia, setStoria] = useState<Location[]>(() => [
    posizione(destinazione),
  ]);
  const corrente = storia[storia.length - 1];
  useEffect(() => {
    scorrimento.current?.scrollTo?.(0, 0);
  }, [corrente.pathname]);
  const [operazioneInCorso, setOperazioneInCorso] = useState(false);
  const [modifiche, setModifiche] = useState(false);
  const [uscita, setUscita] = useState<(() => void) | null>(null);
  const protetta = useCallback(
    (azione: () => void) => {
      if (operazioneInCorso) return;
      if (modifiche) setUscita(() => azione);
      else azione();
    },
    [modifiche, operazioneInCorso],
  );
  const torna = useCallback(
    () =>
      protetta(() => {
        if (storia.length > 1) setStoria((s) => s.slice(0, -1));
        else onClose();
      }),
    [protetta, storia.length, onClose],
  );
  const apri = useCallback(
    (d: DestinazioneScheda, replace = false) => {
      if (
        d.to === `/azienda/ordini/${orderId}` ||
        d.to.startsWith("/azienda/manodopera")
      ) {
        torna();
        return;
      }
      const prossimo = posizione(d);
      protetta(() => {
        setModifiche(false);
        setStoria((s) =>
          replace || prossimo.pathname === corrente.pathname
            ? [...s.slice(0, -1), prossimo]
            : [...s, prossimo],
        );
      });
    },
    [corrente.pathname, orderId, protetta, torna],
  );
  const navigator = useMemo(
    () => ({
      ...nav.navigator,
      createHref: (to: To) => (typeof to === "string" ? to : createPath(to)),
      push: (to: To, state?: unknown) =>
        apri({ to: typeof to === "string" ? to : createPath(to), state }),
      replace: (to: To, state?: unknown) =>
        apri({ to: typeof to === "string" ? to : createPath(to), state }, true),
      go: (delta: number) => {
        if (delta < 0) torna();
      },
    }),
    [nav.navigator, apri, torna],
  );
  const contesto = useMemo(
    () => ({ torna, setModifiche, setOperazioneInCorso }),
    [torna],
  );
  const titolo = corrente.pathname.includes("/subappaltatori/")
    ? "Scheda impresa"
    : corrente.pathname.includes("/mezzi/")
      ? "Scheda mezzo o attrezzatura"
      : corrente.pathname.includes("/pos/")
        ? "Scheda POS"
        : corrente.pathname.includes("/impostazioni/fornitori")
          ? "Anagrafica fornitore"
          : corrente.search.includes("sds")
            ? "Libreria SDS aziendali"
            : corrente.search.includes("verbali")
              ? "Registro verbali aziendale"
              : corrente.pathname.includes("/ordini/")
                ? "Scheda commessa"
                : "Scheda collegata";
  const negato = (
    <p role="alert" className="p-6">
      Non hai il permesso di consultare questa scheda.
    </p>
  );
  const avanzata = (ammesso: boolean, scheda: React.ReactNode) =>
    ammesso ? (
      <FeatureRoute featureKey="cantieri_avanzati">{scheda}</FeatureRoute>
    ) : (
      negato
    );
  return (
    <>
      <Dialog
        open
        onOpenChange={(o) => {
          if (!o) protetta(onClose);
        }}
      >
        <DialogContent
          className="flex h-[92dvh] max-h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0"
          onPointerDownOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (origine?.isConnected) origine.focus({ preventScroll: true });
          }}
        >
          <DialogHeader className="shrink-0 border-b p-4 pr-12">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={operazioneInCorso}
                onClick={torna}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {storia.length > 1
                  ? "Scheda precedente"
                  : contestoOrigine === "impresa"
                    ? "Torna all’impresa"
                    : "Torna alla commessa"}
              </Button>
              <DialogTitle>{titolo}</DialogTitle>
            </div>
            {operazioneInCorso && (
              <p role="status" className="text-sm text-muted-foreground">
                Operazione in corso: attendi il completamento prima di chiudere.
              </p>
            )}
            <DialogDescription>
              {contestoOrigine === "impresa"
                ? "La scheda dell’impresa resta aperta. Chiudi per tornare al punto da cui sei partito."
                : "Sei nella commessa. Chiudi questa scheda per ritrovare il punto da cui l’hai aperta."}
            </DialogDescription>
          </DialogHeader>
          <div
            ref={scorrimento}
            className="min-h-0 flex-1 overflow-auto p-4 sm:p-5"
            onClickCapture={(e) => intercettaScheda(e, apri)}
          >
            <ContestoSchedaCommessa.Provider value={contesto}>
              <UNSAFE_NavigationContext.Provider value={{ ...nav, navigator }}>
                <UNSAFE_RouteContext.Provider
                  value={{ outlet: null, matches: [], isDataRoute: false }}
                >
                  <ErrorBoundary
                    resetKey={corrente.pathname}
                    title="Impossibile caricare la scheda"
                  >
                    <Suspense
                      fallback={
                        <div
                          role="status"
                          className="flex items-center justify-center gap-2 p-10"
                        >
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Caricamento scheda…
                        </div>
                      }
                    >
                      <Routes key={corrente.pathname} location={corrente}>
                        <Route
                          path="/azienda/subappaltatori/:id"
                          element={avanzata(
                            p.canViewSubappaltatori,
                            <Impresa />,
                          )}
                        />
                        <Route
                          path="/azienda/mezzi/:id"
                          element={p.canViewMezzi ? <Mezzo /> : negato}
                        />
                        <Route
                          path="/azienda/sicurezza-cantiere/pos/:id"
                          element={avanzata(
                            p.canViewSicurezzaCantiere,
                            <Pos />,
                          )}
                        />
                        <Route
                          path="/azienda/sicurezza-cantiere"
                          element={avanzata(
                            p.canViewSicurezzaCantiere,
                            new URLSearchParams(corrente.search).get("tab") ===
                              "sds" ? (
                              <Sds companyId={companyId} />
                            ) : (
                              <Sicurezza />
                            ),
                          )}
                        />
                        <Route
                          path="/azienda/impostazioni/fornitori"
                          element={
                            p.canViewSettingsSuppliers ? <Fornitore /> : negato
                          }
                        />
                        <Route
                          path="/azienda/ordini/:id"
                          element={p.canViewOrders ? <Commessa /> : negato}
                        />
                        <Route
                          path="*"
                          element={
                            <div className="space-y-3 p-6">
                              <p>
                                Questa sezione non è disponibile nella scheda
                                collegata.
                              </p>
                              <Button onClick={torna}>
                                Torna ai dettagli precedenti
                              </Button>
                            </div>
                          }
                        />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </UNSAFE_RouteContext.Provider>
              </UNSAFE_NavigationContext.Provider>
            </ContestoSchedaCommessa.Provider>
          </div>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!uscita}
        onOpenChange={(o) => {
          if (!o) setUscita(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Uscire senza salvare?</AlertDialogTitle>
            <AlertDialogDescription>
              Ci sono modifiche al POS non salvate. Rimani nella scheda e
              salvale, oppure esci senza conservarle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continua modifica</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const azione = uscita;
                setUscita(null);
                setModifiche(false);
                azione?.();
              }}
            >
              Esci senza salvare
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
