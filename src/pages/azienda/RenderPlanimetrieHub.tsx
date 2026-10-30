/**
 * Render AI → Planimetrie: le piante dell'azienda e «Nuova pianta».
 *
 * Da una pianta si apre la sua scheda (stanze, 3D, render). Gli ingressi «Disegna»,
 * «Carica PDF o foto» e «Descrivi a parole» stanno in `percorsiPlanimetrie`.
 */
import { Link } from "react-router-dom";
import { ChevronRight, FileUp, LayoutPanelTop, MessageSquareText, PenLine } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { useElencoPlanimetrie, type RigaPlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";

const INGRESSI: { modo: ModoNuovaPianta; titolo: string; testo: string; icona: LucideIcon }[] = [
  { modo: "disegno", titolo: "Disegna", testo: "Trascina le stanze e scrivi le misure", icona: PenLine },
  { modo: "documento", titolo: "Carica PDF o foto", testo: "Catastale, disegno del tecnico o schizzo a mano", icona: FileUp },
  { modo: "testo", titolo: "Descrivi a parole", testo: "«Bilocale di 60 mq, bagno 2 × 2,5»", icona: MessageSquareText },
];

const STATO: Record<RigaPlanimetria["stato"], string> = { bozza: "Bozza", in_uso: "In uso", archiviata: "Archiviata" };

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export default function RenderPlanimetrieHub() {
  const { effectiveCompany } = useAuth();
  const { data: piante = [], isLoading, error, refetch } = useElencoPlanimetrie(effectiveCompany?.id);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12 max-md:space-y-3">
      <TestataPlanimetrie
        indietro="/azienda/render"
        titolo="Planimetrie"
        sottotitolo="La pianta con le misure vere: da lì il 3D e il render di ogni stanza, con porte e finestre al loro posto."
        azioni={<div className="max-md:hidden"><RenderCreditsWidget /></div>}
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
          Nuova pianta
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          {INGRESSI.map(({ modo, titolo, testo, icona: Icona }) => (
            <Link key={modo} to={percorsiPlanimetrie.nuova(modo)} className="group">
              <Card className="h-full transition-colors group-hover:border-purple-400">
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                    <Icona className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold">{titolo}</p>
                    <p className="text-sm text-muted-foreground">{testo}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
          Le tue piante
        </h2>
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="flex items-center justify-between gap-3 p-4 text-sm">
              <span>{error instanceof Error ? error.message : "Elenco delle piante non disponibile."}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button>
            </CardContent>
          </Card>
        ) : piante.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
              <LayoutPanelTop className="h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Nessuna pianta ancora</p>
              <p className="text-sm text-muted-foreground">Parti da una delle tre strade qui sopra: in pochi minuti hai la pianta con le misure.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {piante.map((p) => (
              <Link key={p.id} to={percorsiPlanimetrie.pianta(p.id)} className="block">
                <Card className="transition-colors hover:border-purple-400">
                  <CardContent className="flex items-center gap-3 p-4">
                    <LayoutPanelTop className="h-5 w-5 shrink-0 text-purple-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.titolo}</p>
                      <p className="text-xs text-muted-foreground">Versione {p.versione_corrente} · aggiornata il {data(p.updated_at)}</p>
                    </div>
                    {p.stato !== "bozza" && <Badge variant="secondary">{STATO[p.stato]}</Badge>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
