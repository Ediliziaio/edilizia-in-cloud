/**
 * Aggiungere voci al computo dal listino (2/11/2026), uguale nel preventivo con computo e negli
 * otto preventivatori edili: a sinistra si sfoglia per gruppi, si spuntano più voci, la quantità si
 * scrive sulla riga e in fondo si vede cosa si sta per aggiungere. Il popup resta aperto finché non
 * si conferma. Prima era una ricerca da tastiera che si chiudeva a ogni voce e mostrava 40 voci.
 */
import { useMemo, useState } from "react";
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
import { rigaVoceLibera, totaleScelte, voceGiaPresente, type RigaScelta, type VoceScelta } from "@/lib/moduli/scegliVoci";

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
  onPick: (voci: VoceScelta[]) => void;
  /** Il capitolo in cui vanno le voci. Senza: quello del listino da cui vengono. */
  targetCapitolo?: string;
  /** Le voci già nel computo, per dirlo sulla riga. */
  vociPresenti?: readonly string[];
  fonti: FontiModulo;
}

type Scheda = { tipo: "tutto" } | { tipo: "capitolo"; id: string } | { tipo: "gruppo"; id: string } | { tipo: "prodotti" };
const RIGHE_MOSTRATE = 150;
const stessaScheda = (a: Scheda, b: Scheda) => a.tipo === b.tipo && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");

/** Tutto il listino aziendale, non i primi 40: i gruppi contano le voci e si sfogliano senza scrivere. */
function useVociAzienda(attivo: boolean) {
  const companyId = useEffectiveCompanyId();
  return useQuery({
    queryKey: ["scegli-voci-azienda", companyId],
    enabled: !!companyId && attivo,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("tariffe_aziendali")
        .select("id, nome, codice, tipo, unita, unita_fatturazione, prezzo_vendita, costo_interno, prezzo_costo, costo_default, custom_field_values")
        .eq("company_id", companyId!).eq("attivo", true).order("nome").limit(3000);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as (CostiTariffa & { id: string; nome: string; codice: string | null; tipo: string; unita?: string | null; unita_fatturazione?: string | null; prezzo_vendita: number | null; custom_field_values?: unknown })[];
    },
  });
}

function Voce({ riga, scelta, presente, onCambia, onQuantita, onConferma }: {
  riga: RigaScelta; scelta?: { quantita: string }; presente: boolean;
  onCambia: () => void; onQuantita: (q: string) => void; onConferma: () => void;
}) {
  return (
    <li className={cn("flex items-center gap-3 border-b px-3 py-2 hover:bg-muted/50", scelta && "bg-orange-50/70 hover:bg-orange-50")}>
      <Checkbox checked={!!scelta} onCheckedChange={onCambia} aria-label={`Scegli: ${riga.descrizione}`} />
      <button type="button" tabIndex={-1} onClick={onCambia} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        {riga.immagine && <MiniaturaProdotto src={riga.immagine} className="h-9 w-9" />}
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-slate-800 line-clamp-2">{riga.descrizione}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
            {riga.meta && <span className="truncate">{riga.meta}</span>}
            {presente && <span className="inline-flex items-center gap-0.5 font-medium text-emerald-700"><Check className="h-3 w-3" />Già nel computo</span>}
          </span>
        </span>
      </button>
      {scelta && (
        <Input
          aria-label={`Quantità: ${riga.descrizione}`} className="h-8 w-20 text-right tabular-nums" inputMode="decimal"
          value={scelta.quantita} placeholder={riga.chiedeQuantita ? "Quanti?" : "1"} autoFocus={riga.chiedeQuantita}
          onChange={(e) => onQuantita(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onConferma(); } }}
        />
      )}
      <span className="w-24 shrink-0 text-right">
        <span className="block text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(riga.prezzo)}</span>
        <span className="block text-[10px] text-muted-foreground">{riga.unitaLabel}</span>
      </span>
    </li>
  );
}

export function ScegliVociListino({ open, onOpenChange, onPick, targetCapitolo, vociPresenti = [], fonti }: Props) {
  const isMobile = useIsMobile();
  const [termine, setTermine] = useState("");
  const [fonte, setFonte] = useState<"listino" | "prezzario">("listino");
  const [scheda, setScheda] = useState<Scheda>({ tipo: "tutto" });
  const [scelte, setScelte] = useState<Map<string, { riga: RigaScelta; quantita: string }>>(new Map());
  const cercato = useDebounce(termine, 250);

  const suListino = open && fonte === "listino";
  const capitoloId = scheda.tipo === "capitolo" ? scheda.id : null;
  const capitoli = fonti.useCapitoli();
  const lavorazioni = fonti.useVoci(suListino ? cercato : "", capitoloId, suListino && (scheda.tipo === "tutto" || scheda.tipo === "capitolo"));
  const articoli = fonti.useArticoli(suListino ? cercato : "", suListino && (scheda.tipo === "tutto" || scheda.tipo === "prodotti"));
  const prodotti = useProdottiListino(cercato, fonti.verticale, suListino && (scheda.tipo === "tutto" || scheda.tipo === "prodotti"));
  const tariffe = useVociAzienda(suListino);
  const prezzario = usePrezzarioVociGlobalSearch(open && fonte === "prezzario" ? cercato : "");
  const { mapUnita, verticale } = fonti;

  const voceTariffa = useMemo(() => (tariffe.data ?? []).map((t): RigaScelta & { gruppo: string } => {
    const unita = t.unita_fatturazione || t.unita ? unitaTariffa(t as never, "") : null;
    const costo = costoTariffa(t) ?? 0;
    const prezzo = Number(t.prezzo_vendita) || costo;
    return {
      chiave: `tariffa-${t.id}`, gruppo: gruppoLavorazione(t), descrizione: t.nome, meta: t.codice ?? undefined, prezzo, unitaLabel: unita ? `/ ${unita}` : "",
      voce: { descrizione: t.nome, unita_misura: mapUnita(unita), unita_originale: unita, prezzo_unitario: prezzo, costo_materiali: 0, costo_manodopera: costo, capitolo_nome: targetCapitolo, codice_tariffa: t.codice },
    };
  }), [tariffe.data, mapUnita, targetCapitolo]);

  const gruppiConVoci = useMemo(() => {
    const conti = new Map<string, number>();
    for (const r of voceTariffa) conti.set(r.gruppo, (conti.get(r.gruppo) ?? 0) + 1);
    return GRUPPI_LAVORAZIONE.filter((g) => conti.has(g.id)).map((g) => ({ ...g, voci: conti.get(g.id)! }));
  }, [voceTariffa]);

  const righe = useMemo((): RigaScelta[] => {
    if (fonte === "prezzario") {
      return (prezzario.data ?? []).map((v) => {
        const prezzo = Number(v.prezzo) || 0;
        const quota = v.incidenza_manodopera_pct ?? 0;
        const costoMano = Math.round(prezzo * quota * 100) / 100;
        return {
          chiave: `prezzario-${v.id}`, descrizione: v.descrizione, prezzo, unitaLabel: v.unita_misura ? `/ ${v.unita_misura}` : "",
          meta: [v.codice, v.fonteLabel, quota > 0 ? `manodopera ${Math.round(quota * 100)}%` : null].filter(Boolean).join(" · "),
          voce: { descrizione: v.descrizione, unita_misura: mapUnita(v.unita_misura), unita_originale: v.unita_misura, prezzo_unitario: prezzo, costo_materiali: Math.round((prezzo - costoMano) * 100) / 100, costo_manodopera: costoMano, capitolo_nome: targetCapitolo, fonte: v.fonteLabel, codice_tariffa: v.codice },
        };
      });
    }
    const voci: RigaScelta[] = [];
    if (scheda.tipo === "tutto" || scheda.tipo === "capitolo") {
      for (const v of lavorazioni.data ?? []) {
        voci.push({
          chiave: `lavorazione-${v.id}`, descrizione: v.descrizione, meta: [v.capitolo_nome, v.codice].filter(Boolean).join(" · "), prezzo: v.prezzo_unitario, unitaLabel: `/ ${v.unita_misura}`,
          voce: { descrizione: v.descrizione, unita_misura: v.unita_misura, unita_originale: v.unita_misura, prezzo_unitario: v.prezzo_unitario, costo_materiali: v.costo_materiali, costo_manodopera: v.costo_manodopera, capitolo_nome: v.capitolo_nome ?? targetCapitolo, listino_voce_id: v.id, codice_tariffa: v.codice, fonte: v.fonte },
        });
      }
    }
    if (scheda.tipo === "tutto" || scheda.tipo === "prodotti") {
      for (const p of prodotti.data ?? []) {
        const inRiga = prodottoInRiga(p);
        voci.push({
          chiave: `prodotto-${p.id}`, descrizione: p.nome, meta: dettaglioNelPicker(p, verticale) || undefined, immagine: p.immagine_url, prezzo: inRiga.prezzo_unitario,
          unitaLabel: p.modo === "mq" ? "/ mq" : p.unita ? `/ ${p.unita}` : "/ pz", chiedeQuantita: chiedeQuantita(p),
          voce: { descrizione: p.nome, unita_misura: mapUnita(p.unita), unita_originale: p.unita, ...inRiga, capitolo_nome: targetCapitolo, famiglia_id: p.id, immagine_url: p.immagine_url, descrizione_estesa: p.descrizione },
        });
      }
      for (const a of articoli.data ?? []) {
        voci.push({
          chiave: `articolo-${a.id}`, descrizione: a.name, meta: [a.marca, a.sku].filter(Boolean).join(" · ") || undefined, prezzo: a.prezzo_vendita || a.costo, unitaLabel: a.unita ? `/ ${a.unita}` : "",
          voce: { descrizione: a.name, unita_misura: mapUnita(a.unita), unita_originale: a.unita, prezzo_unitario: a.prezzo_vendita || a.costo, costo_materiali: a.costo, costo_manodopera: 0, capitolo_nome: targetCapitolo },
        });
      }
    }
    if (scheda.tipo !== "prodotti" && scheda.tipo !== "capitolo") {
      const cerca = cercato.trim().toLowerCase();
      for (const r of voceTariffa) {
        if (scheda.tipo === "gruppo" && r.gruppo !== scheda.id) continue;
        if (cerca && !`${r.descrizione} ${r.meta ?? ""}`.toLowerCase().includes(cerca)) continue;
        voci.push(r);
      }
    }
    return voci;
  }, [fonte, prezzario.data, scheda, lavorazioni.data, prodotti.data, articoli.data, voceTariffa, cercato, targetCapitolo, mapUnita, verticale]);

  const caricamento = fonte === "prezzario" ? prezzario.isFetching : lavorazioni.isFetching || prodotti.isFetching || articoli.isFetching || tariffe.isFetching;
  const elenco = righe.slice(0, RIGHE_MOSTRATE);
  const conto = totaleScelte([...scelte.values()]);

  const chiudi = () => {
    setTermine(""); setFonte("listino"); setScheda({ tipo: "tutto" }); setScelte(new Map());
    onOpenChange(false);
  };
  const cambia = (r: RigaScelta) => setScelte((prima) => {
    const dopo = new Map(prima);
    if (dopo.has(r.chiave)) dopo.delete(r.chiave); else dopo.set(r.chiave, { riga: r, quantita: r.chiedeQuantita ? "" : "1" });
    return dopo;
  });
  const quantita = (chiave: string, q: string) => setScelte((prima) => {
    const c = prima.get(chiave);
    if (!c) return prima;
    return new Map(prima).set(chiave, { ...c, quantita: q });
  });
  const conferma = () => {
    if (!conto.voci.length || conto.mancanti) return;
    onPick(conto.voci);
    chiudi();
  };
  const voceLibera = () => {
    onPick([...conto.voci, rigaVoceLibera(termine, targetCapitolo)]);
    chiudi();
  };

  const VoceNav = ({ s, nome, voci }: { s: Scheda; nome: string; voci?: number }) => {
    const attiva = stessaScheda(s, scheda);
    return (
      <button
        type="button" aria-pressed={attiva} onClick={() => setScheda(s)}
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors md:w-full",
          "max-md:border max-md:whitespace-nowrap",
          attiva ? "bg-orange-100 font-medium text-orange-800" : "text-slate-700 hover:bg-muted",
        )}
      >
        <span className="md:line-clamp-2">{nome}</span>
        {voci != null && <span className="tabular-nums text-[10px] text-muted-foreground">{voci}</span>}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) chiudi(); else onOpenChange(v); }}>
      <DialogContent
        className="flex h-[88dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(e) => { if (isMobile) e.preventDefault(); }}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b px-4 py-3 pr-12 text-left">
          <DialogTitle className="text-base">Aggiungi voci al computo</DialogTitle>
          <DialogDescription className="text-xs">
            {targetCapitolo ? <>Vanno nel capitolo <strong>{targetCapitolo}</strong>. </> : null}Spunta quelle che ti servono e scrivi la quantità.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-4 py-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              aria-label="Cerca una voce" className="h-9 pl-8" value={termine} onChange={(e) => setTermine(e.target.value)}
              placeholder={fonte === "listino" ? "Cerca nel tuo listino…" : "Cerca nel prezzario regionale (almeno 2 lettere)…"}
            />
          </div>
          {caricamento && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Sto cercando" />}
          <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setFonte(fonte === "listino" ? "prezzario" : "listino")}>
            <Library className="h-3.5 w-3.5" />{fonte === "listino" ? "Cerca nel prezzario regionale" : "Torna al tuo listino"}
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {fonte === "listino" && (
            <nav aria-label="Gruppi del listino" className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
              <VoceNav s={{ tipo: "tutto" }} nome="Tutte le voci" />
              {(capitoli.data ?? []).map((c) => <VoceNav key={c.id} s={{ tipo: "capitolo", id: c.id }} nome={c.nome} />)}
              {gruppiConVoci.map((g) => <VoceNav key={g.id} s={{ tipo: "gruppo", id: g.id }} nome={g.nome} voci={g.voci} />)}
              <VoceNav s={{ tipo: "prodotti" }} nome="Prodotti" />
            </nav>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {elenco.length > 0 ? (
              <ul>
                {elenco.map((r) => (
                  <Voce
                    key={r.chiave} riga={r} scelta={scelte.get(r.chiave)} presente={voceGiaPresente(r.descrizione, vociPresenti)}
                    onCambia={() => cambia(r)} onQuantita={(q) => quantita(r.chiave, q)} onConferma={conferma}
                  />
                ))}
              </ul>
            ) : !caricamento && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                {fonte === "prezzario" && cercato.trim().length < 2 ? "Scrivi almeno 2 lettere per cercare nel prezzario." : "Nessuna voce trovata. Prova un'altra parola, o aggiungi una voce libera."}
              </p>
            )}
            {righe.length > RIGHE_MOSTRATE && <p className="p-3 text-center text-xs text-muted-foreground">Vedi le prime {RIGHE_MOSTRATE} di {righe.length}: scegli un gruppo o scrivi cosa cerchi.</p>}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t bg-muted/30 px-4 py-3">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={voceLibera} disabled={conto.mancanti > 0}>
            <PlusCircle className="h-4 w-4" />{termine.trim() ? `Voce libera: «${termine.trim().slice(0, 30)}»` : "Voce libera"}
          </Button>
          <div className="ml-auto flex items-center gap-3">
            {conto.voci.length + conto.mancanti > 0 && (
              <span className="text-sm">
                <strong>{conto.voci.length + conto.mancanti} {conto.voci.length + conto.mancanti === 1 ? "voce" : "voci"}</strong> · {formatCurrency(conto.totale)}
                {conto.mancanti > 0 && <Badge variant="outline" className="ml-2 border-amber-300 text-amber-700">scrivi la quantità</Badge>}
              </span>
            )}
            <Button type="button" onClick={conferma} disabled={!conto.voci.length || conto.mancanti > 0}>Aggiungi al computo</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
