/**
 * Progettazione → Planimetrie: le piante dell'azienda e «Nuova pianta».
 *
 * Da una pianta si apre la sua scheda (stanze, 3D, render). Gli ingressi «Disegna»,
 * «Carica PDF o foto» e «Descrivi a parole» stanno in `percorsiPlanimetrie`.
 */
import { useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { toast } from "sonner";
import esempioTrilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import {
  Grid2X2,
  ImageIcon,
  List,
  Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BOTTONE_NUOVO, BOTTONE_SECONDARIO } from "@/components/orders/TestataScheda";
import { cn } from "@/lib/utils";

import { usePermissions } from "@/hooks/usePermissions";
import {
  accessiCollegamenti,
  useCollegamentiPiante,
} from "@/lib/planimetrie/collegamenti";
import {
  filtraElencoPiante,
  leggiFiltriElenco,
  scriviFiltriElenco,
  FILTRI_PIANTE_INIZIALI,
  type FiltriArchivioPiante,
} from "@/lib/planimetrie/elenco";
import { AssociazioniPiantaPanel } from "@/components/planimetrie/CollegamentiPianta";
import { FiltriArchivioPiante as FiltriPiante } from "@/components/planimetrie/FiltriArchivioPiante";
import { PlanimetriaProjectCard } from "@/components/planimetrie/PlanimetriaProjectCard";
import {
  PIANTE_PER_PAGINA,
  useAnteprimePlanimetrie,
} from "@/lib/planimetrie/anteprime";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  useCreaPlanimetria,
  useElencoPlanimetrie,
  type RigaPlanimetria,
} from "@/lib/planimetrie/archivio";
import {
  percorsiPlanimetrie,
} from "@/lib/planimetrie/render/percorsi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

export default function RenderPlanimetrieHub() {
  const t = useT();
  const { effectiveCompany, user } = useAuth();
  const permessi = usePermissions();
  const [params, setParams] = useSearchParams();
  const {
    data: piante = [],
    isLoading,
    error,
    refetch,
  } = useElencoPlanimetrie(effectiveCompany?.id, { archiviate: true });
  const collegamenti = useCollegamentiPiante(
    effectiveCompany?.id,
    piante,
    accessiCollegamenti(permessi),
  );
  const crea = useCreaPlanimetria();
  const navigate = useNavigate();
  const [esempio, setEsempio] = useState(false);
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const filtri = useMemo(() => leggiFiltriElenco(params), [params]);
  const { pagina } = filtri;
  const cambiaFiltri = (patch: Partial<FiltriArchivioPiante>) =>
    setParams(scriviFiltriElenco(params, { pagina: 0, ...patch }), {
      replace: true,
    });
  const setPagina = (pagina: number) => cambiaFiltri({ pagina });
  const [daCollegare, setDaCollegare] = useState<RigaPlanimetria | null>(null);
  const vista = params.get("vista") === "elenco" ? "elenco" : "griglia";
  const cambiaVista = (value: string) => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value === "elenco") next.set("vista", "elenco");
        else next.delete("vista");
        return next;
      },
      { replace: true },
    );
  };
  const filtrate = useMemo(
    () => filtraElencoPiante(piante, filtri, collegamenti.data, user?.id),
    [piante, filtri, collegamenti.data, user?.id],
  );
  const ultimaPagina = Math.max(
    0,
    Math.ceil(filtrate.length / PIANTE_PER_PAGINA) - 1,
  );
  const paginaCorrente = Math.min(pagina, ultimaPagina);
  const visibili = filtrate.slice(
    paginaCorrente * PIANTE_PER_PAGINA,
    (paginaCorrente + 1) * PIANTE_PER_PAGINA,
  );
  const anteprime = useAnteprimePlanimetrie(effectiveCompany?.id, visibili);
  const azzeraFiltri = () => cambiaFiltri(FILTRI_PIANTE_INIZIALI);
  // Prima volta: una pianta d'esempio già pronta (trilocale con il progetto), da guardare e modificare.
  const apriEsempio = async () => {
    if (!effectiveCompany?.id) return;
    setEsempio(true);
    try {
      const id = await crea.mutateAsync({
        companyId: effectiveCompany.id,
        titolo: "Esempio · Trilocale da ristrutturare",
        documento: esempioTrilocale as unknown as Planimetria,
        nota: "Pianta d'esempio",
      });
      navigate(percorsiPlanimetrie.pianta(id));
    } catch (e) {
      toast.error(t("Esempio non creato"), {
        description: messaggioErrore(e),
      });
    } finally {
      setEsempio(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12 sm:space-y-6">
      {/* Testata come Commesse (25/11/2026): titolo 20px, la frase solo per i lettori di schermo,
          comandi alti 32px. Le pagine interne usano ancora TestataPlanimetrie. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-xl font-bold leading-tight text-foreground max-md:text-lg">{t("Planimetrie")}</h1>
          <p className="sr-only">{t("Disegni 2D, viste 3D e render organizzati per progetto.")}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
          <Button asChild variant="outline" size="sm" className={BOTTONE_SECONDARIO}>
            <Link to="/azienda/render">
              <ImageIcon />
              {t("Render AI")}
            </Link>
          </Button>
          <div className="max-md:hidden">
            <RenderCreditsWidget />
          </div>
          {!permessi.solaLettura && (
            <Button asChild size="sm" className={BOTTONE_NUOVO}>
              <Link to={percorsiPlanimetrie.nuova()}>
                <Plus />
                {t("Nuova planimetria")}
              </Link>
            </Button>
          )}
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">{t("I tuoi progetti")}</h2>
          </div>
          <div
            className="inline-flex gap-0.5 rounded-lg bg-muted/60 p-0.5"
            aria-label={t("Visualizzazione dell'archivio")}
          >
            <Button
              variant={vista === "griglia" ? "secondary" : "ghost"}
              size="sm"
              aria-label={t("Vista griglia")}
              aria-pressed={vista === "griglia"}
              onClick={() => cambiaVista("griglia")}
              className={cn(BOTTONE_SECONDARIO, "h-7")}
            >
              <Grid2X2 />
              {t("Griglia")}
            </Button>
            <Button
              variant={vista === "elenco" ? "secondary" : "ghost"}
              size="sm"
              aria-label={t("Vista elenco")}
              aria-pressed={vista === "elenco"}
              onClick={() => cambiaVista("elenco")}
              className={cn(BOTTONE_SECONDARIO, "h-7")}
            >
              <List />
              {t("Elenco")}
            </Button>
          </div>
        </div>
        {piante.length > 0 && (
          <FiltriPiante
            value={filtri}
            onChange={cambiaFiltri}
            piante={piante}
            mappa={collegamenti.data}
            userId={user?.id}
            companyId={effectiveCompany?.id}
            accessi={accessiCollegamenti(permessi)}
            risultati={filtrate.length}
          />
        )}
        {anteprime.isError && (
          <p role="status" className="text-xs text-muted-foreground">
            {t("Le anteprime non sono disponibili. Puoi comunque aprire i progetti.")}{" "}
            <button
              className="underline"
              onClick={() => void anteprime.refetch()}
            >
              {t("Riprova anteprime")}
            </button>
          </p>
        )}
        {collegamenti.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
          >
            {t("I nomi dei collegamenti non sono disponibili.")}
            <Button
              variant="link"
              size="sm"
              onClick={() => collegamenti.refetch()}
            >
              {t("Riprova")}
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
              <span>
                {error instanceof Error
                  ? error.message
                  : t("Elenco delle piante non disponibile.")}
              </span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t("Riprova")}
              </Button>
            </CardContent>
          </Card>
        ) : piante.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="text-lg font-semibold">
                  {t("Nessuna planimetria ancora")}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("Crea la prima pianta, poi collegala al cliente e al suo preventivo.")}
                </p>
              </div>
              {!permessi.solaLettura && (
                <Button variant="outline" onClick={apriEsempio} disabled={esempio}>
                  {esempio ? t("Preparo l'esempio…") : t("Apri una pianta d'esempio")}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : filtrate.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-6 text-sm">
              <p>{t("Nessuna planimetria con questi filtri.")}</p>
              <Button variant="outline" size="sm" onClick={azzeraFiltri}>
                {t("Azzera i filtri")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Il conteggio sta già sopra, nei filtri («16 di 16 planimetrie»): qui ripeteva lo stesso numero. */}
            <div
              className={
                vista === "griglia"
                  ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
                  : "space-y-3"
              }
            >
              {visibili.map((p) => (
                <PlanimetriaProjectCard
                  key={p.id}
                  pianta={p}
                  anteprima={anteprime.data?.[p.id]}
                  loading={anteprime.isLoading}
                  mappa={collegamenti.data}
                  list={vista === "elenco"}
                  returnTo={returnTo}
                  onAssocia={
                    permessi.solaLettura ? undefined : () => setDaCollegare(p)
                  }
                />
              ))}
            </div>
            {ultimaPagina > 0 && (
              <nav
                aria-label={t("Pagine dell'archivio")}
                className="flex items-center justify-between gap-3"
              >
                <Button
                  variant="outline"
                  disabled={paginaCorrente === 0}
                  onClick={() => setPagina(paginaCorrente - 1)}
                >
                  {t("Precedenti")}
                </Button>
                <span className="text-sm text-muted-foreground">{t("Pagina {n} di {totale}", { n: paginaCorrente + 1, totale: ultimaPagina + 1 })}</span>
                <Button
                  variant="outline"
                  disabled={paginaCorrente === ultimaPagina}
                  onClick={() => setPagina(paginaCorrente + 1)}
                >
                  {t("Successive")}
                </Button>
              </nav>
            )}
          </>
        )}
      </section>
      {daCollegare && (
        <AssociazioniPiantaPanel
          key={daCollegare.id}
          riga={daCollegare}
          mappa={collegamenti.data}
          anteprima={anteprime.data?.[daCollegare.id]}
          onChiudi={() => setDaCollegare(null)}
        />
      )}
    </div>
  );
}
