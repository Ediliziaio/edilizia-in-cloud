// src/components/orders/ModelliFasiPicker.tsx
import { useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { PHASE_TEMPLATES } from "@/hooks/useOrderWorkPhases";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { fasiPerCommessa, modelliDaOffrire, totaleSottofasi, type FaseModello, type ModelloFasi } from "@/lib/orders/modelliFasi";

interface ModelliFasiPickerProps {
  /** Aggiunge alla commessa le fasi (e sottofasi) del modello scelto. */
  onApplica: (fasi: FaseModello[], modello: ModelloFasi) => void;
  inCorso: boolean;
}

const TITOLO = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/** «Parti da un modello»: i modelli dell'azienda (con le sottofasi); finché non sono suoi, gli stessi di sempre. */
export function ModelliFasiPicker({ onApplica, inCorso }: ModelliFasiPickerProps) {
  const { modelli, inizializzati } = useModelliFasi();
  const elenco = modelliDaOffrire(inizializzati, modelli, PHASE_TEMPLATES);
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  const scelto = elenco.find((m) => m.id === sceltoId) ?? null;
  const nSotto = scelto ? totaleSottofasi(scelto) : 0;

  return (
    <div className="space-y-2">
      <Label className={TITOLO}>Parti da un modello</Label>
      {elenco.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Non hai modelli: preparali in Impostazioni → Fasi e avanzamento, oppure scrivi le fasi una alla volta qui sotto.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {elenco.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSceltoId((k) => (k === m.id ? null : m.id))}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                sceltoId === m.id ? "border-primary bg-primary/10 font-medium text-primary" : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}

      {scelto && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            {[scelto.descrizione, `${scelto.fasi.length} fasi`, nSotto > 0 ? `${nSotto} sottofasi` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="flex flex-wrap gap-1">
            {scelto.fasi.map((f, i) => (
              <span
                key={i}
                title={f.sottofasi.map((s) => s.nome).join(", ") || undefined}
                className="rounded border bg-background px-1.5 py-0.5 text-[11px] text-foreground"
              >
                {i + 1}. {f.nome}{f.sottofasi.length > 0 ? ` (${f.sottofasi.length})` : ""}
              </span>
            ))}
          </div>
          <Button size="sm" className="w-full" disabled={inCorso} onClick={() => onApplica(fasiPerCommessa(scelto), scelto)}>
            {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListPlus className="mr-1 h-4 w-4" />}
            Aggiungi le {scelto.fasi.length} fasi
          </Button>
        </div>
      )}
    </div>
  );
}
