/**
 * Commessa → Fatture dei fornitori → «Collega fattura».
 *
 * La fattura del fornitore quasi sempre è già fra le ricevute (SDI, import): qui si sceglie da lì invece di
 * ricaricarla. In testa le probabili per questa commessa, col motivo (bolla della commessa, suggerita dall'AI,
 * fornitore della commessa), poi le altre ancora da assegnare. Le dà `fatture_candidate_commessa`.
 * Scelta la fattura si apre il popup di sempre (CollegaFatturaCommesseDialog) con la commessa già messa:
 * tutta, una quota o solo alcune righe. Se la fattura non c'è, resta il caricamento del file.
 * Piano: docs/piano-collega-fatture-ricevute-da-commessa-20261124.md (lotti 1-2).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, Link2, Loader2, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogContentOperativo as DialogContent } from "@/components/orders/generali/design/ContestoOperativo";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { eNotaDiCredito } from "@/lib/fatturazione/noteDiCredito";
import { CollegaFatturaCommesseDialog, type FatturaDaCollegare } from "@/components/fatturazione/CollegaFatturaCommesseDialog";
import { CaricaFatturaCommessaButton } from "./CaricaFatturaCommessa";
import { RiepilogoFatturaRicevuta } from "@/components/fatturazione/RiepilogoFatturaRicevuta";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface FatturaCandidata {
  id: string; numero_fattura: string | null; data_fattura: string | null; fornitore: string | null;
  imponibile: number | null; totale: number | null; tipo_documento: string | null;
  assegnata_pct: number | null; commesse_collegate: string[] | null;
  punteggio: number | null; motivi: string[] | null; company_cost_id: string | null;
  /** Bolle collegate (con la loro commessa) e ordini citati nell'XML, anche di altre commesse. */
  riferimenti: string[] | null;
}

/** Probabile = almeno un motivo (bolla, AI, fornitore). */
export const eProbabile = (f: Pick<FatturaCandidata, "punteggio">) => Number(f.punteggio ?? 0) > 0;

const dataBreve = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("it-IT") : "—");

export function CollegaFatturaRicevutaDialog({ open, onOpenChange, orderId, companyId, mostraImporti = true }: {
  open: boolean; onOpenChange: (v: boolean) => void; orderId: string; companyId: string; mostraImporti?: boolean;
}) {
  const queryClient = useQueryClient();
  const [testo, setTesto] = useState("");
  const [cerca, setCerca] = useState("");
  const [ancheAssegnate, setAncheAssegnate] = useState(false);
  const [scelta, setScelta] = useState<FatturaDaCollegare | null>(null);
  const [anteprima, setAnteprima] = useState<FatturaCandidata | null>(null);

  useEffect(() => { const t = setTimeout(() => setCerca(testo.trim()), 300); return () => clearTimeout(t); }, [testo]);

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ["fatture-candidate-commessa", companyId, orderId, cerca, ancheAssegnate],
    enabled: open && !!orderId,
    staleTime: 15_000,
    queryFn: async (): Promise<FatturaCandidata[]> => {
      const { data: righe, error } = await db.rpc("fatture_candidate_commessa", {
        p_order: orderId, p_cerca: cerca || null, p_limit: 80, p_anche_assegnate: ancheAssegnate,
      });
      if (error) throw error;
      return (righe ?? []) as FatturaCandidata[];
    },
  });

  const probabili = data.filter(eProbabile);
  const altre = data.filter((f) => !eProbabile(f));

  const scegli = (f: FatturaCandidata) => setScelta({
    id: f.id, numero: f.numero_fattura, fornitore: f.fornitore,
    imponibile: f.imponibile, totale: f.totale, companyCostId: f.company_cost_id,
  });

  const riga = (f: FatturaCandidata) => {
    const nc = eNotaDiCredito(f.tipo_documento);
    const pct = Number(f.assegnata_pct ?? 0);
    return (
      <li key={f.id} className="flex items-center gap-3 border-b px-2 py-2 last:border-b-0 hover:bg-muted/40">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="truncate font-medium">{f.fornitore ?? "Fornitore sconosciuto"}</span>
            <span className="text-muted-foreground">{nc ? "Nota di credito" : "Fattura"} n. {f.numero_fattura ?? "—"} del {dataBreve(f.data_fattura)}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {(f.motivi ?? []).map((m) => (
              <span key={m} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{m}</span>
            ))}
            {(f.riferimenti ?? []).map((r) => (
              <span key={r} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground" title={r.includes("→") ? "Bolla collegata e commessa della bolla" : undefined}>
                {r.startsWith("DDT") ? <Truck className="h-3 w-3" aria-hidden="true" /> : <FileText className="h-3 w-3" aria-hidden="true" />}{r}
              </span>
            ))}
            {pct > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">
                {pct >= 99.5 ? "Già tutta assegnata" : `Assegnata al ${Math.round(pct)}%`}
                {f.commesse_collegate?.length ? ` · ${f.commesse_collegate.join(", ")}` : ""}
              </span>
            )}
          </div>
        </div>
        {mostraImporti && (
          <div className="text-right text-[13px] tabular-nums">
            <div className="font-medium">{f.totale == null ? "—" : formatCurrency((nc ? -1 : 1) * Math.abs(Number(f.totale)))}</div>
            {pct > 0 && pct < 99.5 && f.totale != null && (
              <div className="text-[11px] text-muted-foreground">da assegnare {formatCurrency(Math.abs(Number(f.totale)) * (100 - pct) / 100)}</div>
            )}
          </div>
        )}
        <Button size="sm" variant="ghost" className="h-8 shrink-0 px-2 text-xs" onClick={() => setAnteprima(f)} title="Apri la fattura: righe, importi, bolle, file">
          <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Vedi
        </Button>
        <Button size="sm" variant="outline" className="h-8 shrink-0 px-2 text-xs" onClick={() => scegli(f)}>
          <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Collega
        </Button>
      </li>
    );
  };

  if (scelta) {
    return (
      <CollegaFatturaCommesseDialog companyId={companyId} commessaIniziale={orderId} fattura={scelta}
        onChiudi={() => {
          setScelta(null);
          void queryClient.invalidateQueries({ queryKey: ["fatture-candidate-commessa"] });
          void queryClient.invalidateQueries({ queryKey: ["commessa-fatture-fornitori"] });
        }} />
    );
  }

  if (anteprima) {
    // La fattura completa, nel riepilogo di sempre; da lì «Collega» porta alla scelta delle commesse.
    return (
      <RiepilogoFatturaRicevuta fatturaId={anteprima.id} companyId={companyId} onClose={() => setAnteprima(null)}
        azioni={{ onCollegaCommesse: () => { const f = anteprima; setAnteprima(null); scegli(f); } }} />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Collega una fattura ricevuta</DialogTitle>
          <DialogDescription>Scegli la fattura del fornitore: poi decidi se va tutta su questa commessa, una parte o solo alcune righe.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input autoFocus value={testo} onChange={(e) => setTesto(e.target.value)} placeholder="Fornitore, numero o importo" className="pl-8" aria-label="Cerca fattura" />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Checkbox checked={ancheAssegnate} onCheckedChange={(v) => setAncheAssegnate(v === true)} />
            Mostra anche quelle già assegnate
          </label>
        </div>
        <div className="max-h-[55vh] overflow-y-auto rounded-md border">
          {isLoading ? (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cerco le fatture…</div>
          ) : isError ? (
            <p className="p-4 text-sm text-destructive">Non riesco a leggere le fatture ricevute. Riprova.</p>
          ) : data.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">{cerca ? "Nessuna fattura trovata con questa ricerca." : "Nessuna fattura ricevuta da assegnare."}</p>
          ) : (
            <>
              {probabili.length > 0 && <>
                <p className="sticky top-0 z-10 bg-muted/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">Probabili per questa commessa</p>
                <ul>{probabili.map(riga)}</ul>
              </>}
              {altre.length > 0 && <>
                <p className="sticky top-0 z-10 bg-muted/80 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{probabili.length > 0 ? "Altre fatture ricevute" : "Fatture ricevute"}</p>
                <ul>{altre.map(riga)}</ul>
              </>}
            </>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t pt-3 text-[13px] text-muted-foreground">
          <span>Non c'è? Caricala dal file (XML, PDF o foto).</span>
          <CaricaFatturaCommessaButton orderId={orderId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Le fatture da proporre nella scheda: con un motivo vero oltre al suggerimento dell'AI (che la scheda mostra già a parte), e non già mostrate. */
export function fattureProbabili(candidate: FatturaCandidata[], giaMostrate: ReadonlySet<string>): FatturaCandidata[] {
  return candidate.filter((f) => eProbabile(f) && !giaMostrate.has(f.id) && (f.motivi ?? []).some((m) => !m.startsWith("Suggerita")));
}

/**
 * Lotto 4: nella scheda della commessa, le fatture ricevute che sembrano sue (bolla della commessa, ordine
 * citato nell'XML, fornitore della commessa) senza aprire niente. Non collega da solo: «Collega» apre la
 * divisione già impostata per la commessa (aperturaDallaCommessa), «Vedi tutte» il popup completo.
 * Le fatture che la scheda mostra già (collegate o suggerite dall'AI) si passano in `giaMostrate`.
 */
export function FattureProbabiliCommessa({ orderId, companyId, giaMostrate, mostraImporti = true, onCollega, onVediTutte }: {
  orderId: string; companyId: string; giaMostrate: ReadonlySet<string>; mostraImporti?: boolean;
  onCollega: (f: FatturaDaCollegare) => void; onVediTutte: () => void;
}) {
  const { data = [] } = useQuery({
    queryKey: ["fatture-candidate-commessa", companyId, orderId, "probabili"],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<FatturaCandidata[]> => {
      const { data: righe, error } = await db.rpc("fatture_candidate_commessa", { p_order: orderId, p_cerca: null, p_limit: 20, p_anche_assegnate: false });
      if (error) throw error;
      return (righe ?? []) as FatturaCandidata[];
    },
  });
  const probabili = fattureProbabili(data, giaMostrate);
  if (probabili.length === 0) return null;
  const prime = probabili.slice(0, 3);
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2.5" role="region" aria-label="Fatture ricevute che sembrano di questa commessa">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium">
          {probabili.length === 1 ? "1 fattura ricevuta sembra di questa commessa" : `${probabili.length} fatture ricevute sembrano di questa commessa`}
        </p>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onVediTutte}>Vedi tutte</Button>
      </div>
      <ul className="space-y-1">
        {prime.map((f) => {
          const pct = Number(f.assegnata_pct ?? 0);
          return (
            <li key={f.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-background px-2 py-1.5 text-[13px]">
              <span className="font-medium">{f.fornitore ?? "Fornitore sconosciuto"}</span>
              <span className="text-muted-foreground">n. {f.numero_fattura ?? "—"}</span>
              {(f.motivi ?? []).filter((m) => !m.startsWith("Suggerita")).map((m) => (
                <span key={m} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{m}</span>
              ))}
              {pct > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800">già al {Math.round(pct)}% su altre</span>}
              <span className="ml-auto flex items-center gap-2">
                {mostraImporti && f.totale != null && <span className="tabular-nums">{formatCurrency(Math.abs(Number(f.totale)))}</span>}
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => onCollega({ id: f.id, numero: f.numero_fattura, fornitore: f.fornitore, imponibile: f.imponibile, totale: f.totale, companyCostId: f.company_cost_id })}>
                  <Link2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />Collega
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
      {probabili.length > prime.length && <p className="mt-1 text-xs text-muted-foreground">e altre {probabili.length - prime.length} in «Vedi tutte».</p>}
    </div>
  );
}
