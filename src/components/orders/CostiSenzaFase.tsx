// src/components/orders/CostiSenzaFase.tsx
// Fatture e spese della commessa che non stanno su nessuna fase: si sistemano per fornitore, tutte insieme.
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/formatters";

export interface CostoDaSistemare { id: string; importo: number; nome: string; data: string | null; fornitore: string | null }

/** Per fornitore, dal più pesante: con 87 fatture si finisce in pochi passaggi. */
export function costiPerFornitore(costi: ReadonlyArray<CostoDaSistemare>) {
  const gruppi = new Map<string, { chiave: string; nome: string; costi: CostoDaSistemare[]; totale: number }>();
  for (const c of costi) {
    const nome = c.fornitore?.trim() || "Senza fornitore";
    const g = gruppi.get(nome) ?? { chiave: nome, nome, costi: [], totale: 0 };
    g.costi.push(c);
    g.totale += c.importo;
    gruppi.set(nome, g);
  }
  return [...gruppi.values()].sort((a, b) => b.totale - a.totale);
}

const dataIt = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");

function SceltaFase({ etichetta, fasi, valore, onCambia }: { etichetta: string; fasi: ReadonlyArray<{ id: string; name: string }>; valore: string; onCambia: (v: string) => void }) {
  return (
    <select aria-label={etichetta} value={valore} onChange={(e) => onCambia(e.target.value)} className="h-7 w-44 min-w-0 rounded border bg-background px-1 text-xs">
      <option value="">Scegli la fase…</option>
      {fasi.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

function Gruppo({ gruppo, fasi, inCorso, onAssegna }: {
  gruppo: ReturnType<typeof costiPerFornitore>[number];
  fasi: ReadonlyArray<{ id: string; name: string }>;
  inCorso: boolean;
  onAssegna: (ids: string[], faseId: string) => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [fase, setFase] = useState("");
  const n = gruppo.costi.length;
  return (
    <li className="py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={aperto} onClick={() => setAperto((v) => !v)} className="flex min-w-0 flex-1 items-center gap-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {aperto ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
          <span className="truncate text-sm font-medium" title={gruppo.nome}>{gruppo.nome}</span>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{n} {n === 1 ? "costo" : "costi"}</span>
        </button>
        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatCurrency(gruppo.totale)}</span>
        <SceltaFase etichetta={`Fase di tutti i costi di ${gruppo.nome}`} fasi={fasi} valore={fase} onCambia={setFase} />
        <Button type="button" size="sm" className="h-7 text-xs" disabled={!fase || inCorso} onClick={() => onAssegna(gruppo.costi.map((c) => c.id), fase)}>
          {n === 1 ? "Assegna" : `Assegna ${n}`}
        </Button>
      </div>
      {aperto && (
        <ul className="ml-5 mt-1 divide-y border-l pl-2">
          {gruppo.costi.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={c.nome}>{c.nome}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{dataIt(c.data)}</span>
              <span className="shrink-0 tabular-nums">{formatCurrency(c.importo)}</span>
              <SceltaFase etichetta={`Fase di ${c.nome}`} fasi={fasi} valore="" onCambia={(v) => { if (v) onAssegna([c.id], v); }} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function CostiSenzaFaseDialog({ aperto, onChiudi, costi, fasi, inCorso, onAssegna, ripartiti = 0 }: {
  /** Costi ripartiti su più commesse: contano nel consuntivo ma la fase non si sceglie. */
  ripartiti?: number;
  aperto: boolean;
  onChiudi: () => void;
  costi: ReadonlyArray<CostoDaSistemare>;
  fasi: ReadonlyArray<{ id: string; name: string }>;
  inCorso: boolean;
  onAssegna: (ids: string[], faseId: string) => void;
}) {
  const gruppi = useMemo(() => costiPerFornitore(costi), [costi]);
  const totale = gruppi.reduce((s, g) => s + g.totale, 0);
  return (
    <Dialog open={aperto} onOpenChange={(a) => { if (!a) onChiudi(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Costi senza fase · {formatCurrency(totale)}</DialogTitle>
          <DialogDescription className="sr-only">Assegna fatture e spese della commessa alle fasi, per fornitore o una alla volta.</DialogDescription>
        </DialogHeader>
        {gruppi.length === 0
          ? <p role="status" className="py-4 text-sm text-muted-foreground">Tutti i costi stanno su una fase.</p>
          : <ul className="divide-y">{gruppi.map((g) => <Gruppo key={g.chiave} gruppo={g} fasi={fasi} inCorso={inCorso} onAssegna={onAssegna} />)}</ul>}
        {ripartiti > 0 && <p className="text-xs text-muted-foreground">Più {formatCurrency(ripartiti)} di costi ripartiti su più commesse: restano senza fase.</p>}
      </DialogContent>
    </Dialog>
  );
}
