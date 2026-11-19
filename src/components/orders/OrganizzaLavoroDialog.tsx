import { FooterLavorazioniProvider } from "./AzioniLavorazioni";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Layers3, ListTree, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { INTERA_COMMESSA, type AmbitoLavoro } from "@/lib/orders/previsionaleLavoro";

export type SezioneLavoro = "sottofasi" | "economia" | "chi" | "mezzi" | "materiali" | "note" | "subappalto" | "previsionale";
export interface AperturaLavoro {
  attiva: string;
  ids: string[];
  sezione: SezioneLavoro;
}

export function OrganizzaLavoroDialog({ apertura, albero, sezioni, occupato, onCambio, onChiudi, children }: {
  apertura: AperturaLavoro;
  albero: readonly AmbitoLavoro[];
  sezioni: Array<[SezioneLavoro, string]>;
  occupato: boolean;
  onCambio: (a: AperturaLavoro) => void;
  onChiudi: () => void;
  children: ReactNode;
}) {
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const [cerca, setCerca] = useState("");
  const [naviga, setNaviga] = useState(false);
  const [espansione, setEspansione] = useState<Record<string, boolean>>({});
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (corpo.current) corpo.current.scrollTop = 0;
  }, [apertura.attiva, apertura.sezione]);
  const scelte = new Set(apertura.ids);
  const attiva = albero.find((r) => r.id === apertura.attiva);
  const padre = attiva && albero.find((r) => r.id === attiva.faseId && r.id !== attiva.id);
  const vicine = attiva?.faseId ? albero.filter((r) => padre ? r.faseId === padre.id && r.id !== padre.id : r.faseId === r.id) : [];
  const posizione = vicine.findIndex((r) => r.id === attiva?.id);
  const vai = (r: AmbitoLavoro) => {
    onCambio({ attiva: r.id, ids: [r.id], sezione: apertura.sezione });
    setNaviga(false);
  };
  const q = cerca.trim().toLocaleLowerCase("it");
  const gruppi = useMemo(() => {
    const voci = new Map<string, AmbitoLavoro[]>();
    for (const r of albero) {
      if (r.faseId && r.id !== r.faseId) {
        const gruppo = voci.get(r.faseId) ?? [];
        gruppo.push(r);
        voci.set(r.faseId, gruppo);
      }
    }
    return albero.filter((r) => r.id === r.faseId).map((fase) => {
      const tutte = voci.get(fase.id) ?? [];
      const corrisponde = !q || fase.nome.toLocaleLowerCase("it").includes(q);
      return { fase, tutte, viste: corrisponde ? tutte : tutte.filter((v) => v.nome.toLocaleLowerCase("it").includes(q)), corrisponde };
    }).filter(({ corrisponde, viste }) => corrisponde || viste.length > 0);
  }, [albero, q]);

  const riga = (r: AmbitoLavoro, guida?: ReactNode) => (
    <div className={cn("flex min-w-0 items-center gap-2 rounded-lg px-2",
      apertura.attiva === r.id ? "bg-blue-50 ring-1 ring-inset ring-blue-200 dark:bg-primary/15 dark:ring-primary/30" : "hover:bg-muted/80")}>
      {guida}
      <Checkbox aria-label={`Seleziona ${r.nome}`} checked={scelte.has(r.id)} disabled={occupato}
        onCheckedChange={(si) => {
          const candidati = apertura.ids.filter((id) => {
            if (id === INTERA_COMMESSA) return false;
            if (apertura.sezione !== "previsionale") return true;
            // La ripartizione lavora su ambiti distinti. Selezionare una
            // voce al posto della fase permette di ripartire fra più voci.
            if (r.id !== r.faseId) return id !== r.faseId;
            return albero.find((a) => a.id === id)?.faseId !== r.id;
          });
          const ids = r.id === INTERA_COMMESSA
            ? (si ? [r.id] : [])
            : si ? [...candidati, r.id] : apertura.ids.filter((id) => id !== r.id);
          onCambio({ ...apertura, ids });
        }} />
      <button type="button" className={cn("min-w-0 flex-1 break-words rounded-sm py-2.5 text-left text-sm leading-snug",
        apertura.attiva === r.id ? "font-semibold text-primary" : "text-foreground")} disabled={occupato}
        aria-current={apertura.attiva === r.id ? "true" : undefined}
        onClick={() => vai(r)}>
        {r.nome}
      </button>
    </div>
  );
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !occupato) onChiudi(); }}>
      <DialogContent className="flex h-[min(50rem,90dvh)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(72rem,96vw)] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none"
        onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="shrink-0 border-b bg-slate-50/70 px-4 py-2.5 pr-14 text-left sm:flex-row sm:items-baseline sm:gap-3 sm:space-y-0">
          <DialogTitle className="text-base">Organizza il lavoro</DialogTitle>
          <DialogDescription>{albero.filter((r) => r.id === r.faseId).length} fasi · {albero.filter((r) => r.faseId && r.id !== r.faseId).length} voci</DialogDescription>
        </DialogHeader>
        <Button type="button" variant="ghost" size="sm" className="m-2 justify-start md:hidden" aria-expanded={naviga} onClick={() => setNaviga(!naviga)}>
          <ListTree className="mr-2 h-4 w-4" />{naviga ? "Torna al dettaglio" : "Fasi e voci"}
        </Button>
        <div className="relative flex min-h-0 flex-1 md:pl-56 lg:pl-64">
          <aside aria-label="Fasi e voci" className={cn("w-full shrink-0 flex-col border-r bg-slate-50/70 dark:bg-muted/30 md:absolute md:inset-y-0 md:left-0 md:w-56 lg:w-64", naviga ? "flex" : "hidden md:flex")}>
            <div className="shrink-0 border-b border-border/70 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="h-9 bg-background pl-8" aria-label="Cerca fasi e voci" placeholder="Cerca fase o voce" value={cerca} onChange={(e) => setCerca(e.target.value)} />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
              {albero[0] && riga(albero[0], <Layers3 size={16} className="mx-1 shrink-0 text-muted-foreground" aria-hidden="true" />)}
              <div className="mt-2 space-y-1 border-t border-border/70 pt-2">
                {gruppi.map(({ fase, tutte, viste }) => {
                  const espansa = !!q || (espansione[fase.id] ?? (attiva?.faseId === fase.id));
                  return <div key={fase.id}>
                    {riga(fase, tutte.length > 0 ? <button type="button" className="grid h-8 w-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground"
                      aria-label={`Voci di ${fase.nome}`} aria-expanded={espansa}
                      onClick={() => setEspansione((prima) => ({ ...prima, [fase.id]: !espansa }))}>{espansa ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>
                      : <span className="w-6 shrink-0" />)}
                    {espansa && viste.length > 0 && <div className="ml-5 mt-1 space-y-1 border-l border-border pl-3">
                      {viste.map((v) => <div key={v.id}>{riga(v)}</div>)}
                    </div>}
                  </div>;
                })}
                {q && !gruppi.length && <p className="p-2 text-sm text-muted-foreground">Nessuna lavorazione trovata.</p>}
              </div>
            </div>
          </aside>
          <section className={cn("min-w-0 flex-1 flex-col", naviga ? "hidden md:flex" : "flex")} aria-label="Dettaglio lavorazione">
            <div className="shrink-0 border-b px-4 pt-2.5">
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {padre && <p className="text-xs text-muted-foreground">{padre.nome}</p>}
                  <h3 className="break-words text-base font-semibold">{attiva?.nome ?? "Lavorazioni"}</h3>
                </div>
                {vicine.length > 1 && <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={occupato || posizione < 1}
                    aria-label={padre ? "Voce prima" : "Fase prima"} onClick={() => vai(vicine[posizione - 1])}><ChevronLeft size={15} /></Button>
                  {posizione + 1} di {vicine.length}
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={occupato || posizione >= vicine.length - 1}
                    aria-label={padre ? "Voce dopo" : "Fase dopo"} onClick={() => vai(vicine[posizione + 1])}><ChevronRight size={15} /></Button>
                </div>}
              </div>
              <nav aria-label="Sezioni lavorazione" className="flex gap-1 overflow-x-auto">
                {sezioni.map(([id, nome]) => <button key={id} type="button" disabled={occupato}
                  aria-current={apertura.sezione === id ? "page" : undefined}
                  onClick={() => onCambio({ ...apertura, sezione: id })}
                  className={cn("shrink-0 rounded-t-md border-b-2 px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40",
                    apertura.sezione === id ? "border-primary bg-primary/5 font-semibold text-primary" : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground")}>{nome}</button>)}
              </nav>
            </div>
            <div ref={corpo} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 [scrollbar-gutter:stable]" tabIndex={0}>
              <FooterLavorazioniProvider value={naviga ? null : footer}>{children}</FooterLavorazioniProvider>
            </div>
          </section>
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))] sm:px-5">
          <span className="text-xs text-muted-foreground sm:text-sm">{scelte.size === 1 ? "1 lavorazione selezionata" : `${scelte.size} lavorazioni selezionate`}</span>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={occupato} onClick={onChiudi}>Chiudi</Button>
            <div ref={setFooter} className="empty:hidden" />
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
