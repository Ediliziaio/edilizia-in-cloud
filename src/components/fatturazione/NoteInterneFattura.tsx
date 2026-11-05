/** Le note interne di una fattura: si cercano dalla lista, non finiscono né nell'XML né sul PDF. */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

export function NoteInterneFattura({ tabella, id, companyId, valore, puoModificare, chiaviDaAggiornare }: {
  tabella: "fatture_ricevute" | "invoices" | "documenti_fiscali";
  id: string;
  companyId: string;
  valore: string | null | undefined;
  puoModificare: boolean;
  chiaviDaAggiornare: string[];
}) {
  const queryClient = useQueryClient();
  const [testo, setTesto] = useState(valore ?? "");
  useEffect(() => setTesto(valore ?? ""), [valore]);
  const salva = useMutation({
    mutationFn: async () => {
      const pulito = testo.trim() || null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from(tabella).update({ note_interne: pulito }).eq("id", id).eq("company_id", companyId).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Non hai il permesso di modificare questa fattura.");
    },
    onSuccess: () => {
      toast.success("Nota salvata");
      for (const k of chiaviDaAggiornare) void queryClient.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => toast.error("Nota non salvata", { description: e instanceof Error ? e.message : String(e) }),
  });
  const cambiata = testo.trim() !== (valore ?? "").trim();
  if (!puoModificare && !valore) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`note-interne-${id}`}>Note interne</Label>
      <Textarea id={`note-interne-${id}`} value={testo} onChange={(e) => setTesto(e.target.value)} readOnly={!puoModificare} maxLength={4000} rows={3}
        placeholder="Le vedete solo voi: si cercano dalla lista e non finiscono sul documento." />
      {puoModificare && cambiata && (
        <Button size="sm" disabled={salva.isPending} onClick={() => salva.mutate()}>
          {salva.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Salva la nota
        </Button>
      )}
    </div>
  );
}
