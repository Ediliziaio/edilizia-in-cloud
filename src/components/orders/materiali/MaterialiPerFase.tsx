/**
 * L'elenco unico degli articoli della commessa, diviso per fase di lavoro
 * (con il gruppo «Senza fase»): materiali, lavorazioni e descrizioni, in una
 * tabella compatta. Ogni fase ha un'intestazione sottile (nome, conteggio,
 * importo, pillola della validazione, UN pulsante principale, «+») e si
 * chiude; le fasi con tutto arrivato partono chiuse.
 *
 * Lo stato di ogni materiale è UNO, sulla scala di statoMateriale (Da ordinare
 * → In offerta → In bozza d'ordine → Ordinato → Consegnato → Installato): la
 * testata lo conta, i contatori filtrano, le fasi lo riassumono e le righe lo
 * mostrano con la stessa funzione, così i numeri non si contraddicono.
 *
 * Con `editor` (dettaglio commessa) qui si fa anche tutto quello che faceva
 * il vecchio «Articoli della Commessa»: aggiungere un articolo (dal listino,
 * dal magazzino o a mano, con posizioni e misure, OdA, pagamenti e posa),
 * modificarlo, duplicarlo, cambiarne lo stato, gli allegati, toglierlo. La
 * finestra dell'articolo è quella di OrderItemsList (soloFinestra).
 */
import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Copy, FileCheck, FileSearch, History,
  Layers, Library, MoreHorizontal, Paperclip, PenLine, Pencil, Plus, Send, ShoppingCart, Sparkles, Trash2, Undo2, Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useAzioniMateriali, useMaterialiPerFase, type FaseMateriali, type MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { useApplicaPrezziProposti, usePrezziProposti } from "@/hooks/usePrezziMateriali";
import {
  acquistabile, azionePrincipaleFase, ETICHETTA_AZIONE_PRINCIPALE, ETICHETTA_PILLOLA, pillolaValidazione, puoModificareMateriali,
  spiegazioneFase, type AzioneFase, type AzionePrincipale, type PermessiMateriali, type PillolaValidazione,
} from "@/lib/distinta/statiFase";
import {
  contaStati, descrizioneVisibile, ETICHETTA_STATO_MATERIALE, faseCompleta, infoStato, quantitaLeggibile, riassuntoStati, SCALA_STATI,
  STATI_DA_ORDINARE, type InfoStatoMateriale, type StatoMateriale,
} from "@/lib/distinta/statoMateriale";
import { ETICHETTA_FONTE_PREZZO, prezzoAttuale, totaleStimato, type FontePrezzo, type PrezzoProposto } from "@/lib/distinta/prezziMateriali";
import {
  allegatoOda, dettaglioAccontoSaldo, eliminabile, eMateriale, ETICHETTA_ORDINAMENTO, filtraPerFonte, ordinaRighe, type FiltroFonte, type Ordinamento,
} from "@/lib/distinta/elencoArticoli";
import { ODA_STATUS_LABELS } from "@/lib/odaStatus";
import { OrderItemsList, STATUS_CONFIG, statusConfig, type OrderItem, type OrderItemStatus, type RichiestaArticolo } from "@/components/orders/OrderItemsList";
import { OrderItemAttachments } from "@/components/orders/OrderItemAttachments";
import { openAttachmentInTab } from "@/components/orders/filePreviewUtils";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

const GeneraMaterialiDialog = lazy(() => import("./GeneraMaterialiDialog"));
const PlanimetrieDialog = lazy(() => import("./PlanimetrieDialog"));

/** Quello che serve per aggiungere e modificare gli articoli (dettaglio commessa). */
export interface EditorArticoli {
  items: OrderItem[];
  onItemsChange: (items: OrderItem[]) => void;
  onItemUpdate: (item: OrderItem) => void;
  onAttachmentsRefresh?: () => void;
  companyId: string;
  onAddLabor?: (labor: { external_team_id: string; total_cost: number; notes: string }) => void;
}

const COLORE_STATO: Record<StatoMateriale, string> = {
  da_ordinare: "border-border bg-muted text-muted-foreground",
  in_offerta: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  in_bozza_oda: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  ordinato: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  consegnato: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  installato: "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-700",
};

const COLORE_PILLOLA: Record<PillolaValidazione, string> = {
  bozza: "bg-muted text-muted-foreground",
  da_validare: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  validata: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  rimandata: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
};

const ICONA_FONTE: Record<FontePrezzo, typeof Library> = {
  listino: Library,
  ultimo_acquisto: History,
  scomposizione: Layers,
  offerta: FileCheck,
  ordine: ShoppingCart,
  manuale: PenLine,
};

const ICONA_AZIONE: Record<AzionePrincipale, typeof Send> = {
  invia_validazione: Send,
  valida: CheckCircle2,
  rimanda: Undo2,
  ordina: ShoppingCart,
};

const ETICHETTA_NATURA: Record<string, string> = { lavorazione: "Lavorazione", descrizione: "Descrizione" };

const numero = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 });

const dataBreve = (d: string) => {
  const [a, m, g] = d.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, g).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

/** Suggerimento al passaggio: in un portale, posizionato da Radix, non copre i titoli. */
function Suggerimento({ testo, children, lato = "top" }: { testo: ReactNode; children: ReactNode; lato?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={lato} collisionPadding={8} className="max-w-xs whitespace-pre-line text-xs">{testo}</TooltipContent>
    </Tooltip>
  );
}

function Provenienza({ m }: { m: MaterialeFase }) {
  if (!m.origine_materiale || m.origine_materiale === "manuale") return null;
  const origini = m.origini ?? [];
  const titolo = origini.map((o) =>
    o.tipo === "computo"
      ? `${o.codice ? o.codice + " · " : ""}${o.descrizione} (${numero(o.quantita_voce)} ${o.unita_voce ?? ""}) → ${numero(o.quantita)}`
      : `${o.documento ?? "Tavola"} · ${o.simbolo}${o.locale ? " · " + o.locale : ""} (${numero(o.quantita_simbolo)}) → ${numero(o.quantita)}`,
  ).join("\n");
  const etichetta = m.origine_materiale === "planimetria"
    ? `Tavola${m.locale ? " · " + m.locale : ""}`
    : origini.length > 1 ? `Computo · ${origini.length} voci` : `Computo${origini[0]?.tipo === "computo" && origini[0].codice ? " · " + origini[0].codice : ""}`;
  const badge = (
    <span tabIndex={titolo ? 0 : undefined} className="inline-flex max-w-full items-center gap-1 truncate rounded border border-violet-200 bg-violet-50 px-1 text-[11px] text-violet-800 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
      {m.origine_materiale === "planimetria" ? <Layers className="h-3 w-3 shrink-0" aria-hidden /> : <FileSearch className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">{etichetta}</span>
    </span>
  );
  return titolo ? <Suggerimento testo={titolo} lato="bottom">{badge}</Suggerimento> : badge;
}

/** Importo della riga con la fonte del prezzo come icona; il prezzo proposto (non ancora scritto) in corsivo. */
function Importo({ m, proposto }: { m: MaterialeFase; proposto: PrezzoProposto | undefined }) {
  const attuale = prezzoAttuale(m);
  const p = attuale ?? proposto;
  const rate = dettaglioAccontoSaldo(m);
  if (!p) {
    return <span className="text-xs text-muted-foreground">Senza prezzo</span>;
  }
  const Icona = ICONA_FONTE[p.fonte] ?? PenLine;
  const delta = attuale && m.standard_cost && m.standard_cost > 0 ? (attuale.prezzo - m.standard_cost) * m.quantity : 0;
  const fonte = `${ETICHETTA_FONTE_PREZZO[p.fonte]}${attuale ? "" : " (proposto)"}`;
  const spiegazione = [
    `${formatCurrency(p.prezzo)}/${quantitaLeggibile(1, m.unita_misura).unita} · ${fonte}`,
    p.dettaglio,
    attuale ? null : "Si scrive con «Usa i prezzi proposti»",
    m.standard_cost && m.standard_cost > 0 ? `Listino ${formatCurrency(m.standard_cost)}` : null,
    Math.abs(delta) > 0.005 ? `${delta > 0 ? "Sopra" : "Sotto"} il listino di ${formatCurrency(Math.abs(delta))}` : null,
  ].filter(Boolean).join("\n");
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className={cn("inline-flex items-center gap-1 tabular-nums", attuale ? "text-foreground" : "italic text-violet-700 dark:text-violet-300")}>
        <Suggerimento testo={spiegazione}>
          <span tabIndex={0} className="inline-flex text-muted-foreground" aria-label={`Prezzo: ${fonte}`}>
            <Icona className="h-3 w-3" aria-hidden />
          </span>
        </Suggerimento>
        {formatCurrency(p.prezzo * m.quantity)}
        {Math.abs(delta) > 0.005 && <span className={cn("text-[10px]", delta > 0 ? "text-red-600" : "text-emerald-600")} aria-hidden>{delta > 0 ? "▲" : "▼"}</span>}
      </span>
      {m.is_paid ? (
        <span className="text-[11px] text-emerald-700 dark:text-emerald-400">Pagato</span>
      ) : rate ? (
        <span className="flex flex-col items-end whitespace-nowrap text-[11px] tabular-nums text-muted-foreground" title={`Acconto ${formatCurrency(rate.acconto)} · Saldo ${formatCurrency(rate.saldo)}`}>
          <span className={rate.accontoPagato ? "text-emerald-700 dark:text-emerald-400" : undefined}>Acconto {rate.accontoPagato ? "✓" : "—"}</span>
          <span className={rate.saldoPagato ? "text-emerald-700 dark:text-emerald-400" : undefined}>
            Saldo {rate.saldoPagato ? "✓" : rate.saldoPrevisto ? dataBreve(rate.saldoPrevisto) : "—"}
          </span>
        </span>
      ) : m.deposit_paid ? (
        <span className="text-[11px] text-amber-700 dark:text-amber-400">Acconto pagato</span>
      ) : null}
    </div>
  );
}

function OrdineArrivo({ m, info, oda }: { m: MaterialeFase; info: InfoStatoMateriale; oda: { file_name: string; file_url: string } | null }) {
  const [primo, ...altri] = info.ordini;
  const arrivo = primo?.arrivo ?? m.delivery_date ?? null;
  if (!primo && !arrivo && !oda) return <span className="text-xs text-muted-foreground max-lg:hidden">—</span>;
  return (
    <div className="flex min-w-0 flex-col leading-tight">
      {primo && (
        <span className="truncate text-xs font-medium tabular-nums">
          {primo.numero}
          {altri.length > 0 && (
            <Suggerimento testo={info.ordini.map((o) => `${o.numero}${o.stato ? ` · ${ODA_STATUS_LABELS[o.stato] ?? o.stato}` : ""}`).join("\n")}>
              <span tabIndex={0} className="ml-1 text-muted-foreground">+{altri.length}</span>
            </Suggerimento>
          )}
        </span>
      )}
      <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground tabular-nums">
        {primo?.data && <span>del {dataBreve(primo.data)}</span>}
        {arrivo && <span>arrivo {dataBreve(arrivo)}</span>}
        {oda && (
          <button type="button" onClick={() => openAttachmentInTab(oda.file_url)} aria-label={`Scarica l'ODA allegato: ${oda.file_name}`}
            className="inline-flex items-center gap-0.5 rounded border px-1 text-[10px] text-foreground hover:bg-muted">
            <Paperclip className="h-2.5 w-2.5" aria-hidden />ODA allegato
          </button>
        )}
      </span>
    </div>
  );
}

function RigaMateriale({
  m, selezionato, onSeleziona, modificabile, tecnico, nomeFornitore, onQuantita, canViewCosts, proposto, azioni, oda,
}: {
  /** L'ordine d'acquisto allegato alla riga, se c'è: si scarica con un clic. */
  oda: { file_name: string; file_url: string } | null;
  m: MaterialeFase;
  selezionato: boolean;
  onSeleziona: (v: boolean) => void;
  modificabile: boolean;
  tecnico: boolean;
  nomeFornitore: string | null;
  onQuantita: (q: number) => void;
  canViewCosts: boolean;
  proposto: PrezzoProposto | undefined;
  azioni: ReactNode;
}) {
  const [bozza, setBozza] = useState<string | null>(null);
  const materiale = eMateriale(m);
  const info = infoStato(m);
  const calcolata = m.quantita_calcolata != null && Math.abs(Number(m.quantita_calcolata) - m.quantity) > 0.005 ? Number(m.quantita_calcolata) : null;
  const salva = () => {
    if (bozza == null) return;
    const q = Math.round(Number(bozza.replace(",", ".")));
    setBozza(null);
    if (Number.isFinite(q) && q > 0 && q !== m.quantity) onQuantita(q);
  };
  const oltre = (m.ordinata ?? 0) > m.quantity && m.quantity > 0;
  const descrizione = descrizioneVisibile(m.name, m.description);
  const qta = quantitaLeggibile(m.quantity, m.unita_misura, info.unitaDaVerificare?.unitaOrdine);
  const fornitore = nomeFornitore ?? (materiale ? <span className="text-muted-foreground">Da scegliere</span> : null);
  const tooltipStato = [
    info.dettaglio,
    m.status ? `Riga: ${statusConfig(m.status).label}` : null,
    ...info.ordini.map((o) => `${o.numero}${o.stato ? `: ${ODA_STATUS_LABELS[o.stato] ?? o.stato}` : ""}`),
    oltre ? `Ordinati ${numero(m.ordinata)} su ${numero(m.quantity)} previsti` : null,
  ].filter(Boolean).join("\n");

  return (
    // Sul telefono la riga è un blocco che va a capo (nome e ⋯ in alto, poi quantità, ordine, stato,
    // importo); da lg in su è una riga di tabella con le colonne dell'intestazione.
    <tr className="relative flex flex-wrap items-center gap-x-3 gap-y-1 border-t py-2 pl-11 pr-3 hover:bg-muted/40 max-lg:[&>td]:order-4 lg:table-row lg:p-0 lg:[&>td]:px-2 lg:[&>td]:py-1.5 lg:[&>td]:align-middle">
      <td className="max-lg:absolute max-lg:left-3 max-lg:top-2.5 lg:!pl-3">
        <Checkbox checked={selezionato} onCheckedChange={(v) => onSeleziona(!!v)} aria-label={`Seleziona ${m.name}`} />
      </td>
      <td className="min-w-0 flex-1 max-lg:!order-2 max-lg:basis-[calc(100%-3.75rem)]">
        <p className="line-clamp-2 break-words text-sm font-medium text-foreground">
          {m.name}
          {!materiale && <span className="ml-2 rounded bg-muted px-1.5 text-[11px] font-normal text-muted-foreground">{ETICHETTA_NATURA[m.natura_riga ?? ""] ?? m.natura_riga}</span>}
        </p>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {m.specifiche && <span className="max-w-full truncate">{m.specifiche}</span>}
          {descrizione && (
            descrizione.length > 60
              ? <Suggerimento testo={descrizione} lato="bottom"><span tabIndex={0} className="max-w-[18rem] truncate">{descrizione}</span></Suggerimento>
              : <span>{descrizione}</span>
          )}
          <Provenienza m={m} />
          {m.stock_item_id && <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Warehouse className="h-3 w-3" aria-hidden />Da giacenza</span>}
          {m.posizioni && m.posizioni.length > 0 && (
            <Suggerimento testo={m.posizioni.map((po) => `${po.descrizione}${po.misure ? ` · ${po.misure}` : ""} ×${po.quantita}`).join("\n")} lato="bottom">
              <span tabIndex={0} className="underline decoration-dotted underline-offset-2">{m.posizioni.length} posizioni</span>
            </Suggerimento>
          )}
          {nomeFornitore && <span className="truncate xl:hidden">{nomeFornitore}</span>}
          {m.avviso && (
            <Suggerimento testo={m.avviso}>
              <span tabIndex={0} className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400" aria-label={`Attenzione: ${m.avviso}`}>
                <AlertTriangle className="h-3 w-3" aria-hidden />Da verificare
              </span>
            </Suggerimento>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap text-sm tabular-nums lg:text-right">
        {modificabile ? (
          <label className="inline-flex items-center gap-1">
            <span className="sr-only">Quantità di {m.name}</span>
            <Input
              inputMode="numeric"
              className="h-7 w-14 px-1.5 text-right tabular-nums"
              value={bozza ?? String(m.quantity)}
              onChange={(e) => setBozza(e.target.value)}
              onBlur={salva}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              title={tecnico ? "Correzione del tecnico" : undefined}
            />
            <span className="max-w-[3.25rem] truncate text-xs text-muted-foreground">{qta.unita}</span>
          </label>
        ) : (
          <span>{qta.numero}{qta.numero ? " " : ""}<span className="text-xs text-muted-foreground">{qta.unita}</span></span>
        )}
        {calcolata != null && <span className="block text-[11px] text-muted-foreground">calcolata {numero(calcolata)}</span>}
      </td>
      <td className="hidden truncate text-sm xl:table-cell" title={nomeFornitore ?? undefined}>{fornitore}</td>
      <td className="min-w-0">{materiale ? <OrdineArrivo m={m} info={info} oda={oda} /> : null}</td>
      <td>
        {materiale ? (
          <div className="flex flex-col items-start gap-0.5">
            {tooltipStato ? (
              <Suggerimento testo={tooltipStato}>
                <span tabIndex={0} className={cn("inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium", COLORE_STATO[info.stato])}>
                  {ETICHETTA_STATO_MATERIALE[info.stato]}
                </span>
              </Suggerimento>
            ) : (
              <span className={cn("inline-flex whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium", COLORE_STATO[info.stato])}>
                {ETICHETTA_STATO_MATERIALE[info.stato]}
              </span>
            )}
            {info.dettaglio && <span className="text-[11px] text-muted-foreground">{info.dettaglio}</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{statusConfig(m.status).label}</span>
        )}
      </td>
      {canViewCosts && (
        <td className="text-right text-sm max-lg:ml-auto">{materiale ? <Importo m={m} proposto={proposto} /> : null}</td>
      )}
      <td className="shrink-0 max-lg:!order-3 lg:!pr-2 lg:text-right">{azioni}</td>
    </tr>
  );
}

interface SezioneProps {
  fase: FaseMateriali;
  righe: MaterialeFase[];
  colonne: number;
  permessi: PermessiMateriali;
  canViewCosts: boolean;
  selezione: Set<string>;
  setSelezione: (s: Set<string>) => void;
  nomeFornitore: (id: string | null) => string | null;
  onAzione: (azione: AzioneFase) => void;
  onOrdina: () => void;
  onQuantita: (m: MaterialeFase, q: number, tecnico: boolean) => void;
  aperta: boolean;
  onApri: () => void;
  proposte: Map<string, PrezzoProposto>;
  onAggiungi?: () => void;
  azioniRiga: (m: MaterialeFase) => ReactNode;
  allegatoOdaDi: (m: MaterialeFase) => { file_name: string; file_url: string } | null;
}

function SezioneFase({
  fase, righe, colonne, permessi, canViewCosts, selezione, setSelezione, nomeFornitore, onAzione, onOrdina, onQuantita, aperta, onApri, proposte,
  onAggiungi, azioniRiga, allegatoOdaDi,
}: SezioneProps) {
  const stato = fase.validazione?.stato ?? null;
  // Conteggi, validazione e importi contano i materiali: lavorazioni e descrizioni no.
  const materiali = fase.materiali.filter(eMateriale);
  const conteggio = contaStati(materiali.map((m) => infoStato(m).stato));
  const daOrdinare = STATI_DA_ORDINARE.reduce((n, s) => n + conteggio[s], 0);
  const stima = totaleStimato(materiali, proposte);
  const { principale, secondarie } = azionePrincipaleFase(stato, permessi, {
    haFase: !!fase.id,
    daOrdinare,
    senzaQuantita: materiali.filter((m) => !(m.quantity > 0)).length,
    inAcquisto: conteggio.totale - conteggio.da_ordinare,
  });
  const pillola = pillolaValidazione(fase.validazione);
  const modificabile = puoModificareMateriali(stato, permessi);
  const tecnico = stato === "da_validare" && permessi.canValidateBom && !permessi.canEditOrders;
  const ids = righe.map((m) => m.id);
  const tutti = ids.length > 0 && ids.every((id) => selezione.has(id));
  const nota = pillola === "rimandata" ? fase.validazione?.note_validazione : null;
  const spiegazione = stato === "da_validare" ? spiegazioneFase(stato, permessi) : null;
  const altre = fase.materiali.length - materiali.length;
  const riassunto = riassuntoStati(conteggio);
  // La fase senza validazione non ha pulsanti di validazione nell'intestazione.
  const esegui = (a: AzionePrincipale) => (a === "ordina" ? onOrdina() : onAzione(a));

  const seleziona = (id: string, v: boolean) => {
    const s = new Set(selezione);
    if (v) s.add(id); else s.delete(id);
    setSelezione(s);
  };

  return (
    <tbody aria-label={`Fase ${fase.nome}`} className="block border-t first:border-t-0 lg:table-row-group">
      <tr className="block bg-muted/50 lg:table-row">
        <th scope="colgroup" colSpan={colonne} className="block px-3 py-1.5 text-left font-normal lg:table-cell">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Checkbox
              checked={tutti}
              onCheckedChange={(v) => {
                const s = new Set(selezione);
                for (const id of ids) { if (v) s.add(id); else s.delete(id); }
                setSelezione(s);
              }}
              aria-label={`Seleziona tutte le righe di ${fase.nome}`}
              disabled={!ids.length}
            />
            <button type="button" onClick={onApri} aria-expanded={aperta} aria-label={`${aperta ? "Chiudi" : "Apri"} la fase ${fase.nome}`}
              className="flex min-w-0 items-center gap-1.5 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {aperta ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
              <span className="truncate text-sm font-semibold text-foreground">{fase.nome}</span>
            </button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {conteggio.totale} {conteggio.totale === 1 ? "materiale" : "materiali"}{altre > 0 ? ` · ${altre} ${altre === 1 ? "altra riga" : "altre righe"}` : ""}
              {riassunto ? <span className="max-sm:hidden"> · {riassunto}</span> : null}
            </span>
            {canViewCosts && stima.totale > 0 && (
              <span className="text-xs font-medium tabular-nums text-foreground">{stima.proposto > 0 ? "stima " : ""}{formatCurrency(stima.totale)}</span>
            )}
            {pillola && (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", COLORE_PILLOLA[pillola])}>{ETICHETTA_PILLOLA[pillola]}</span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {principale && (
                <Button size="sm" className="tap-compact h-8 px-2.5 text-xs sm:h-7" variant={principale === "rimanda" ? "outline" : "default"} onClick={() => esegui(principale)}>
                  {(() => { const I = ICONA_AZIONE[principale]; return <I className="mr-1 h-3.5 w-3.5" aria-hidden />; })()}
                  {ETICHETTA_AZIONE_PRINCIPALE[principale]}
                </Button>
              )}
              {principale === "valida" && secondarie.includes("rimanda") && (
                <Button size="sm" variant="outline" className="tap-compact h-8 px-2.5 text-xs sm:h-7" onClick={() => onAzione("rimanda")}>
                  <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden />{ETICHETTA_AZIONE_PRINCIPALE.rimanda}
                </Button>
              )}
              {principale !== "valida" && secondarie.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="tap-compact h-8 w-8 sm:h-7 sm:w-7" aria-label={`Altre azioni sulla fase ${fase.nome}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {secondarie.map((a) => (
                      <DropdownMenuItem key={a} onSelect={() => onAzione(a)}>{ETICHETTA_AZIONE_PRINCIPALE[a]}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {onAggiungi && (
                <Button size="icon" variant="outline" className="tap-compact h-8 w-8 sm:h-7 sm:w-7" onClick={onAggiungi} aria-label={`Aggiungi un articolo in ${fase.nome}`}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {aperta && (nota || spiegazione) && (
            <p className={cn("mt-1 rounded px-2 py-1 text-xs", nota ? "bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200" : "text-muted-foreground")}>
              {nota ? <>Rimandati indietro dal tecnico: «{nota}»</> : spiegazione}
            </p>
          )}
        </th>
      </tr>
      {aperta && (righe.length ? righe.map((m) => (
        <RigaMateriale
          key={m.id}
          m={m}
          selezionato={selezione.has(m.id)}
          onSeleziona={(v) => seleziona(m.id, v)}
          modificabile={modificabile && infoStato(m).stato === "da_ordinare" && eMateriale(m)}
          tecnico={tecnico}
          nomeFornitore={nomeFornitore(m.supplier_id)}
          onQuantita={(q) => onQuantita(m, q, tecnico)}
          canViewCosts={canViewCosts}
          proposto={proposte.get(m.id)}
          azioni={azioniRiga(m)}
          oda={allegatoOdaDi(m)}
        />
      )) : (
        <tr className="block border-t lg:table-row">
          <td colSpan={colonne} className="block px-3 py-2 text-sm text-muted-foreground lg:table-cell">
            {fase.materiali.length ? "Nessuna riga con questo filtro." : "Nessuna riga in questa fase."}
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export function MaterialiPerFase({ orderId, orderCode, editor }: { orderId: string; orderCode?: string | null; editor?: EditorArticoli }) {
  const perm = usePermissions();
  const permessi: PermessiMateriali = {
    canEditOrders: !!perm.canEditOrders, canValidateBom: !!perm.canValidateBom, canManagePurchasing: !!perm.canManagePurchasing,
  };
  const canViewCosts = !!perm.canViewCosts;
  const { fasi, isLoading, isError, refetch } = useMaterialiPerFase(orderId);
  const azioni = useAzioniMateriali(orderId, orderCode);
  const { suppliers } = useOperationalSuppliers();
  const [selezione, setSelezione] = useState<Set<string>>(new Set());
  /** Aperta/chiusa scelta a mano; le altre seguono la regola (chiuse se tutto è arrivato). */
  const [aperte, setAperte] = useState<Map<string, boolean>>(new Map());
  const [mostraVuote, setMostraVuote] = useState(false);
  const [filtroStato, setFiltroStato] = useState<StatoMateriale | null>(null);
  const [dettaglioUnita, setDettaglioUnita] = useState(false);
  const [rimando, setRimando] = useState<{ phaseId: string; nome: string } | null>(null);
  const [nota, setNota] = useState("");
  const [offerta, setOfferta] = useState(false);
  const [titoloOfferta, setTitoloOfferta] = useState("");
  const [fornitoriOfferta, setFornitoriOfferta] = useState<Set<string>>(new Set());
  const [genera, setGenera] = useState(false);
  const [tavole, setTavole] = useState(false);
  const [filtro, setFiltro] = useState<FiltroFonte>("tutti");
  const [ordine, setOrdine] = useState<Ordinamento>("posizione");
  const [richiesta, setRichiesta] = useState<RichiestaArticolo | null>(null);
  const [allegatiDi, setAllegatiDi] = useState<MaterialeFase | null>(null);
  const [daTogliere, setDaTogliere] = useState<MaterialeFase | null>(null);

  const nomeFornitore = (id: string | null) => (id ? suppliers.find((s: { id: string }) => s.id === id)?.name ?? "Fornitore" : null);
  const tutteRighe = useMemo(() => fasi.flatMap((f) => f.materiali), [fasi]);
  const tuttiMateriali = useMemo(() => tutteRighe.filter(eMateriale), [tutteRighe]);
  const scelti = tutteRighe.filter((m) => selezione.has(m.id));
  const sceltiMateriali = scelti.filter(eMateriale);
  const faseDi = (m: MaterialeFase) => fasi.find((f) => f.materiali.includes(m));
  const sceltiAcquistabili = sceltiMateriali.filter((m) => acquistabile(faseDi(m)?.validazione?.stato ?? null));
  const bloccati = sceltiMateriali.length - sceltiAcquistabili.length;
  const conteggio = contaStati(tuttiMateriali.map((m) => infoStato(m).stato));
  const puoComprare = permessi.canEditOrders || permessi.canManagePurchasing;
  const { proposte } = usePrezziProposti(orderId, tuttiMateriali, canViewCosts);
  const applicaPrezzi = useApplicaPrezziProposti(orderId);
  const stima = totaleStimato(tuttiMateriali, proposte);
  const puoScrivere = !!editor && permessi.canEditOrders;
  const nuovo = (phaseId: string | null) => setRichiesta({ tipo: "nuovo", phaseId, nonce: Date.now() });
  const inEditor = (m: MaterialeFase) => !!editor?.items.some((i) => i.id === m.id);
  const colonne = canViewCosts ? 8 : 7;

  // Unità dell'ordine diverse da quella della riga: un riepilogo solo, non un avviso per riga.
  const unitaDaVerificare = tuttiMateriali.filter((m) => infoStato(m).unitaDaVerificare);
  const allineabili = permessi.canEditOrders
    ? unitaDaVerificare.filter((m) => infoStato(m).allineaA && puoModificareMateriali(faseDi(m)?.validazione?.stato ?? null, permessi))
    : [];

  // Gli allegati arrivano con gli articoli dell'editor (dettaglio commessa).
  const allegatoOdaDi = (m: MaterialeFase) => allegatoOda(editor?.items.find((i) => i.id === m.id)?.attachments);

  const azioniRiga = (m: MaterialeFase) => {
    if (!editor) return null;
    const item = editor.items.find((i) => i.id === m.id);
    const allegati = item?.attachments?.length ?? 0;
    if (!puoScrivere) {
      return allegati > 0 ? (
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Allegati di ${m.name}`} onClick={() => setAllegatiDi(m)}><Paperclip className="h-4 w-4" /></Button>
      ) : null;
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Azioni su ${m.name}`}>
            {allegati > 0 ? <Paperclip className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {inEditor(m) ? (
            <>
              <DropdownMenuItem onSelect={() => setRichiesta({ tipo: "modifica", id: m.id, nonce: Date.now() })}><Pencil className="mr-2 h-4 w-4" />Modifica</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRichiesta({ tipo: "duplica", id: m.id, nonce: Date.now() })}><Copy className="mr-2 h-4 w-4" />Duplica</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Stato della riga: {statusConfig(m.status).label}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={m.status ?? "da_ordinare"} onValueChange={(v) => item && editor.onItemUpdate({ ...item, status: v as OrderItemStatus })}>
                    {Object.entries(STATUS_CONFIG).map(([k, c]) => <DropdownMenuRadioItem key={k} value={k}>{c.label}</DropdownMenuRadioItem>)}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => setAllegatiDi(m)}><Paperclip className="mr-2 h-4 w-4" />Allegati{allegati ? ` (${allegati})` : ""}</DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled>Le lavorazioni si gestiscono in Cantiere</DropdownMenuItem>
          )}
          {eliminabile(m) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-700" onSelect={() => setDaTogliere(m)}><Trash2 className="mr-2 h-4 w-4" />Togli dalla commessa</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  if (isLoading) return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Carico gli articoli…</p>;
  if (isError) {
    return (
      <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        Articoli non caricati. <button type="button" className="underline" onClick={() => refetch()}>Riprova</button>
      </p>
    );
  }

  const proposteDaScrivere = tuttiMateriali.filter((m) => !prezzoAttuale(m) && proposte.has(m.id));
  const allegatiItem = allegatiDi ? editor?.items.find((i) => i.id === allegatiDi.id) : undefined;
  const rangoStato = (m: MaterialeFase) => (eMateriale(m) ? SCALA_STATI.indexOf(infoStato(m).stato) : SCALA_STATI.length);
  const filtraStato = (righe: MaterialeFase[]) => (filtroStato ? righe.filter((m) => eMateriale(m) && infoStato(m).stato === filtroStato) : righe);
  const filtrato = filtro !== "tutti" || !!filtroStato;

  const sezioni = fasi.map((f) => {
    const chiave = f.id ?? "_senza";
    const materiali = f.materiali.filter(eMateriale);
    const completa = faseCompleta(contaStati(materiali.map((m) => infoStato(m).stato)));
    const righe = ordinaRighe(filtraStato(filtraPerFonte(f.materiali, filtro)), ordine, nomeFornitore, rangoStato);
    return { f, chiave, righe, aperta: aperte.get(chiave) ?? !completa };
  });
  const vuote = sezioni.filter((s) => s.f.materiali.length === 0).length;
  const visibili = sezioni.filter((s) => (s.f.materiali.length === 0 ? mostraVuote && !filtrato : !filtrato || s.righe.length > 0));
  const tutteAperte = visibili.length > 0 && visibili.every((s) => s.aperta);

  const ordinaFase = (f: FaseMateriali, chiave: string) => {
    const daOrdinare = f.materiali.filter((m) => eMateriale(m) && STATI_DA_ORDINARE.includes(infoStato(m).stato));
    setSelezione(new Set(daOrdinare.map((m) => m.id)));
    setAperte(new Map(aperte).set(chiave, true));
    toast.info(`${daOrdinare.length} materiali di «${f.nome}» selezionati: crea l'ordine o richiedi un'offerta dalla barra in alto.`);
  };

  const chip = (attivo: boolean) => cn(
    "tap-compact inline-flex h-7 items-center gap-1 rounded-full sm:h-6 border px-2 text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    attivo ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted",
  );

  return (
    <TooltipProvider delayDuration={250}>
      <div className="space-y-2" id="materiali-per-fase">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-card px-3 py-2">
          <h3 className="text-sm font-semibold text-foreground">Articoli e materiali per fase</h3>
          {tuttiMateriali.length > 0 && (
            <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtra per stato">
              <button type="button" className={chip(filtroStato === null)} aria-pressed={filtroStato === null} onClick={() => setFiltroStato(null)}>
                {conteggio.totale} {conteggio.totale === 1 ? "materiale" : "materiali"}
              </button>
              {SCALA_STATI.filter((s) => conteggio[s] > 0).map((s) => (
                <button key={s} type="button" className={chip(filtroStato === s)} aria-pressed={filtroStato === s}
                  onClick={() => setFiltroStato(filtroStato === s ? null : s)}>
                  {conteggio[s]} {ETICHETTA_STATO_MATERIALE[s]}
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 sm:ml-auto">
            {puoScrivere && (
              <Button size="sm" className="tap-compact h-8 px-2.5 text-xs" onClick={() => nuovo(null)}>
                <Plus className="mr-1 h-3.5 w-3.5" aria-hidden /> Aggiungi articolo
              </Button>
            )}
            {permessi.canEditOrders && (
              <Button size="sm" variant={puoScrivere ? "outline" : "default"} className="tap-compact h-8 px-2.5 text-xs" onClick={() => setGenera(true)}>
                <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden /> Genera dal computo
              </Button>
            )}
            <Button size="sm" variant="outline" className="tap-compact h-8 px-2.5 text-xs" onClick={() => setTavole(true)}>
              <Layers className="mr-1 h-3.5 w-3.5" aria-hidden /> Tavole
            </Button>
            <Suggerimento testo="Scomposizioni: da una voce di computo ai suoi materiali">
              <Button size="icon" variant="ghost" className="tap-compact h-8 w-8" asChild>
                <Link to="/azienda/scomposizioni" aria-label="Scomposizioni"><Library className="h-4 w-4" aria-hidden /></Link>
              </Button>
            </Suggerimento>
          </div>
        </div>

        {tutteRighe.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="inline-flex rounded-md border bg-card p-0.5" role="group" aria-label="Provenienza">
              {([["tutti", "Tutti"], ["giacenza", "Da giacenza"], ["fornitore", "Da fornitore"]] as [FiltroFonte, string][]).map(([v, l]) => (
                <button key={v} type="button" aria-pressed={filtro === v} className={cn("tap-compact rounded px-2.5 py-1", filtro === v && "bg-foreground text-background")} onClick={() => setFiltro(v)}>{l}</button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span id="materiali-ordina">Ordina per</span>
              <Select value={ordine} onValueChange={(v) => setOrdine(v as Ordinamento)}>
                <SelectTrigger className="h-8 w-32 bg-card text-xs" aria-labelledby="materiali-ordina"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ETICHETTA_ORDINAMENTO) as Ordinamento[]).map((o) => <SelectItem key={o} value={o}>{ETICHETTA_ORDINAMENTO[o]}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <Button size="sm" variant="ghost" className="tap-compact h-8 px-2 text-xs"
              onClick={() => setAperte(new Map(sezioni.map((s) => [s.chiave, !tutteAperte])))}>
              {tutteAperte ? <ChevronsDownUp className="mr-1 h-3.5 w-3.5" aria-hidden /> : <ChevronsUpDown className="mr-1 h-3.5 w-3.5" aria-hidden />}
              {tutteAperte ? "Chiudi tutte" : "Apri tutte"}
            </Button>
            {vuote > 0 && (
              <Button size="sm" variant="ghost" className="tap-compact h-8 px-2 text-xs" aria-pressed={mostraVuote} onClick={() => setMostraVuote(!mostraVuote)}>
                {mostraVuote ? "Nascondi le fasi senza materiali" : `Mostra fasi senza materiali (${vuote})`}
              </Button>
            )}
            {canViewCosts && stima.totale > 0 && (
              <span className="text-muted-foreground tabular-nums sm:ml-auto">
                {stima.proposto > 0 ? "Stima " : "Totale "}<strong className="font-semibold text-foreground">{formatCurrency(stima.totale)}</strong>
                {stima.senzaPrezzo > 0 ? ` · ${stima.senzaPrezzo} senza prezzo` : ""}
              </span>
            )}
            {canViewCosts && permessi.canEditOrders && proposteDaScrivere.length > 0 && (
              <Button size="sm" variant="outline" className="tap-compact h-8 bg-card" disabled={applicaPrezzi.isPending}
                title="Scrive sui materiali senza prezzo il prezzo proposto (listino, ultimo acquisto o scomposizione)"
                onClick={() => applicaPrezzi.mutate(proposteDaScrivere.map((m) => ({ id: m.id, prezzo: proposte.get(m.id)! })))}>
                Usa i prezzi proposti ({proposteDaScrivere.length})
              </Button>
            )}
          </div>
        )}

        {unitaDaVerificare.length > 0 && (
          <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                <strong>{unitaDaVerificare.length} {unitaDaVerificare.length === 1 ? "riga" : "righe"} con l'unità dell'ordine da verificare</strong>
                {" "}— finché non coincide, il residuo da ordinare non si calcola.
              </span>
              <button type="button" className="tap-compact underline underline-offset-2" aria-expanded={dettaglioUnita} onClick={() => setDettaglioUnita(!dettaglioUnita)}>
                {dettaglioUnita ? "Nascondi" : "Quali sono"}
              </button>
              {allineabili.length > 0 && (
                <Button size="sm" variant="outline" className="tap-compact h-7 bg-card text-xs sm:ml-auto" disabled={azioni.allineaUnita.isPending}
                  title="Le righe da 1 pezzo ordinate come 1 «a corpo» diventano «a corpo»: l'ordine non cambia"
                  onClick={() => azioni.allineaUnita.mutate(allineabili.map((m) => ({ id: m.id, unita: infoStato(m).allineaA! })))}>
                  Allinea le unità ({allineabili.length})
                </Button>
              )}
            </div>
            {dettaglioUnita && (
              <ul className="mt-1 space-y-0.5 pl-5">
                {unitaDaVerificare.map((m) => {
                  const i = infoStato(m);
                  return (
                    <li key={m.id}>
                      {m.name}: riga in «{i.unitaDaVerificare!.unitaRiga}», {i.ordini.map((o) => o.numero).join(", ") || "ordine"} in «{i.unitaDaVerificare!.unitaOrdine.join("», «")}»
                      {i.allineaA ? " — si allinea" : " — da correggere a mano"}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {scelti.length > 0 && (
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/95 px-3 py-2 text-sm shadow-sm backdrop-blur dark:border-orange-800 dark:bg-orange-950/95">
            <strong className="tabular-nums">{scelti.length} selezionati</strong>
            {bloccati > 0 && <span className="text-xs text-amber-800 dark:text-amber-300">{bloccati} di fasi non validate: non si ordinano</span>}
            {puoComprare && sceltiMateriali.length > 0 && (
              <Select onValueChange={(v) => azioni.assegnaFornitore.mutate({ ids: sceltiMateriali.map((m) => m.id), supplierId: v === "_nessuno" ? null : v, diretto: permessi.canEditOrders })}>
                <SelectTrigger className="h-8 w-48 bg-card" aria-label="Assegna fornitore"><SelectValue placeholder="Assegna fornitore" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_nessuno">Nessun fornitore</SelectItem>
                  {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {permessi.canEditOrders && (
              <Select onValueChange={(v) => azioni.spostaInFase.mutate({ ids: scelti.map((m) => m.id), phaseId: v === "_senza" ? null : v })}>
                <SelectTrigger className="h-8 w-44 bg-card" aria-label="Sposta in fase"><SelectValue placeholder="Sposta in fase" /></SelectTrigger>
                <SelectContent>
                  {fasi.filter((f) => f.id).map((f) => <SelectItem key={f.id!} value={f.id!}>{f.nome}</SelectItem>)}
                  <SelectItem value="_senza">Senza fase</SelectItem>
                </SelectContent>
              </Select>
            )}
            {puoComprare && (
              <>
                <Button size="sm" variant="outline" className="h-8 bg-card" disabled={!sceltiAcquistabili.length}
                  onClick={() => {
                    setTitoloOfferta(`Materiali ${orderCode ?? ""}`.trim());
                    setFornitoriOfferta(new Set(sceltiAcquistabili.flatMap((m) => (m.supplier_id ? [m.supplier_id] : []))));
                    setOfferta(true);
                  }}>
                  Richiedi offerta
                </Button>
                <Button size="sm" className="h-8" disabled={!sceltiAcquistabili.length || azioni.creaOrdini.isPending}
                  onClick={() => azioni.creaOrdini.mutate({ materiali: sceltiAcquistabili.filter((m) => m.ordinabile) }, { onSuccess: () => setSelezione(new Set()) })}>
                  <ShoppingCart className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Crea ordine
                </Button>
              </>
            )}
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelezione(new Set())}>Annulla</Button>
          </div>
        )}

        {fasi.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-card p-6 text-center">
            <p className="font-medium text-foreground">Nessun articolo ancora</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Aggiungili a mano, dal listino o dal magazzino, oppure generali dal computo metrico e dalle tavole: il sistema prepara la lista dei materiali con quantità e specifiche, divisa per fase. Il tecnico la valida e l'ufficio acquisti ordina.
            </p>
          </div>
        ) : visibili.length === 0 ? (
          <p className="rounded-lg border bg-card px-3 py-3 text-sm text-muted-foreground">
            {filtrato ? "Nessuna riga con questo filtro." : "Le fasi della commessa non hanno ancora materiali."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            <table className="block w-full text-sm lg:table lg:table-fixed">
              <caption className="sr-only">Articoli della commessa divisi per fase</caption>
              <thead className="hidden border-b bg-card text-[11px] uppercase tracking-wide text-muted-foreground lg:table-header-group">
                <tr>
                  <th scope="col" className="w-9 py-1.5 pl-3"><span className="sr-only">Selezione</span></th>
                  <th scope="col" className="px-2 py-1.5 text-left font-medium">Materiale</th>
                  <th scope="col" className="w-28 px-2 py-1.5 text-right font-medium">Q.tà</th>
                  <th scope="col" className="hidden w-36 px-2 py-1.5 text-left font-medium xl:table-cell">Fornitore</th>
                  <th scope="col" className="w-36 px-2 py-1.5 text-left font-medium">Ordine / arrivo</th>
                  <th scope="col" className="w-32 px-2 py-1.5 text-left font-medium">Stato</th>
                  {canViewCosts && <th scope="col" className="w-28 px-2 py-1.5 text-right font-medium">Importo</th>}
                  <th scope="col" className="w-10 py-1.5 pr-2"><span className="sr-only">Azioni</span></th>
                </tr>
              </thead>
              {visibili.map(({ f, chiave, righe, aperta }) => (
                <SezioneFase
                  key={chiave}
                  fase={f}
                  righe={righe}
                  colonne={colonne}
                  permessi={permessi}
                  canViewCosts={canViewCosts}
                  selezione={selezione}
                  setSelezione={setSelezione}
                  nomeFornitore={nomeFornitore}
                  aperta={aperta}
                  onApri={() => setAperte(new Map(aperte).set(chiave, !aperta))}
                  onAzione={(a) => {
                    if (!f.id) return;
                    if (a === "rimanda") { setNota(""); setRimando({ phaseId: f.id, nome: f.nome }); return; }
                    azioni.cambiaStato.mutate({ phaseId: f.id, azione: a });
                  }}
                  onOrdina={() => ordinaFase(f, chiave)}
                  onQuantita={(m, q, tecnico) => azioni.aggiornaMateriale.mutate({ id: m.id, tecnico, modifica: { quantity: q } })}
                  proposte={proposte}
                  onAggiungi={puoScrivere && puoModificareMateriali(f.validazione?.stato ?? null, permessi) ? () => nuovo(f.id) : undefined}
                  azioniRiga={azioniRiga}
                  allegatoOdaDi={allegatoOdaDi}
                />
              ))}
            </table>
          </div>
        )}

        <Dialog open={!!rimando} onOpenChange={(o) => !o && setRimando(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rimanda indietro i materiali di «{rimando?.nome}»</DialogTitle>
              <DialogDescription>Scrivi cosa va corretto: chi li ha preparati riceve la nota in campanella.</DialogDescription>
            </DialogHeader>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={4} placeholder="Es. mancano le cassette 294×152×75 del piano primo" aria-label="Nota per chi ha preparato i materiali" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRimando(null)}>Annulla</Button>
              <Button disabled={!nota.trim() || azioni.cambiaStato.isPending}
                onClick={() => rimando && azioni.cambiaStato.mutate({ phaseId: rimando.phaseId, azione: "rimanda", nota }, { onSuccess: () => setRimando(null) })}>
                Rimanda indietro
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={offerta} onOpenChange={setOfferta}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Richiedi offerta ai fornitori</DialogTitle>
              <DialogDescription>{sceltiAcquistabili.length} materiali con quantità, unità e specifiche. Poi la mandi dalla richiesta d'offerta.</DialogDescription>
            </DialogHeader>
            <label className="space-y-1 text-sm">
              <span className="font-medium">Titolo</span>
              <Input value={titoloOfferta} onChange={(e) => setTitoloOfferta(e.target.value)} />
            </label>
            <fieldset className="max-h-56 space-y-1 overflow-auto rounded border p-2">
              <legend className="px-1 text-sm font-medium">Fornitori a cui chiederla</legend>
              {suppliers.filter((s: { is_active?: boolean | null }) => s.is_active !== false).map((s: { id: string; name: string }) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={fornitoriOfferta.has(s.id)} onCheckedChange={(v) => {
                    const n = new Set(fornitoriOfferta);
                    if (v) n.add(s.id); else n.delete(s.id);
                    setFornitoriOfferta(n);
                  }} />
                  {s.name}
                </label>
              ))}
            </fieldset>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOfferta(false)}>Annulla</Button>
              <Button disabled={azioni.richiediOfferta.isPending}
                onClick={() => azioni.richiediOfferta.mutate(
                  { ids: sceltiAcquistabili.map((m) => m.id), titolo: titoloOfferta, fornitori: [...fornitoriOfferta] },
                  { onSuccess: () => { setOfferta(false); setSelezione(new Set()); } },
                )}>
                Crea richiesta d'offerta
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!daTogliere} onOpenChange={(o) => !o && setDaTogliere(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Togliere «{daTogliere?.name}» dalla commessa?</DialogTitle>
              <DialogDescription>La riga non è in nessuna offerta, ordine o magazzino: si toglie senza conseguenze sugli acquisti.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDaTogliere(null)}>Annulla</Button>
              <Button variant="destructive" disabled={azioni.elimina.isPending}
                onClick={() => daTogliere && azioni.elimina.mutate(daTogliere, { onSuccess: () => setDaTogliere(null) })}>
                Togli
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={!!allegatiDi} onOpenChange={(o) => !o && setAllegatiDi(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Allegati di «{allegatiDi?.name}»</DialogTitle>
              <DialogDescription>Ordini, schede tecniche e foto dell'articolo.</DialogDescription>
            </DialogHeader>
            {allegatiDi && (
              <OrderItemAttachments
                itemId={allegatiDi.id}
                itemName={allegatiDi.name}
                attachments={allegatiItem?.attachments ?? []}
                editable={permessi.canEditOrders}
                onAttachmentsChange={() => editor?.onAttachmentsRefresh?.()}
              />
            )}
          </DialogContent>
        </Dialog>

        {editor && (
          <OrderItemsList
            soloFinestra
            richiesta={richiesta}
            items={editor.items}
            onItemsChange={editor.onItemsChange}
            onItemUpdate={editor.onItemUpdate}
            onAttachmentsRefresh={editor.onAttachmentsRefresh}
            editable={permessi.canEditOrders}
            allowEdit={permessi.canEditOrders}
            fallbackCompanyId={editor.companyId}
            onAddLabor={editor.onAddLabor}
            canViewCosts={canViewCosts}
          />
        )}

        <Suspense fallback={null}>
          {genera && <GeneraMaterialiDialog orderId={orderId} open={genera} onOpenChange={setGenera} />}
          {tavole && <PlanimetrieDialog orderId={orderId} open={tavole} onOpenChange={setTavole} />}
        </Suspense>
      </div>
    </TooltipProvider>
  );
}

export default MaterialiPerFase;
