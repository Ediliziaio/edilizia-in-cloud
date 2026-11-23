// src/components/orders/DistintaLavorazioni.tsx
// Le lavorazioni in una tabella sola: ogni fase si apre sulle sue voci, tutto sulla stessa riga,
// e si cambia cliccando sul dato. Per i cantieri con centinaia di voci.
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, ChevronsUpDown, Circle, ExternalLink, Layers3, ListChecks, MoreHorizontal, Package, Pencil, Plus, Search, Trash2, Truck, Users, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DialogAssegna, type Opzione } from "@/components/orders/AssegnazioniFasi";
import { SchedaVoce } from "@/components/orders/SchedaVoce";
import type { DatiVoce } from "@/hooks/useSottofasi";
import type { DatiChiSottofasi } from "@/hooks/useChiSottofasi";
import { avanzamentoFasi } from "@/lib/orders/schedaCommessa";
import { andamentoLavori, type Andamento } from "@/lib/orders/andamentoLavori";
import type { ScelteAssegnazione } from "@/hooks/useAssegnaAlleFasi";
import { formatCurrency } from "@/lib/formatters";
import {
  contaFiltri, dateInFila, dateSpostate, dateValide, FILTRI_DISTINTA, filtraDistinta, ordineSpostando, pianoInBlocco, righeDistinta, statoVoce,
  type EconomiaDistinta, type FaseDistinta, type FiltroDistinta, type RigaDistinta, type VoceDistinta,
} from "@/lib/orders/distintaLavorazioni";
import { conAliquota, saldoIva, type IvaCommessa } from "@/lib/orders/ivaCommessa";
import { percentualeDaQuantita, quantitaEseguita, type GiornoLavorativo, type Sottofase } from "@/lib/orders/sottofasi";
import { cn } from "@/lib/utils";
import { OfficeSelect } from "./OfficeSelect";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";

export interface ChiLavora {
  squadre: string[];
  persone: string[];
  ditte: string[];
  mezzi: string[];
  articoli: number;
}

export type FaseTabella = FaseDistinta & { start_date?: string | null; end_date?: string | null };

// Scritte intere: Tailwind trova solo le classi che compaiono per esteso nel codice.
// Sotto 1280 px date e previsto si leggono nel popup: la descrizione resta leggibile e non si scorre di lato.
const COLONNE = "md:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_4.25rem_5.75rem_1.25rem] xl:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_4.25rem_4rem_4rem_5.75rem_5.75rem_1.25rem]";

const breve = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : "");
const quantita = (n: number | null, u: string | null) => (n === null ? "" : `${n.toLocaleString(intlCampo(), { maximumFractionDigits: 2 })}${u ? ` ${u}` : ""}`);

/** Una data che sembra testo: si clicca e si cambia. */
function CellaData({ valore, etichetta, modificabile, rossa, onSalva }: {
  valore: string | null | undefined; etichetta: string; modificabile: boolean; rossa?: boolean; onSalva: (v: string | null, e: FocusEvent<HTMLInputElement>) => void;
}) {
  const [aperta, setAperta] = useState(false);
  if (!modificabile) return <span className={cn("text-xs tabular-nums", valore ? "" : "text-muted-foreground/40")}>{breve(valore) || "—"}</span>;
  if (aperta) {
    return (
      <Input
        autoFocus type="date" defaultValue={valore ?? ""} aria-label={etichetta}
        className="relative z-10 h-6 w-[7.5rem] px-1 text-xs"
        onBlur={(e) => {
          setAperta(false);
          // Una data scritta a metà risulta vuota: non deve cancellare quella salvata.
          if (e.target.validity.badInput) return;
          const v = e.target.value || null;
          if (v !== (valore ?? null)) onSalva(v, e);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); else if (e.key === "Escape") setAperta(false); }}
      />
    );
  }
  return (
    <button type="button" aria-label={etichetta} onClick={() => setAperta(true)}
      className={cn("rounded px-0.5 text-left text-xs tabular-nums hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", rossa ? "font-medium text-rose-700" : valore ? "" : "text-muted-foreground/40")}>
      {breve(valore) || "—"}
    </button>
  );
}

/** Aggiornamento rapido: il totale fatto (quantità se la voce ne ha una, altrimenti %), salvato uscendo dal campo. */
function CampoRapido({ riga: r, onAvanza }: { riga: RigaDistinta; onAvanza: Props["onAvanza"] }) {
  const t = useT();
  const misurabile = !!r.quantita && r.quantita > 0;
  const attuale = misurabile ? quantitaEseguita(r) ?? 0 : r.percentuale;
  const [valore, setValore] = useState(attuale ? String(attuale) : "");
  // Invio e uscita dal campo salvano entrambi: lo stesso numero una volta sola.
  const salvato = useRef<number>(attuale);
  const salva = () => {
    const n = Number(valore.replace(",", "."));
    if (valore.trim() === "" || !Number.isFinite(n) || n < 0 || n === salvato.current) return;
    salvato.current = n;
    if (misurabile) onAvanza(r.sottofaseId!, { percentuale: percentualeDaQuantita(n, r.quantita) ?? 0, quantita_fatta: n });
    else onAvanza(r.sottofaseId!, { percentuale: Math.min(100, Math.round(n)), quantita_fatta: null });
  };
  return (
    <input type="text" inputMode="decimal" data-rapido value={valore} onChange={(e) => setValore(e.target.value)} onBlur={salva}
      placeholder={misurabile ? r.unita ?? t("q.tà") : "%"} aria-label={`${r.descrizione}: ${misurabile ? t("fatti su {quantita}", { quantita: r.quantita ?? "" }) : t("percentuale")}`}
      title={misurabile ? t("Fatti su {quantita}", { quantita: `${r.quantita?.toLocaleString(intlCampo())}${r.unita ? ` ${r.unita}` : ""}` }) : t("Percentuale fatta")}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        salva();
        const campi = [...document.querySelectorAll<HTMLInputElement>("input[data-rapido]")];
        const dopo = campi[campi.indexOf(e.currentTarget) + 1];
        if (dopo) { dopo.focus(); dopo.select(); dopo.scrollIntoView({ block: "nearest" }); }
      }}
      className="h-6 w-full rounded border border-sky-300 bg-background px-1 text-right text-[11px] tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500" />
  );
}

const dataBreve = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/**
 * La barra dello stato avanzamento lavori, nello spazio libero della striscia dei numeri:
 * quanto è fatto, e la tacca di oggi fra la prima data d'inizio e l'ultima di fine delle fasi.
 */
export function BarraAndamento({ a, sintesi = false }: { a: Andamento; sintesi?: boolean }) {
  const t = useT();
  const ritardo = a.stato === "in_ritardo";
  const colore = a.fatto >= 100 ? "bg-emerald-500" : ritardo ? "bg-amber-500" : "bg-sky-600";
  const testo = a.stato === "in_ritardo" ? t("in ritardo di {punti} punti", { punti: a.punti })
    : a.stato === "in_anticipo" ? t("in anticipo di {punti} punti", { punti: a.punti })
    : a.fatto >= 100 ? t("lavori finiti") : a.stato === "in_linea" ? t("in linea coi tempi") : t("senza date sulle fasi");
  return (
    <div className={cn("min-w-0", !sintesi && "flex-1 basis-56 self-center")} data-testid="barra-andamento">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 text-xs">
        <span className={sintesi ? "text-2xl font-semibold leading-none tracking-tight tabular-nums" : "text-muted-foreground"}>
          {sintesi ? `${a.fatto}%` : t("Stato avanzamento lavori")}
        </span>
        <span className={cn("font-medium", ritardo ? "text-amber-800 dark:text-amber-200" : "text-muted-foreground")}>
          {!sintesi && <><span className="font-semibold tabular-nums text-foreground">{a.fatto}%</span> · </>}{testo}
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-muted" role="progressbar" aria-label={t("Stato avanzamento lavori")} aria-valuenow={a.fatto} aria-valuemin={0} aria-valuemax={100}
        aria-valuetext={`${t("{percentuale}% fatto", { percentuale: a.fatto })}${a.tempo !== null ? `, ${t("{percentuale}% del tempo trascorso", { percentuale: a.tempo })}` : ""}, ${testo}`}>
        <div className={cn("h-full rounded-full transition-all", colore)} style={{ width: `${a.fatto}%` }} />
        {a.tempo !== null && a.fatto < 100 && (
          <div className="absolute -top-1 h-[18px] w-0.5 -translate-x-1/2 rounded bg-slate-900" style={{ left: `${a.tempo}%` }}
            title={t("Oggi: è passato il {percentuale}% del tempo previsto", { percentuale: a.tempo })} aria-hidden="true" />
        )}
      </div>
      {a.inizio && a.fine && (
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{dataBreve(a.inizio)}</span>
          {a.tempo !== null && a.fatto < 100 && <span className={cn(a.tempo >= 100 && "font-medium text-amber-800")}>{a.tempo >= 100 ? t("fine prevista superata") : t("oggi {percentuale}% del tempo", { percentuale: a.tempo })}</span>}
          <span>{dataBreve(a.fine)}</span>
        </div>
      )}
    </div>
  );
}

function Stat({ etichetta, children, nota }: { etichetta: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="min-w-0 shrink-0 max-md:hidden">
      <dt className="whitespace-nowrap text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="whitespace-nowrap text-sm font-semibold tabular-nums">{children}{nota && <span className="block text-[11px] font-normal text-amber-800 dark:text-amber-200">{nota}</span>}</dd>
    </div>
  );
}

interface Props {
  /** Per leggere i rapportini della voce nel popup. */
  orderId?: string;
  fasi: ReadonlyArray<FaseTabella>;
  sottofasiDi: ReadonlyMap<string, ReadonlyArray<Sottofase>>;
  voci: ReadonlyArray<VoceDistinta>;
  /** Venduto, previsto e consuntivo si leggono dalla fase: tengono conto di sconti, ditte e acquisti. */
  economiaDi?: ReadonlyMap<string, EconomiaDistinta>;
  /** Costi della commessa che non stanno in una sola fase, come le ore di un rapportino su più fasi. */
  consuntivoSenzaFase?: number;
  /** Chi fa ogni sottofase (persone, squadre, ditte); senza la tabella nel database non si mostra. */
  chiSottofasi?: DatiChiSottofasi;
  onAggiungiChi?: (sottofaseIds: string[], chi: { persona?: string; ditta?: string }) => void;
  onTogliChi?: (id: string) => void;
  /** Una sottofase da aprire nel popup (arriva dal popup della fase); poi si avvisa che è aperta. */
  apriSottofase?: string | null;
  onSottofaseAperta?: () => void;
  /** Apre l'elenco dei costi da mettere su una fase. */
  onCostiSenzaFase?: () => void;
  /** Il conto dell'IVA della commessa: aliquota, debito, credito e reverse charge. */
  iva?: IvaCommessa | null;
  chiDi: ReadonlyMap<string, ChiLavora>;
  squadre: ReadonlyArray<Opzione>;
  persone: ReadonlyArray<Opzione>;
  ditte: ReadonlyArray<Opzione>;
  puoSquadre: boolean;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  /** Il margine è un permesso a sé: non basta vedere venduto e costi. */
  vedeMargini: boolean;
  puoModificare: boolean;
  oggi: string;
  onAssegna: (scelte: ScelteAssegnazione, fatto: () => void) => void;
  assegnaInCorso: boolean;
  onSegna: (id: string, fatta: boolean) => void;
  /** Una scrittura sola per tante righe: con centinaia di voci non si manda una richiesta per riga. */
  onSegnaTutte: (ids: string[], fatta: boolean) => void;
  onAvanza: (id: string, avanzamento: { percentuale: number; quantita_fatta: number | null }) => void;
  onPianifica: (id: string, piano: { data_inizio: string | null; data_fine: string | null; giorni: number | null }) => void;
  onPianificaTutte: (passi: Array<{ id: string; data_inizio: string | null; data_fine: string | null; giorni: number | null }>) => void;
  onDateFase: (id: string, date: { start_date: string | null; end_date: string | null }) => void;
  onDalleVoci: (faseId: string) => void;
  onAggiungi: (faseId: string, nome: string) => void;
  /** Un elenco incollato, una sottofase per riga. */
  onAggiungiTante?: (faseId: string, nomi: string[]) => void;
  /** Più sottofasi insieme, ognuna col suo punto: l'avanzamento in blocco e il suo «Annulla». */
  onAvanzaTante?: (passi: Array<{ id: string; percentuale: number; quantita_fatta: number | null }>) => void;
  onSalvaVoce?: (riga: RigaDistinta, dati: DatiVoce) => void;
  onRisorse?: (id: string, persone: number | null) => void;
  onParallelo?: (id: string, insieme: boolean) => void;
  onRinomina: (id: string, nome: string) => void;
  onElimina: (id: string) => void;
  onRiordina: (ids: string[]) => void;
  /** I giorni di lavoro del cantiere, per mettere le righe in fila. */
  lavorativo?: GiornoLavorativo;
  /** Materiali, mezzi, costi e note restano nella scheda della fase. */
  onApriScheda: (faseId: string) => void;
  onOrganizza?: (ids: string[], assegna: boolean) => void;
  soloOrganizza?: boolean;
  renderOrganizza?: (scheda: (id: string, onChiudi: () => void) => ReactNode) => ReactNode;
}

type Elemento =
  | { tipo: "fase"; key: string; fase: FaseTabella; righe: RigaDistinta[] }
  | { tipo: "riga"; key: string; riga: RigaDistinta }
  | { tipo: "nuova"; key: string; faseId: string }
  | { tipo: "aggiungi"; key: string; faseId: string };

export function DistintaLavorazioni({
  orderId, fasi, sottofasiDi, voci, economiaDi, consuntivoSenzaFase = 0, onCostiSenzaFase, apriSottofase, onSottofaseAperta, chiSottofasi, onAggiungiChi, onTogliChi, iva, chiDi, squadre, persone, ditte, puoSquadre, vedeVenduto, vedeCosti, vedeMargini, puoModificare, oggi,
  onAssegna, assegnaInCorso, onSegna, onSegnaTutte, onAvanza, onPianifica, onPianificaTutte, onDateFase, onDalleVoci, onAggiungi, onAggiungiTante, onAvanzaTante, onSalvaVoce, onRisorse, onParallelo, onRinomina, onElimina, onRiordina, lavorativo, onApriScheda, onOrganizza, renderOrganizza, soloOrganizza,
}: Props) {
  const tr = useT();
  // Si parte dalla prima fase ancora da finire: con decine di voci, una fase alla volta.
  const [faseId, setFaseId] = useState<string | null>(() => {
    const voci = fasi.reduce((n, f) => n + (sottofasiDi.get(f.id)?.length ?? 0), 0);
    if (voci <= 30) return null;
    return (fasi.find((f) => f.status === "in_corso") ?? fasi.find((f) => Number(f.percentuale) < 100) ?? fasi[0])?.id ?? null;
  });
  const [filtro, setFiltro] = useState<FiltroDistinta>("tutte");
  const [testo, setTesto] = useState("");
  const [conIva, setConIva] = useState(false);
  const [aperta, setAperta] = useState<string | null>(null);
  const [aperte, setAperte] = useState<ReadonlySet<string>>(() => new Set(fasi.filter((f) => f.status === "in_corso").slice(0, 3).map((f) => f.id)));
  const [scelteRighe, setScelteRighe] = useState<ReadonlySet<string>>(new Set());
  const [scelteFasi, setScelteFasi] = useState<ReadonlySet<string>>(new Set());
  const [inModifica, setInModifica] = useState<{ id: string; testo: string } | null>(null);
  const [nuovaIn, setNuovaIn] = useState<string | null>(null);
  const campoNuova = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!nuovaIn) return undefined;
    // Dopo la chiusura del menu e dopo che la riga è entrata nell'elenco.
    const timer = window.setTimeout(() => campoNuova.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [nuovaIn]);
  const [nuova, setNuova] = useState("");
  const [daEliminare, setDaEliminare] = useState<RigaDistinta | null>(null);
  const [divisione, setDivisione] = useState<string | null>(null);
  const [assegnaA, setAssegnaA] = useState<string[] | null>(null);
  const apriVoce = (id: string) => onOrganizza ? onOrganizza([id], false) : setAperta(id);
  const apriAssegnazione = (ids: string[]) => onOrganizza ? onOrganizza(ids, true) : setAssegnaA(ids);
  const [bloccoInizio, setBloccoInizio] = useState("");
  const [bloccoFine, setBloccoFine] = useState("");
  const [bloccoGiorni, setBloccoGiorni] = useState("");
  const [bloccoSposta, setBloccoSposta] = useState("");
  const [bloccoPct, setBloccoPct] = useState("");
  // Aggiornamento rapido: un campo per riga, Invio passa alla dopo.
  const [rapido, setRapido] = useState(false);

  const tutte = useMemo(() => righeDistinta(fasi, sottofasiDi, voci), [fasi, sottofasiDi, voci]);
  const dellaScelta = useMemo(() => (faseId ? tutte.filter((r) => r.faseId === faseId) : tutte), [tutte, faseId]);
  const conti = useMemo(() => contaFiltri(dellaScelta, oggi), [dellaScelta, oggi]);
  const filtriDistinta = FILTRI_DISTINTA.filter((f) => (!f.soloCosti || vedeCosti) && (f.value === "tutte" || conti[f.value] > 0 || filtro === f.value));
  const righe = useMemo(() => filtraDistinta(dellaScelta, { testo, filtro, oggi }), [dellaScelta, testo, filtro, oggi]);
  const filtrando = !!testo.trim() || filtro !== "tutte";

  // Numeri di tutta la commessa.
  const economia = useMemo(() => fasi.reduce((t, f) => {
    const e = economiaDi?.get(f.id);
    return { venduto: t.venduto + (e?.venduto ?? 0), previsto: t.previsto + (e?.costoPrevisto ?? 0), consuntivo: t.consuntivo + (e?.costoConsuntivo ?? 0),
      senzaCosto: t.senzaCosto + (e?.costoIncompleto ? e.vociSenzaCosto ?? 0 : 0) };
  }, { venduto: 0, previsto: 0, consuntivo: 0, senzaCosto: 0 }), [fasi, economiaDi]);
  const sommaVoci = useMemo(() => tutte.reduce((s, r) => s + (r.venduto ?? 0), 0), [tutte]);
  const vendutoFasi = economia.venduto || sommaVoci;
  // Senza un venduto sulle fasi vale il contratto: zero sarebbe un numero falso.
  const venduto = iva?.valore_commessa || vendutoFasi;
  const daRipartire = iva ? Math.round((iva.valore_commessa - vendutoFasi) * 100) / 100 : 0;
  const aliquota = iva?.aliquota ?? 0;
  const conIvaTot = conAliquota(venduto, aliquota);
  // Lo stesso numero della testata della commessa: una commessa ha un avanzamento solo.
  const medio = avanzamentoFasi(fasi.map((f) => ({ status: f.status ?? "", percentuale: Number(f.percentuale) || 0 }))).avgPct;
  const avanzamento = medio === null ? null : Math.round(medio);
  const andamento = useMemo(() => (avanzamento === null ? null : andamentoLavori(avanzamento, fasi, oggi)), [avanzamento, fasi, oggi]);
  const daVersare = iva ? saldoIva(Math.max(iva.debito_previsto, iva.debito_fatturato), iva.credito_fatture + iva.credito_previsto_costi + iva.credito_previsto_ditte) : null;
  // Con voci senza costo il previsto è parziale: un margine calcolato su quello sarebbe falso.
  const margine = venduto > 0 && economia.previsto > 0 && !economia.senzaCosto ? Math.round(((venduto - economia.previsto) / venduto) * 100) : null;
  const importo = (n: number | null | undefined) => (n ? formatCurrency(conIva ? conAliquota(n, aliquota).totale : n) : "—");

  const elementi = useMemo(() => {
    const lista: Elemento[] = [];
    for (const f of fasi) {
      if (faseId && f.id !== faseId) continue;
      const dellaFase = righe.filter((r) => r.faseId === f.id);
      if (!faseId && filtrando && dellaFase.length === 0) continue;
      lista.push({ tipo: "fase", key: `f:${f.id}`, fase: f, righe: dellaFase });
      if (faseId || filtrando || aperte.has(f.id)) {
        for (const r of dellaFase) lista.push({ tipo: "riga", key: r.key, riga: r });
        if (nuovaIn === f.id) lista.push({ tipo: "nuova", key: `n:${f.id}`, faseId: f.id });
        else if (puoModificare && !filtrando) lista.push({ tipo: "aggiungi", key: `a:${f.id}`, faseId: f.id });
      }
    }
    return lista;
  }, [fasi, faseId, righe, filtrando, aperte, nuovaIn, puoModificare]);

  // Il popup segue l'elenco visibile: con la voce aperta si passa a quella prima o dopo.
  const righeInElenco = useMemo(() => elementi.flatMap((e) => (e.tipo === "riga" ? [e.riga] : [])), [elementi]);
  const indiceAperta = righeInElenco.findIndex((x) => x.key === aperta);
  // Con un filtro attivo una voce appena segnata esce dall'elenco: il popup resta su di lei, e «dopo» è quella che ne ha preso il posto.
  const ultimoIndice = useRef(0);
  if (indiceAperta >= 0) ultimoIndice.current = indiceAperta;
  // Una sottofase scritta a mano, quando riceve i prezzi, diventa una riga con la sua voce: resta la stessa.
  const sottofaseAperta = useRef<string | null>(null);
  const rigaAperta = aperta ? tutte.find((x) => x.key === aperta) ?? tutte.find((x) => !!sottofaseAperta.current && x.sottofaseId === sottofaseAperta.current) ?? null : null;
  sottofaseAperta.current = rigaAperta?.sottofaseId ?? null;
  // Nome di una persona, squadra o ditta, e chi fa ogni sottofase.
  const nomeDi = useMemo(() => new Map([...persone, ...squadre, ...ditte].map((o) => [o.id, o.nome])), [persone, squadre, ditte]);
  const chiDellaSottofase = (id: string | null) => (id && chiSottofasi?.disponibile ? (chiSottofasi.perSottofase.get(id) ?? []).map((c) => ({ id: c.id, nome: nomeDi.get(c.employee_id ?? c.external_team_id ?? "") ?? "—" })) : []);
  const [bloccoChi, setBloccoChi] = useState("");
  const scegliChi = (valore: string, ids: string[]) => {
    if (!valore || !onAggiungiChi || ids.length === 0) return;
    const [tipo, id] = valore.split(":");
    onAggiungiChi(ids, tipo === "p" ? { persona: id } : { ditta: id });
  };
  const nomiChi = (id: string) => { const c = chiDi.get(id); return c ? [...c.squadre, ...c.persone, ...c.ditte] : []; };

  useEffect(() => {
    if (!apriSottofase) return;
    const riga = tutte.find((x) => x.sottofaseId === apriSottofase);
    // Se la riga non è ancora arrivata la richiesta resta, e si apre appena c'è.
    if (!riga) return;
    if (onOrganizza) onOrganizza([riga.key], false); else setAperta(riga.key);
    onSottofaseAperta?.();
  }, [apriSottofase, tutte, onSottofaseAperta, onOrganizza]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtuale = elementi.length > 80;
  const virtualizer = useVirtualizer({ count: elementi.length, getScrollElement: () => scrollRef.current, estimateSize: () => 30, overscan: 12, enabled: virtuale });

  const inverti = (setter: typeof setScelteRighe, id: string) => setter((ora) => {
    const nuove = new Set(ora);
    if (nuove.has(id)) nuove.delete(id); else nuove.add(id);
    return nuove;
  });
  const azzeraScelte = () => { setScelteRighe(new Set()); setScelteFasi(new Set()); };
  const apriChiudi = (id: string) => inverti(setAperte, id);
  const tutteAperte = fasi.length > 0 && fasi.every((f) => aperte.has(f.id));

  const righeScelte = useMemo(() => tutte.filter((r) => scelteRighe.has(r.key)), [tutte, scelteRighe]);
  const conSottofase = righeScelte.filter((r) => r.sottofaseId);
  const inSelezione = scelteRighe.size + scelteFasi.size > 0;
  const fineAzioneDate = () => { azzeraScelte(); setBloccoInizio(""); setBloccoFine(""); setBloccoGiorni(""); };

  // Dopo un'azione su tante righe, qualche secondo per tornare indietro.
  const conAnnulla = (testo: string, indietro: () => void) => toast.success(testo, { action: { label: tr("Annulla"), onClick: indietro }, duration: 8000 });
  const dateDiPrima = () => conSottofase.map((r) => ({ id: r.sottofaseId!, data_inizio: r.inizio, data_fine: r.fine, giorni: r.giorni }));
  const applicaDate = () => {
    if (!bloccoInizio && !bloccoFine) return;
    const { passi, incoerenti } = pianoInBlocco(conSottofase, bloccoInizio || null, bloccoFine || null);
    if (incoerenti.length > 0) { toast.error(tr(incoerenti.length === 1 ? "Su 1 riga la fine verrebbe prima dell'inizio: nessuna data salvata." : "Su {n} righe la fine verrebbe prima dell'inizio: nessuna data salvata.", { n: incoerenti.length })); return; }
    const prima = dateDiPrima();
    onPianificaTutte(passi);
    conAnnulla(tr(passi.length === 1 ? "Date su {n} riga" : "Date su {n} righe", { n: passi.length }), () => onPianificaTutte(prima));
    fineAzioneDate();
  };
  const spostaDate = () => {
    const n = Number(bloccoSposta);
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 3650) { toast.error(tr("Scrivi di quanti giorni, anche negativo.")); return; }
    const passi = dateSpostate(conSottofase, n);
    if (passi.length === 0) { toast.error(tr("Nessuna riga con date da spostare: quelle fatte restano dove sono.")); return; }
    const prima = dateDiPrima();
    onPianificaTutte(passi);
    conAnnulla(tr(passi.length === 1 ? "{n} riga spostata di {giorni} giorni" : "{n} righe spostate di {giorni} giorni", { n: passi.length, giorni: n }), () => onPianificaTutte(prima));
    setBloccoSposta("");
    azzeraScelte();
  };
  const avanzaBlocco = () => {
    const p = Number(bloccoPct);
    if (!onAvanzaTante || !Number.isInteger(p) || p < 0 || p > 100) { toast.error(tr("Scrivi una percentuale da 0 a 100.")); return; }
    const righe = conSottofase.filter((r) => !r.fatta || p < 100);
    if (righe.length === 0) return;
    const prima = righe.map((r) => ({ id: r.sottofaseId!, percentuale: r.percentuale, quantita_fatta: r.quantitaFatta }));
    onAvanzaTante(righe.map((r) => ({ id: r.sottofaseId!, percentuale: p, quantita_fatta: r.quantita ? Math.round((r.quantita * p) / 100 * 1000) / 1000 : null })));
    conAnnulla(tr(righe.length === 1 ? "{n} riga al {percentuale}%" : "{n} righe al {percentuale}%", { n: righe.length, percentuale: p }), () => onAvanzaTante(prima));
    setBloccoPct("");
    azzeraScelte();
  };
  const mettiInFila = () => {
    const giorni = bloccoGiorni === "" ? null : Number(bloccoGiorni);
    if (giorni !== null && (!Number.isInteger(giorni) || giorni < 1 || giorni > 3650)) { toast.error(tr("Scrivi i giorni con un numero intero.")); return; }
    const { passi, senzaGiorni } = dateInFila(conSottofase, bloccoInizio || oggi, giorni, lavorativo ?? (() => true));
    if (senzaGiorni.length > 0) { toast.error(tr(senzaGiorni.length === 1 ? "1 riga non ha i giorni: scrivili qui." : "{n} righe non hanno i giorni: scrivili qui.", { n: senzaGiorni.length })); return; }
    if (passi.length === 0) { toast.error(tr("Nessuna riga da mettere in fila: quelle fatte restano dove sono.")); return; }
    const prima = dateDiPrima();
    onPianificaTutte(passi);
    conAnnulla(tr(passi.length === 1 ? "{n} riga messa in fila" : "{n} righe messe in fila", { n: passi.length }), () => onPianificaTutte(prima));
    fineAzioneDate();
  };
  const segnaBlocco = (fatta: boolean) => {
    const cambiano = conSottofase.filter((r) => r.fatta !== fatta);
    const ids = cambiano.map((r) => r.sottofaseId!);
    if (ids.length > 0) {
      // Indietro: ognuna torna al suo punto, non solo «da fare».
      const prima = cambiano.map((r) => ({ id: r.sottofaseId!, percentuale: r.percentuale, quantita_fatta: r.quantitaFatta }));
      onSegnaTutte(ids, fatta);
      conAnnulla(tr(ids.length === 1 ? (fatta ? "{n} riga segnate fatte" : "{n} riga da fare") : (fatta ? "{n} righe segnate fatte" : "{n} righe da fare"), { n: ids.length }), () => (onAvanzaTante ? onAvanzaTante(prima) : onSegnaTutte(ids, !fatta)));
    }
    azzeraScelte();
  };
  const salvaDataRiga = (r: RigaDistinta, campo: "inizio" | "fine", v: string | null) => {
    const inizio = campo === "inizio" ? v : r.inizio;
    const fine = campo === "fine" ? v : r.fine;
    if (!r.sottofaseId) return;
    if (!dateValide(inizio, fine)) { toast.error(tr("La fine viene prima dell'inizio.")); return; }
    // Togliendo la fine si tolgono anche i giorni: con quelli il database la ricalcolerebbe.
    onPianifica(r.sottofaseId, { data_inizio: inizio, data_fine: fine, giorni: fine ? r.giorni : null });
  };
  const salvaDataFase = (f: FaseTabella, campo: "inizio" | "fine", v: string | null) => {
    const start = campo === "inizio" ? v : f.start_date ?? null;
    const end = campo === "fine" ? v : f.end_date ?? null;
    if (!dateValide(start, end)) { toast.error(tr("La fine viene prima dell'inizio.")); return; }
    onDateFase(f.id, { start_date: start, end_date: end });
  };
  const sposta = (r: RigaDistinta, verso: -1 | 1) => {
    const ids = (sottofasiDi.get(r.faseId) ?? []).map((s) => s.id);
    const nuovo = r.sottofaseId ? ordineSpostando(ids, r.sottofaseId, verso) : null;
    if (nuovo) onRiordina(nuovo);
  };
  const confermaNome = (r: RigaDistinta) => {
    if (!inModifica) return;
    const nome = inModifica.testo.trim();
    setInModifica(null);
    if (nome && nome !== r.descrizione) onRinomina(inModifica.id, nome);
  };
  const aggiungi = (faseId: string) => {
    const nome = nuova.trim();
    if (!nome) { setNuovaIn(null); return; }
    onAggiungi(faseId, nome);
    setNuova("");
  };


  const rigaFase = (f: FaseTabella, dellaFase: RigaDistinta[]) => {
    const aperta = !!faseId || filtrando || aperte.has(f.id);
    const e = economiaDi?.get(f.id);
    const chi = chiDi.get(f.id);
    const nomi = chi ? [...chi.squadre, ...chi.persone, ...chi.ditte] : [];
    const pct = Number(f.percentuale) || 0;
    const finita = f.status === "completata" || pct >= 100;
    const senzaSottofase = dellaFase.filter((r) => r.voceId && !r.sottofaseId).length;
    const ritardo = !finita && !!f.end_date && f.end_date < oggi;
    return (
      <>
        <div className="flex items-center">
          {puoModificare && <Checkbox checked={scelteFasi.has(f.id)} onCheckedChange={() => inverti(setScelteFasi, f.id)} aria-label={tr("Seleziona {nome}", { nome: f.name })} />}
        </div>
        <div className="min-w-0">
          <div className="flex max-w-full items-center gap-1">
            {!faseId && (
              <button type="button" onClick={() => apriChiudi(f.id)} aria-expanded={aperta} aria-label={aperta ? tr("Chiudi le voci di {nome}", { nome: f.name }) : tr("Apri le voci di {nome}", { nome: f.name })} className="tap-compact shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {aperta ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
              </button>
            )}
            <button type="button" onClick={() => onApriScheda(f.id)} aria-label={tr("Scheda di {nome}", { nome: f.name })} title={f.name} className="tap-compact line-clamp-2 min-w-0 rounded text-left text-[13px] font-semibold leading-tight max-md:text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{f.name}</button>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 max-md:flex-nowrap max-md:overflow-hidden max-md:[&_*]:text-xs">
            {puoModificare || puoSquadre ? (
              <button type="button" onClick={() => apriAssegnazione([f.id])} title={nomi.join(", ") || tr("Assegna chi la fa")} aria-label={tr("Chi fa {fase}", { fase: f.name })}
                className={cn("tap-compact min-w-0 max-w-full truncate rounded text-left text-[11px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", nomi.length === 0 && !finita ? "font-medium text-amber-700" : "text-muted-foreground")}>
                {nomi.length ? `${nomi[0]}${nomi.length > 1 ? ` +${nomi.length - 1}` : ""}` : finita ? tr("Nessuno") : tr("+ Assegna chi la fa")}
              </button>
            ) : <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={nomi.join(", ")}>{nomi.join(", ") || tr("Nessuno")}</span>}
            {/* Sotto i 1280px la colonna «Fine» è nascosta: senza questo una fase scaduta
                non si distingueva dalle altre da telefono e tablet (collaudo 23/11/2026). */}
            {ritardo && <span title={tr("Doveva finire il {data}", { data: dataBreve(f.end_date!) })} className="shrink-0 whitespace-nowrap text-[11px] font-medium text-rose-700 xl:hidden">{tr("In ritardo {data}", { data: dataBreve(f.end_date!) })}</span>}
            {!!chi?.mezzi.length && <span title={chi.mezzi.join(", ")} className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Truck className="h-3 w-3" aria-hidden="true" />{chi.mezzi.length}</span>}
            {!!chi?.articoli && <span title={tr("{n} articoli", { n: chi.articoli })} className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Package className="h-3 w-3" aria-hidden="true" />{chi.articoli}</span>}
            {vedeCosti && !!e?.costoConsuntivo && <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", e.costoPrevisto > 0 && e.costoConsuntivo > e.costoPrevisto && "font-medium text-rose-700")}>{tr("Consuntivo {importo}", { importo: formatCurrency(e.costoConsuntivo) })}</span>}
          </div>
        </div>
        <div className="whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground max-md:hidden">{tr("{n} voci", { n: dellaFase.length })}</div>
        <div className="flex items-center justify-end gap-1 max-md:col-start-3 max-md:row-start-1" title={(sottofasiDi.get(f.id)?.length ?? 0) > 0 ? tr("Avanzamento {percentuale}%: dalle sottofasi, pesate sull'importo", { percentuale: pct }) : tr("Avanzamento {percentuale}%: scritto a mano o dai rapportini (la fase non ha sottofasi)", { percentuale: pct })}>
          <span className="h-1 w-6 overflow-hidden rounded-full bg-muted max-md:hidden"><span className={cn("block h-full", finita ? "bg-emerald-600" : "bg-primary")} style={{ width: `${pct}%` }} /></span>
          <span className="text-[11px] font-medium tabular-nums max-md:text-xs">{pct}%</span>
        </div>
        <div className="max-xl:hidden"><CellaData valore={f.start_date} etichetta={tr("Inizio di {nome}", { nome: f.name })} modificabile={puoModificare} onSalva={(v) => salvaDataFase(f, "inizio", v)} /></div>
        <div className="max-xl:hidden"><CellaData valore={f.end_date} etichetta={tr("Fine di {nome}", { nome: f.name })} modificabile={puoModificare} rossa={ritardo} onSalva={(v) => salvaDataFase(f, "fine", v)} /></div>
        <div className="text-right text-xs font-semibold tabular-nums max-md:hidden">{vedeVenduto ? importo(e?.venduto) : ""}</div>
        <div className="text-right text-xs font-semibold tabular-nums max-xl:hidden">{vedeCosti ? (e?.costoPrevisto ? formatCurrency(e.costoPrevisto) : "—") : ""}</div>
        <div className="flex items-center justify-end max-md:col-start-4 max-md:row-start-1">
          {puoModificare && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="tap-compact h-5 w-5 text-muted-foreground max-md:h-8 max-md:w-8" aria-label={tr("Altro per {nome}", { nome: f.name })}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              {/* Il menu, chiudendosi, rimetterebbe il cursore su di sé: il nome scritto andava perso. */}
              <DropdownMenuContent align="end" onCloseAutoFocus={(ev) => { if (campoNuova.current) ev.preventDefault(); }}>
                <DropdownMenuItem onClick={() => { setAperte((a) => new Set(a).add(f.id)); setNuovaIn(f.id); }}><Plus className="mr-2 h-3.5 w-3.5" />{tr("Aggiungi sottofase")}</DropdownMenuItem>
                {senzaSottofase > 0 && <DropdownMenuItem onClick={() => (pct > 0 ? setDivisione(f.id) : onDalleVoci(f.id))}><ListChecks className="mr-2 h-3.5 w-3.5" />{tr("Crea {n} sottofasi dalle voci", { n: senzaSottofase })}</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => onApriScheda(f.id)}><ExternalLink className="mr-2 h-3.5 w-3.5" />{tr("Apri la scheda")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </>
    );
  };

  const rigaVoce = (r: RigaDistinta) => {
    const ritardo = !r.fatta && !!r.fine && r.fine < oggi;
    const q = quantita(r.quantita, r.unita);
    const unitaLunga = r.quantita !== null && (r.unita?.length ?? 0) > 7;
    const stato = statoVoce(r);
    return (
      <>
        <div className="flex items-center">
          {puoModificare && <Checkbox checked={scelteRighe.has(r.key)} onCheckedChange={() => inverti(setScelteRighe, r.key)} aria-label={tr("Seleziona {nome}", { nome: r.descrizione })} />}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 pl-3">
          {r.sottofaseId ? (
            <button type="button" role="checkbox" aria-checked={r.fatta} disabled={!puoModificare} onClick={() => onSegna(r.sottofaseId!, !r.fatta)} aria-label={`${r.descrizione}: ${r.fatta ? tr("fatta") : tr("da fare")}`} className="tap-compact shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
              {r.fatta ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground" aria-hidden="true" />}
            </button>
          ) : <span title={tr("Non ha ancora una sottofase")} className="h-3.5 w-3.5 shrink-0" />}
          {inModifica && inModifica.id === r.sottofaseId ? (
            <Input
              autoFocus value={inModifica.testo} maxLength={160} aria-label={tr("Nuovo nome di {nome}", { nome: r.descrizione })}
              onChange={(e) => setInModifica({ ...inModifica, testo: e.target.value })}
              onBlur={() => confermaNome(r)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confermaNome(r); } else if (e.key === "Escape") setInModifica(null); }}
              className="h-6 min-w-0 flex-1 px-1 text-xs"
            />
          ) : (
            <button type="button" onClick={() => apriVoce(r.key)} title={r.descrizione}
              className={cn("tap-compact min-w-0 flex-1 rounded text-left text-xs leading-snug max-md:text-[13px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring line-clamp-2", r.fatta && "text-muted-foreground")}>
              {r.descrizione}
              {r.codice && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.codice}</span>}
            {chiDellaSottofase(r.sottofaseId).length > 0 && <span className="block truncate text-[10px] text-sky-800 max-md:text-[11px]">{chiDellaSottofase(r.sottofaseId).map((c) => c.nome).join(", ")}</span>}
            {/* Solo con date proprie: senza sottofase la voce eredita quelle della fase, già segnalate sopra. */}
            {ritardo && r.sottofaseId && <span className="block text-[10px] font-medium text-rose-700 max-md:text-[11px] xl:hidden">{tr("In ritardo {data}", { data: dataBreve(r.fine!) })}</span>}
            </button>
          )}
        </div>
        <div className="min-w-0 text-right text-xs tabular-nums [overflow-wrap:anywhere] max-md:text-[13px] max-md:col-start-3 max-md:row-start-1 max-md:max-w-20" title={q || undefined}>
          {unitaLunga ? <>{quantita(r.quantita, null)}<span className="block truncate text-[10px] text-muted-foreground">{r.unita}</span></> : q}
        </div>
        {rapido && r.sottofaseId && !r.fatta && puoModificare
          ? <div className="max-md:hidden"><CampoRapido riga={r} onAvanza={onAvanza} /></div>
          : <div className={cn("whitespace-nowrap text-[11px] tabular-nums max-md:hidden", stato.tono === "fatta" ? "font-medium text-emerald-700" : stato.tono === "corso" ? "font-medium text-primary" : "text-muted-foreground")}>{r.sottofaseId ? (stato.testo === "Fatta" || stato.testo === "Da fare" ? tr(stato.testo) : stato.testo) : ""}</div>}
        <div className="max-xl:hidden">{r.sottofaseId ? <CellaData valore={r.inizio} etichetta={tr("Inizio di {nome}", { nome: r.descrizione })} modificabile={puoModificare} onSalva={(v) => salvaDataRiga(r, "inizio", v)} /> : null}</div>
        <div className="max-xl:hidden">{r.sottofaseId ? <CellaData valore={r.fine} etichetta={tr("Fine di {nome}", { nome: r.descrizione })} modificabile={puoModificare} rossa={ritardo} onSalva={(v) => salvaDataRiga(r, "fine", v)} /> : null}</div>
        <div className="text-right text-xs tabular-nums text-muted-foreground max-md:hidden">{vedeVenduto && r.venduto ? importo(r.venduto) : ""}</div>
        <div className="text-right text-xs tabular-nums text-muted-foreground max-xl:hidden">{vedeCosti && r.previsto !== null ? formatCurrency(r.previsto) : ""}</div>
        <div className="flex items-center justify-end max-md:col-start-4 max-md:row-start-1">
          {puoModificare && r.sottofaseId && !inModifica && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="tap-compact h-5 w-5 text-muted-foreground max-md:h-8 max-md:w-8" aria-label={tr("Altro per {nome}", { nome: r.descrizione })}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setInModifica({ id: r.sottofaseId!, testo: r.descrizione.slice(0, 160) })}><Pencil className="mr-2 h-3.5 w-3.5" />{tr("Rinomina")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => sposta(r, -1)}><ArrowUp className="mr-2 h-3.5 w-3.5" />{tr("Sposta su")}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => sposta(r, 1)}><ArrowDown className="mr-2 h-3.5 w-3.5" />{tr("Sposta giù")}</DropdownMenuItem>
                <DropdownMenuItem className="text-rose-700" onClick={() => setDaEliminare(r)}><Trash2 className="mr-2 h-3.5 w-3.5" />{tr("Elimina")}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </>
    );
  };

  const griglia = cn("group grid grid-cols-[1.25rem_minmax(0,1fr)_auto_1.75rem] items-center gap-x-2 border-b px-2.5", COLONNE);
  const mostra = (e: Elemento) => {
    if (e.tipo === "fase") return <div className={cn(griglia, "min-h-11 bg-muted/55 py-1.5")}>{rigaFase(e.fase, e.righe)}</div>;
    if (e.tipo === "riga") return <div className={cn(griglia, "min-h-9 py-1 hover:bg-muted/35")}>{rigaVoce(e.riga)}</div>;
    if (e.tipo === "aggiungi") {
      return (
        <div className="border-b px-2 py-0.5 pl-9">
          <button type="button" onClick={() => setNuovaIn(e.faseId)} className="flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-3 w-3" aria-hidden="true" />{tr("Aggiungi sottofase")}
          </button>
        </div>
      );
    }
    return (
      <div className="border-b px-2 py-1 pl-9">
        <Input ref={campoNuova} autoFocus value={nuova} maxLength={160} onChange={(ev) => setNuova(ev.target.value)} placeholder={tr("Nome e Invio, Esc per chiudere. Puoi incollare un elenco.")} aria-label={tr("Nuova sottofase")}
          onPaste={(ev) => {
            const nomi = ev.clipboardData.getData("text").split(/\r?\n/).map((x) => x.trim().slice(0, 160)).filter(Boolean);
            if (nomi.length > 1 && onAggiungiTante) { ev.preventDefault(); onAggiungiTante(e.faseId, nomi); setNuova(""); }
          }}
          onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); aggiungi(e.faseId); } else if (ev.key === "Escape") { setNuovaIn(null); setNuova(""); } }}
          onBlur={() => { if (!nuova.trim()) setNuovaIn(null); }}
          className="h-6 max-w-md px-1 text-xs" />
      </div>
    );
  };

  const schedaVoce = (riga: RigaDistinta | null, chiudi: () => void, incorporata = false) => {
    const elenco = incorporata ? tutte : righeInElenco;
    const idx = elenco.findIndex((v) => v.key === riga?.key);
    return (
      <SchedaVoce
        riga={riga}
        incorporata={incorporata}
        posizione={{ numero: (idx >= 0 ? idx : ultimoIndice.current) + 1, totale: elenco.length }}
        orderId={orderId}
        aliquota={aliquota}
        chiLaFa={riga ? nomiChi(riga.faseId) : []}
        consuntivoFase={riga ? economiaDi?.get(riga.faseId)?.costoConsuntivo ?? null : null}
        vedeVenduto={vedeVenduto} vedeCosti={vedeCosti} vedeMargini={vedeMargini} puoModificare={puoModificare}
        onChiudi={chiudi}
        onVicina={(verso) => { const v = elenco[idx >= 0 ? idx + verso : verso > 0 ? ultimoIndice.current : ultimoIndice.current - 1]; if (v) apriVoce(v.key); }}
        onSalvaVoce={onSalvaVoce} onRisorse={onRisorse} onParallelo={onParallelo}
        chiSottofase={riga ? chiDellaSottofase(riga.sottofaseId) : []}
        chiDisponibile={!!chiSottofasi?.disponibile && !!onAggiungiChi}
        opzioniChi={{ persone, squadre, ditte }}
        onAggiungiChi={(valore) => riga?.sottofaseId && scegliChi(valore, [riga.sottofaseId])}
        onTogliChi={onTogliChi}
        oggi={oggi}
        onSegna={onSegna} onAvanza={onAvanza} onPianifica={onPianifica} onRinomina={onRinomina}
        onSposta={sposta}
        onElimina={(x) => { chiudi(); setDaEliminare(x); }}
        onAssegna={(id) => { if (!incorporata) chiudi(); apriAssegnazione([id]); }}
        onCreaSottofasi={(id) => { if (Number(fasi.find((f) => f.id === id)?.percentuale) > 0) { chiudi(); setDivisione(id); } else onDalleVoci(id); }}
        onApriScheda={onApriScheda}
      />
    );
  };

  return (
    <section aria-label={tr("Lavorazioni della commessa")} className={soloOrganizza ? undefined : "space-y-3"}>
      {!soloOrganizza && <>
      <dl className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border bg-card p-3">
        {andamento && <div className="min-w-[min(100%,14rem)] flex-1 basis-[15rem] rounded-lg bg-muted/50 px-3 py-2 lg:max-w-[21rem]">
          <dt className="mb-1.5 text-xs font-medium text-muted-foreground">{tr("Avanzamento")}</dt>
          <dd><BarraAndamento a={andamento} sintesi /></dd>
        </div>}
        {vedeVenduto && <Stat etichetta={tr("Imponibile")} nota={daRipartire > 0.5 && vendutoFasi > 0 ? tr("{importo} da ripartire", { importo: formatCurrency(daRipartire) }) : undefined}>{formatCurrency(venduto)}</Stat>}
        {vedeVenduto && iva && <Stat etichetta={tr("Con IVA {aliquota}%", { aliquota: aliquota.toLocaleString(intlCampo()) })}>{formatCurrency(conIvaTot.totale)}</Stat>}
        {vedeCosti && <Stat etichetta={tr("Previsto")} nota={economia.senzaCosto ? tr(economia.senzaCosto === 1 ? "{n} voce senza costo" : "{n} voci senza costo", { n: economia.senzaCosto }) : undefined}>{economia.previsto > 0 ? formatCurrency(economia.previsto) : "—"}</Stat>}
        {vedeCosti && <Stat etichetta={tr("Consuntivo")} nota={consuntivoSenzaFase > 0 ? (onCostiSenzaFase
          ? <button type="button" onClick={onCostiSenzaFase} className="rounded font-medium text-amber-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{tr("+ {importo} senza fase", { importo: formatCurrency(consuntivoSenzaFase) })}</button>
          : tr("+ {importo} senza fase", { importo: formatCurrency(consuntivoSenzaFase) })) : undefined}>{formatCurrency(economia.consuntivo)}</Stat>}
        {vedeMargini && vedeVenduto && vedeCosti && <Stat etichetta={tr("Margine previsto")}>{margine === null ? "—" : `${margine}%`}</Stat>}
        {vedeVenduto && vedeCosti && iva && daVersare && (
          <div className="shrink-0 max-md:hidden" title={`${tr("Vendite {importo}", { importo: formatCurrency(Math.max(iva.debito_previsto, iva.debito_fatturato)) })} · ${tr("credito acquisti {importo}", { importo: formatCurrency(iva.credito_fatture + iva.credito_previsto_costi + iva.credito_previsto_ditte) })}${iva.reverse_charge_imponibile > 0 ? ` · ${tr("reverse charge {importo}", { importo: formatCurrency(iva.reverse_charge_imponibile) })}` : ""}`}>
            <dt className="whitespace-nowrap text-xs text-muted-foreground">{daVersare.verso === "credito" ? tr("IVA a credito") : tr("IVA da versare")}</dt>
            <dd className="whitespace-nowrap text-sm font-semibold tabular-nums">{daVersare.verso === "pari" ? "—" : formatCurrency(daVersare.importo)}</dd>
          </div>
        )}
      </dl>

      <div className="grid gap-3 lg:grid-cols-[12.5rem_minmax(0,1fr)] 2xl:grid-cols-[14rem_minmax(0,1fr)]">
      {/* Sotto i 1024px niente selettore «Tutte le fasi»: le fasi sono già l'elenco qui
          sotto e si aprono con un tocco. Era il terzo menu impilato sotto «Lavorazioni» e
          sopra i filtri, con un conteggio (fasi) diverso da quello dei filtri (voci). */}
      <nav aria-label={tr("Fasi")} className="hidden max-h-[78vh] self-start overflow-y-auto rounded-xl border bg-card lg:block">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-card px-3 py-2.5 text-xs font-semibold">
          <span className="flex items-center gap-2"><Layers3 className="size-4 text-muted-foreground" aria-hidden="true" />{tr("Fasi")}</span>
          <span className="font-normal tabular-nums text-muted-foreground">{fasi.length}</span>
        </div>
        <div className="space-y-1 p-1.5">
          <button type="button" aria-current={faseId === null ? "true" : undefined} onClick={() => { setFaseId(null); azzeraScelte(); }}
            className={cn("flex min-h-9 w-full items-center justify-between gap-1 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring", faseId === null && "bg-primary/10 text-primary hover:bg-primary/15")}>
            {tr("Tutte le fasi")} <span className="shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground">{tr("{n} voci", { n: tutte.length })}</span>
          </button>
        {fasi.map((f) => {
          const pct = Number(f.percentuale) || 0;
          const chi = chiDi.get(f.id);
          const senzaNessuno = pct < 100 && f.status !== "completata" && !(chi && chi.squadre.length + chi.persone.length + chi.ditte.length > 0);
          const v = economiaDi?.get(f.id)?.venduto ?? 0;
          return (
            <div key={f.id} className={cn("flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-muted", faseId === f.id && "bg-primary/10 hover:bg-primary/15")}>
              {puoModificare && <Checkbox checked={scelteFasi.has(f.id)} onCheckedChange={() => inverti(setScelteFasi, f.id)} aria-label={tr("Seleziona {nome}", { nome: f.name })} className="mt-0.5" />}
              <button type="button" aria-current={faseId === f.id ? "true" : undefined} onClick={() => { setFaseId(f.id); setFiltro("tutte"); setScelteRighe(new Set()); }} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("line-clamp-2 text-[13px] font-medium leading-tight", faseId === f.id && "text-primary")} title={f.name}>{f.name}</span>
                <span className="mt-1 flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                  <span className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-muted-foreground/15"><span className={cn("block h-full", pct >= 100 ? "bg-emerald-600" : "bg-primary")} style={{ width: `${pct}%` }} /></span>
                  {pct}%
                  {senzaNessuno && <span title={tr("Da assegnare")} className="ml-0.5 size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />}
                  {vedeVenduto && v > 0 && <span className="ml-auto truncate">{formatCurrency(conIva ? conAliquota(v, aliquota).totale : v)}</span>}
                </span>
              </button>
            </div>
          );
        })}
        </div>
      </nav>
      <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-2.5">
        <div className="relative min-w-[min(100%,12rem)] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder={tr("Cerca voce o codice…")} aria-label={tr("Cerca nella distinta")} className="h-9 pl-8 pr-8" />
          {testo && <button type="button" aria-label={tr("Cancella ricerca")} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setTesto("")}>
            <X className="size-3.5" aria-hidden="true" />
          </button>}
        </div>
        {/* Con il solo «Tutte» non c'è niente da scegliere: niente riga di filtri (a lavori finiti
            restava un bottone «Tutte» da solo). */}
        {filtriDistinta.length > 1 && <div role="group" aria-label={tr("Filtri")} className="flex flex-wrap items-center gap-1 max-md:-mx-1 max-md:w-full max-md:flex-nowrap max-md:overflow-x-auto max-md:px-1 max-md:[scrollbar-width:none]">
          {filtriDistinta.map((f) => (
            <Button key={f.value} type="button" size="sm" variant="ghost" className={cn("h-8 shrink-0 gap-1 rounded-md px-2 text-xs", filtro === f.value ? "bg-primary/10 font-semibold text-primary hover:bg-primary/15" : "text-muted-foreground")} aria-pressed={filtro === f.value} onClick={() => setFiltro(f.value)}>
              {tr(f.label)}{f.value !== "tutte" && <span className={cn("rounded px-1 text-[10px] tabular-nums", filtro === f.value ? "bg-primary/10" : "bg-muted")}>{conti[f.value]}</span>}
            </Button>
          ))}
        </div>}
        {puoModificare && (
          <Button type="button" size="sm" variant={rapido ? "default" : "outline"} className="h-8 px-2 text-xs max-md:hidden" aria-pressed={rapido}
            onClick={() => { const si = !rapido; setRapido(si); if (si && filtro === "tutte") setFiltro(conti.settimana > 0 ? "settimana" : "da_fare"); }}>
            <ListChecks className="size-3.5" aria-hidden="true" />
            {rapido ? tr("Fine aggiornamento") : tr("Aggiorna avanzamento")}
          </Button>
        )}
        {!faseId && <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground max-md:hidden" onClick={() => setAperte(tutteAperte ? new Set() : new Set(fasi.map((f) => f.id)))}>
          <ChevronsUpDown className="size-3.5" aria-hidden="true" />{tutteAperte ? tr("Chiudi tutte") : tr("Apri tutte")}
        </Button>}
      </div>

      {rapido && <p role="status" className="border-b bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">{tr("Inserisci il totale fatto nella colonna Stato. Premi Invio per salvare e passare alla riga successiva.")}</p>}
      <div ref={scrollRef} className={cn("max-h-[78vh] overflow-y-auto", !virtuale && "max-md:max-h-none")}>
        <div>
        <div className={cn("sticky top-0 z-10 hidden items-center gap-x-2 border-b bg-card px-2.5 py-2 text-[11px] font-semibold text-muted-foreground md:grid", COLONNE)}>
          <div /><div>{tr("Voce")}</div><div className="text-right">{tr("Quantità")}</div><div>{tr("Stato")}</div><div className="max-xl:hidden">{tr("Dal")}</div><div className="max-xl:hidden">{tr("Al")}</div>
          <div className="text-right">
            {vedeVenduto && (iva && aliquota > 0
              ? <button type="button" onClick={() => setConIva((v) => !v)} title={tr("Cambia tra imponibile e con IVA")} className="rounded underline decoration-dotted underline-offset-2 hover:text-foreground">{conIva ? tr("Con IVA") : tr("Imponibile")}</button>
              : tr("Imponibile"))}
          </div>
          <div className="text-right max-xl:hidden">{vedeCosti && tr("Previsto")}</div>
          <div />
        </div>
        {elementi.length === 0 ? (
          <div className="space-y-1.5 p-6 text-center">
            <p role="status" className="text-sm text-muted-foreground">{tr("Nessuna voce con questi filtri.")}</p>
            {filtrando && <Button type="button" size="sm" variant="ghost" onClick={() => { setTesto(""); setFiltro("tutte"); }}>{tr("Azzera filtri")}</Button>}
          </div>
        ) : virtuale ? (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vr) => {
              const e = elementi[vr.index];
              return <div key={e.key} ref={virtualizer.measureElement} data-index={vr.index} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vr.start}px)` }}>{mostra(e)}</div>;
            })}
          </div>
        ) : elementi.map((e) => <div key={e.key}>{mostra(e)}</div>)}
        </div>
      </div>
      </div>
      </div>

      {inSelezione && (
        <div role="group" aria-label={tr("Azioni sulle righe scelte")} className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-lg">
          <span className="font-medium">{[scelteFasi.size ? tr(scelteFasi.size === 1 ? "{n} fase" : "{n} fasi", { n: scelteFasi.size }) : null, scelteRighe.size ? tr(scelteRighe.size === 1 ? "{n} voce" : "{n} voci", { n: scelteRighe.size }) : null].filter(Boolean).join(", ")}</span>
          {(scelteFasi.size > 0 || (onOrganizza && scelteRighe.size > 0)) && <Button type="button" size="sm" variant="secondary" className="h-6 gap-1 text-xs" onClick={() => apriAssegnazione([...scelteFasi, ...(onOrganizza ? scelteRighe : [])])}><Users className="h-3 w-3" aria-hidden="true" />{tr("Assegna")}</Button>}
          {scelteRighe.size > 0 && <>
            {conSottofase.length < righeScelte.length && <span className="text-amber-300">{tr("{n} senza sottofase", { n: righeScelte.length - conSottofase.length })}</span>}
            <Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0} onClick={() => segnaBlocco(true)}>{tr("Segna fatte")}</Button>
            <Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0} onClick={() => segnaBlocco(false)}>{tr("Da fare")}</Button>
            <Popover>
              <PopoverTrigger asChild><Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0}>{tr("Date")}</Button></PopoverTrigger>
              <PopoverContent className="w-64 space-y-2 text-xs">
                <label className="flex items-center justify-between gap-2">{tr("Dal")}<Input type="date" value={bloccoInizio} onChange={(e) => setBloccoInizio(e.target.value)} aria-label={tr("Inizio per le righe scelte")} className="h-7 w-36 px-1 text-xs" /></label>
                <label className="flex items-center justify-between gap-2">{tr("Al")}<Input type="date" value={bloccoFine} onChange={(e) => setBloccoFine(e.target.value)} aria-label={tr("Fine per le righe scelte")} className="h-7 w-36 px-1 text-xs" /></label>
                <Button type="button" size="sm" className="h-7 w-full text-xs" disabled={!bloccoInizio && !bloccoFine} onClick={applicaDate}>{tr("Applica le date")}</Button>
                <div className="border-t pt-2">
                  <label className="flex items-center justify-between gap-2">{tr("Giorni ognuna")}<Input type="number" inputMode="numeric" min={1} max={3650} value={bloccoGiorni} onChange={(e) => setBloccoGiorni(e.target.value)} aria-label={tr("Giorni per ogni riga scelta")} className="h-7 w-20 px-1 text-xs" /></label>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" title={tr("Una dopo l'altra, dalla data «dal» o da oggi, contando i giorni di lavoro")} onClick={mettiInFila}>{tr("Metti in fila")}</Button>
                </div>
                <div className="border-t pt-2">
                  <label className="flex items-center justify-between gap-2">{tr("Sposta di giorni")}<Input type="number" inputMode="numeric" min={-3650} max={3650} value={bloccoSposta} onChange={(e) => setBloccoSposta(e.target.value)} aria-label={tr("Giorni di cui spostare le righe scelte")} placeholder={tr("es. 7 o -3")} className="h-7 w-20 px-1 text-xs" /></label>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" disabled={!bloccoSposta} onClick={spostaDate}>{tr("Sposta le date")}</Button>
                </div>
              </PopoverContent>
            </Popover>
            {chiSottofasi?.disponibile && onAggiungiChi && (
              <OfficeSelect label={tr("Chi fa le righe scelte")} value={bloccoChi} disabled={conSottofase.length === 0}
                onValueChange={(v) => { scegliChi(v, conSottofase.map((x) => x.sottofaseId!)); setBloccoChi(""); azzeraScelte(); }}
                className="h-6 max-w-40 rounded-lg border-0 bg-secondary px-1 text-xs text-secondary-foreground"
                placeholder={tr("Chi la fa…")}
                options={[
                  ...squadre.map((o) => ({ value: `d:${o.id}`, label: o.nome, group: tr("Squadre") })),
                  ...persone.map((o) => ({ value: `p:${o.id}`, label: o.nome, group: tr("Persone") })),
                  ...ditte.map((o) => ({ value: `d:${o.id}`, label: o.nome, group: tr("Ditte") })),
                ]} />
            )}
            {onAvanzaTante && (
              <Popover>
                <PopoverTrigger asChild><Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0}>{tr("Avanzamento")}</Button></PopoverTrigger>
                <PopoverContent className="w-56 space-y-2 text-xs">
                  <label className="flex items-center justify-between gap-2">{tr("Tutte al")}<span className="flex items-center gap-1"><Input type="number" inputMode="numeric" min={0} max={100} value={bloccoPct} onChange={(e) => setBloccoPct(e.target.value)} aria-label={tr("Percentuale per le righe scelte")} className="h-7 w-16 px-1 text-xs" />%</span></label>
                  <Button type="button" size="sm" className="h-7 w-full text-xs" disabled={bloccoPct === ""} onClick={avanzaBlocco}>{tr("Applica")}</Button>
                </PopoverContent>
              </Popover>
            )}
          </>}
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-background hover:bg-background/20 hover:text-background" aria-label={tr("Togli la selezione")} onClick={azzeraScelte}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      </>}
      {renderOrganizza
        ? renderOrganizza((id, chiudi) => schedaVoce(tutte.find((r) => r.key === id) ?? null, chiudi, true))
        : schedaVoce(rigaAperta, () => setAperta(null))}
      <DialogAssegna
        fasi={assegnaA ? fasi.filter((f) => assegnaA.includes(f.id)).map((f) => f.name) : null}
        squadre={squadre} persone={persone} ditte={ditte}
        puoSquadre={puoSquadre} puoPersoneDitte={puoModificare} inCorso={assegnaInCorso}
        onChiudi={() => setAssegnaA(null)}
        onAssegna={(s, fatto) => onAssegna({ fasi: assegnaA ?? [], ...s }, () => { fatto(); setAssegnaA(null); setScelteFasi(new Set()); })}
      />

      <AlertDialog open={!!daEliminare} onOpenChange={(aperto) => { if (!aperto) setDaEliminare(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("Eliminare la sottofase?")}</AlertDialogTitle>
            <AlertDialogDescription>{daEliminare?.descrizione.slice(0, 160)}{daEliminare?.voceId ? tr(". La voce con quantità e importo resta nella fase.") : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (daEliminare?.sottofaseId) onElimina(daEliminare.sottofaseId); setDaEliminare(null); }}>{tr("Elimina")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!divisione} onOpenChange={(aperto) => { if (!aperto) setDivisione(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tr("La fase è già avviata")}</AlertDialogTitle>
            <AlertDialogDescription>{tr("Con le sottofasi l'avanzamento si calcola da quelle spuntate: la fase ripartirebbe da zero finché non segni quelle già fatte.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tr("Annulla")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (divisione) onDalleVoci(divisione); setDivisione(null); }}>{tr("Crea le sottofasi")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
