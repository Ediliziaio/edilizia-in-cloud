// src/components/orders/DistintaLavorazioni.tsx
// Le lavorazioni in una tabella sola: ogni fase si apre sulle sue voci, tutto sulla stessa riga,
// e si cambia cliccando sul dato. Per i cantieri con centinaia di voci.
import { useEffect, useMemo, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, CheckCircle2, ChevronDown, ChevronRight, Circle, ExternalLink, ListChecks, MoreHorizontal, Package, Pencil, Plus, Search, Trash2, Truck, Users, X } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogAssegna, type Opzione } from "@/components/orders/AssegnazioniFasi";
import { SchedaVoce } from "@/components/orders/SchedaVoce";
import type { DatiVoce } from "@/hooks/useSottofasi";
import { avanzamentoFasi } from "@/lib/orders/schedaCommessa";
import type { ScelteAssegnazione } from "@/hooks/useAssegnaAlleFasi";
import { formatCurrency } from "@/lib/formatters";
import {
  contaFiltri, dateInFila, dateSpostate, dateValide, FILTRI_DISTINTA, filtraDistinta, ordineSpostando, pianoInBlocco, righeDistinta, statoVoce,
  type EconomiaDistinta, type FaseDistinta, type FiltroDistinta, type RigaDistinta, type VoceDistinta,
} from "@/lib/orders/distintaLavorazioni";
import { conAliquota, saldoIva, type IvaCommessa } from "@/lib/orders/ivaCommessa";
import { percentualeDaQuantita, quantitaEseguita, type GiornoLavorativo, type Sottofase } from "@/lib/orders/sottofasi";
import { cn } from "@/lib/utils";

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
const quantita = (n: number | null, u: string | null) => (n === null ? "" : `${n.toLocaleString("it-IT", { maximumFractionDigits: 2 })}${u ? ` ${u}` : ""}`);

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
      placeholder={misurabile ? r.unita ?? "q.tà" : "%"} aria-label={`${r.descrizione}: ${misurabile ? `fatti su ${r.quantita}` : "percentuale"}`}
      title={misurabile ? `Fatti su ${r.quantita?.toLocaleString("it-IT")}${r.unita ? ` ${r.unita}` : ""}` : "Percentuale fatta"}
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

function Stat({ etichetta, children, nota }: { etichetta: string; children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="shrink-0">
      <dt className="whitespace-nowrap text-[11px] text-muted-foreground">{etichetta}</dt>
      <dd className="whitespace-nowrap text-[13px] font-semibold tabular-nums">{children}{nota && <span className="block text-[11px] font-normal text-amber-700">{nota}</span>}</dd>
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
}

type Elemento =
  | { tipo: "fase"; key: string; fase: FaseTabella; righe: RigaDistinta[] }
  | { tipo: "riga"; key: string; riga: RigaDistinta }
  | { tipo: "nuova"; key: string; faseId: string }
  | { tipo: "aggiungi"; key: string; faseId: string };

export function DistintaLavorazioni({
  orderId, fasi, sottofasiDi, voci, economiaDi, consuntivoSenzaFase = 0, onCostiSenzaFase, apriSottofase, onSottofaseAperta, iva, chiDi, squadre, persone, ditte, puoSquadre, vedeVenduto, vedeCosti, vedeMargini, puoModificare, oggi,
  onAssegna, assegnaInCorso, onSegna, onSegnaTutte, onAvanza, onPianifica, onPianificaTutte, onDateFase, onDalleVoci, onAggiungi, onAggiungiTante, onAvanzaTante, onSalvaVoce, onRisorse, onParallelo, onRinomina, onElimina, onRiordina, lavorativo, onApriScheda,
}: Props) {
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
    const t = window.setTimeout(() => campoNuova.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [nuovaIn]);
  const [nuova, setNuova] = useState("");
  const [daEliminare, setDaEliminare] = useState<RigaDistinta | null>(null);
  const [divisione, setDivisione] = useState<string | null>(null);
  const [assegnaA, setAssegnaA] = useState<string[] | null>(null);
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
  const righe = useMemo(() => filtraDistinta(dellaScelta, { testo, filtro, oggi }), [dellaScelta, testo, filtro, oggi]);
  const filtrando = !!testo.trim() || filtro !== "tutte";

  // Numeri di tutta la commessa.
  const economia = useMemo(() => fasi.reduce((t, f) => {
    const e = economiaDi?.get(f.id);
    return { venduto: t.venduto + (e?.venduto ?? 0), previsto: t.previsto + (e?.costoPrevisto ?? 0), consuntivo: t.consuntivo + (e?.costoConsuntivo ?? 0) };
  }, { venduto: 0, previsto: 0, consuntivo: 0 }), [fasi, economiaDi]);
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
  const daVersare = iva ? saldoIva(Math.max(iva.debito_previsto, iva.debito_fatturato), iva.credito_fatture + iva.credito_previsto_costi + iva.credito_previsto_ditte) : null;
  const margine = venduto > 0 && economia.previsto > 0 ? Math.round(((venduto - economia.previsto) / venduto) * 100) : null;
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
  const nomiChi = (id: string) => { const c = chiDi.get(id); return c ? [...c.squadre, ...c.persone, ...c.ditte] : []; };

  useEffect(() => {
    if (!apriSottofase) return;
    const riga = tutte.find((x) => x.sottofaseId === apriSottofase);
    if (riga) setAperta(riga.key);
    onSottofaseAperta?.();
  }, [apriSottofase, tutte, onSottofaseAperta]);

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
  const conAnnulla = (testo: string, indietro: () => void) => toast.success(testo, { action: { label: "Annulla", onClick: indietro }, duration: 8000 });
  const dateDiPrima = () => conSottofase.map((r) => ({ id: r.sottofaseId!, data_inizio: r.inizio, data_fine: r.fine, giorni: r.giorni }));
  const applicaDate = () => {
    if (!bloccoInizio && !bloccoFine) return;
    const { passi, incoerenti } = pianoInBlocco(conSottofase, bloccoInizio || null, bloccoFine || null);
    if (incoerenti.length > 0) { toast.error(`Su ${incoerenti.length === 1 ? "1 riga" : `${incoerenti.length} righe`} la fine verrebbe prima dell'inizio: nessuna data salvata.`); return; }
    const prima = dateDiPrima();
    onPianificaTutte(passi);
    conAnnulla(`Date su ${passi.length} ${passi.length === 1 ? "riga" : "righe"}`, () => onPianificaTutte(prima));
    fineAzioneDate();
  };
  const spostaDate = () => {
    const n = Number(bloccoSposta);
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 3650) { toast.error("Scrivi di quanti giorni, anche negativo."); return; }
    const passi = dateSpostate(conSottofase, n);
    if (passi.length === 0) { toast.error("Nessuna riga con date da spostare: quelle fatte restano dove sono."); return; }
    const prima = dateDiPrima();
    onPianificaTutte(passi);
    conAnnulla(`${passi.length} ${passi.length === 1 ? "riga spostata" : "righe spostate"} di ${n} giorni`, () => onPianificaTutte(prima));
    setBloccoSposta("");
    azzeraScelte();
  };
  const avanzaBlocco = () => {
    const p = Number(bloccoPct);
    if (!onAvanzaTante || !Number.isInteger(p) || p < 0 || p > 100) { toast.error("Scrivi una percentuale da 0 a 100."); return; }
    const righe = conSottofase.filter((r) => !r.fatta || p < 100);
    if (righe.length === 0) return;
    const prima = righe.map((r) => ({ id: r.sottofaseId!, percentuale: r.percentuale, quantita_fatta: r.quantitaFatta }));
    onAvanzaTante(righe.map((r) => ({ id: r.sottofaseId!, percentuale: p, quantita_fatta: r.quantita ? Math.round((r.quantita * p) / 100 * 1000) / 1000 : null })));
    conAnnulla(`${righe.length} ${righe.length === 1 ? "riga" : "righe"} al ${p}%`, () => onAvanzaTante(prima));
    setBloccoPct("");
    azzeraScelte();
  };
  const mettiInFila = () => {
    const giorni = bloccoGiorni === "" ? null : Number(bloccoGiorni);
    if (giorni !== null && (!Number.isInteger(giorni) || giorni < 1 || giorni > 3650)) { toast.error("Scrivi i giorni con un numero intero."); return; }
    const { passi, senzaGiorni } = dateInFila(conSottofase, bloccoInizio || oggi, giorni, lavorativo ?? (() => true));
    if (senzaGiorni.length > 0) { toast.error(`${senzaGiorni.length === 1 ? "1 riga non ha" : `${senzaGiorni.length} righe non hanno`} i giorni: scrivili qui.`); return; }
    if (passi.length === 0) { toast.error("Nessuna riga da mettere in fila: quelle fatte restano dove sono."); return; }
    const prima = dateDiPrima();
    onPianificaTutte(passi);
    conAnnulla(`${passi.length} ${passi.length === 1 ? "riga messa" : "righe messe"} in fila`, () => onPianificaTutte(prima));
    fineAzioneDate();
  };
  const segnaBlocco = (fatta: boolean) => {
    const cambiano = conSottofase.filter((r) => r.fatta !== fatta);
    const ids = cambiano.map((r) => r.sottofaseId!);
    if (ids.length > 0) {
      // Indietro: ognuna torna al suo punto, non solo «da fare».
      const prima = cambiano.map((r) => ({ id: r.sottofaseId!, percentuale: r.percentuale, quantita_fatta: r.quantitaFatta }));
      onSegnaTutte(ids, fatta);
      conAnnulla(`${ids.length} ${ids.length === 1 ? "riga" : "righe"} ${fatta ? "segnate fatte" : "da fare"}`, () => (onAvanzaTante ? onAvanzaTante(prima) : onSegnaTutte(ids, !fatta)));
    }
    azzeraScelte();
  };
  const salvaDataRiga = (r: RigaDistinta, campo: "inizio" | "fine", v: string | null) => {
    const inizio = campo === "inizio" ? v : r.inizio;
    const fine = campo === "fine" ? v : r.fine;
    if (!r.sottofaseId) return;
    if (!dateValide(inizio, fine)) { toast.error("La fine viene prima dell'inizio."); return; }
    // Togliendo la fine si tolgono anche i giorni: con quelli il database la ricalcolerebbe.
    onPianifica(r.sottofaseId, { data_inizio: inizio, data_fine: fine, giorni: fine ? r.giorni : null });
  };
  const salvaDataFase = (f: FaseTabella, campo: "inizio" | "fine", v: string | null) => {
    const start = campo === "inizio" ? v : f.start_date ?? null;
    const end = campo === "fine" ? v : f.end_date ?? null;
    if (!dateValide(start, end)) { toast.error("La fine viene prima dell'inizio."); return; }
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
          {puoModificare && <Checkbox checked={scelteFasi.has(f.id)} onCheckedChange={() => inverti(setScelteFasi, f.id)} aria-label={`Seleziona ${f.name}`} />}
        </div>
        <div className="min-w-0">
          <div className="flex max-w-full items-center gap-1">
            {!faseId && (
              <button type="button" onClick={() => apriChiudi(f.id)} aria-expanded={aperta} aria-label={`${aperta ? "Chiudi" : "Apri"} le voci di ${f.name}`} className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {aperta ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />}
              </button>
            )}
            <button type="button" onClick={() => onApriScheda(f.id)} aria-label={`Scheda di ${f.name}`} title={f.name} className="line-clamp-2 min-w-0 rounded text-left text-[13px] font-semibold leading-tight hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{f.name}</button>
          </div>
          <div className="flex flex-wrap items-center gap-x-2">
            {puoModificare || puoSquadre ? (
              <button type="button" onClick={() => setAssegnaA([f.id])} title={nomi.join(", ") || "Assegna chi la fa"} aria-label={`Chi fa ${f.name}`}
                className={cn("min-w-0 max-w-full truncate rounded text-left text-[11px] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", nomi.length === 0 && !finita ? "font-medium text-amber-700" : "text-muted-foreground")}>
                {nomi.length ? `${nomi[0]}${nomi.length > 1 ? ` +${nomi.length - 1}` : ""}` : finita ? "Nessuno" : "+ Assegna chi la fa"}
              </button>
            ) : <span className="min-w-0 truncate text-[11px] text-muted-foreground" title={nomi.join(", ")}>{nomi.join(", ") || "Nessuno"}</span>}
            {!!chi?.mezzi.length && <span title={chi.mezzi.join(", ")} className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Truck className="h-3 w-3" aria-hidden="true" />{chi.mezzi.length}</span>}
            {!!chi?.articoli && <span title={`${chi.articoli} articoli`} className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground"><Package className="h-3 w-3" aria-hidden="true" />{chi.articoli}</span>}
            {vedeCosti && !!e?.costoConsuntivo && <span className={cn("shrink-0 text-[11px] tabular-nums text-muted-foreground", e.costoPrevisto > 0 && e.costoConsuntivo > e.costoPrevisto && "font-medium text-rose-700")}>Consuntivo {formatCurrency(e.costoConsuntivo)}</span>}
          </div>
        </div>
        <div className="whitespace-nowrap text-right text-[11px] tabular-nums text-muted-foreground max-md:hidden">{dellaFase.length} voci</div>
        <div className="flex items-center gap-1 max-md:col-start-2" title={`Avanzamento ${pct}%`}>
          <span className="h-1 w-6 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full", finita ? "bg-emerald-600" : "bg-primary")} style={{ width: `${pct}%` }} /></span>
          <span className="text-[11px] font-medium tabular-nums">{pct}%</span>
        </div>
        <div className="max-xl:hidden"><CellaData valore={f.start_date} etichetta={`Inizio di ${f.name}`} modificabile={puoModificare} onSalva={(v) => salvaDataFase(f, "inizio", v)} /></div>
        <div className="max-xl:hidden"><CellaData valore={f.end_date} etichetta={`Fine di ${f.name}`} modificabile={puoModificare} rossa={ritardo} onSalva={(v) => salvaDataFase(f, "fine", v)} /></div>
        <div className="text-right text-xs font-semibold tabular-nums max-md:hidden">{vedeVenduto ? importo(e?.venduto) : ""}</div>
        <div className="text-right text-xs font-semibold tabular-nums max-xl:hidden">{vedeCosti ? (e?.costoPrevisto ? formatCurrency(e.costoPrevisto) : "—") : ""}</div>
        <div className="flex items-center justify-end max-md:col-start-3 max-md:row-start-1">
          {puoModificare && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" aria-label={`Altro per ${f.name}`}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              {/* Il menu, chiudendosi, rimetterebbe il cursore su di sé: il nome scritto andava perso. */}
              <DropdownMenuContent align="end" onCloseAutoFocus={(ev) => { if (campoNuova.current) ev.preventDefault(); }}>
                <DropdownMenuItem onClick={() => { setAperte((a) => new Set(a).add(f.id)); setNuovaIn(f.id); }}><Plus className="mr-2 h-3.5 w-3.5" />Aggiungi sottofase</DropdownMenuItem>
                {senzaSottofase > 0 && <DropdownMenuItem onClick={() => (pct > 0 ? setDivisione(f.id) : onDalleVoci(f.id))}><ListChecks className="mr-2 h-3.5 w-3.5" />Crea {senzaSottofase} sottofasi dalle voci</DropdownMenuItem>}
                <DropdownMenuItem onClick={() => onApriScheda(f.id)}><ExternalLink className="mr-2 h-3.5 w-3.5" />Apri la scheda</DropdownMenuItem>
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
    const stato = statoVoce(r);
    return (
      <>
        <div className="flex items-center">
          {puoModificare && <Checkbox checked={scelteRighe.has(r.key)} onCheckedChange={() => inverti(setScelteRighe, r.key)} aria-label={`Seleziona ${r.descrizione}`} />}
        </div>
        <div className="flex min-w-0 items-center gap-1.5 pl-3">
          {r.sottofaseId ? (
            <button type="button" role="checkbox" aria-checked={r.fatta} disabled={!puoModificare} onClick={() => onSegna(r.sottofaseId!, !r.fatta)} aria-label={`${r.descrizione}: ${r.fatta ? "fatta" : "da fare"}`} className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default">
              {r.fatta ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground" aria-hidden="true" />}
            </button>
          ) : <span title="Non ha ancora una sottofase" className="h-3.5 w-3.5 shrink-0" />}
          {inModifica && inModifica.id === r.sottofaseId ? (
            <Input
              autoFocus value={inModifica.testo} maxLength={160} aria-label={`Nuovo nome di ${r.descrizione}`}
              onChange={(e) => setInModifica({ ...inModifica, testo: e.target.value })}
              onBlur={() => confermaNome(r)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); confermaNome(r); } else if (e.key === "Escape") setInModifica(null); }}
              className="h-6 min-w-0 flex-1 px-1 text-xs"
            />
          ) : (
            <button type="button" onClick={() => setAperta(r.key)} title={r.descrizione}
              className={cn("min-w-0 flex-1 rounded text-left text-xs leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring line-clamp-2", r.fatta && "text-muted-foreground")}>
              {r.descrizione}
              {r.codice && <span className="ml-1 font-mono text-[10px] text-muted-foreground">{r.codice}</span>}
            </button>
          )}
        </div>
        <div className="whitespace-nowrap text-right text-xs tabular-nums max-md:col-start-2 max-md:text-left">{q}</div>
        {rapido && r.sottofaseId && !r.fatta && puoModificare
          ? <div className="max-md:hidden"><CampoRapido riga={r} onAvanza={onAvanza} /></div>
          : <div className={cn("whitespace-nowrap text-[11px] tabular-nums max-md:hidden", stato.tono === "fatta" ? "font-medium text-emerald-700" : stato.tono === "corso" ? "font-medium text-primary" : "text-muted-foreground")}>{r.sottofaseId ? stato.testo : ""}</div>}
        <div className="max-xl:hidden">{r.sottofaseId ? <CellaData valore={r.inizio} etichetta={`Inizio di ${r.descrizione}`} modificabile={puoModificare} onSalva={(v) => salvaDataRiga(r, "inizio", v)} /> : null}</div>
        <div className="max-xl:hidden">{r.sottofaseId ? <CellaData valore={r.fine} etichetta={`Fine di ${r.descrizione}`} modificabile={puoModificare} rossa={ritardo} onSalva={(v) => salvaDataRiga(r, "fine", v)} /> : null}</div>
        <div className="text-right text-xs tabular-nums text-muted-foreground max-md:hidden">{vedeVenduto && r.venduto ? importo(r.venduto) : ""}</div>
        <div className="text-right text-xs tabular-nums text-muted-foreground max-xl:hidden">{vedeCosti && r.previsto !== null ? formatCurrency(r.previsto) : ""}</div>
        <div className="flex items-center justify-end max-md:col-start-3 max-md:row-start-1">
          {puoModificare && r.sottofaseId && !inModifica && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground" aria-label={`Altro per ${r.descrizione}`}><MoreHorizontal className="h-3.5 w-3.5" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setInModifica({ id: r.sottofaseId!, testo: r.descrizione.slice(0, 160) })}><Pencil className="mr-2 h-3.5 w-3.5" />Rinomina</DropdownMenuItem>
                <DropdownMenuItem onClick={() => sposta(r, -1)}><ArrowUp className="mr-2 h-3.5 w-3.5" />Sposta su</DropdownMenuItem>
                <DropdownMenuItem onClick={() => sposta(r, 1)}><ArrowDown className="mr-2 h-3.5 w-3.5" />Sposta giù</DropdownMenuItem>
                <DropdownMenuItem className="text-rose-700" onClick={() => setDaEliminare(r)}><Trash2 className="mr-2 h-3.5 w-3.5" />Elimina</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </>
    );
  };

  const griglia = cn("group grid grid-cols-[1.25rem_minmax(0,1fr)_1.5rem] items-center gap-x-2 border-b px-2", COLONNE);
  const mostra = (e: Elemento) => {
    if (e.tipo === "fase") return <div className={cn(griglia, "bg-muted/50 py-1")}>{rigaFase(e.fase, e.righe)}</div>;
    if (e.tipo === "riga") return <div className={cn(griglia, "py-0.5 hover:bg-muted/30")}>{rigaVoce(e.riga)}</div>;
    if (e.tipo === "aggiungi") {
      return (
        <div className="border-b px-2 py-0.5 pl-9">
          <button type="button" onClick={() => setNuovaIn(e.faseId)} className="flex items-center gap-1 rounded text-[11px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Plus className="h-3 w-3" aria-hidden="true" />Aggiungi sottofase
          </button>
        </div>
      );
    }
    return (
      <div className="border-b px-2 py-1 pl-9">
        <Input ref={campoNuova} autoFocus value={nuova} maxLength={160} onChange={(ev) => setNuova(ev.target.value)} placeholder="Nome e Invio, Esc per chiudere. Puoi incollare un elenco." aria-label="Nuova sottofase"
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

  return (
    <section aria-label="Lavorazioni della commessa" className="space-y-2">
      {/* I numeri restano in vista mentre si scorre la pagina. */}
      <div className="sticky top-0 z-20 bg-background">
      <dl className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-1.5 rounded-lg border px-3 py-1.5">
        {avanzamento !== null && <Stat etichetta="Avanzamento">{avanzamento}%</Stat>}
        {vedeVenduto && <Stat etichetta="Imponibile" nota={daRipartire > 0.5 && vendutoFasi > 0 ? `${formatCurrency(daRipartire)} da ripartire` : undefined}>{formatCurrency(venduto)}</Stat>}
        {vedeVenduto && iva && <Stat etichetta={`Con IVA ${aliquota.toLocaleString("it-IT")}%`}>{formatCurrency(conIvaTot.totale)}</Stat>}
        {vedeCosti && <Stat etichetta="Previsto">{economia.previsto > 0 ? formatCurrency(economia.previsto) : "—"}</Stat>}
        {vedeCosti && <Stat etichetta="Consuntivo" nota={consuntivoSenzaFase > 0 ? (onCostiSenzaFase
          ? <button type="button" onClick={onCostiSenzaFase} className="rounded font-medium text-amber-800 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">+ {formatCurrency(consuntivoSenzaFase)} senza fase</button>
          : `+ ${formatCurrency(consuntivoSenzaFase)} senza fase`) : undefined}>{formatCurrency(economia.consuntivo)}</Stat>}
        {vedeMargini && vedeVenduto && vedeCosti && <Stat etichetta="Margine previsto">{margine === null ? "—" : `${margine}%`}</Stat>}
        {vedeVenduto && vedeCosti && iva && daVersare && (
          <div className="shrink-0" title={`Vendite ${formatCurrency(Math.max(iva.debito_previsto, iva.debito_fatturato))} · credito acquisti ${formatCurrency(iva.credito_fatture + iva.credito_previsto_costi + iva.credito_previsto_ditte)}${iva.reverse_charge_imponibile > 0 ? ` · reverse charge ${formatCurrency(iva.reverse_charge_imponibile)}` : ""}`}>
            <dt className="whitespace-nowrap text-[11px] text-muted-foreground">{daVersare.verso === "credito" ? "IVA a credito" : "IVA da versare"}</dt>
            <dd className="whitespace-nowrap text-[13px] font-semibold tabular-nums">{daVersare.verso === "pari" ? "—" : formatCurrency(daVersare.importo)}</dd>
          </div>
        )}
      </dl>
      </div>

      <div className="grid gap-2 lg:grid-cols-[12rem_minmax(0,1fr)]">
      <div className="lg:hidden">
        <Select value={faseId ?? "tutte"} onValueChange={(v) => { setFaseId(v === "tutte" ? null : v); azzeraScelte(); }}>
          <SelectTrigger aria-label="Scegli la fase" className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le fasi ({tutte.length})</SelectItem>
            {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({Number(f.percentuale) || 0}%)</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <nav aria-label="Fasi" className="hidden max-h-[78vh] space-y-0.5 self-start overflow-y-auto rounded-lg border p-1 lg:block">
        <button type="button" aria-current={faseId === null ? "true" : undefined} onClick={() => { setFaseId(null); azzeraScelte(); }}
          className={cn("w-full rounded-md px-2 py-1 text-left text-xs font-medium hover:bg-muted", faseId === null && "bg-muted")}>
          Tutte le fasi <span className="font-normal text-muted-foreground">{tutte.length}</span>
        </button>
        {fasi.map((f) => {
          const pct = Number(f.percentuale) || 0;
          const chi = chiDi.get(f.id);
          const senzaNessuno = pct < 100 && f.status !== "completata" && !(chi && chi.squadre.length + chi.persone.length + chi.ditte.length > 0);
          const v = economiaDi?.get(f.id)?.venduto ?? 0;
          return (
            <div key={f.id} className={cn("group flex items-start gap-1 rounded-md px-1.5 py-1 hover:bg-muted", faseId === f.id && "bg-muted")}>
              {puoModificare && <Checkbox checked={scelteFasi.has(f.id)} onCheckedChange={() => inverti(setScelteFasi, f.id)} aria-label={`Seleziona ${f.name}`} className="mt-0.5" />}
              <button type="button" aria-current={faseId === f.id ? "true" : undefined} onClick={() => { setFaseId(f.id); setFiltro("tutte"); setScelteRighe(new Set()); }} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={cn("block truncate text-xs font-medium", senzaNessuno && "text-amber-700")} title={f.name}>{f.name}</span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                  <span className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-background"><span className={cn("block h-full", pct >= 100 ? "bg-emerald-600" : "bg-primary")} style={{ width: `${pct}%` }} /></span>
                  {pct}%
                  {vedeVenduto && v > 0 && <span className="ml-auto truncate">{formatCurrency(conIva ? conAliquota(v, aliquota).totale : v)}</span>}
                </span>
              </button>
            </div>
          );
        })}
      </nav>
      <div className="min-w-0 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <div className="relative min-w-[11rem] flex-1">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca una voce o un codice…" aria-label="Cerca nella distinta" className="h-7 pl-7 text-xs" />
        </div>
        <div role="group" aria-label="Filtri" className="flex flex-wrap items-center gap-0.5">
          {FILTRI_DISTINTA.filter((f) => (!f.soloCosti || vedeCosti) && (f.value === "tutte" || conti[f.value] > 0 || filtro === f.value)).map((f) => (
            <Button key={f.value} type="button" size="sm" variant={filtro === f.value ? "secondary" : "ghost"} className="h-7 px-2 text-xs" aria-pressed={filtro === f.value} onClick={() => setFiltro(f.value)}>
              {f.label}{f.value !== "tutte" && <span className="ml-1 tabular-nums text-muted-foreground">{conti[f.value]}</span>}
            </Button>
          ))}
        </div>
        {puoModificare && (
          <Button type="button" size="sm" variant={rapido ? "default" : "outline"} className="h-7 px-2 text-xs" aria-pressed={rapido}
            onClick={() => { const si = !rapido; setRapido(si); if (si && filtro === "tutte") setFiltro(conti.settimana > 0 ? "settimana" : "da_fare"); }}>
            {rapido ? "Fine aggiornamento" : "Aggiorna avanzamento"}
          </Button>
        )}
        {!faseId && <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setAperte(tutteAperte ? new Set() : new Set(fasi.map((f) => f.id)))}>{tutteAperte ? "Chiudi tutte" : "Apri tutte"}</Button>}
      </div>

      {rapido && <p role="status" className="rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-900">Scrivi nella colonna Stato quanto è fatto in totale (quantità o %), Invio passa alla riga dopo. Ogni riga si salva da sola.</p>}
      <div ref={scrollRef} className="max-h-[78vh] overflow-y-auto rounded-lg border">
        <div>
        <div className={cn("sticky top-0 z-10 hidden items-center gap-x-2 border-b bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground md:grid", COLONNE)}>
          <div /><div>Voce</div><div className="text-right">Quantità</div><div>Stato</div><div className="max-xl:hidden">Dal</div><div className="max-xl:hidden">Al</div>
          <div className="text-right">
            {vedeVenduto && (iva && aliquota > 0
              ? <button type="button" onClick={() => setConIva((v) => !v)} title="Cambia tra imponibile e con IVA" className="rounded underline decoration-dotted underline-offset-2 hover:text-foreground">{conIva ? "Con IVA" : "Imponibile"}</button>
              : "Imponibile")}
          </div>
          <div className="text-right max-xl:hidden">{vedeCosti && "Previsto"}</div>
          <div />
        </div>
        {elementi.length === 0 ? (
          <p role="status" className="p-6 text-center text-sm text-muted-foreground">Nessuna voce con questi filtri.</p>
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
        <div role="group" aria-label="Azioni sulle righe scelte" className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-lg">
          <span className="font-medium">{[scelteFasi.size ? `${scelteFasi.size} ${scelteFasi.size === 1 ? "fase" : "fasi"}` : null, scelteRighe.size ? `${scelteRighe.size} ${scelteRighe.size === 1 ? "voce" : "voci"}` : null].filter(Boolean).join(", ")}</span>
          {scelteFasi.size > 0 && <Button type="button" size="sm" variant="secondary" className="h-6 gap-1 text-xs" onClick={() => setAssegnaA([...scelteFasi])}><Users className="h-3 w-3" aria-hidden="true" />Assegna</Button>}
          {scelteRighe.size > 0 && <>
            {conSottofase.length < righeScelte.length && <span className="text-amber-300">{righeScelte.length - conSottofase.length} senza sottofase</span>}
            <Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0} onClick={() => segnaBlocco(true)}>Segna fatte</Button>
            <Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0} onClick={() => segnaBlocco(false)}>Da fare</Button>
            <Popover>
              <PopoverTrigger asChild><Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0}>Date</Button></PopoverTrigger>
              <PopoverContent className="w-64 space-y-2 text-xs">
                <label className="flex items-center justify-between gap-2">Dal<Input type="date" value={bloccoInizio} onChange={(e) => setBloccoInizio(e.target.value)} aria-label="Inizio per le righe scelte" className="h-7 w-36 px-1 text-xs" /></label>
                <label className="flex items-center justify-between gap-2">Al<Input type="date" value={bloccoFine} onChange={(e) => setBloccoFine(e.target.value)} aria-label="Fine per le righe scelte" className="h-7 w-36 px-1 text-xs" /></label>
                <Button type="button" size="sm" className="h-7 w-full text-xs" disabled={!bloccoInizio && !bloccoFine} onClick={applicaDate}>Applica le date</Button>
                <div className="border-t pt-2">
                  <label className="flex items-center justify-between gap-2">Giorni ognuna<Input type="number" inputMode="numeric" min={1} max={3650} value={bloccoGiorni} onChange={(e) => setBloccoGiorni(e.target.value)} aria-label="Giorni per ogni riga scelta" className="h-7 w-20 px-1 text-xs" /></label>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" title="Una dopo l'altra, dalla data «dal» o da oggi, contando i giorni di lavoro" onClick={mettiInFila}>Metti in fila</Button>
                </div>
                <div className="border-t pt-2">
                  <label className="flex items-center justify-between gap-2">Sposta di giorni<Input type="number" inputMode="numeric" min={-3650} max={3650} value={bloccoSposta} onChange={(e) => setBloccoSposta(e.target.value)} aria-label="Giorni di cui spostare le righe scelte" placeholder="es. 7 o -3" className="h-7 w-20 px-1 text-xs" /></label>
                  <Button type="button" size="sm" variant="outline" className="mt-2 h-7 w-full text-xs" disabled={!bloccoSposta} onClick={spostaDate}>Sposta le date</Button>
                </div>
              </PopoverContent>
            </Popover>
            {onAvanzaTante && (
              <Popover>
                <PopoverTrigger asChild><Button type="button" size="sm" variant="secondary" className="h-6 text-xs" disabled={conSottofase.length === 0}>Avanzamento</Button></PopoverTrigger>
                <PopoverContent className="w-56 space-y-2 text-xs">
                  <label className="flex items-center justify-between gap-2">Tutte al<span className="flex items-center gap-1"><Input type="number" inputMode="numeric" min={0} max={100} value={bloccoPct} onChange={(e) => setBloccoPct(e.target.value)} aria-label="Percentuale per le righe scelte" className="h-7 w-16 px-1 text-xs" />%</span></label>
                  <Button type="button" size="sm" className="h-7 w-full text-xs" disabled={bloccoPct === ""} onClick={avanzaBlocco}>Applica</Button>
                </PopoverContent>
              </Popover>
            )}
          </>}
          <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-background hover:bg-background/20 hover:text-background" aria-label="Togli la selezione" onClick={azzeraScelte}><X className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      <SchedaVoce
        riga={rigaAperta}
        posizione={{ numero: (indiceAperta >= 0 ? indiceAperta : ultimoIndice.current) + 1, totale: righeInElenco.length }}
        orderId={orderId}
        aliquota={aliquota}
        chiLaFa={rigaAperta ? nomiChi(rigaAperta.faseId) : []}
        consuntivoFase={rigaAperta ? economiaDi?.get(rigaAperta.faseId)?.costoConsuntivo ?? null : null}
        vedeVenduto={vedeVenduto} vedeCosti={vedeCosti} vedeMargini={vedeMargini} puoModificare={puoModificare}
        onChiudi={() => setAperta(null)}
        onVicina={(verso) => { const v = righeInElenco[indiceAperta >= 0 ? indiceAperta + verso : verso > 0 ? ultimoIndice.current : ultimoIndice.current - 1]; if (v) setAperta(v.key); }}
        onSalvaVoce={onSalvaVoce} onRisorse={onRisorse} onParallelo={onParallelo}
        oggi={oggi}
        onSegna={onSegna} onAvanza={onAvanza} onPianifica={onPianifica} onRinomina={onRinomina}
        onSposta={sposta}
        onElimina={(x) => { setAperta(null); setDaEliminare(x); }}
        onAssegna={(id) => { setAperta(null); setAssegnaA([id]); }}
        onCreaSottofasi={(id) => { setAperta(null); if (Number(fasi.find((f) => f.id === id)?.percentuale) > 0) setDivisione(id); else onDalleVoci(id); }}
        onApriScheda={onApriScheda}
      />

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
            <AlertDialogTitle>Eliminare la sottofase?</AlertDialogTitle>
            <AlertDialogDescription>{daEliminare?.descrizione.slice(0, 160)}{daEliminare?.voceId ? ". La voce con quantità e importo resta nella fase." : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (daEliminare?.sottofaseId) onElimina(daEliminare.sottofaseId); setDaEliminare(null); }}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!divisione} onOpenChange={(aperto) => { if (!aperto) setDivisione(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>La fase è già avviata</AlertDialogTitle>
            <AlertDialogDescription>Con le sottofasi l'avanzamento si calcola da quelle spuntate: la fase ripartirebbe da zero finché non segni quelle già fatte.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (divisione) onDalleVoci(divisione); setDivisione(null); }}>Crea le sottofasi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
