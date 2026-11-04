// src/components/orders/DistintaLavorazioni.tsx
// Tutte le voci della commessa, una riga ciascuna, con la stessa riga vista in modi diversi.
import { useMemo, useRef, useState, type FocusEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListChecks, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/formatters";
import {
  avanzamentoFasi, contaFiltri, dateValide, FILTRI_DISTINTA, filtraDistinta, pianoInBlocco, righeDistinta, totaliDistinta,
  type EconomiaDistinta, type FaseDistinta, type FiltroDistinta, type RigaDistinta, type VoceDistinta,
} from "@/lib/orders/distintaLavorazioni";
import { conAliquota, saldoIva, type IvaCommessa } from "@/lib/orders/ivaCommessa";
import type { Sottofase } from "@/lib/orders/sottofasi";
import { cn } from "@/lib/utils";

type Vista = "struttura" | "pianificazione" | "economia";

const VISTE: ReadonlyArray<{ value: Vista; label: string }> = [
  { value: "struttura", label: "Struttura" },
  { value: "pianificazione", label: "Pianificazione" },
  { value: "economia", label: "Economia" },
];

const COLONNE: Record<Vista, string> = {
  struttura: "sm:grid-cols-[1.75rem_1.75rem_7rem_minmax(0,1fr)_6rem_3rem_7rem]",
  pianificazione: "sm:grid-cols-[1.75rem_1.75rem_7rem_minmax(0,1fr)_8.5rem_8.5rem_3.5rem]",
  economia: "sm:grid-cols-[1.75rem_1.75rem_7rem_minmax(0,1fr)_7rem_7rem_5rem]",
};

const quantita = (n: number | null) => (n === null ? "—" : n.toLocaleString("it-IT", { maximumFractionDigits: 2 }));
const euro = (n: number | null) => (n === null ? "—" : formatCurrency(n));

interface Props {
  fasi: ReadonlyArray<FaseDistinta>;
  sottofasiDi: ReadonlyMap<string, ReadonlyArray<Sottofase>>;
  voci: ReadonlyArray<VoceDistinta>;
  /** Venduto, previsto e consuntivo si leggono dalla fase: tengono conto di sconti, ditte e acquisti. */
  economiaDi?: ReadonlyMap<string, EconomiaDistinta>;
  /** Costi della commessa che non stanno in una sola fase, come le ore di un rapportino su più fasi. */
  consuntivoSenzaFase?: number;
  /** Il conto dell'IVA della commessa: aliquota, debito, credito e reverse charge. */
  iva?: IvaCommessa | null;
  vedeVenduto: boolean;
  vedeCosti: boolean;
  /** Il margine è un permesso a sé: non basta vedere venduto e costi. */
  vedeMargini: boolean;
  puoModificare: boolean;
  oggi: string;
  onSegna: (id: string, fatta: boolean) => void;
  /** Una scrittura sola per tante righe: con centinaia di voci non si manda una richiesta per riga. */
  onSegnaTutte: (ids: string[], fatta: boolean) => void;
  onPianifica: (id: string, piano: { data_inizio: string | null; data_fine: string | null; giorni: number | null }) => void;
  onPianificaTutte: (passi: Array<{ id: string; data_inizio: string | null; data_fine: string | null; giorni: number | null }>) => void;
  onDalleVoci: (faseId: string) => void;
  /** Squadre, ditte, note e materiali restano nella scheda della fase. */
  onApriScheda: (faseId: string) => void;
}

export function DistintaLavorazioni({
  fasi, sottofasiDi, voci, economiaDi, consuntivoSenzaFase = 0, iva, vedeVenduto, vedeCosti, vedeMargini, puoModificare, oggi,
  onSegna, onSegnaTutte, onPianifica, onPianificaTutte, onDalleVoci, onApriScheda,
}: Props) {
  const viste = VISTE.filter((v) => v.value !== "economia" || vedeCosti || vedeVenduto);
  const [vista, setVista] = useState<Vista>("struttura");
  const [faseId, setFaseId] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroDistinta>("tutte");
  const [testo, setTesto] = useState("");
  const [scelte, setScelte] = useState<ReadonlySet<string>>(new Set());
  const [aperte, setAperte] = useState<ReadonlySet<string>>(new Set());
  const [bloccoInizio, setBloccoInizio] = useState("");
  const [bloccoFine, setBloccoFine] = useState("");
  const [divisione, setDivisione] = useState<string | null>(null);
  const [conIva, setConIva] = useState(false);

  const scegliFase = (id: string | null) => { setFaseId(id); setScelte(new Set()); };

  const tutte = useMemo(() => righeDistinta(fasi, sottofasiDi, voci), [fasi, sottofasiDi, voci]);
  const dellaFase = useMemo(() => (faseId ? tutte.filter((r) => r.faseId === faseId) : tutte), [tutte, faseId]);
  const righe = useMemo(() => filtraDistinta(dellaFase, { testo, filtro, oggi }), [dellaFase, testo, filtro, oggi]);
  const conti = useMemo(() => contaFiltri(dellaFase, oggi), [dellaFase, oggi]);
  const totali = useMemo(() => totaliDistinta(dellaFase), [dellaFase]);
  const perFase = useMemo(() => {
    const mappa = new Map<string, ReturnType<typeof totaliDistinta>>();
    for (const f of fasi) mappa.set(f.id, totaliDistinta(tutte.filter((r) => r.faseId === f.id)));
    return mappa;
  }, [fasi, tutte]);
  const fasiScelte = useMemo(() => (faseId ? fasi.filter((f) => f.id === faseId) : fasi), [fasi, faseId]);
  const economia = useMemo(() => {
    if (!economiaDi) return null;
    return fasiScelte.reduce((t, f) => {
      const e = economiaDi.get(f.id);
      return { venduto: t.venduto + (e?.venduto ?? 0), costoPrevisto: t.costoPrevisto + (e?.costoPrevisto ?? 0), costoConsuntivo: t.costoConsuntivo + (e?.costoConsuntivo ?? 0) };
    }, { venduto: 0, costoPrevisto: 0, costoConsuntivo: 0 });
  }, [economiaDi, fasiScelte]);
  const avanzamento = avanzamentoFasi(fasiScelte, economiaDi);
  const faseAperta = faseId ? fasi.find((f) => f.id === faseId) : undefined;
  const venduto = economia ? economia.venduto : totali.venduto;
  const aliquota = iva?.aliquota ?? 0;
  const vendutoIva = conAliquota(venduto, aliquota);
  // Solo il venduto cambia: sui costi l'IVA dipende da chi fattura, e col reverse charge non c'è.
  const importoVenduto = (n: number | null) => euro(n === null ? null : conIva ? conAliquota(n, aliquota).totale : n);
  const daVersare = iva ? saldoIva(Math.max(iva.debito_previsto, iva.debito_fatturato), iva.credito_fatture + iva.credito_previsto_costi + iva.credito_previsto_ditte) : null;
  const previsto = economia && economia.costoPrevisto > 0 ? economia.costoPrevisto : totali.previsto;
  const senzaSottofase = dellaFase.filter((r) => r.voceId && !r.sottofaseId).length;

  // Con tutte le fasi insieme, il nome della fase separa i suoi gruppi di righe.
  const elementi = useMemo(() => {
    if (faseId) return righe.map((r) => ({ key: r.key, riga: r as RigaDistinta | null, faseId: r.faseId, titolo: "" }));
    const lista: Array<{ key: string; riga: RigaDistinta | null; faseId: string; titolo: string }> = [];
    let corrente: string | null = null;
    for (const r of righe) {
      if (r.faseId !== corrente) {
        corrente = r.faseId;
        lista.push({ key: `fase:${r.faseId}`, riga: null, faseId: r.faseId, titolo: r.faseNome });
      }
      lista.push({ key: r.key, riga: r, faseId: r.faseId, titolo: "" });
    }
    return lista;
  }, [righe, faseId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const virtuale = elementi.length > 60;
  const virtualizer = useVirtualizer({
    count: elementi.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 26,
    overscan: 12,
    enabled: virtuale,
  });

  const selezionate = useMemo(() => righe.filter((r) => scelte.has(r.key)), [righe, scelte]);
  const conSottofase = selezionate.filter((r) => r.sottofaseId);
  const inverti = (key: string) => {
    const nuove = new Set(scelte);
    if (nuove.has(key)) nuove.delete(key); else nuove.add(key);
    setScelte(nuove);
  };
  const tutteScelte = righe.length > 0 && selezionate.length === righe.length;
  const invertiTutte = () => setScelte(tutteScelte ? new Set() : new Set(righe.map((r) => r.key)));

  const applicaDate = () => {
    if (!bloccoInizio && !bloccoFine) return;
    const { passi, incoerenti } = pianoInBlocco(conSottofase, bloccoInizio || null, bloccoFine || null);
    if (incoerenti.length > 0) {
      toast.error(`Su ${incoerenti.length === 1 ? "1 riga" : `${incoerenti.length} righe`} la fine verrebbe prima dell'inizio: nessuna data salvata.`, { description: incoerenti[0].slice(0, 120) });
      return;
    }
    onPianificaTutte(passi);
    setScelte(new Set());
    setBloccoInizio("");
    setBloccoFine("");
  };
  const segnaBlocco = (fatta: boolean) => {
    const ids = conSottofase.filter((r) => r.fatta !== fatta).map((r) => r.sottofaseId!);
    if (ids.length > 0) onSegnaTutte(ids, fatta);
    setScelte(new Set());
  };
  const salvaData = (r: RigaDistinta, campo: "inizio" | "fine", e: FocusEvent<HTMLInputElement>) => {
    const salvata = (campo === "inizio" ? r.inizio : r.fine) ?? "";
    // Una data scritta a metà risulta vuota: non deve cancellare quella salvata.
    if (e.target.validity.badInput) { e.target.value = salvata; return; }
    const valore = e.target.value;
    if (!r.sottofaseId || valore === salvata) return;
    const inizio = campo === "inizio" ? valore || null : r.inizio;
    const fine = campo === "fine" ? valore || null : r.fine;
    if (!dateValide(inizio, fine)) {
      toast.error("La fine viene prima dell'inizio.");
      e.target.value = salvata;
      return;
    }
    // Togliendo la fine si tolgono anche i giorni: con quelli il database la ricalcolerebbe.
    onPianifica(r.sottofaseId, { data_inizio: inizio, data_fine: fine, giorni: fine ? r.giorni : null });
  };

  const riga = (r: RigaDistinta) => {
    const aperta = aperte.has(r.key);
    const ritardo = !r.fatta && !!r.fine && r.fine < oggi;
    return (
      <>
        <div className="flex items-center pt-1.5 sm:pt-0">
          {puoModificare && <Checkbox checked={scelte.has(r.key)} onCheckedChange={() => inverti(r.key)} aria-label={`Seleziona ${r.descrizione}`} />}
        </div>
        <div className="flex items-center pt-1.5 sm:pt-0">
          {r.sottofaseId
            ? <Checkbox checked={r.fatta} disabled={!puoModificare} onCheckedChange={(v) => onSegna(r.sottofaseId!, v === true)} aria-label={`${r.descrizione}: ${r.fatta ? "fatta" : "da fare"}`} className="data-[state=checked]:border-emerald-600 data-[state=checked]:bg-emerald-600" />
            : <span title="Non ha ancora una sottofase" className="block h-4 w-4 rounded-sm border border-dashed border-muted-foreground/40" />}
        </div>
        <div className="hidden min-w-0 items-center truncate font-mono text-[11px] text-muted-foreground sm:flex" title={r.codice ?? undefined}>{r.codice ?? ""}</div>
        <button
          type="button"
          onClick={() => {
            const nuove = new Set(aperte);
            if (aperta) nuove.delete(r.key); else nuove.add(r.key);
            setAperte(nuove);
          }}
          aria-expanded={aperta}
          title={aperta ? undefined : r.descrizione}
          className={cn("min-w-0 self-center rounded text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", !aperta && "truncate", r.fatta && "text-muted-foreground line-through")}
        >
          {r.descrizione}
        </button>
        {vista === "struttura" && <>
          <div className="self-center text-right text-xs tabular-nums max-sm:col-start-3 max-sm:text-left">{quantita(r.quantita)} <span className="text-muted-foreground sm:hidden">{r.unita}</span></div>
          <div className="hidden self-center text-xs text-muted-foreground sm:block">{r.unita ?? ""}</div>
          {vedeVenduto && <div className="self-center text-right text-xs tabular-nums max-sm:col-start-3 max-sm:text-left">{importoVenduto(r.venduto)}</div>}
        </>}
        {vista === "pianificazione" && (r.sottofaseId ? <>
          <Input type="date" key={`i${r.inizio ?? ""}`} defaultValue={r.inizio ?? ""} disabled={!puoModificare} aria-label={`Inizio di ${r.descrizione}`} onBlur={(e) => salvaData(r, "inizio", e)} className="h-6 px-1 text-xs max-sm:col-start-3" />
          <Input type="date" key={`f${r.fine ?? ""}`} defaultValue={r.fine ?? ""} disabled={!puoModificare} aria-label={`Fine di ${r.descrizione}`} onBlur={(e) => salvaData(r, "fine", e)} className={cn("h-6 px-1 text-xs max-sm:col-start-3", ritardo && "border-rose-400 text-rose-700")} />
          <div className="hidden self-center text-right text-xs tabular-nums text-muted-foreground sm:block" title={r.giorniLavorati > 0 ? "Giorni lavorati dai rapportini approvati, su quelli previsti" : undefined}>{r.giorniLavorati > 0 ? `${r.giorniLavorati}/${r.giorni ?? "—"}` : r.giorni ? `${r.giorni} gg` : ""}</div>
        </> : <p className="self-center text-xs text-muted-foreground max-sm:col-start-3 sm:col-span-3">Senza sottofase</p>)}
        {vista === "economia" && <>
          {vedeVenduto ? <div className="self-center text-right text-xs tabular-nums max-sm:col-start-3 max-sm:text-left">{importoVenduto(r.venduto)}</div> : <div />}
          {vedeCosti ? <div className={cn("self-center text-right text-xs tabular-nums max-sm:col-start-3 max-sm:text-left", r.previsto === null && "text-muted-foreground")}>{r.previsto === null ? "Da definire" : euro(r.previsto)}</div> : <div />}
          <div className="hidden self-center text-right text-xs tabular-nums text-muted-foreground sm:block">
            {vedeMargini && vedeVenduto && vedeCosti && r.venduto && r.previsto !== null ? `${Math.round(((r.venduto - r.previsto) / r.venduto) * 100)}%` : ""}
          </div>
        </>}
      </>
    );
  };

  const titoloFase = (id: string, titolo: string) => (
    <button type="button" onClick={() => scegliFase(id)} className="block w-full border-b bg-muted/50 px-2 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
      {titolo}
    </button>
  );
  const classiRiga = cn("grid grid-cols-[1.5rem_1.5rem_minmax(0,1fr)] gap-x-2 gap-y-0.5 border-b px-2 py-0.5 sm:gap-y-0", COLONNE[vista]);

  return (
    <section aria-label="Distinta delle lavorazioni" className="grid gap-3 lg:grid-cols-[13rem_minmax(0,1fr)]">
      {/* Le fasi: sul telefono una tendina, altrimenti l'elenco con i totali. */}
      <div className="lg:hidden">
        <Select value={faseId ?? "tutte"} onValueChange={(v) => scegliFase(v === "tutte" ? null : v)}>
          <SelectTrigger aria-label="Scegli la fase"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tutte">Tutte le fasi ({tutte.length})</SelectItem>
            {fasi.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} ({perFase.get(f.id)?.righe ?? 0})</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <nav aria-label="Fasi" className="hidden max-h-[75vh] space-y-0.5 overflow-y-auto rounded-lg border p-1.5 lg:block">
        <button type="button" aria-current={faseId === null ? "true" : undefined} onClick={() => scegliFase(null)}
          className={cn("w-full rounded-md px-2 py-1 text-left text-xs font-medium hover:bg-muted", faseId === null && "bg-muted")}>
          Tutte le fasi <span className="font-normal text-muted-foreground">{tutte.length}</span>
        </button>
        {fasi.map((f) => {
          const t = perFase.get(f.id);
          const pct = Number(f.percentuale) || 0;
          const vendutoFase = economiaDi?.get(f.id)?.venduto ?? t?.venduto ?? 0;
          return (
            <button key={f.id} type="button" aria-current={faseId === f.id ? "true" : undefined} onClick={() => scegliFase(f.id)}
              className={cn("w-full rounded-md px-2 py-1 text-left hover:bg-muted", faseId === f.id && "bg-muted")}>
              <span className="block truncate text-xs font-medium" title={f.name}>{f.name}</span>
              <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px] tabular-nums text-muted-foreground">
                <span>{t?.righe ?? 0} voci · {pct}%</span>
                {vedeVenduto && <span>{formatCurrency(conIva ? conAliquota(vendutoFase, aliquota).totale : vendutoFase)}</span>}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-1.5">
        <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-xs">
          {avanzamento !== null && <div className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">Avanzamento</dt><dd className="font-semibold tabular-nums">{avanzamento}%</dd></div>}
          {vedeVenduto && <div className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">Venduto imponibile</dt><dd className="font-semibold tabular-nums">{formatCurrency(venduto)}</dd></div>}
          {vedeVenduto && iva && <div className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">IVA {aliquota.toLocaleString("it-IT")}%</dt><dd className="font-semibold tabular-nums">{formatCurrency(vendutoIva.iva)}</dd></div>}
          {vedeVenduto && iva && <div className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">Con IVA</dt><dd className="font-semibold tabular-nums">{formatCurrency(vendutoIva.totale)}</dd></div>}
          {vedeCosti && <div className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">Previsto</dt><dd className="font-semibold tabular-nums">{previsto > 0 ? formatCurrency(previsto) : "Da definire"}{previsto > 0 && totali.senzaPrevisto > 0 && <span className="ml-1 text-[11px] font-normal text-amber-700">parziale</span>}</dd></div>}
          {vedeCosti && economia && <div className="flex items-baseline gap-1.5"><dt className="text-muted-foreground">Consuntivo</dt><dd className="font-semibold tabular-nums">{formatCurrency(economia.costoConsuntivo)}{!faseId && consuntivoSenzaFase > 0 && <span className="ml-1 text-[11px] font-normal text-amber-700">+ {formatCurrency(consuntivoSenzaFase)} senza fase</span>}</dd></div>}
          {vedeCosti && <span className="text-[11px] text-muted-foreground">Previsto e consuntivo in imponibile, IVA esclusa</span>}
          {faseId && <Button type="button" variant="link" size="sm" className="ml-auto h-auto p-0 text-xs" onClick={() => onApriScheda(faseId)}>Apri la scheda: squadre, ditte, note</Button>}
        </dl>

        {vedeVenduto && vedeCosti && iva && daVersare && (
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">IVA commessa a fine lavori: </span>
            <span className="font-semibold tabular-nums text-foreground">{daVersare.verso === "credito" ? `${formatCurrency(daVersare.importo)} a credito` : daVersare.verso === "pari" ? "in pari" : `${formatCurrency(daVersare.importo)} da versare`}</span>
            {" · "}vendite {formatCurrency(Math.max(iva.debito_previsto, iva.debito_fatturato))}{" · "}credito acquisti {formatCurrency(iva.credito_fatture + iva.credito_previsto_costi + iva.credito_previsto_ditte)}
            {iva.reverse_charge_imponibile > 0 && <>{" · "}reverse charge {formatCurrency(iva.reverse_charge_imponibile)}</>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Vista" className="inline-flex rounded-md border p-0.5">
            {viste.map((v) => (
              <Button key={v.value} type="button" size="sm" variant={vista === v.value ? "secondary" : "ghost"} className="h-6 px-2 text-xs" aria-pressed={vista === v.value} onClick={() => setVista(v.value)}>{v.label}</Button>
            ))}
          </div>
          {vedeVenduto && iva && aliquota > 0 && (
            <div role="group" aria-label="Venduto" className="inline-flex rounded-md border p-0.5">
              <Button type="button" size="sm" variant={!conIva ? "secondary" : "ghost"} className="h-6 px-2 text-xs" aria-pressed={!conIva} onClick={() => setConIva(false)}>Imponibile</Button>
              <Button type="button" size="sm" variant={conIva ? "secondary" : "ghost"} className="h-6 px-2 text-xs" aria-pressed={conIva} onClick={() => setConIva(true)}>Con IVA</Button>
            </div>
          )}
          <div className="relative min-w-[12rem] flex-1">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <Input value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Cerca per descrizione o codice…" aria-label="Cerca nella distinta" className="h-8 pl-8" />
          </div>
          {puoModificare && senzaSottofase > 0 && faseId && (
            <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={() => (Number(faseAperta?.percentuale) > 0 ? setDivisione(faseId) : onDalleVoci(faseId))}>
              <ListChecks className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Crea {senzaSottofase} sottofasi
            </Button>
          )}
        </div>

        <div role="group" aria-label="Filtri" className="flex flex-wrap items-center gap-1">
          {FILTRI_DISTINTA.filter((f) => !f.soloCosti || vedeCosti).map((f) => (
            <Button key={f.value} type="button" size="sm" variant={filtro === f.value ? "secondary" : "ghost"} className="h-6 px-2 text-xs" aria-pressed={filtro === f.value} onClick={() => { setFiltro(f.value); setScelte(new Set()); }}>
              {f.label} <span className="ml-1 tabular-nums text-muted-foreground">{conti[f.value]}</span>
            </Button>
          ))}
          {puoModificare && righe.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-2 text-xs sm:hidden" onClick={invertiTutte}>{tutteScelte ? "Togli tutte" : "Scegli tutte"}</Button>
          )}
        </div>

        {selezionate.length > 0 && (
          <div role="group" aria-label="Azioni sulle righe scelte" className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs">
            <span className="font-medium">{selezionate.length} scelte</span>
            {conSottofase.length < selezionate.length && <span className="text-amber-700">{selezionate.length - conSottofase.length} senza sottofase: restano fuori</span>}
            <Button type="button" variant="outline" size="sm" className="h-6 text-xs" disabled={conSottofase.length === 0} onClick={() => segnaBlocco(true)}>Segna fatte</Button>
            <Button type="button" variant="outline" size="sm" className="h-6 text-xs" disabled={conSottofase.length === 0} onClick={() => segnaBlocco(false)}>Segna da fare</Button>
            <label className="flex items-center gap-1">dal<Input type="date" value={bloccoInizio} onChange={(e) => setBloccoInizio(e.target.value)} aria-label="Inizio per le righe scelte" className="h-6 w-[8.5rem] px-1 text-xs" /></label>
            <label className="flex items-center gap-1">al<Input type="date" value={bloccoFine} onChange={(e) => setBloccoFine(e.target.value)} aria-label="Fine per le righe scelte" className="h-6 w-[8.5rem] px-1 text-xs" /></label>
            <Button type="button" size="sm" className="h-6 text-xs" disabled={conSottofase.length === 0 || (!bloccoInizio && !bloccoFine)} onClick={applicaDate}>Applica le date</Button>
            <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 text-xs" onClick={() => setScelte(new Set())}>Annulla</Button>
          </div>
        )}

        <div ref={scrollRef} className="max-h-[75vh] overflow-y-auto rounded-lg border">
          <div className={cn("sticky top-0 z-10 hidden gap-x-2 border-b bg-muted px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:grid", COLONNE[vista])}>
            <div className="flex items-center">{puoModificare && <Checkbox checked={tutteScelte} onCheckedChange={invertiTutte} aria-label="Seleziona tutte le righe" />}</div>
            <div title="Fatta">✓</div>
            <div>Codice</div>
            <div>Descrizione</div>
            {vista === "struttura" && <><div className="text-right">Quantità</div><div>Um</div>{vedeVenduto ? <div className="text-right">{conIva ? "Con IVA" : "Imponibile"}</div> : <div />}</>}
            {vista === "pianificazione" && <><div>Dal</div><div>Al</div><div className="text-right">Giorni</div></>}
            {vista === "economia" && <>{vedeVenduto ? <div className="text-right">{conIva ? "Con IVA" : "Imponibile"}</div> : <div />}{vedeCosti ? <div className="text-right">Previsto</div> : <div />}{vedeMargini ? <div className="text-right" title="Margine previsto">Mrg %</div> : <div />}</>}
          </div>
          {righe.length === 0 ? (
            <p role="status" className="p-6 text-center text-sm text-muted-foreground">Nessuna voce con questi filtri.</p>
          ) : virtuale ? (
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((vr) => {
                const e = elementi[vr.index];
                return (
                  <div key={e.key} ref={virtualizer.measureElement} data-index={vr.index} className={e.riga ? classiRiga : undefined} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vr.start}px)` }}>
                    {e.riga ? riga(e.riga) : titoloFase(e.faseId, e.titolo)}
                  </div>
                );
              })}
            </div>
          ) : (
            elementi.map((e) => (e.riga ? <div key={e.key} className={classiRiga}>{riga(e.riga)}</div> : <div key={e.key}>{titoloFase(e.faseId, e.titolo)}</div>))
          )}
        </div>
        {vedeCosti && economia && <p className="text-[11px] text-muted-foreground">Il consuntivo si legge per fase: costi, ore e fatture non sono ancora collegati alle singole voci.</p>}
      </div>

      <AlertDialog open={!!divisione} onOpenChange={(aperto) => { if (!aperto) setDivisione(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>La fase è già al {Number(faseAperta?.percentuale) || 0}%</AlertDialogTitle>
            <AlertDialogDescription>
              Con le sottofasi l'avanzamento si calcola da quelle spuntate: la fase ripartirebbe da zero finché non segni quelle già fatte.
            </AlertDialogDescription>
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
