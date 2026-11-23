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
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import {
  useCreaPlanimetria,
  useElencoPlanimetrie,
  type RigaPlanimetria,
} from "@/lib/planimetrie/archivio";
import {
  percorsiPlanimetrie,
} from "@/lib/planimetrie/render/percorsi";

export default function RenderPlanimetrieHub() {
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
      toast.error("Esempio non creato", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEsempio(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-12 sm:space-y-6">
      <TestataPlanimetrie
        titolo="Planimetrie"
        sottotitolo="Disegni 2D, viste 3D e render organizzati per progetto."
        azioni={
          <>
            <Button asChild variant="outline" size="sm">
              <Link to="/azienda/render">
                <ImageIcon className="mr-2 h-4 w-4" />
                Render AI
              </Link>
            </Button>
            <div className="max-md:hidden">
              <RenderCreditsWidget />
            </div>
            {!permessi.solaLettura && (
              <Button asChild size="sm">
                <Link to={percorsiPlanimetrie.nuova()}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  Nuova planimetria
                </Link>
              </Button>
            )}
          </>
        }
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">I tuoi progetti</h2>
          </div>
          <div
            className="inline-flex rounded-lg border bg-muted/30 p-1"
            aria-label="Visualizzazione dell'archivio"
          >
            <Button
              variant={vista === "griglia" ? "secondary" : "ghost"}
              size="sm"
              aria-label="Vista griglia"
              aria-pressed={vista === "griglia"}
              onClick={() => cambiaVista("griglia")}
            >
              <Grid2X2 className="mr-1.5 h-4 w-4" />
              Griglia
            </Button>
            <Button
              variant={vista === "elenco" ? "secondary" : "ghost"}
              size="sm"
              aria-label="Vista elenco"
              aria-pressed={vista === "elenco"}
              onClick={() => cambiaVista("elenco")}
            >
              <List className="mr-1.5 h-4 w-4" />
              Elenco
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
            Le anteprime non sono disponibili. Puoi comunque aprire i progetti.{" "}
            <button
              className="underline"
              onClick={() => void anteprime.refetch()}
            >
              Riprova anteprime
            </button>
          </p>
        )}
        {collegamenti.isError && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
          >
            I nomi dei collegamenti non sono disponibili.
            <Button
              variant="link"
              size="sm"
              onClick={() => collegamenti.refetch()}
            >
              Riprova
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
                  : "Elenco delle piante non disponibile."}
              </span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Riprova
              </Button>
            </CardContent>
          </Card>
        ) : piante.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
              <div>
                <p className="text-lg font-semibold">
                  Nessuna planimetria ancora
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crea la prima pianta, poi collegala al cliente e al suo
                  preventivo.
                </p>
              </div>
              {!permessi.solaLettura && (
                <Button variant="outline" onClick={apriEsempio} disabled={esempio}>
                  {esempio ? "Preparo l'esempio…" : "Apri una pianta d'esempio"}
                </Button>
              )}
            </CardContent>
          </Card>
        ) : filtrate.length === 0 ? (
          <Card>
            <CardContent className="space-y-3 p-6 text-sm">
              <p>Nessuna planimetria con questi filtri.</p>
              <Button variant="outline" size="sm" onClick={azzeraFiltri}>
                Azzera i filtri
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {filtrate.length}{" "}
              {filtrate.length === 1 ? "progetto" : "progetti"} · anteprime
              dell’ultima versione salvata
            </p>
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
                aria-label="Pagine dell'archivio"
                className="flex items-center justify-between gap-3"
              >
                <Button
                  variant="outline"
                  disabled={paginaCorrente === 0}
                  onClick={() => setPagina(paginaCorrente - 1)}
                >
                  Precedenti
                </Button>
                <span className="text-sm text-muted-foreground">
                  Pagina {paginaCorrente + 1} di {ultimaPagina + 1}
                </span>
                <Button
                  variant="outline"
                  disabled={paginaCorrente === ultimaPagina}
                  onClick={() => setPagina(paginaCorrente + 1)}
                >
                  Successive
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
