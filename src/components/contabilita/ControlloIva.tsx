/**
 * Il percorso guidato dell'IVA in testa alla vista IVA della Contabilità generale (23/11/2026):
 * i passi nell'ordine in cui si fanno, con lo stato di ciascuno e il pulsante che porta dove si fa.
 * La logica sta in `lib/contabilita/percorsoIva.ts`, i dati in `hooks/useControlloIva.ts`.
 */
import { AlertTriangle, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { passoAttuale, percorsoIva, type DestinazionePasso, type PassoIva } from "@/lib/contabilita/percorsoIva";
import type { StatoControlloIva } from "@/hooks/useControlloIva";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function Segno({ passo, numero }: { passo: PassoIva; numero: number }) {
  const t = useT();
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (passo.stato === "fatto") return <span className={`${base} bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300`} aria-label={t("fatto")}><Check className="h-3.5 w-3.5" /></span>;
  if (passo.stato === "avviso") return <span className={`${base} bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300`} aria-label={t("da guardare")}><AlertTriangle className="h-3.5 w-3.5" /></span>;
  if (passo.stato === "in_attesa") return <span className={`${base} bg-muted text-muted-foreground`} aria-label={t("in attesa")}><Circle className="h-3 w-3" /></span>;
  return <span className={`${base} bg-primary text-primary-foreground`} aria-label={t("da fare")}>{numero}</span>;
}

export function PercorsoIva({ stato, anno, oggi, onVai }: {
  stato: StatoControlloIva | undefined;
  anno: number;
  /** Data di oggi (ISO): decide quali periodi sono finiti. */
  oggi: string;
  onVai: (dove: DestinazionePasso) => void;
}) {
  const t = useT();
  if (!stato) return null;
  const passi = percorsoIva(stato, anno, oggi);
  const attuale = passoAttuale(passi);
  const completo = !attuale && passi.every((p) => p.stato === "fatto");
  return (
    <section aria-label={t("Percorso IVA {anno}", { anno: String(anno ?? "") })} className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("Percorso IVA {anno}", { anno: String(anno ?? "") })}</h2>
        <p className="text-xs text-muted-foreground">
          {completo ? t("Tutto in ordine: liquidazioni confermate, registrate e versate.")
            : attuale ? t("Da fare adesso: {titolo}", { titolo: String(attuale.titolo ?? "") }) : t("Niente da fare adesso")}
        </p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {passi.map((p, i) => (
          <li key={p.chiave} aria-current={p === attuale ? "step" : undefined}
            className={`flex gap-2 rounded-lg border p-2 ${p === attuale ? "border-primary ring-1 ring-primary/30" : ""} ${p.stato === "in_attesa" ? "opacity-70" : ""}`}>
            <Segno passo={p} numero={i + 1} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{p.titolo}</p>
              <p className="text-xs text-muted-foreground">{p.dettaglio}</p>
              {p.azione && (
                <Button size="sm" variant={p === attuale ? "default" : "outline"} className="mt-1.5 h-7 px-2 text-xs" onClick={() => onVai(p.azione!.vai)}>
                  {p.azione.etichetta}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
