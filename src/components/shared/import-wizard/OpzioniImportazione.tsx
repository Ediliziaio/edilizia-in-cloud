import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag, Workflow, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export interface AutomazioneScelta { id: string; nome: string }

/**
 * Cosa fare ai contatti appena importati: etichette da aggiungere a tutti e
 * automazioni in cui farli entrare. Solo i flussi pubblicati: gli altri non partono.
 */
export function OpzioniImportazione({ etichette, onEtichetteChange, automazioni, onAutomazioniChange }: {
  etichette: string[];
  onEtichetteChange: (v: string[]) => void;
  automazioni: AutomazioneScelta[];
  onAutomazioniChange: (v: AutomazioneScelta[]) => void;
}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const [testo, setTesto] = useState("");
  const { data: flussi = [], isLoading } = useQuery({
    queryKey: ["automation-flows-active", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_flows")
        .select("id, name, status, version")
        .eq("company_id", companyId!)
        .eq("status", "published")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  const aggiungi = () => {
    const nuove = testo.split(",").map((t) => t.trim()).filter((t) => t && !etichette.includes(t));
    if (nuove.length) onEtichetteChange([...etichette, ...nuove]);
    setTesto("");
  };
  const scelta = new Set(automazioni.map((a) => a.id));

  return (
    <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-medium"><Tag className="h-4 w-4 text-primary" /> Etichette da aggiungere</p>
        <p className="mb-2 text-xs text-muted-foreground">Vanno su tutti i contatti importati, insieme a quelle già nel file.</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {etichette.map((e) => (
            <span key={e} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
              {e}
              <button type="button" aria-label={`Togli l'etichetta ${e}`} onClick={() => onEtichetteChange(etichette.filter((x) => x !== e))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <Input
            aria-label="Nuova etichetta"
            value={testo}
            onChange={(ev) => setTesto(ev.target.value)}
            onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === ",") { ev.preventDefault(); aggiungi(); } }}
            onBlur={aggiungi}
            placeholder={etichette.length ? "Aggiungi un'altra…" : "Scrivi un'etichetta e premi Invio"}
            className="h-8 w-56 text-sm"
          />
        </div>
      </div>

      <div>
        <p className="flex items-center gap-2 text-sm font-medium"><Workflow className="h-4 w-4 text-primary" /> Automazioni in cui farli entrare</p>
        <p className="mb-2 text-xs text-muted-foreground">I contatti importati partono subito dal primo passaggio di ogni automazione scelta.</p>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Caricamento delle automazioni…</p>
        ) : flussi.length === 0 ? (
          <p className="text-xs text-muted-foreground">Non ci sono automazioni attive.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {flussi.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:border-primary/50">
                <Checkbox
                  checked={scelta.has(f.id)}
                  onCheckedChange={(v) => onAutomazioniChange(v ? [...automazioni, { id: f.id, nome: f.name }] : automazioni.filter((a) => a.id !== f.id))}
                />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
