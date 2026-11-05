/**
 * Render AI → Planimetrie: le piante dell'azienda e «Nuova pianta».
 *
 * Da una pianta si apre la sua scheda (stanze, 3D, render). Gli ingressi «Disegna»,
 * «Carica PDF o foto» e «Descrivi a parole» stanno in `percorsiPlanimetrie`.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import esempioTrilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { ChevronRight, ClipboardList, FileUp, LayoutPanelTop, MessageSquareText, PenLine, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnteprimaPianta } from "@/components/planimetrie/AnteprimaPianta";
import { PIANTE_PER_PAGINA, useAnteprimePlanimetrie } from "@/lib/planimetrie/anteprime";
import { TestataPlanimetrie } from "@/components/planimetrie/render/TestataPlanimetrie";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { useCreaPlanimetria, useElencoPlanimetrie, type RigaPlanimetria } from "@/lib/planimetrie/archivio";
import { percorsiPlanimetrie, type ModoNuovaPianta } from "@/lib/planimetrie/render/percorsi";

const INGRESSI: { modo: ModoNuovaPianta; titolo: string; testo: string; icona: LucideIcon }[] = [
  { modo: "disegno", titolo: "Disegna", testo: "Trascina le stanze e scrivi le misure", icona: PenLine },
  { modo: "documento", titolo: "Carica PDF o foto", testo: "Catastale, disegno del tecnico o schizzo a mano", icona: FileUp },
  { modo: "testo", titolo: "Descrivi a parole", testo: "«Bilocale di 60 mq, bagno 2 × 2,5»", icona: MessageSquareText },
  { modo: "sopralluogo", titolo: "Dal sopralluogo", testo: "Detta le misure stanza per stanza, aggiungi le foto", icona: ClipboardList },
];

const PASSI: { titolo: string; testo: string; icona: LucideIcon }[] = [
  { titolo: "Carica o disegna", testo: "PDF, foto o schizzo: l'AI legge stanze, porte e misure.", icona: FileUp },
  { titolo: "Disegna il progetto", testo: "Demolizioni in giallo, opere nuove in rosso.", icona: PenLine },
  { titolo: "Dalla scheda", testo: "3D, render delle stanze, prima e dopo con i costi, preventivo e PDF.", icona: LayoutPanelTop },
];

const STATO: Record<RigaPlanimetria["stato"], string> = { bozza: "Bozza", in_uso: "In uso", archiviata: "Archiviata" };

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export default function RenderPlanimetrieHub() {
  const { effectiveCompany } = useAuth();
  const { data: piante = [], isLoading, error, refetch } = useElencoPlanimetrie(effectiveCompany?.id);
  const crea = useCreaPlanimetria();
  const navigate = useNavigate();
  const [esempio, setEsempio] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [pagina, setPagina] = useState(0);
  const filtrate = piante.filter((p) => p.titolo.toLocaleLowerCase("it-IT").includes(ricerca.trim().toLocaleLowerCase("it-IT")));
  const ultimaPagina = Math.max(0, Math.ceil(filtrate.length / PIANTE_PER_PAGINA) - 1);
  const paginaCorrente = Math.min(pagina, ultimaPagina);
  const visibili = filtrate.slice(paginaCorrente * PIANTE_PER_PAGINA, (paginaCorrente + 1) * PIANTE_PER_PAGINA);
  const anteprime = useAnteprimePlanimetrie(effectiveCompany?.id, visibili);
  // Prima volta: una pianta d'esempio già pronta (trilocale con il progetto), da guardare e modificare.
  const apriEsempio = async () => {
    if (!effectiveCompany?.id) return;
    setEsempio(true);
    try {
      const id = await crea.mutateAsync({ companyId: effectiveCompany.id, titolo: "Esempio · Trilocale da ristrutturare", documento: esempioTrilocale as unknown as Planimetria, nota: "Pianta d'esempio" });
      navigate(percorsiPlanimetrie.pianta(id));
    } catch (e) {
      toast.error("Esempio non creato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setEsempio(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 max-md:space-y-3">
      <TestataPlanimetrie
        indietro="/azienda/render"
        titolo="Planimetrie"
        sottotitolo="La pianta con le misure vere: da lì il 3D e il render di ogni stanza, con porte e finestre al loro posto."
        azioni={<div className="max-md:hidden"><RenderCreditsWidget /></div>}
      />

      <ol aria-label="Dalla pianta al render" className="grid grid-cols-2 gap-2 rounded-2xl border bg-gradient-to-br from-blue-50/70 to-indigo-50/50 p-4 sm:grid-cols-4">
        {[['Crea la pianta', 'Disegna, carica o descrivi'], ['Controlla le misure', 'Stanze, porte e finestre'], ['Scegli i materiali', 'Finiture comuni e arredi'], ['Genera i render', 'Interni, esterni e varianti']].map(([nome, testo], i) => <li key={nome} className="flex items-start gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary shadow-sm">{i + 1}</span><div><p className="text-sm font-semibold">{nome}</p><p className="mt-0.5 text-xs text-muted-foreground">{testo}</p></div></li>)}
      </ol>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
          Nuova pianta
        </h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {INGRESSI.map(({ modo, titolo, testo, icona: Icona }) => (
            <Link key={modo} to={percorsiPlanimetrie.nuova(modo)} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/50 group-hover:shadow-md">
                <CardContent className="flex items-start gap-4 p-5 max-md:gap-3 max-md:p-4">
                  <div className="flex h-12 w-12 max-md:h-10 max-md:w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icona className="h-6 w-6 max-md:h-5 max-md:w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-base font-semibold max-md:text-sm">{titolo}</p>
                    <p className="text-sm text-muted-foreground">{testo}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground max-md:text-[13px] max-md:normal-case max-md:tracking-normal max-md:text-foreground">
          Le tue piante
        </h2>
        {piante.length > 0 && <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca una pianta" placeholder="Cerca per nome…" value={ricerca} onChange={(e) => { setRicerca(e.target.value); setPagina(0); }} className="pl-9" /></div>}
        </div>
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
            <CardContent className="space-y-6 p-8 max-md:space-y-3 max-md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-3">
                <div className="flex items-center gap-4">
                  <LayoutPanelTop className="h-10 w-10 shrink-0 text-primary/70 max-md:h-8 max-md:w-8" />
                  <div>
                    <p className="text-lg font-semibold max-md:text-base">Nessuna pianta ancora</p>
                    <p className="text-sm text-muted-foreground">Scegli uno dei quattro modi qui sopra, oppure guarda prima come funziona.</p>
                  </div>
                </div>
                <Button size="lg" onClick={apriEsempio} disabled={esempio} className="max-md:w-full">{esempio ? "Preparo l'esempio…" : "Apri una pianta d'esempio"}</Button>
              </div>
              <ol className="grid gap-4 text-left md:grid-cols-3 max-md:hidden">
                {PASSI.map(({ titolo, testo, icona: Icona }, i) => (
                  <li key={titolo} className="flex flex-col gap-3 rounded-xl bg-muted/50 p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                      <Icona className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-base font-semibold">{titolo}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{testo}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        ) : filtrate.length === 0 ? <Card><CardContent className="space-y-2 p-6 text-sm"><p>Nessuna pianta corrisponde alla ricerca.</p><Button variant="outline" size="sm" onClick={() => setRicerca("")}>Mostra tutte le piante</Button></CardContent></Card> : (
          <>
          <p className="text-xs text-muted-foreground">{filtrate.length} {filtrate.length === 1 ? "pianta" : "piante"} · anteprime dell'ultima versione salvata</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibili.map((p) => { const a = anteprime.data?.[p.id]; return (
              <Link key={p.id} to={percorsiPlanimetrie.pianta(p.id)} aria-label={`Apri ${p.titolo}`} className="group block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <Card className="h-full overflow-hidden rounded-2xl transition-all group-hover:border-primary/50 group-hover:shadow-md">
                  <AnteprimaPianta anteprima={a} titolo={p.titolo} caricando={anteprime.isLoading} className="h-48 border-b transition-colors group-hover:bg-blue-50/40" />
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2"><h3 className="line-clamp-2 text-sm font-semibold">{p.titolo}</h3><ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /></div>
                    {a && <p className="text-xs text-muted-foreground">{a.piano} · {a.stanze} {a.stanze === 1 ? "stanza" : "stanze"} · {a.superficie.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²{a.piani > 1 ? ` · ${a.piani} piani` : ""}</p>}
                    <div className="flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">Versione {p.versione_corrente} · {data(p.updated_at)}</p>{p.stato !== "bozza" && <Badge variant="secondary">{STATO[p.stato]}</Badge>}</div>
                  </CardContent>
                </Card>
              </Link>
            ); })}
          </div>
          {ultimaPagina > 0 && <nav aria-label="Pagine dell'archivio" className="flex items-center justify-between gap-3"><Button variant="outline" disabled={paginaCorrente === 0} onClick={() => setPagina(paginaCorrente - 1)}>Precedenti</Button><span className="text-sm text-muted-foreground">Pagina {paginaCorrente + 1} di {ultimaPagina + 1}</span><Button variant="outline" disabled={paginaCorrente === ultimaPagina} onClick={() => setPagina(paginaCorrente + 1)}>Successive</Button></nav>}
          </>
        )}
      </section>
    </div>
  );
}
