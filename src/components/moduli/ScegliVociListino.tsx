/**
 * Aggiungere voci al computo dal listino (2/11/2026), uguale nel preventivo con computo e negli
 * otto preventivatori edili: a sinistra si sfoglia per gruppi, si spuntano più voci, la quantità si
 * scrive sulla riga e in fondo si vede cosa si sta per aggiungere. Il popup resta aperto finché non
 * si conferma. Prima era una ricerca da tastiera che si chiudeva a ogni voce e mostrava 40 voci.
 */
import { Fragment, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Library, Loader2, PlusCircle, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MiniaturaProdotto } from "@/components/preventivatore/MiniaturaProdotto";
import { useDebounce } from "@/hooks/useDebounce";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProdottiListino } from "@/hooks/useProdottiListino";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { chiedeQuantita, dettaglioNelPicker, prodottoInRiga, type VerticaleModulo } from "@/lib/moduli/prodottiListino";
import { usePrezzarioVociGlobalSearch } from "@/lib/prezzario/queries";
import { GRUPPI_LAVORAZIONE, gruppoLavorazione } from "@/lib/tariffe/costoLavorazione";
import { costoTariffa, unitaTariffa, type CostiTariffa } from "@/lib/listino/costoTariffa";
import { cn } from "@/lib/utils";
import { insiemeVoci, rigaVoceLibera, totaleScelte, voceGiaPresente, type RigaScelta, type VoceScelta } from "@/lib/moduli/scegliVoci";

export type { VoceScelta } from "@/lib/moduli/scegliVoci";

/** Le voci del listino lavorazioni del modulo, nella forma comune a tutti i preventivatori. */
interface VoceDiLavorazione {
  id: string; descrizione: string; codice: string | null; unita_misura: string; prezzo_unitario: number;
  costo_materiali: number; costo_manodopera: number; capitolo_nome?: string | null; fonte?: string | null;
}
interface Risposta<T> { data?: T[]; isFetching?: boolean }

export interface FontiModulo {
  verticale: VerticaleModulo;
  useCapitoli: () => Risposta<{ id: string; nome: string }>;
  useVoci: (termine: string, capitoloId: string | null, attivo: boolean) => Risposta<VoceDiLavorazione>;
  useArticoli: (termine: string, attivo: boolean) => Risposta<{ id: string; name: string; marca?: string | null; sku?: string | null; unita?: string | null; prezzo_vendita: number; costo: number }>;
  mapUnita: (unita: string | null | undefined) => string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `false`: le voci non vanno bene, il popup resta aperto con la scelta. */
  onPick: (voci: VoceScelta[]) => void | false;
  /** Il capitolo in cui vanno le voci. Senza: quello del listino da cui vengono. */
  targetCapitolo?: string;
  /** Le voci già nel computo, per dirlo sulla riga. */
  vociPresenti?: readonly string[];
  fonti: FontiModulo;
}

type Scheda = { tipo: "tutto" } | { tipo: "scelte" } | { tipo: "capitolo"; id: string } | { tipo: "gruppo"; id: string } | { tipo: "prodotti" };
const RIGHE_MOSTRATE = 300;
const TETTO_RICERCA = 40;
const PAGINA_TARIFFE = 1000;
const MASSIMO_TARIFFE = 10_000;
const stessaScheda = (a: Scheda, b: Scheda) => a.tipo === b.tipo && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");

type RigaTariffa = CostiTariffa & { id: string; nome: string; codice: string | null; tipo: string; unita?: string | null; unita_fatturazione?: string | null; prezzo_vendita: number | null; gruppo?: string | null };

/** Tutto il listino aziendale, non i primi 40: i gruppi contano le voci e si sfogliano senza scrivere. */
function useVociAzienda(attivo: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["scegli-voci-azienda", companyId],
    enabled: !!companyId && attivo,
    staleTime: 60_000,
    queryFn: async () => {
      // A pagine: il server dà al massimo mille righe per volta. Del gruppo si prende solo il nome,
      // non i dati di costo che stanno nello stesso campo.
      const tutte: RigaTariffa[] = [];
      for (let da = 0; da < MASSIMO_TARIFFE; da += PAGINA_TARIFFE) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase as any).from("tariffe_aziendali")
          .select("id, nome, codice, tipo, unita, unita_fatturazione, prezzo_vendita, costo_interno, prezzo_costo, costo_default, gruppo:custom_field_values->>_gruppo_lavorazione")
          .eq("company_id", companyId!).eq("attivo", true).order("nome").order("id").range(da, da + PAGINA_TARIFFE - 1);
        if (error) throw new Error(error.message);
        const pagina = (data ?? []) as unknown as RigaTariffa[];
        tutte.push(...pagina);
        if (pagina.length < PAGINA_TARIFFE) break;
      }
      return tutte;
    },
  });
}

function Voce({ riga, scelta, presente, conFocus, onFocusPreso, onCambia, onQuantita, onConferma }: {
  riga: RigaScelta; scelta?: { quantita: string }; presente: boolean; conFocus: boolean; onFocusPreso: () => void;
  onCambia: () => void; onQuantita: (q: string) => void; onConferma: () => void;
}) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-3 py-2 hover:bg-muted/50", scelta && "bg-orange-50/70 hover:bg-orange-50")}>
      <Checkbox checked={!!scelta} onCheckedChange={onCambia} aria-label={`Scegli: ${riga.descrizione}`} />
      <button type="button" tabIndex={-1} onClick={onCambia} className="flex min-w-0 flex-1 basis-40 items-center gap-3 text-left">
        {riga.immagine && <MiniaturaProdotto src={riga.immagine} className="h-9 w-9" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800 line-clamp-2">{riga.descrizione}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {riga.meta && <span className="truncate">{riga.meta}</span>}
            {presente && <span className="inline-flex items-center gap-0.5 font-medium text-emerald-700"><Check className="h-3 w-3" />Già nel computo</span>}
          </span>
        </span>
      </button>
      <span className="w-24 shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(riga.prezzo)}</span>
        <span className="block text-[10px] text-muted-foreground">{riga.unitaLabel}</span>
      </span>
      {scelta && (
        <label className="flex w-full items-center justify-end gap-2 text-xs text-muted-foreground sm:w-auto">
          <span className="sm:hidden">Quantità</span>
          <Input
            aria-label={`Quantità: ${riga.descrizione}`} className="h-8 w-20 text-right tabular-nums" inputMode="decimal"
            value={scelta.quantita} placeholder={riga.chiedeQuantita ? "Quanti?" : "1"} autoFocus={conFocus} onFocus={onFocusPreso}
            onChange={(e) => onQuantita(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onConferma(); } }}
          />
        </label>
      )}
    </li>
  );
}

function VoceNav({ nome, voci, attiva, onClick, evidenza }: { nome: string; voci?: number; attiva: boolean; onClick: () => void; evidenza?: boolean }) {
  return (
    <button
      type="button" aria-pressed={attiva} onClick={onClick}
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors md:w-full",
        "max-md:border max-md:whitespace-nowrap",
        attiva ? "bg-orange-100 font-medium text-orange-800" : "text-slate-700 hover:bg-muted",
        evidenza && !attiva && "font-medium text-orange-700",
      )}
    >
      <span className="md:line-clamp-2">{nome}</span>
      {voci != null && <span className="tabular-nums text-[10px] text-muted-foreground">{voci}</span>}
    </button>
  );
}

const TitoloNav = ({ testo }: { testo: string }) => <p className="px-2.5 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground max-md:hidden">{testo}</p>;

/** Frecce su e giù fra le spunte: la tastiera continua a bastare per scegliere. */
function muoviTraSpunte(e: KeyboardEvent<HTMLElement>, contenitore: HTMLElement | null) {
  if ((e.key !== "ArrowDown" && e.key !== "ArrowUp") || !contenitore) return;
  const spunte = Array.from(contenitore.querySelectorAll<HTMLElement>('[role="checkbox"]'));
  if (!spunte.length) return;
  const qui = spunte.indexOf(document.activeElement as HTMLElement);
  const prossima = qui < 0 ? 0 : qui + (e.key === "ArrowDown" ? 1 : -1);
  if (prossima < 0 || prossima >= spunte.length) return;
  e.preventDefault();
  spunte[prossima].focus();
}

export function ScegliVociListino({ open, onOpenChange, onPick, targetCapitolo, vociPresenti = [], fonti }: Props) {
  const isMobile = useIsMobile();
  const [termine, setTermine] = useState("");
  const [fonte, setFonte] = useState<"listino" | "prezzario">("listino");
  const [scheda, setScheda] = useState<Scheda>({ tipo: "tutto" });
  const [scelte, setScelte] = useState<Map<string, { riga: RigaScelta; quantita: string }>>(new Map());
  // La riga appena spuntata che chiede la quantità: il cursore va lì una volta sola.
  const [conFocus, setConFocus] = useState<string | null>(null);
  const elencoRef = useRef<HTMLDivElement>(null);
  const cercato = useDebounce(termine, 250);
  // Chi scrive cerca in tutto il listino, da qualunque gruppo parta.
  const staCercando = cercato.trim().length > 0;
  const schedaVista: Scheda = staCercando && scheda.tipo !== "scelte" ? { tipo: "tutto" } : scheda;
  const presenti = useMemo(() => insiemeVoci(vociPresenti), [vociPresenti]);

  const suListino = open && fonte === "listino";
  const capitoloId = schedaVista.tipo === "capitolo" ? schedaVista.id : null;
  const capitoli = fonti.useCapitoli();
  const lavorazioni = fonti.useVoci(suListino ? cercato : "", capitoloId, suListino && (schedaVista.tipo === "tutto" || schedaVista.tipo === "capitolo"));
  const articoli = fonti.useArticoli(suListino ? cercato : "", suListino && (schedaVista.tipo === "tutto" || schedaVista.tipo === "prodotti"));
  const prodotti = useProdottiListino(cercato, fonti.verticale, suListino && (schedaVista.tipo === "tutto" || schedaVista.tipo === "prodotti"));
  const tariffe = useVociAzienda(suListino);
  const prezzario = usePrezzarioVociGlobalSearch(open && fonte === "prezzario" ? cercato : "");
  const { mapUnita, verticale } = fonti;

  const voceTariffa = useMemo(() => (tariffe.data ?? []).map((t): RigaScelta & { gruppo: string } => {
    const unita = t.unita_fatturazione || t.unita ? unitaTariffa(t as never, "") : null;
    const gruppo = gruppoLavorazione({ nome: t.nome, tipo: t.tipo, custom_field_values: { _gruppo_lavorazione: t.gruppo } });
    const costo = costoTariffa(t) ?? 0;
    const prezzo = Number(t.prezzo_vendita) || costo;
    return {
      chiave: `tariffa-${t.id}`, gruppo, descrizione: t.nome, meta: t.codice ?? undefined, prezzo, unitaLabel: unita ? `/ ${unita}` : "",
      voce: { descrizione: t.nome, unita_misura: mapUnita(unita), unita_originale: unita, prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: costo, capitolo_nome: targetCapitolo, sourceUnit: unita },
    };
  }), [tariffe.data, mapUnita, targetCapitolo]);

  const gruppiConVoci = useMemo(() => {
    const conti = new Map<string, number>();
    for (const r of voceTariffa) conti.set(r.gruppo, (conti.get(r.gruppo) ?? 0) + 1);
    return GRUPPI_LAVORAZIONE.filter((g) => conti.has(g.id)).map((g) => ({ ...g, voci: conti.get(g.id)! }));
  }, [voceTariffa]);

  const schedaId = "id" in schedaVista ? schedaVista.id : null;
  const righe = useMemo((): RigaScelta[] => {
    if (schedaVista.tipo === "scelte") return [...scelte.values()].map((c) => c.riga);
    if (fonte === "prezzario") {
      return (prezzario.data ?? []).map((v) => {
        const prezzo = Number(v.prezzo) || 0;
        const quota = v.incidenza_manodopera_pct ?? 0;
        const costoMano = Math.round(prezzo * quota * 100) / 100;
        return {
          chiave: `prezzario-${v.id}`, descrizione: v.descrizione, prezzo, unitaLabel: v.unita_misura ? `/ ${v.unita_misura}` : "",
          meta: [v.codice, v.fonteLabel, quota > 0 ? `manodopera ${Math.round(quota * 100)}%` : null].filter(Boolean).join(" · "),
          voce: { descrizione: v.descrizione, unita_misura: mapUnita(v.unita_misura), unita_originale: v.unita_misura, prezzo_unitario: prezzo, costo_materiali: Math.round((prezzo - costoMano) * 100) / 100, costo_manodopera: costoMano, capitolo_nome: targetCapitolo, fonte: v.fonteLabel, codice_tariffa: v.codice, sourceUnit: v.unita_misura },
        };
      });
    }
    const voci: RigaScelta[] = [];
    if (schedaVista.tipo === "tutto" || schedaVista.tipo === "capitolo") {
      for (const v of lavorazioni.data ?? []) {
        voci.push({
          chiave: `lavorazione-${v.id}`, sezione: v.capitolo_nome?.trim() || "Lavorazioni", descrizione: v.descrizione, meta: v.codice ?? undefined, prezzo: v.prezzo_unitario, unitaLabel: `/ ${v.unita_misura}`,
          voce: { descrizione: v.descrizione, unita_misura: v.unita_misura, unita_originale: v.unita_misura, prezzo_unitario: v.prezzo_unitario, costo_materiali: v.costo_materiali, costo_manodopera: v.costo_manodopera, capitolo_nome: v.capitolo_nome ?? targetCapitolo, listino_voce_id: v.id, codice_tariffa: v.codice, fonte: v.fonte, sourceUnit: v.unita_misura },
        });
      }
    }
    if (schedaVista.tipo === "tutto" || schedaVista.tipo === "prodotti") {
      for (const p of prodotti.data ?? []) {
        const inRiga = prodottoInRiga(p);
        voci.push({
          chiave: `prodotto-${p.id}`, sezione: "Prodotti", descrizione: p.nome, meta: dettaglioNelPicker(p, verticale) || undefined, immagine: p.immagine_url, prezzo: inRiga.prezzo_unitario,
          unitaLabel: p.modo === "mq" ? "/ mq" : p.unita ? `/ ${p.unita}` : "/ pz", chiedeQuantita: chiedeQuantita(p),
          voce: { descrizione: p.nome, unita_misura: mapUnita(p.unita), unita_originale: p.unita, ...inRiga, capitolo_nome: targetCapitolo, famiglia_id: p.id, immagine_url: p.immagine_url, descrizione_estesa: p.descrizione, sourceUnit: p.modo === "mq" ? "mq" : p.unita },
        });
      }
      for (const a of articoli.data ?? []) {
        voci.push({
          chiave: `articolo-${a.id}`, sezione: "Prodotti", descrizione: a.name, meta: [a.marca, a.sku].filter(Boolean).join(" · ") || undefined, prezzo: a.prezzo_vendita || a.costo, unitaLabel: a.unita ? `/ ${a.unita}` : "",
          voce: { descrizione: a.name, unita_misura: mapUnita(a.unita), unita_originale: a.unita, prezzo_unitario: a.prezzo_vendita || a.costo, costo_materiali: a.costo, costo_manodopera: 0, capitolo_nome: targetCapitolo, sourceUnit: a.unita },
        });
      }
    }
    if (schedaVista.tipo !== "prodotti" && schedaVista.tipo !== "capitolo") {
      const cerca = cercato.trim().toLowerCase();
      for (const r of voceTariffa) {
        if (schedaVista.tipo === "gruppo" && r.gruppo !== schedaId) continue;
        if (cerca && !`${r.descrizione} ${r.meta ?? ""}`.toLowerCase().includes(cerca)) continue;
        voci.push({ ...r, sezione: GRUPPI_LAVORAZIONE.find((g) => g.id === r.gruppo)?.nome });
      }
    }
    return voci;
  }, [fonte, prezzario.data, schedaVista.tipo, schedaId, scelte, lavorazioni.data, prodotti.data, articoli.data, voceTariffa, cercato, targetCapitolo, mapUnita, verticale]);

  const caricamento = fonte === "prezzario" ? prezzario.isFetching : lavorazioni.isFetching || prodotti.isFetching || articoli.isFetching || tariffe.isFetching;
  const elenco = righe.slice(0, RIGHE_MOSTRATE);
  const conto = totaleScelte([...scelte.values()]);
  const nScelte = scelte.size;
  // Le fonti danno al massimo 40 voci: se si tocca il tetto, sfogliando non si vedrebbe tutto.
  const elencoParziale = fonte === "listino" && schedaVista.tipo !== "scelte" && schedaVista.tipo !== "gruppo" && schedaVista.tipo !== "capitolo"
    && ((schedaVista.tipo === "tutto" && (lavorazioni.data?.length ?? 0) >= TETTO_RICERCA) || (prodotti.data?.length ?? 0) >= TETTO_RICERCA || (articoli.data?.length ?? 0) >= TETTO_RICERCA);

  const chiudi = () => {
    setTermine(""); setFonte("listino"); setScheda({ tipo: "tutto" }); setScelte(new Map()); setConFocus(null);
    onOpenChange(false);
  };
  const cambia = (r: RigaScelta) => {
    const nuova = !scelte.has(r.chiave);
    setConFocus(nuova && r.chiedeQuantita ? r.chiave : null);
    setScelte((prima) => {
      const dopo = new Map(prima);
      if (dopo.has(r.chiave)) dopo.delete(r.chiave); else dopo.set(r.chiave, { riga: r, quantita: r.chiedeQuantita ? "" : "1" });
      return dopo;
    });
  };
  const quantita = (chiave: string, q: string) => setScelte((prima) => {
    const c = prima.get(chiave);
    if (!c) return prima;
    return new Map(prima).set(chiave, { ...c, quantita: q });
  });
  const conferma = () => {
    if (!conto.voci.length || conto.mancanti) return;
    if (onPick(conto.voci) !== false) chiudi();
  };
  const voceLibera = () => {
    if (onPick([...conto.voci, rigaVoceLibera(termine, targetCapitolo)]) !== false) chiudi();
  };

  const nav = (s: Scheda, nome: string, voci?: number) => (
    <VoceNav key={`${s.tipo}-${"id" in s ? s.id : ""}`} nome={nome} voci={voci} attiva={stessaScheda(s, schedaVista)} onClick={() => { setTermine(""); setScheda(s); }} />
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) chiudi(); else onOpenChange(v); }}>
      <DialogContent
        className="flex h-[88dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => { if (isMobile) e.preventDefault(); }}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base">Aggiungi voci al computo</DialogTitle>
          <DialogDescription className="text-xs max-sm:hidden">
            {targetCapitolo ? <>Vanno nel capitolo <strong>{targetCapitolo}</strong>. </> : null}Spunta quelle che ti servono e scrivi la quantità.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cerca una voce" className="h-9 pl-8" value={termine} onChange={(e) => setTermine(e.target.value)}
              onKeyDown={(e) => muoviTraSpunte(e, elencoRef.current)}
              placeholder={fonte === "listino" ? "Cerca nel tuo listino…" : "Cerca nel prezzario regionale (almeno 2 lettere)…"}
            />
          </div>
          {caricamento && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Sto cercando" />}
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setFonte(fonte === "listino" ? "prezzario" : "listino")}>
            <Library className="h-3.5 w-3.5" /><span className="max-sm:hidden">{fonte === "listino" ? "Cerca nel prezzario regionale" : "Torna al tuo listino"}</span><span className="sm:hidden">{fonte === "listino" ? "Prezzario" : "Listino"}</span>
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {fonte === "listino" && (
            <nav aria-label="Gruppi del listino" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
              {nav({ tipo: "tutto" }, "Tutte le voci")}
              {nScelte > 0 && <VoceNav nome="Le tue scelte" voci={nScelte} evidenza attiva={schedaVista.tipo === "scelte"} onClick={() => setScheda({ tipo: "scelte" })} />}
              {!!capitoli.data?.length && <TitoloNav testo="Capitoli" />}
              {(capitoli.data ?? []).map((c) => nav({ tipo: "capitolo", id: c.id }, c.nome))}
              {!!gruppiConVoci.length && <TitoloNav testo="Listino azienda" />}
              {gruppiConVoci.map((g) => nav({ tipo: "gruppo", id: g.id }, g.nome, g.voci))}
              {nav({ tipo: "prodotti" }, "Prodotti")}
            </nav>
          )}
          <div ref={elencoRef} className="min-h-0 flex-1 overflow-y-auto" onKeyDown={(e) => { if (!(e.target instanceof HTMLInputElement)) muoviTraSpunte(e, elencoRef.current); }}>
            {!open ? null : elenco.length > 0 ? (
              <ul>
                {elenco.map((r, i) => (
                  <Fragment key={r.chiave}>
                    {r.sezione && r.sezione !== elenco[i - 1]?.sezione && (
                      <li className="sticky top-0 z-10 border-b bg-muted px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{r.sezione}</li>
                    )}
                    <Voce
                      riga={r} scelta={scelte.get(r.chiave)} presente={voceGiaPresente(r.descrizione, presenti)}
                      conFocus={conFocus === r.chiave} onFocusPreso={() => setConFocus(null)}
                      onCambia={() => cambia(r)} onQuantita={(q) => quantita(r.chiave, q)} onConferma={conferma}
                    />
                  </Fragment>
                ))}
              </ul>
            ) : !caricamento && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {schedaVista.tipo === "scelte" ? "Non hai ancora scelto nessuna voce." : fonte === "prezzario" && cercato.trim().length < 2 ? "Scrivi almeno 2 lettere per cercare nel prezzario." : "Nessuna voce trovata. Prova un'altra parola, o aggiungi una voce libera."}
              </p>
            )}
            {(righe.length > RIGHE_MOSTRATE || elencoParziale) && <p className="p-3 text-center text-xs text-muted-foreground">Qui vedi solo una parte delle voci: scegli un gruppo o scrivi cosa cerchi.</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t bg-muted/30 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={voceLibera} disabled={conto.mancanti > 0}>
            <PlusCircle className="h-4 w-4" />{termine.trim() ? `Voce libera: «${termine.trim().slice(0, 30)}»` : "Voce libera"}
          </Button>
          <div className="ml-auto flex items-center gap-3">
            {nScelte > 0 && (
              <button type="button" className="text-left text-sm hover:underline" title="Vedi le voci che hai scelto" onClick={() => { setFonte("listino"); setTermine(""); setScheda({ tipo: "scelte" }); }}>
                <strong>{nScelte} {nScelte === 1 ? "voce" : "voci"}</strong> · {formatCurrency(conto.totale)}
                {conto.mancanti > 0 && <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700">scrivi la quantità</Badge>}
              </button>
            )}
            <Button type="button" onClick={conferma} disabled={!conto.voci.length || conto.mancanti > 0}>Aggiungi al computo</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
