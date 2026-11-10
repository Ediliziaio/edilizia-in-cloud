/**
 * Progettazione → Planimetrie: le piante dell'azienda e «Nuova pianta».
 *
 * Da una pianta si apre la sua scheda (stanze, 3D, render). Gli ingressi «Disegna»,
 * «Carica PDF o foto» e «Descrivi a parole» stanno in `percorsiPlanimetrie`.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import esempioTrilocale from "../../../shared/planimetrie/esempi/trilocale.json";
import type { Planimetria } from "../../../shared/planimetrie/modello.ts";
import { ChevronDown, ClipboardList, FileUp, Grid2X2, ImageIcon, LayoutPanelTop, Link2, List, MessageSquareText, PenLine, Plus, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { accessiCollegamenti, useCollegamentiPiante } from "@/lib/planimetrie/collegamenti";
import { filtraElencoPiante, STATI_PIANTA, type FiltriElencoPiante } from "@/lib/planimetrie/elenco";
import { CollegamentiPiantaDialog, RiferimentiPianta } from "@/components/planimetrie/CollegamentiPianta";
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

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });

export default function RenderPlanimetrieHub() {
  const { effectiveCompany } = useAuth();
  const permessi = usePermissions();
  const [params, setParams] = useSearchParams();
  const { data: piante = [], isLoading, error, refetch } = useElencoPlanimetrie(effectiveCompany?.id, { archiviate: true });
  const collegamenti = useCollegamentiPiante(effectiveCompany?.id, piante, accessiCollegamenti(permessi));
  const crea = useCreaPlanimetria();
  const navigate = useNavigate();
  const [esempio, setEsempio] = useState(false);
  const [ricerca, setRicerca] = useState("");
  const [stato, setStato] = useState<FiltriElencoPiante["stato"]>("attive");
  const [filtroCollegamento, setFiltroCollegamento] = useState<FiltriElencoPiante["collegamento"]>("tutti");
  const [ordine, setOrdine] = useState<FiltriElencoPiante["ordine"]>("recenti");
  const [daCollegare, setDaCollegare] = useState<RigaPlanimetria | null>(null);
  const vista = params.get("vista") === "elenco" ? "elenco" : "griglia";
  const cambiaVista = (value: string) => { setParams((p) => { const next = new URLSearchParams(p); if (value === "elenco") next.set("vista", "elenco"); else next.delete("vista"); return next; }, { replace: true }); };
  const [pagina, setPagina] = useState(0);
  const filtrate = useMemo(() => filtraElencoPiante(piante, { stato, ricerca, collegamento: filtroCollegamento, ordine }, collegamenti.data), [piante, stato, ricerca, filtroCollegamento, ordine, collegamenti.data]);
  const ultimaPagina = Math.max(0, Math.ceil(filtrate.length / PIANTE_PER_PAGINA) - 1);
  const paginaCorrente = Math.min(pagina, ultimaPagina);
  const visibili = filtrate.slice(paginaCorrente * PIANTE_PER_PAGINA, (paginaCorrente + 1) * PIANTE_PER_PAGINA);
  const anteprime = useAnteprimePlanimetrie(effectiveCompany?.id, vista === "griglia" ? visibili : []);
  const azzeraFiltri = () => { setRicerca(""); setStato("attive"); setFiltroCollegamento("tutti"); setPagina(0); };
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
        titolo="Planimetrie"
        sottotitolo="Progetti, disegno 2D, viste 3D e fascicolo PDF. Da ogni pianta avvii i render collegati alle sue stanze."
        azioni={<><Button asChild variant="outline" size="sm"><Link to="/azienda/render"><ImageIcon className="mr-2 h-4 w-4" />Render AI</Link></Button><div className="max-md:hidden"><RenderCreditsWidget /></div>{!permessi.solaLettura && <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Nuova planimetria<ChevronDown className="ml-1.5 h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{INGRESSI.map(({ modo, titolo, icona: Icona }) => <DropdownMenuItem key={modo} asChild><Link to={percorsiPlanimetrie.nuova(modo)}><Icona className="mr-2 h-4 w-4" />{titolo}</Link></DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}</>}
      />

      {!piante.length && !isLoading && <ol aria-label="Dalla pianta al render" className="grid grid-cols-2 gap-2 rounded-2xl border bg-gradient-to-br from-blue-50/70 to-indigo-50/50 p-4 sm:grid-cols-4">
        {[['Crea la pianta', 'Disegna, carica o descrivi'], ['Controlla le misure', 'Stanze, porte e finestre'], ['Scegli i materiali', 'Finiture comuni e arredi'], ['Genera i render', 'Interni, esterni e varianti']].map(([nome, testo], i) => <li key={nome} className="flex items-start gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary shadow-sm">{i + 1}</span><div><p className="text-sm font-semibold">{nome}</p><p className="mt-0.5 text-xs text-muted-foreground">{testo}</p></div></li>)}
      </ol>}

      {!piante.length && !isLoading && <section className="space-y-3">
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
      </section>}

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-base font-semibold">I tuoi progetti</h2><p className="text-xs text-muted-foreground">{piante.length} planimetrie · disegni, materiali e render del progetto</p></div>
          <div className="inline-flex rounded-lg border bg-muted/30 p-1" aria-label="Visualizzazione dell'archivio">
            <Button variant={vista === "griglia" ? "secondary" : "ghost"} size="sm" aria-label="Vista griglia" aria-pressed={vista === "griglia"} onClick={() => cambiaVista("griglia")}><Grid2X2 className="mr-1.5 h-4 w-4" />Griglia</Button>
            <Button variant={vista === "elenco" ? "secondary" : "ghost"} size="sm" aria-label="Vista elenco" aria-pressed={vista === "elenco"} onClick={() => cambiaVista("elenco")}><List className="mr-1.5 h-4 w-4" />Elenco</Button>
          </div>
        </div>
        {piante.length > 0 && <div className="space-y-3 rounded-xl border bg-card p-3">
          <div className="flex flex-wrap gap-1" aria-label="Stato delle planimetrie">{([["attive", "Attive"], ["bozza", "Bozze"], ["in_uso", "In uso"], ["archiviata", "Archiviate"]] as const).map(([key, nome]) => <Button key={key} size="sm" variant={stato === key ? "secondary" : "ghost"} aria-pressed={stato === key} onClick={() => { setStato(key); setPagina(0); }}>{nome}<span className="ml-1.5 text-xs text-muted-foreground">{piante.filter((p) => key === "attive" ? p.stato !== "archiviata" : p.stato === key).length}</span></Button>)}</div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Cerca una pianta" placeholder="Cerca progetto, cliente, contatto o preventivo…" value={ricerca} onChange={(e) => { setRicerca(e.target.value); setPagina(0); }} className="pl-9" /></div>
            <Select value={filtroCollegamento} onValueChange={(v) => { setFiltroCollegamento(v as FiltriElencoPiante["collegamento"]); setPagina(0); }}><SelectTrigger aria-label="Filtra collegamenti"><SelectValue /></SelectTrigger><SelectContent>{[["tutti", "Tutti i collegamenti"], ["collegate", "Con collegamenti"], ["libere", "Da collegare"], ["contatto", "Contatto CRM"], ["cliente", "Cliente"], ["preventivo", "Preventivo"], ["commessa", "Commessa"], ["computo", "Computo metrico"]].map(([key, nome]) => <SelectItem key={key} value={key}>{nome}</SelectItem>)}</SelectContent></Select>
            <Select value={ordine} onValueChange={(v) => { setOrdine(v as FiltriElencoPiante["ordine"]); setPagina(0); }}><SelectTrigger aria-label="Ordina planimetrie"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="recenti">Ultime modificate</SelectItem><SelectItem value="nome">Nome A–Z</SelectItem><SelectItem value="meno_recenti">Meno recenti</SelectItem></SelectContent></Select>
          </div>
        </div>}
        {collegamenti.isError && <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">I nomi dei collegamenti non sono disponibili.<Button variant="link" size="sm" onClick={() => collegamenti.refetch()}>Riprova</Button></div>}
        {isLoading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
          : error ? <Card><CardContent className="flex items-center justify-between gap-3 p-4 text-sm"><span>{error instanceof Error ? error.message : "Elenco delle piante non disponibile."}</span><Button variant="outline" size="sm" onClick={() => refetch()}>Riprova</Button></CardContent></Card>
          : piante.length === 0 ? <Card className="border-dashed"><CardContent className="space-y-5 p-6"><div><p className="text-lg font-semibold">Nessuna planimetria ancora</p><p className="mt-1 text-sm text-muted-foreground">Crea la prima pianta, poi collegala al cliente e al suo preventivo.</p></div><Button onClick={apriEsempio} disabled={esempio || permessi.solaLettura}>{esempio ? "Preparo l'esempio…" : "Apri una pianta d'esempio"}</Button><ol className="grid gap-3 md:grid-cols-3">{PASSI.map(({ titolo, testo }, i) => <li key={titolo} className="rounded-xl bg-muted/40 p-4"><p className="text-sm font-medium">{i + 1}. {titolo}</p><p className="mt-1 text-xs text-muted-foreground">{testo}</p></li>)}</ol></CardContent></Card>
          : filtrate.length === 0 ? <Card><CardContent className="space-y-3 p-6 text-sm"><p>Nessuna planimetria con questi filtri.</p><Button variant="outline" size="sm" onClick={azzeraFiltri}>Azzera i filtri</Button></CardContent></Card>
          : <>
            <p className="text-xs text-muted-foreground">{filtrate.length} {filtrate.length === 1 ? "progetto" : "progetti"} · {vista === "griglia" ? "anteprime dell'ultima versione salvata" : "elenco dei riferimenti collegati"}</p>
            {vista === "griglia" ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visibili.map((p) => { const a = anteprime.data?.[p.id]; return <Card key={p.id} className="flex h-full flex-col overflow-hidden rounded-2xl transition-colors hover:border-primary/40">
              <Link to={percorsiPlanimetrie.pianta(p.id)} tabIndex={-1} aria-hidden="true"><AnteprimaPianta anteprima={a} titolo={p.titolo} caricando={anteprime.isLoading} className="h-48 border-b" /></Link>
              <CardContent className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2"><h3 className="min-w-0 text-sm font-semibold"><Link to={percorsiPlanimetrie.pianta(p.id)} aria-label={`Apri ${p.titolo}`} className="line-clamp-2 hover:underline">{p.titolo}</Link></h3><Badge variant={p.stato === "in_uso" ? "secondary" : "outline"} className="shrink-0 text-[10px]">{STATI_PIANTA[p.stato]}</Badge></div>
                {a && <p className="text-xs text-muted-foreground">{a.piano} · {a.stanze} {a.stanze === 1 ? "stanza" : "stanze"} · {a.superficie.toLocaleString("it-IT", { maximumFractionDigits: 1 })} m²{a.piani > 1 ? ` · ${a.piani} piani` : ""}</p>}
                <RiferimentiPianta riga={p} mappa={collegamenti.data} />
                <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3"><p className="text-xs text-muted-foreground">v{p.versione_corrente} · {data(p.updated_at)}</p>{!permessi.solaLettura && <Button variant="ghost" size="sm" aria-label={`Associa ${p.titolo}`} onClick={() => setDaCollegare(p)}><Link2 className="mr-1.5 h-3.5 w-3.5" />Associa</Button>}</div>
              </CardContent>
            </Card>; })}</div> : <div className="overflow-hidden rounded-xl border bg-card"><Table><TableHeader><TableRow><TableHead>Progetto</TableHead><TableHead>Collegamenti</TableHead><TableHead>Stato</TableHead><TableHead>Aggiornata</TableHead><TableHead><span className="sr-only">Azioni</span></TableHead></TableRow></TableHeader><TableBody>{visibili.map((p) => <TableRow key={p.id}>
              <TableCell className="min-w-[200px]"><Link to={percorsiPlanimetrie.pianta(p.id)} className="font-medium hover:underline">{p.titolo}</Link><p className="mt-1 text-xs text-muted-foreground">Versione {p.versione_corrente}</p></TableCell>
              <TableCell className="min-w-[220px]"><RiferimentiPianta riga={p} mappa={collegamenti.data} /></TableCell><TableCell><Badge variant="outline">{STATI_PIANTA[p.stato]}</Badge></TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{data(p.updated_at)}</TableCell><TableCell>{!permessi.solaLettura && <Button variant="ghost" size="sm" aria-label={`Associa ${p.titolo}`} onClick={() => setDaCollegare(p)}><Link2 className="h-4 w-4" /></Button>}</TableCell>
            </TableRow>)}</TableBody></Table></div>}
            {ultimaPagina > 0 && <nav aria-label="Pagine dell'archivio" className="flex items-center justify-between gap-3"><Button variant="outline" disabled={paginaCorrente === 0} onClick={() => setPagina(paginaCorrente - 1)}>Precedenti</Button><span className="text-sm text-muted-foreground">Pagina {paginaCorrente + 1} di {ultimaPagina + 1}</span><Button variant="outline" disabled={paginaCorrente === ultimaPagina} onClick={() => setPagina(paginaCorrente + 1)}>Successive</Button></nav>}
          </>}
      </section>
      {daCollegare && <CollegamentiPiantaDialog key={daCollegare.id} riga={daCollegare} mappa={collegamenti.data} onChiudi={() => setDaCollegare(null)} />}
    </div>
  );
}
