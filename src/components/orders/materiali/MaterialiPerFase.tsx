/**
 * L'elenco unico degli articoli della commessa, diviso per fase di lavoro
 * (con il gruppo «Senza fase»): materiali, lavorazioni e descrizioni. Ogni
 * fase ha il suo avanzamento acquisti (da ordinare, in corso, ordinati,
 * consegnati, importo stimato), lo stato della validazione del tecnico e le
 * righe con quantità, unità, specifiche, fornitore, prezzo con la sua fonte e
 * stato. Azioni in blocco sulla selezione: fornitore, fase, richiesta
 * d'offerta, ordine.
 *
 * Con `editor` (dettaglio commessa) qui si fa anche tutto quello che faceva
 * il vecchio «Articoli della Commessa»: aggiungere un articolo (dal listino,
 * dal magazzino o a mano, con posizioni e misure, OdA, pagamenti e posa),
 * modificarlo, duplicarlo, cambiarne lo stato, gli allegati, toglierlo. La
 * finestra dell'articolo è quella di OrderItemsList (soloFinestra).
 */
import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, CalendarClock, ChevronDown, ChevronRight, CheckCircle2, Copy, FileSearch, Layers, Library, MoreHorizontal,
  Paperclip, Pencil, Plus, Send, ShoppingCart, Sparkles, Trash2, Undo2, Warehouse,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePermissions } from "@/hooks/usePermissions";
import { useOperationalSuppliers } from "@/hooks/useOperationalSuppliers";
import { useAzioniMateriali, useMaterialiPerFase, type FaseMateriali, type MaterialeFase } from "@/hooks/useMaterialiPerFase";
import { useApplicaPrezziProposti, usePrezziProposti } from "@/hooks/usePrezziMateriali";
import { ETICHETTA_STATO_ACQUISTO, riepilogoFase, type StatoAcquistoMateriale } from "@/lib/distinta/fasiMateriali";
import {
  acquistabile, azioniFase, ETICHETTA_AZIONE_FASE, ETICHETTA_STATO_FASE, puoModificareMateriali, spiegazioneFase,
  type AzioneFase, type PermessiMateriali,
} from "@/lib/distinta/statiFase";
import { ETICHETTA_FONTE_PREZZO, prezzoAttuale, totaleStimato, type PrezzoProposto } from "@/lib/distinta/prezziMateriali";
import {
  allegatoOda, conteggioStati, dettaglioAccontoSaldo, eliminabile, eMateriale, ETICHETTA_ORDINAMENTO, filtraPerFonte, ordinaRighe, type FiltroFonte, type Ordinamento,
} from "@/lib/distinta/elencoArticoli";
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

const COLORE_STATO: Record<StatoAcquistoMateriale, string> = {
  da_ordinare: "bg-slate-100 text-slate-700 border-slate-200",
  in_offerta: "bg-amber-50 text-amber-800 border-amber-200",
  in_bozza_oda: "bg-amber-50 text-amber-800 border-amber-200",
  ordinato: "bg-sky-50 text-sky-800 border-sky-200",
  consegnato: "bg-emerald-50 text-emerald-800 border-emerald-200",
};

const COLORE_FASE = {
  bozza: "bg-slate-100 text-slate-700",
  da_validare: "bg-amber-100 text-amber-900",
  validata: "bg-emerald-100 text-emerald-900",
} as const;

const ETICHETTA_NATURA: Record<string, string> = { lavorazione: "Lavorazione", descrizione: "Descrizione" };

const numero = (n: number | null | undefined) =>
  n == null ? "" : Number(n).toLocaleString("it-IT", { maximumFractionDigits: 2 });

const dataBreve = (d: string) => {
  const [a, m, g] = d.slice(0, 10).split("-").map(Number);
  return new Date(a, m - 1, g).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
};

function BarraAvanzamento({ r }: { r: ReturnType<typeof riepilogoFase> }) {
  if (!r.totale) return null;
  const pct = (n: number) => `${(n / r.totale) * 100}%`;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      <div className="bg-emerald-500" style={{ width: pct(r.consegnati) }} />
      <div className="bg-sky-500" style={{ width: pct(r.ordinati) }} />
      <div className="bg-amber-400" style={{ width: pct(r.inCorso) }} />
    </div>
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
  return (
    <span title={titolo} className="inline-flex max-w-full items-center gap-1 truncate rounded border border-violet-200 bg-violet-50 px-1.5 py-0 text-[11px] text-violet-800">
      {m.origine_materiale === "planimetria" ? <Layers className="h-3 w-3 shrink-0" aria-hidden /> : <FileSearch className="h-3 w-3 shrink-0" aria-hidden />}
      <span className="truncate">{etichetta}</span>
    </span>
  );
}

/** Prezzo unitario con la fonte; quello proposto (non ancora scritto) in corsivo. */
function Prezzo({ m, proposto }: { m: MaterialeFase; proposto: PrezzoProposto | undefined }) {
  const attuale = prezzoAttuale(m);
  const p = attuale ?? proposto;
  if (!p) return <span className="text-[11px] text-slate-400">Prezzo da trovare</span>;
  const delta = attuale && m.standard_cost && m.standard_cost > 0 ? (attuale.prezzo - m.standard_cost) * m.quantity : 0;
  return (
    <span
      className={cn("text-[11px] tabular-nums", attuale ? "text-slate-600" : "italic text-violet-700")}
      title={[
        attuale ? null : "Prezzo proposto: si scrive con «Usa i prezzi proposti»",
        p.dettaglio,
        m.standard_cost && m.standard_cost > 0 ? `Listino ${formatCurrency(m.standard_cost)}` : null,
      ].filter(Boolean).join(" · ") || undefined}
    >
      {formatCurrency(p.prezzo)}/{m.unita_misura ?? "pz"} · {ETICHETTA_FONTE_PREZZO[p.fonte]}{attuale ? "" : " (proposto)"}
      {Math.abs(delta) > 0.005 && <span className={delta > 0 ? "ml-1 text-red-600" : "ml-1 text-emerald-600"}>{delta > 0 ? "▲" : "▼"}{formatCurrency(Math.abs(delta))}</span>}
    </span>
  );
}

function RigaMateriale({
  m, selezionato, onSeleziona, modificabile, tecnico, nomeFornitore, onQuantita, canViewCosts, proposto, azioni, oda,
}: {
  /** L'ordine d'acquisto allegato alla riga, se c'è: si scarica con un clic. */
  oda?: { file_name: string; file_url: string } | null;
  m: MaterialeFase;
  selezionato: boolean;
  onSeleziona: (v: boolean) => void;
  modificabile: boolean;
  tecnico: boolean;
  nomeFornitore: string | null;
  onQuantita: (q: number) => void;
  canViewCosts: boolean;
  proposto: PrezzoProposto | undefined;
  azioni: React.ReactNode;
}) {
  const [bozza, setBozza] = useState<string | null>(null);
  const materiale = eMateriale(m);
  const calcolata = m.quantita_calcolata != null && Math.abs(Number(m.quantita_calcolata) - m.quantity) > 0.005 ? Number(m.quantita_calcolata) : null;
  const salva = () => {
    if (bozza == null) return;
    const q = Math.round(Number(bozza.replace(",", ".")));
    setBozza(null);
    if (Number.isFinite(q) && q > 0 && q !== m.quantity) onQuantita(q);
  };
  const oltre = (m.ordinata ?? 0) > m.quantity && m.quantity > 0;
  const rate = canViewCosts ? dettaglioAccontoSaldo(m) : null;
  return (
    <li className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3 gap-y-1 px-3 py-2 sm:grid-cols-[auto_minmax(0,1fr)_8rem_10rem_8rem_auto] sm:items-center">
      <Checkbox checked={selezionato} onCheckedChange={(v) => onSeleziona(!!v)} aria-label={`Seleziona ${m.name}`} className="mt-1 sm:mt-0" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900" title={m.name}>
          {m.name}
          {!materiale && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0 text-[11px] font-normal text-slate-600">{ETICHETTA_NATURA[m.natura_riga ?? ""] ?? m.natura_riga}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
          {m.specifiche && <span className="truncate" title={m.specifiche}>{m.specifiche}</span>}
          {m.description && <span className="truncate" title={m.description}>{m.description}</span>}
          <Provenienza m={m} />
          {m.stock_item_id && <span className="inline-flex items-center gap-1 text-emerald-700"><Warehouse className="h-3 w-3" aria-hidden />Da giacenza</span>}
          {(m.oda ?? []).length > 0 && <span title="Ordini d'acquisto che coprono la riga">{(m.oda ?? []).join(", ")}</span>}
          {(m.ordinata ?? 0) > 0 && (
            <span className={oltre ? "font-medium text-red-700" : undefined} title="Quantità negli ordini emessi rispetto a quella prevista">
              Ordinato {numero(m.ordinata)}/{numero(m.quantity)}
            </span>
          )}
          {m.delivery_date && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" aria-hidden />Arrivo {dataBreve(m.delivery_date)}</span>}
          {canViewCosts && m.is_paid && <span className="text-emerald-700">Pagato</span>}
          {canViewCosts && !m.is_paid && m.deposit_paid && !rate && <span className="text-amber-700">Acconto pagato</span>}
          {rate && (
            <span className="tabular-nums" title="Pagamento al fornitore in due rate">
              <span className={rate.accontoPagato ? "text-emerald-700" : undefined}>Acconto {formatCurrency(rate.acconto)} {rate.accontoPagato ? "✓" : "—"}</span>
              {" · "}
              <span className={rate.saldoPagato ? "text-emerald-700" : undefined}>
                Saldo {formatCurrency(rate.saldo)} {rate.saldoPagato ? "✓" : rate.saldoPrevisto ? `prev. ${dataBreve(rate.saldoPrevisto)}` : "—"}
              </span>
            </span>
          )}
          {oda && (
            <button type="button" className="inline-flex items-center gap-1 rounded border px-1.5 py-0 text-[11px] text-slate-700 hover:bg-slate-50"
              title={`Scarica ${oda.file_name}`} onClick={() => openAttachmentInTab(oda.file_url)}>
              <Paperclip className="h-3 w-3" aria-hidden />ODA allegato
            </button>
          )}
          {canViewCosts && materiale && <Prezzo m={m} proposto={proposto} />}
          {m.avviso && <span className="inline-flex items-center gap-1 text-amber-700" title={m.avviso}><AlertTriangle className="h-3 w-3" aria-hidden />{m.avviso}</span>}
        </div>
        {m.posizioni && m.posizioni.length > 0 && (
          <ul className="mt-0.5 text-[11px] text-slate-500">
            {m.posizioni.map((po, i) => <li key={i}>• {po.descrizione}{po.misure ? ` · ${po.misure}` : ""} ×{po.quantita}</li>)}
          </ul>
        )}
      </div>
      <div className="text-right sm:text-left">
        {modificabile ? (
          <label className="flex items-center justify-end gap-1 sm:justify-start">
            <span className="sr-only">Quantità di {m.name}</span>
            <Input
              inputMode="numeric"
              className="h-8 w-20 text-right tabular-nums"
              value={bozza ?? String(m.quantity)}
              onChange={(e) => setBozza(e.target.value)}
              onBlur={salva}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              title={tecnico ? "Correzione del tecnico" : undefined}
            />
            <span className="w-8 text-xs text-slate-500">{m.unita_misura ?? "pz"}</span>
          </label>
        ) : (
          <span className="text-sm tabular-nums">{numero(m.quantity)} <span className="text-xs text-slate-500">{m.unita_misura ?? "pz"}</span></span>
        )}
        {calcolata != null && <p className="text-[11px] text-slate-400 tabular-nums">calcolata {numero(calcolata)}</p>}
      </div>
      <p className="col-start-2 truncate text-xs text-slate-600 sm:col-start-auto sm:text-sm" title={nomeFornitore ?? ""}>
        {nomeFornitore ?? (materiale ? <span className="text-slate-400">Fornitore da scegliere</span> : null)}
      </p>
      <span className={cn("col-start-3 justify-self-end rounded border px-1.5 py-0.5 text-[11px] font-medium sm:col-start-auto sm:justify-self-start", COLORE_STATO[m.stato])}
        title={m.status ? `Stato della riga: ${statusConfig(m.status).label}` : undefined}>
        {materiale ? ETICHETTA_STATO_ACQUISTO[m.stato] : statusConfig(m.status).label}
      </span>
      <div className="col-start-3 justify-self-end sm:col-start-auto">{azioni}</div>
    </li>
  );
}

interface SezioneProps {
  fase: FaseMateriali;
  righe: MaterialeFase[];
  permessi: PermessiMateriali;
  canViewCosts: boolean;
  selezione: Set<string>;
  setSelezione: (s: Set<string>) => void;
  nomeFornitore: (id: string | null) => string | null;
  onAzione: (azione: AzioneFase) => void;
  onQuantita: (m: MaterialeFase, q: number, tecnico: boolean) => void;
  aperta: boolean;
  onApri: () => void;
  proposte: Map<string, PrezzoProposto>;
  onAggiungi?: () => void;
  azioniRiga: (m: MaterialeFase) => React.ReactNode;
  allegatoOdaDi: (m: MaterialeFase) => { file_name: string; file_url: string } | null;
}

function SezioneFase({
  fase, righe, permessi, canViewCosts, selezione, setSelezione, nomeFornitore, onAzione, onQuantita, aperta, onApri, proposte, onAggiungi, azioniRiga, allegatoOdaDi,
}: SezioneProps) {
  const stato = fase.validazione?.stato ?? null;
  // Avanzamento, validazione e importi contano i materiali: lavorazioni e descrizioni no.
  const materiali = fase.materiali.filter(eMateriale);
  const r = riepilogoFase(materiali);
  const stima = totaleStimato(materiali, proposte);
  const inAcquisto = materiali.filter((m) => m.stato !== "da_ordinare").length;
  const azioni = fase.id
    ? azioniFase(stato, permessi, { totale: materiali.length, senzaQuantita: materiali.filter((m) => !(m.quantity > 0)).length, inAcquisto })
    : [];
  const modificabile = puoModificareMateriali(stato, permessi);
  const tecnico = stato === "da_validare" && permessi.canValidateBom && !permessi.canEditOrders;
  const ids = righe.map((m) => m.id);
  const tutti = ids.length > 0 && ids.every((id) => selezione.has(id));
  const spiegazione = spiegazioneFase(stato, permessi);
  const rimandata = stato === "bozza" && fase.validazione?.note_validazione;
  const altre = fase.materiali.length - materiali.length;

  const seleziona = (id: string, v: boolean) => {
    const s = new Set(selezione);
    if (v) s.add(id); else s.delete(id);
    setSelezione(s);
  };

  return (
    <section aria-label={`Fase ${fase.nome}`} className="overflow-hidden rounded-lg border bg-white">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
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
        <button type="button" onClick={onApri} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={aperta}>
          {aperta ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />}
          <span className="truncate font-semibold text-slate-900">{fase.nome}</span>
          {stato && <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium", COLORE_FASE[stato])}>{ETICHETTA_STATO_FASE[stato]}</span>}
        </button>
        <div className="flex w-full flex-col gap-1 sm:w-64">
          <BarraAvanzamento r={r} />
          <p className="text-[11px] text-slate-500 tabular-nums">
            {r.totale} materiali{altre > 0 ? ` · ${altre} altre righe` : ""} · {r.daOrdinare} da ordinare · {r.inCorso > 0 ? `${r.inCorso} in corso · ` : ""}{r.ordinati} ordinati · {r.consegnati} consegnati
            {canViewCosts && stima.totale > 0 ? ` · ${stima.proposto > 0 ? "stima " : ""}${formatCurrency(stima.totale)}` : ""}
          </p>
        </div>
        {(azioni.length > 0 || onAggiungi) && (
          <div className="flex flex-wrap gap-1.5">
            {onAggiungi && (
              <Button size="sm" variant="outline" className="h-8" onClick={onAggiungi} aria-label={`Aggiungi un articolo in ${fase.nome}`}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi
              </Button>
            )}
            {azioni.map((a) => (
              <Button key={a} size="sm" variant={a === "rimanda" ? "outline" : "default"} className="h-8" onClick={() => onAzione(a)}>
                {a === "invia_validazione" ? <Send className="mr-1.5 h-3.5 w-3.5" /> : a === "valida" ? <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> : <Undo2 className="mr-1.5 h-3.5 w-3.5" />}
                {ETICHETTA_AZIONE_FASE[a]}
              </Button>
            ))}
          </div>
        )}
      </header>
      {aperta && (
        <>
          {(spiegazione || rimandata) && (
            <p className={cn("border-t px-3 py-1.5 text-xs", rimandata ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-600")}>
              {rimandata ? <>Rimandati indietro dal tecnico: «{fase.validazione?.note_validazione}»</> : spiegazione}
            </p>
          )}
          {righe.length ? (
            <ul className="divide-y border-t">
              {righe.map((m) => (
                <RigaMateriale
                  key={m.id}
                  m={m}
                  selezionato={selezione.has(m.id)}
                  onSeleziona={(v) => seleziona(m.id, v)}
                  modificabile={modificabile && m.stato === "da_ordinare" && eMateriale(m)}
                  tecnico={tecnico}
                  nomeFornitore={nomeFornitore(m.supplier_id)}
                  onQuantita={(q) => onQuantita(m, q, tecnico)}
                  canViewCosts={canViewCosts}
                  proposto={proposte.get(m.id)}
                  azioni={azioniRiga(m)}
                  oda={allegatoOdaDi(m)}
                />
              ))}
            </ul>
          ) : (
            <p className="border-t px-3 py-3 text-sm text-slate-500">{fase.materiali.length ? "Nessuna riga con questo filtro." : "Nessuna riga in questa fase."}</p>
          )}
        </>
      )}
    </section>
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
  const [chiuse, setChiuse] = useState<Set<string>>(new Set());
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
  const totale = riepilogoFase(tuttiMateriali);
  const puoComprare = permessi.canEditOrders || permessi.canManagePurchasing;
  const { proposte } = usePrezziProposti(orderId, tuttiMateriali, canViewCosts);
  const applicaPrezzi = useApplicaPrezziProposti(orderId);
  const stima = totaleStimato(tuttiMateriali, proposte);
  const stati = conteggioStati(tutteRighe);
  const puoScrivere = !!editor && permessi.canEditOrders;
  const nuovo = (phaseId: string | null) => setRichiesta({ tipo: "nuovo", phaseId, nonce: Date.now() });
  const inEditor = (m: MaterialeFase) => !!editor?.items.some((i) => i.id === m.id);

  // Gli allegati arrivano con gli articoli dell'editor (dettaglio commessa).
  const allegatoOdaDi = (m: MaterialeFase) => allegatoOda(editor?.items.find((i) => i.id === m.id)?.attachments);

  const azioniRiga = (m: MaterialeFase) => {
    if (!editor) return null;
    const item = editor.items.find((i) => i.id === m.id);
    const allegati = item?.attachments?.length ?? 0;
    if (!puoScrivere) {
      return allegati > 0 ? (
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Allegati di ${m.name}`} onClick={() => setAllegatiDi(m)}><Paperclip className="h-4 w-4" /></Button>
      ) : null;
    }
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Azioni su ${m.name}`}>
            {allegati > 0 ? <Paperclip className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {inEditor(m) ? (
            <>
              <DropdownMenuItem onSelect={() => setRichiesta({ tipo: "modifica", id: m.id, nonce: Date.now() })}><Pencil className="mr-2 h-4 w-4" />Modifica</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setRichiesta({ tipo: "duplica", id: m.id, nonce: Date.now() })}><Copy className="mr-2 h-4 w-4" />Duplica</DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Stato: {statusConfig(m.status).label}</DropdownMenuSubTrigger>
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

  if (isLoading) return <p className="rounded-lg border bg-white p-4 text-sm text-slate-500">Carico gli articoli…</p>;
  if (isError) {
    return (
      <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
        Articoli non caricati. <button type="button" className="underline" onClick={() => refetch()}>Riprova</button>
      </p>
    );
  }

  const proposteDaScrivere = tuttiMateriali.filter((m) => !prezzoAttuale(m) && proposte.has(m.id));
  const allegatiItem = allegatiDi ? editor?.items.find((i) => i.id === allegatiDi.id) : undefined;

  return (
    <div className="space-y-3" id="materiali-per-fase">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2.5">
        <div>
          <h3 className="font-semibold text-slate-900">Articoli e materiali per fase</h3>
          <p className="text-xs text-slate-500 tabular-nums">
            {totale.totale} materiali · {totale.daOrdinare} da ordinare · {totale.ordinati} ordinati · {totale.consegnati} consegnati
            {canViewCosts && stima.totale > 0 ? ` · ${stima.proposto > 0 ? "stima " : ""}${formatCurrency(stima.totale)}` : ""}
            {canViewCosts && stima.senzaPrezzo > 0 ? ` · ${stima.senzaPrezzo} senza prezzo` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {puoScrivere && (
            <Button size="sm" className="h-8" onClick={() => nuovo(null)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi articolo
            </Button>
          )}
          {permessi.canEditOrders && (
            <Button size="sm" variant={puoScrivere ? "outline" : "default"} className="h-8" onClick={() => setGenera(true)}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Genera dal computo e dalle tavole
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-8" onClick={() => setTavole(true)}>
            <Layers className="mr-1.5 h-3.5 w-3.5" /> Tavole e conteggi
          </Button>
          <Button size="sm" variant="ghost" className="h-8" asChild>
            <Link to="/azienda/scomposizioni"><Library className="mr-1.5 h-3.5 w-3.5" /> Scomposizioni</Link>
          </Button>
        </div>
      </div>

      {tutteRighe.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-md border bg-white p-0.5" role="group" aria-label="Provenienza">
            {([["tutti", "Tutti"], ["giacenza", "Da giacenza"], ["fornitore", "Da fornitore"]] as [FiltroFonte, string][]).map(([v, l]) => (
              <button key={v} type="button" aria-pressed={filtro === v} className={cn("rounded px-2.5 py-1", filtro === v && "bg-slate-900 text-white")} onClick={() => setFiltro(v)}>{l}</button>
            ))}
          </div>
          <Select value={ordine} onValueChange={(v) => setOrdine(v as Ordinamento)}>
            <SelectTrigger className="h-8 w-48 bg-white text-xs" aria-label="Ordina le righe"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(ETICHETTA_ORDINAMENTO) as Ordinamento[]).map((o) => <SelectItem key={o} value={o}>Ordina: {ETICHETTA_ORDINAMENTO[o]}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1 max-sm:hidden">
            {stati.map(([s, n]) => (
              <span key={s} className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", statusConfig(s).badgeColor)}>{n} {statusConfig(s).label}</span>
            ))}
          </div>
          {canViewCosts && permessi.canEditOrders && proposteDaScrivere.length > 0 && (
            <Button size="sm" variant="outline" className="ml-auto h-8 bg-white" disabled={applicaPrezzi.isPending}
              title="Scrive sui materiali senza prezzo il prezzo proposto (listino, ultimo acquisto o scomposizione)"
              onClick={() => applicaPrezzi.mutate(proposteDaScrivere.map((m) => ({ id: m.id, prezzo: proposte.get(m.id)! })))}>
              Usa i prezzi proposti ({proposteDaScrivere.length})
            </Button>
          )}
        </div>
      )}

      {scelti.length > 0 && (
        <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50/95 px-3 py-2 text-sm shadow-sm backdrop-blur">
          <strong className="tabular-nums">{scelti.length} selezionati</strong>
          {bloccati > 0 && <span className="text-xs text-amber-800">{bloccati} di fasi non validate: non si ordinano</span>}
          {puoComprare && sceltiMateriali.length > 0 && (
            <Select onValueChange={(v) => azioni.assegnaFornitore.mutate({ ids: sceltiMateriali.map((m) => m.id), supplierId: v === "_nessuno" ? null : v, diretto: permessi.canEditOrders })}>
              <SelectTrigger className="h-8 w-48 bg-white"><SelectValue placeholder="Assegna fornitore" /></SelectTrigger>
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
              <SelectTrigger className="h-8 w-44 bg-white"><SelectValue placeholder="Sposta in fase" /></SelectTrigger>
              <SelectContent>
                {fasi.filter((f) => f.id).map((f) => <SelectItem key={f.id!} value={f.id!}>{f.nome}</SelectItem>)}
                <SelectItem value="_senza">Senza fase</SelectItem>
              </SelectContent>
            </Select>
          )}
          {puoComprare && (
            <>
              <Button size="sm" variant="outline" className="h-8 bg-white" disabled={!sceltiAcquistabili.length}
                onClick={() => {
                  setTitoloOfferta(`Materiali ${orderCode ?? ""}`.trim());
                  setFornitoriOfferta(new Set(sceltiAcquistabili.flatMap((m) => (m.supplier_id ? [m.supplier_id] : []))));
                  setOfferta(true);
                }}>
                Richiedi offerta
              </Button>
              <Button size="sm" className="h-8" disabled={!sceltiAcquistabili.length || azioni.creaOrdini.isPending}
                onClick={() => azioni.creaOrdini.mutate({ materiali: sceltiAcquistabili.filter((m) => m.ordinabile) }, { onSuccess: () => setSelezione(new Set()) })}>
                <ShoppingCart className="mr-1.5 h-3.5 w-3.5" /> Crea ordine
              </Button>
            </>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelezione(new Set())}>Annulla</Button>
        </div>
      )}

      {fasi.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-6 text-center">
          <p className="font-medium text-slate-800">Nessun articolo ancora</p>
          <p className="mt-1 text-sm text-slate-500">
            Aggiungili a mano, dal listino o dal magazzino, oppure generali dal computo metrico e dalle tavole: il sistema prepara la lista dei materiali con quantità e specifiche, divisa per fase. Il tecnico la valida e l'ufficio acquisti ordina.
          </p>
        </div>
      ) : (
        fasi.map((f) => {
          const chiave = f.id ?? "_senza";
          const righe = ordinaRighe(filtraPerFonte(f.materiali, filtro), ordine, nomeFornitore);
          return (
            <SezioneFase
              key={chiave}
              fase={f}
              righe={righe}
              permessi={permessi}
              canViewCosts={canViewCosts}
              selezione={selezione}
              setSelezione={setSelezione}
              nomeFornitore={nomeFornitore}
              aperta={!chiuse.has(chiave)}
              onApri={() => { const s = new Set(chiuse); if (s.has(chiave)) s.delete(chiave); else s.add(chiave); setChiuse(s); }}
              onAzione={(a) => {
                if (!f.id) return;
                if (a === "rimanda") { setNota(""); setRimando({ phaseId: f.id, nome: f.nome }); return; }
                azioni.cambiaStato.mutate({ phaseId: f.id, azione: a });
              }}
              onQuantita={(m, q, tecnico) => azioni.aggiornaMateriale.mutate({ id: m.id, tecnico, modifica: { quantity: q } })}
              proposte={proposte}
              onAggiungi={puoScrivere && puoModificareMateriali(f.validazione?.stato ?? null, permessi) ? () => nuovo(f.id) : undefined}
              azioniRiga={azioniRiga}
              allegatoOdaDi={allegatoOdaDi}
            />
          );
        })
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
  );
}

export default MaterialiPerFase;
