import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";

interface Props {
  nome: string;
  selezionate: number;
  consentite: number;
  tutte: boolean;
  parziale: boolean;
  entrate: number;
  uscite: number;
  entrateLabel?: string;
  usciteLabel?: string;
  azione: string;
  inCorso: boolean;
  escluse?: Array<{ nome: string; motivo: string }>;
  onPagina: (attive: boolean) => void;
  onAzione: () => void;
}

export function BarraSelezioneRighe(p: Props) {
  return <div className="mb-3 space-y-2 rounded-lg border bg-muted/30 p-3">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox aria-label={`Seleziona ${p.nome} di questa pagina`} checked={p.tutte ? true : p.parziale ? "indeterminate" : false} disabled={p.inCorso} onCheckedChange={(v) => p.onPagina(v === true)} />
        Seleziona questa pagina
      </label>
      {p.selezionate > 0 && <>
        <span className="text-sm" aria-live="polite">{p.selezionate} selezionate · {p.consentite} elaborabili</span>
        <span className="text-xs text-muted-foreground">{p.entrateLabel ?? "Entrate"} {formatCurrency(p.entrate)} · {p.usciteLabel ?? "Uscite"} {formatCurrency(p.uscite)}</span>
        <Button size="sm" variant="destructive" disabled={p.inCorso || p.consentite === 0} onClick={p.onAzione}>{p.inCorso ? "Operazione in corso…" : p.azione}</Button>
      </>}
    </div>
    {!!p.escluse?.length && <details className="text-xs text-muted-foreground"><summary>{p.escluse.length} righe escluse dall'operazione</summary><ul className="mt-2 space-y-1">{p.escluse.map((r, i) => <li key={i}>{r.nome}: {r.motivo}</li>)}</ul></details>}
  </div>;
}

export function ErroriOperazioneRighe({ errori }: { errori: Array<{ nome: string; motivo: string }> }) {
  if (errori.length === 0) return null;
  return <div role="alert" className="mb-3 rounded-lg border border-destructive/40 p-3 text-sm">
    <p className="font-medium">{errori.length} righe non elaborate</p>
    <ul className="mt-2 space-y-1">{errori.map((r, i) => <li key={i}>{r.nome}: {r.motivo}</li>)}</ul>
  </div>;
}
