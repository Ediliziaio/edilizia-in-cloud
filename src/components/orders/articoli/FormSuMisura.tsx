/**
 * Inserire un bene su misura: prodotto e scelte comuni in alto, poi una riga per
 * posizione (Rif., L, H, Pz, costo). Il costo viene dallo stesso motore del
 * preventivo; «Non ho il listino» lo lascia «da definire». Ogni posizione diventa
 * una riga della commessa con lo stesso gruppo, così offerte, ordini e arrivi la
 * seguono una per una.
 */
import { IVA_PREDEFINITA_PCT } from "@/lib/preventivi/ivaPredefinita";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SceltaColoriDentroFuori } from "@/components/serramenti/SceltaColoriDentroFuori";
import { useColoriFamiglia } from "@/hooks/useColoriFamiglia";
import { calcolaPrezzoFamiglia, useFamilyGrid } from "@/hooks/useFamilyPricing";
import { formatCurrency } from "@/lib/formatters";
import { conAssiVisibili, defaultSelections, normalizzaSelezione } from "@/lib/serramenti/assiCondizionati";
import { cn } from "@/lib/utils";
import {
  costoDiListino, costoScritto, erroreDiPosizione, misureDaBozza, numeroDaCampo, posizioniDaSalvare, specifichePosizione,
  type EsitoCosto, type PosizioneBozza, type StatoMisure,
} from "@/lib/orders/gruppiSuMisura";
import { riferimentoSuccessivo } from "@/lib/preventivo/posizioni";
import type { AxisValue, FamilyAxis, FamilyWithAxes, AxisSelection } from "@/types/articleFamily";
import type { OrderItem } from "../OrderItemsList";

export interface ProdottoSuMisura {
  nome: string;
  familyId?: string | null;
  categoria?: string | null;
  codice?: string | null;
  supplierId?: string | null;
  iva?: number | null;
}

export interface EsitoSuMisura {
  nuove: OrderItem[];
  /** La riga com'era e com'è: nei moduli le righe non salvate non hanno ancora un id. */
  aggiornate: { prima: OrderItem; dopo: OrderItem }[];
  tolte: OrderItem[];
}

interface Props {
  prodotto: ProdottoSuMisura;
  canViewCosts: boolean;
  /** La fase in cui nasce (vista per fase della commessa). */
  phaseId?: string | null;
  /** Modifica di un gruppo già nella commessa. */
  righeEsistenti?: OrderItem[];
  /** Le righe salvate non si tolgono da qui nel dettaglio commessa. */
  puoTogliereSalvate?: boolean;
  /** Parte con una posizione in più, copia di questa riga («Duplica»). */
  copiaDi?: OrderItem | null;
  gruppoId: string;
  extra?: ReactNode;
  onAnnulla: () => void;
  onConferma: (esito: EsitoSuMisura) => void;
}

let contatore = 0;
const nuovaChiave = () => `pos-${++contatore}`;
const posizioneVuota = (riferimento: string): PosizioneBozza => ({ chiave: nuovaChiave(), riferimento, larghezza: "", altezza: "", pezzi: "1", costo: "" });

const COSTI_DA_TENERE = new Set(["manuale", "ordine", "offerta"]);

function daRiga(r: OrderItem, indice: number): PosizioneBozza {
  return {
    chiave: nuovaChiave(),
    id: `riga-${indice}`,
    riferimento: r.riferimento ?? "",
    larghezza: r.misure_preventivo?.larghezza_mm ? String(r.misure_preventivo.larghezza_mm) : "",
    altezza: r.misure_preventivo?.altezza_mm ? String(r.misure_preventivo.altezza_mm) : "",
    pezzi: String(r.quantity),
    costo: r.purchase_price && (COSTI_DA_TENERE.has(r.prezzo_fonte ?? "") || !r.family_id) ? String(r.purchase_price) : "",
    bloccata: !!r.status && r.status !== "da_ordinare",
  };
}

export function FormSuMisura(props: Props) {
  const familyId = props.prodotto.familyId ?? null;
  const { data: family, isLoading, isError, refetch } = useQuery({
    queryKey: ["su-misura-prodotto", familyId],
    enabled: !!familyId,
    staleTime: 60_000,
    queryFn: async (): Promise<FamilyWithAxes | null> => {
      const { data, error } = await supabase
        .from("article_families" as never)
        .select("*, axes:article_family_axes(*, values:article_family_axis_values(*))")
        .eq("id" as never, familyId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as FamilyWithAxes;
      return {
        ...row,
        axes: [...(row.axes ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((ax) => ({
          ...ax, values: [...(ax.values ?? [])].sort((a, b) => a.sort_order - b.sort_order),
        })),
      };
    },
  });

  if (familyId && isLoading) {
    return <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Carico il prodotto…</p>;
  }
  if (familyId && isError) {
    return <p role="alert" className="py-6 text-sm text-amber-800">Non riesco a leggere il prodotto dal listino. <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button></p>;
  }
  return family ? <ConListino {...props} family={family} /> : <Tabella {...props} family={null} selezioni={null} scelte={[]} calcola={null} />;
}

function ConListino({ family: completa, ...props }: Props & { family: FamilyWithAxes }) {
  const salvate = props.righeEsistenti?.[0]?.axis_selections ?? null;
  const [selection, setSelection] = useState<AxisSelection>(() =>
    normalizzaSelezione(completa.axes, salvate ?? defaultSelections(completa)).valori,
  );
  const { data: griglia = [] } = useFamilyGrid(completa.id);
  const base = useMemo(() => conAssiVisibili(completa, selection), [completa, selection]);
  const colori = useColoriFamiglia(base, selection, (id) => {
    const p = calcolaPrezzoFamiglia({ family: base, selections: { ...selection, colore: id }, larghezza_mm: 1200, altezza_mm: 1400, quantita: 1 }, griglia);
    return p.calcolo_disponibile !== false ? p.unit_price_acquisto : null;
  });
  const effettiva = colori.selezione;
  const family = conAssiVisibili(completa, effettiva);

  const calcola = (l: number | null, h: number | null) => costoDiListino(family, effettiva, griglia, l, h);

  const scelte = family.axes.flatMap((a: FamilyAxis & { values: AxisValue[] }) => {
    if (a.codice === "colore" && colori.testi) {
      const { interno, esterno } = colori.testi;
      return [interno === esterno || !esterno ? `Colore ${interno}` : `Colore int. ${interno}, est. ${esterno}`];
    }
    const v = a.values.find((x) => x.id === effettiva[a.codice]);
    return v ? [`${a.nome} ${v.label}`] : [];
  });

  const assi = family.axes.length > 0 && (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
      {family.axes.map((axis: FamilyAxis & { values: AxisValue[] }) => {
        if (axis.codice === "colore" && colori.asse && colori.colori) {
          return (
            <div key={axis.id} className="col-span-2 lg:col-span-3">
              <SceltaColoriDentroFuori asse={colori.asse} colori={colori.colori} catalogo={colori.catalogo} guidaId={colori.guida?.valueId} piuCaraId={colori.guida?.valueId} formato="listino" onChange={colori.cambia} onScrivi={colori.scrivi} onElenco={colori.elenco} />
            </div>
          );
        }
        const valori = axis.values.filter((v) => v.attivo);
        return (
          <div key={axis.id} className="min-w-0 space-y-1">
            <Label htmlFor={`asse-${axis.id}`} className="text-xs">{axis.nome}</Label>
            <Select value={selection[axis.codice] ?? ""} onValueChange={(v) => setSelection((p) => normalizzaSelezione(completa.axes, { ...p, [axis.codice]: v }).valori)}>
              <SelectTrigger id={`asse-${axis.id}`} className="h-9"><SelectValue placeholder="Scegli…" /></SelectTrigger>
              <SelectContent>{valori.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );

  return <Tabella {...props} family={completa} selezioni={effettiva} scelte={scelte} calcola={calcola} assi={assi} />;
}

function Tabella({
  prodotto, canViewCosts, phaseId, righeEsistenti, puoTogliereSalvate, copiaDi, gruppoId, extra, onAnnulla, onConferma,
  family, selezioni, scelte, calcola, assi,
}: Props & {
  family: FamilyWithAxes | null;
  selezioni: AxisSelection | null;
  scelte: string[];
  calcola: ((l: number | null, h: number | null) => EsitoCosto) | null;
  assi?: ReactNode;
}) {
  const inModifica = !!righeEsistenti?.length;
  const [posizioni, setPosizioni] = useState<PosizioneBozza[]>(() => {
    if (!righeEsistenti?.length) return [posizioneVuota("P1")];
    const esistenti = righeEsistenti.map(daRiga);
    // `copiaDi` è una riga del gruppo: la copia riparte da lì, ma è una posizione nuova.
    if (!copiaDi) return esistenti;
    const copia = { ...daRiga(copiaDi, 0), chiave: nuovaChiave(), id: undefined as string | undefined, bloccata: false, riferimento: riferimentoSuccessivo(esistenti.map((e) => e.riferimento)) };
    return [...esistenti, copia];
  });
  const [senzaListino, setSenzaListino] = useState(!calcola);
  const [statoMisure, setStatoMisure] = useState<StatoMisure>((righeEsistenti?.[0]?.measure_status as StatoMisure | null | undefined) ?? "da_rilevare");
  const [errore, setErrore] = useState<string | null>(null);
  const [fuoco, setFuoco] = useState<string | null>(null);
  const contenitore = useRef<HTMLDivElement>(null);
  const inviato = useRef(false);

  useEffect(() => {
    if (!fuoco) return;
    contenitore.current?.querySelector<HTMLInputElement>(`[data-campo="${fuoco}"]`)?.focus();
    setFuoco(null);
  }, [fuoco, posizioni.length]);

  const cambia = (chiave: string, campi: Partial<PosizioneBozza>) =>
    setPosizioni((prima) => prima.map((p) => (p.chiave === chiave ? { ...p, ...campi } : p)));

  const aggiungiPosizione = () => {
    const nuova = posizioneVuota(riferimentoSuccessivo(posizioni.map((p) => p.riferimento)));
    setPosizioni((prima) => [...prima, nuova]);
    setFuoco(`l-${nuova.chiave}`);
  };

  // Invio passa alla posizione dopo; sull'ultima ne apre una nuova.
  const invio = (e: KeyboardEvent<HTMLInputElement>, indice: number) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const prossima = posizioni[indice + 1];
    if (prossima) setFuoco(`l-${prossima.chiave}`);
    else aggiungiPosizione();
  };

  const esitoDi = (p: PosizioneBozza): EsitoCosto => {
    if (!calcola || senzaListino) return { costo: null, fuoriListino: false, avviso: null };
    return calcola(numeroDaCampo(p.larghezza), numeroDaCampo(p.altezza));
  };

  const valide = posizioniDaSalvare(posizioni, statoMisure);
  const totali = valide.reduce((t, p) => {
    const pezzi = numeroDaCampo(p.pezzi) ?? 0;
    const costo = costoScritto(p.costo) ?? esitoDi(p).costo;
    return { pezzi: t.pezzi + pezzi, costo: t.costo + (costo ?? 0) * pezzi, mancanti: t.mancanti + (costo == null ? 1 : 0) };
  }, { pezzi: 0, costo: 0, mancanti: 0 });

  const conferma = () => {
    if (inviato.current) return;
    setErrore(null);
    if (valide.length === 0) { setErrore("Scrivi almeno una posizione: bastano il riferimento o le misure."); return; }
    for (const p of valide) {
      const e = erroreDiPosizione(p);
      if (e) { setErrore(e); return; }
    }
    const nuove: OrderItem[] = [];
    const aggiornate: EsitoSuMisura["aggiornate"] = [];
    valide.forEach((p, i) => {
      if (p.bloccata) return;
      const l = numeroDaCampo(p.larghezza);
      const h = numeroDaCampo(p.altezza);
      const esito = esitoDi(p);
      const scritto = costoScritto(p.costo);
      const esistente = p.id ? righeEsistenti?.[Number(p.id.slice(5))] : undefined;
      const prezzo = scritto ?? esito.costo ?? 0;
      const campi: Partial<OrderItem> = {
        name: prodotto.nome,
        quantity: numeroDaCampo(p.pezzi)!,
        riferimento: p.riferimento.trim() || null,
        gruppo_id: gruppoId,
        family_id: family?.id ?? null,
        axis_selections: selezioni,
        misure_preventivo: misureDaBozza(l, h),
        // Senza misure non si può dire confermata.
        measure_status: l == null || h == null ? "da_rilevare" : statoMisure,
        specifiche: specifichePosizione(scelte) || null,
        purchase_price: prezzo,
        standard_cost: esito.costo ?? 0,
        prezzo_fonte: scritto != null ? "manuale" : esito.costo != null ? "listino" : null,
        unita_misura: "pz",
      };
      if (esistente) {
        const uguale = esistente.quantity === campi.quantity
          && (esistente.riferimento ?? null) === campi.riferimento
          && (esistente.misure_preventivo?.larghezza_mm ?? null) === l && (esistente.misure_preventivo?.altezza_mm ?? null) === h
          && esistente.measure_status === campi.measure_status
          && JSON.stringify(esistente.axis_selections ?? null) === JSON.stringify(selezioni)
          && (scritto == null ? !COSTI_DA_TENERE.has(esistente.prezzo_fonte ?? "") : (esistente.purchase_price ?? 0) === scritto);
        if (!uguale) aggiornate.push({ prima: esistente, dopo: { ...esistente, ...campi } });
        return;
      }
      nuove.push({
        ...(campi as OrderItem),
        status: "da_ordinare",
        position: i,
        vat_rate: family?.vat_rate ?? prodotto.iva ?? IVA_PREDEFINITA_PCT,
        supplier_id: family?.supplier_id ?? prodotto.supplierId ?? undefined,
        categoria: prodotto.categoria ?? null,
        product_code: prodotto.codice ?? null,
        unit_price: 0,
        discount_percent: 0,
        ...(phaseId !== undefined ? { phase_id: phaseId } : {}),
      });
    });
    const tenute = new Set(posizioni.map((p) => p.id).filter(Boolean));
    const tolte = (righeEsistenti ?? []).filter((_, i) => !tenute.has(`riga-${i}`));
    if (inModifica && nuove.length === 0 && aggiornate.length === 0 && tolte.length === 0) { onAnnulla(); return; }
    inviato.current = true;
    onConferma({ nuove, aggiornate, tolte });
  };

  const colonne = canViewCosts
    ? "sm:grid-cols-[minmax(0,1.3fr)_5rem_5rem_3.5rem_7.5rem_2rem]"
    : "sm:grid-cols-[minmax(0,1.3fr)_5rem_5rem_3.5rem_2rem]";

  return (
    <div className="space-y-3" ref={contenitore}>
      {assi}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {calcola && canViewCosts && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={senzaListino} onCheckedChange={setSenzaListino} aria-label="Non ho il listino" />
            Non ho il listino
          </label>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor="stato-misure" className="font-normal">Misure</Label>
          <Select value={statoMisure} onValueChange={(v) => setStatoMisure(v as StatoMisure)}>
            <SelectTrigger id="stato-misure" className="h-8 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="da_rilevare">Da rilevare</SelectItem>
              <SelectItem value="confermato">Definitive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <div className={cn("hidden gap-2 px-0.5 text-xs text-muted-foreground sm:grid", colonne)}>
          <span>Rif.</span><span>L mm</span><span>H mm</span><span>Pz</span>
          {canViewCosts && <span className="text-right">Costo cad.</span>}
          <span />
        </div>
        {posizioni.map((p, i) => {
          const esito = esitoDi(p);
          const eliminabile = (p.id ? !!puoTogliereSalvate : posizioni.length > 1) && !p.bloccata;
          return (
            <div key={p.chiave}>
              <div className={cn("grid grid-cols-[1fr_1fr_3.25rem_2rem] items-center gap-2", colonne)}>
                <Input aria-label={`Riferimento posizione ${i + 1}`} data-campo={`rif-${p.chiave}`} value={p.riferimento} disabled={p.bloccata}
                  onChange={(e) => cambia(p.chiave, { riferimento: e.target.value })} onKeyDown={(e) => invio(e, i)}
                  placeholder="Cucina" className={cn("h-9", canViewCosts ? "sm:col-span-1" : "col-span-4 sm:col-span-1")} />
                <Input aria-label={`Larghezza in mm, posizione ${i + 1}`} data-campo={`l-${p.chiave}`} inputMode="numeric" value={p.larghezza} disabled={p.bloccata}
                  onChange={(e) => cambia(p.chiave, { larghezza: e.target.value })} onKeyDown={(e) => invio(e, i)} placeholder="L" className="order-2 h-9 sm:order-none" />
                <Input aria-label={`Altezza in mm, posizione ${i + 1}`} inputMode="numeric" value={p.altezza} disabled={p.bloccata}
                  onChange={(e) => cambia(p.chiave, { altezza: e.target.value })} onKeyDown={(e) => invio(e, i)} placeholder="H" className="order-3 h-9 sm:order-none" />
                <Input aria-label={`Pezzi, posizione ${i + 1}`} inputMode="numeric" value={p.pezzi} disabled={p.bloccata}
                  onChange={(e) => cambia(p.chiave, { pezzi: e.target.value })} onKeyDown={(e) => invio(e, i)} className="order-4 h-9 sm:order-none" />
                {canViewCosts && (
                  <Input aria-label={`Costo, posizione ${i + 1}`} inputMode="decimal" value={p.costo} disabled={p.bloccata}
                    onChange={(e) => cambia(p.chiave, { costo: e.target.value })} onKeyDown={(e) => invio(e, i)}
                    placeholder={esito.costo != null ? formatCurrency(esito.costo) : "da definire"}
                    className="order-1 col-span-3 h-9 text-right sm:order-none sm:col-span-1" />
                )}
                <Button type="button" variant="ghost" size="icon" className="order-5 h-9 w-8 sm:order-none" disabled={!eliminabile}
                  aria-label={`Togli la posizione ${p.riferimento || i + 1}`}
                  onClick={() => setPosizioni((prima) => prima.filter((x) => x.chiave !== p.chiave))}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </Button>
              </div>
              {(esito.avviso || p.bloccata) && (
                <p className={cn("mt-0.5 text-[11px]", esito.fuoriListino ? "text-red-700" : "text-muted-foreground")}>
                  {p.bloccata ? "Già avviata: non si cambia da qui." : esito.avviso}
                </p>
              )}
            </div>
          );
        })}
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={aggiungiPosizione}>
          <Plus className="h-3.5 w-3.5" aria-hidden />Posizione
        </Button>
      </div>

      {extra}
      {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">{valide.length} {valide.length === 1 ? "posizione" : "posizioni"} · {totali.pezzi} pz</span>
          {canViewCosts && totali.costo > 0 && <> · {formatCurrency(totali.costo)}</>}
          {canViewCosts && totali.mancanti > 0 && <> · {totali.mancanti} da definire</>}
        </p>
        <div className="flex gap-2 max-sm:w-full">
          <Button type="button" variant="outline" onClick={onAnnulla} className="max-sm:flex-1">Annulla</Button>
          <Button type="button" onClick={conferma} className="max-sm:flex-1">{inModifica ? "Salva" : "Aggiungi"}</Button>
        </div>
      </div>
    </div>
  );
}
