import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, StickyNote } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLORI_NOTE = [
  "#fef9c3", "#dbeafe", "#dcfce7", "#fef3c7", "#ccfbf1",
  "#f3f4f6", "#d1fae5", "#ede9fe", "#fce7f3", "#fee2e2",
];

interface Props {
  flowId: string;
}

export function WorkflowNotesPanel({ flowId }: Props) {
  const qc = useQueryClient();
  const [nota, setNota] = useState("");
  const [salvata, setSalvata] = useState(false);

  const { data: flow } = useQuery({
    queryKey: ["flow-note", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("automation_flows")
        .select("note, note_color")
        .eq("id", flowId)
        .single();
      if (error) throw error;
      return data as { note: string | null; note_color: string | null };
    },
    enabled: !!flowId,
  });

  useEffect(() => {
    if (flow?.note != null) setNota(flow.note);
  }, [flow?.note]);

  const salvaNota = useMutation({
    mutationFn: async (val: string) => {
      const { error } = await (supabase as any)
        .from("automation_flows")
        .update({ note: val })
        .eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-note", flowId] });
      setSalvata(true);
      setTimeout(() => setSalvata(false), 2000);
    },
  });

  const cambiaColore = useMutation({
    mutationFn: async (colore: string | null) => {
      const { error } = await (supabase as any)
        .from("automation_flows")
        .update({ note_color: colore })
        .eq("id", flowId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["flow-note", flowId] }),
  });

  return (
    <ScrollArea className="flex-1">
      <div className="p-4 space-y-5">
        {/* Color palette */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Colore sfondo nota
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {COLORI_NOTE.map((c) => (
              <button
                key={c}
                onClick={() => cambiaColore.mutate(c)}
                style={{ backgroundColor: c }}
                className={`aspect-square rounded-lg border-2 transition-all ${
                  flow?.note_color === c
                    ? "border-primary scale-110"
                    : "border-transparent hover:border-muted-foreground/40"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() => cambiaColore.mutate(null)}
            className="mt-2 text-[11px] text-muted-foreground hover:text-foreground underline"
          >
            Rimuovi colore
          </button>
        </div>

        {/* Workflow note */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Nota Flusso
            </label>
          </div>
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Aggiungi una nota..."
            rows={6}
            maxLength={5000}
            style={{ backgroundColor: flow?.note_color || undefined }}
            className="w-full px-3 py-2 text-sm border border-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none resize-none bg-background"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-muted-foreground">{nota.length}/5000</span>
            <button
              onClick={() => salvaNota.mutate(nota)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {salvata ? "Salvato!" : "Salva nota"}
            </button>
          </div>
        </div>

        {/* Action note placeholder */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Note Azione
            </label>
          </div>
          <p className="text-sm text-muted-foreground italic py-4 text-center border border-dashed border-border rounded-lg">
            Seleziona un'azione per aggiungere note specifiche
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}
