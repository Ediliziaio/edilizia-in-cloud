import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  return <div className="mb-3 space-y-2 rounded-lg border bg-muted/30 p-3">
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox aria-label={t("Seleziona {nome} di questa pagina", { nome: String(p.nome ?? "") })} checked={p.tutte ? true : p.parziale ? "indeterminate" : false} disabled={p.inCorso} onCheckedChange={(v) => p.onPagina(v === true)} />
        {t("Seleziona questa pagina")}
      </label>
      {p.selezionate > 0 && <>
        <span className="text-sm" aria-live="polite">{t("{selezionate} selezionate · {consentite} elaborabili", { selezionate: String(p.selezionate ?? ""), consentite: String(p.consentite ?? "") })}</span>
        <span className="text-xs text-muted-foreground">{p.entrateLabel ?? t("Entrate")} {formatCurrency(p.entrate)} · {p.usciteLabel ?? t("Uscite")} {formatCurrency(p.uscite)}</span>
        <Button size="sm" variant="destructive" disabled={p.inCorso || p.consentite === 0} onClick={p.onAzione}>{p.inCorso ? t("Operazione in corso…") : p.azione}</Button>
      </>}
    </div>
    {!!p.escluse?.length && <details className="text-xs text-muted-foreground"><summary>{t("{n} righe escluse dall'operazione", { n: p.escluse.length })}</summary><ul className="mt-2 space-y-1">{p.escluse.map((r, i) => <li key={i}>{r.nome}: {r.motivo}</li>)}</ul></details>}
  </div>;
}

export function ErroriOperazioneRighe({ errori }: { errori: Array<{ nome: string; motivo: string }> }) {
  const t = useT();
  if (errori.length === 0) return null;
  return <div role="alert" className="mb-3 rounded-lg border border-destructive/40 p-3 text-sm">
    <p className="font-medium">{t("{n} righe non elaborate", { n: errori.length })}</p>
    <ul className="mt-2 space-y-1">{errori.map((r, i) => <li key={i}>{r.nome}: {r.motivo}</li>)}</ul>
  </div>;
}
