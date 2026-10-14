import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, FileText, Folder, FolderOpen, Loader2, Settings2 } from "lucide-react";
import type { CartellaDocumenti } from "@/lib/commesse/documentiCommessa";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export const TUTTI_DOCUMENTI = "__tutti";
export const SENZA_CARTELLA = "__senza";

interface Props {
  cartelle: CartellaDocumenti[];
  conteggi: Record<string, number>;
  totale: number;
  senzaCartella: number;
  mancanti?: string[];
  loading?: boolean;
  selezione: string;
  onSelect: (id: string) => void;
  puoGestireCartelle?: boolean;
  sopraCartella?: string | null;
  onDragOverCartella?: (event: DragEvent, id: string) => void;
  onDropCartella?: (event: DragEvent, folderId: string | null) => void;
  compact?: boolean;
}

/** La stessa navigazione in creazione e nella commessa salvata: nessuna lista locale di cartelle. */
export function DocumentFoldersNavigation({ cartelle, conteggi, totale, senzaCartella, mancanti = [], loading, selezione, onSelect, puoGestireCartelle, sopraCartella, onDragOverCartella, onDropCartella, compact = false }: Props) {
  const [explore, setExplore] = useState(false);
  const available = cartelle.filter(c => !c.archiviata_at || (conteggi[c.id] ?? 0) > 0);
  const used = available.filter(c => (conteggi[c.id] ?? 0) > 0 || mancanti.includes(c.id) || selezione === c.id);
  const empty = available.filter(c => !used.some(u => u.id === c.id));
  const voce = (id: string, nome: string, count: number, dropId?: string | null) => {
    const active = selezione === id;
    return (
      <button
        key={id}
        type="button"
        aria-label={`${nome}: ${count} documenti`}
        aria-current={active ? "true" : undefined}
        onClick={() => onSelect(id)}
        {...(dropId !== undefined && onDropCartella ? {
          onDragOver: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); onDragOverCartella?.(event, id); },
          onDrop: (event: DragEvent) => { event.preventDefault(); event.stopPropagation(); onDropCartella(event, dropId); },
        } : {})}
        className={[
          "tap-compact flex h-10 min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors md:h-auto md:w-full md:shrink md:whitespace-normal md:border-0",
          active ? "border-primary/30 bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted",
          sopraCartella === id ? "bg-primary/5 ring-2 ring-primary/50" : "",
        ].join(" ")}
      >
        {id === TUTTI_DOCUMENTI ? <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          : active ? <FolderOpen aria-hidden="true" className="h-4 w-4 shrink-0" />
          : <Folder aria-hidden="true" className={`h-4 w-4 shrink-0 ${count ? "text-muted-foreground" : "text-muted-foreground/60"}`} />}
        <span className={`min-w-0 flex-1 md:break-words ${!count && !active ? "text-muted-foreground" : ""}`}>{nome}</span>
        {mancanti.includes(id) && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-label="Cartella obbligatoria vuota" />}
        <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
      </button>
    );
  };
  if (compact && !explore) return <nav aria-label="Categorie dei documenti" style={{minHeight: 0}} className="flex flex-wrap items-center gap-2">
    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium sm:flex-none">Categoria
      <select aria-label="Categoria documenti" value={selezione} onChange={e => onSelect(e.target.value)} disabled={loading}
        className="h-11 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm font-normal sm:w-64 sm:flex-none">
        <option value={TUTTI_DOCUMENTI}>Tutti i documenti ({totale})</option>
        {used.map(c => <option key={c.id} value={c.id}>{c.nome} ({conteggi[c.id] ?? 0}){mancanti.includes(c.id) ? " · obbligatoria, vuota" : ""}{c.archiviata_at ? " · archiviata" : ""}</option>)}
        {senzaCartella > 0 && <option value={SENZA_CARTELLA}>Senza categoria ({senzaCartella})</option>}
        {empty.length > 0 && <optgroup label="Categorie vuote — disponibili per nuovi file">{empty.map(c => <option key={c.id} value={c.id}>{c.nome} (0)</option>)}</optgroup>}
      </select>
    </label>
    <button type="button" className="hidden min-h-11 rounded-md border px-3 text-xs sm:block" onClick={() => setExplore(true)}>Esplora cartelle</button>
    {puoGestireCartelle && <Link to="/azienda/impostazioni/cartelle-documenti" aria-label="Gestisci categorie" title="Gestisci categorie" className="hidden h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"><Settings2 className="h-4 w-4" aria-hidden="true" /></Link>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button type="button" variant="outline" size="icon" className="h-11 w-11 shrink-0 sm:hidden" aria-label="Opzioni categorie documenti"><Settings2 className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setExplore(true)}><FolderOpen className="mr-2 h-4 w-4" />Esplora cartelle</DropdownMenuItem>
        {puoGestireCartelle && <DropdownMenuItem asChild><Link to="/azienda/impostazioni/cartelle-documenti"><Settings2 className="mr-2 h-4 w-4" />Gestisci categorie</Link></DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </nav>;
  return (
    <nav aria-label="Cartelle documenti" style={{minHeight: 0}} className="min-w-0">
      {compact && <button type="button" className="mb-2 min-h-11 rounded-md border px-3 text-xs" onClick={() => setExplore(false)}>Torna al filtro categorie</button>}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-col md:gap-0.5 md:pb-0">
        {voce(TUTTI_DOCUMENTI, "Tutti", totale)}
        {loading && <span role="status" className="m-2 inline-flex items-center gap-2 text-xs text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />Caricamento cartelle…</span>}
        {available.map((c) => voce(c.id, `${c.nome}${c.archiviata_at ? " · archiviata" : ""}`, conteggi[c.id] ?? 0, c.archiviata_at ? undefined : c.id))}
        {senzaCartella > 0 && voce(SENZA_CARTELLA, "Senza cartella", senzaCartella, null)}
      </div>
      {puoGestireCartelle && <Link to="/azienda/impostazioni/cartelle-documenti" className="mt-2 hidden items-center gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground md:inline-flex"><Settings2 aria-hidden="true" className="h-3.5 w-3.5" />Gestisci cartelle</Link>}
    </nav>
  );
}
