// src/components/orders/ModelliFasiPicker.tsx
import { useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
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
  const { modelli, inizializzati, isLoading, isError, refetch } = useModelliFasi();
  const { canViewSettingsOrders } = usePermissions();
  const elenco = modelliDaOffrire(inizializzati, modelli, PHASE_TEMPLATES);
  const [sceltoId, setSceltoId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const visible = elenco.filter(m => `${m.nome} ${m.descrizione ?? ""}`.toLocaleLowerCase("it-IT").includes(search.trim().toLocaleLowerCase("it-IT")));
  const scelto = elenco.find((m) => m.id === sceltoId) ?? null;
  const nSotto = scelto ? totaleSottofasi(scelto) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><Label className={TITOLO}>Parti da un modello</Label>
        {canViewSettingsOrders && <a href="/azienda/impostazioni/modelli-fasi#modelli" className="text-xs font-medium underline">Gestisci modelli</a>}
      </div>
      <p className="text-xs text-muted-foreground">{inizializzati ? "Modelli della tua azienda." : "Modelli standard e modelli salvati dall'azienda."} Aggiungono fasi e sottofasi, non persone, costi o date.</p>
      {isLoading && <p role="status" className="text-xs">Caricamento modelli aziendali…</p>}
      {isError && <div role="alert" className="text-xs text-amber-800">Modelli aziendali non disponibili. Non applico standard al loro posto. <Button variant="outline" size="sm" onClick={() => void refetch()}>Riprova modelli</Button></div>}
      {elenco.length > 5 && <Input aria-label="Cerca modello" value={search} onChange={e => {setSearch(e.target.value); setSceltoId(null);}} placeholder="Cerca un modello…" />}
      {elenco.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Non hai modelli: preparali in Impostazioni → Fasi e avanzamento, oppure torna a «Scrivi una fase».
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {visible.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={sceltoId === m.id}
              disabled={inCorso || isLoading || isError}
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
      {elenco.length > 0 && visible.length === 0 && <p className="text-xs text-muted-foreground">Nessun modello trovato.</p>}

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
          <p className="text-xs text-muted-foreground">Si aggiungono alle fasi già presenti, senza sostituirle.</p>
          <Button size="sm" className="w-full" disabled={inCorso || isLoading || isError} onClick={() => {if (!inCorso && !isLoading && !isError) onApplica(fasiPerCommessa(scelto), scelto);}}>
            {inCorso ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ListPlus className="mr-1 h-4 w-4" />}
            Aggiungi le {scelto.fasi.length} fasi
          </Button>
        </div>
      )}
    </div>
  );
}
