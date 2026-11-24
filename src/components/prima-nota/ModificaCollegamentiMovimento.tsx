import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CommessaCombobox } from "@/components/orders/CommessaCombobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { PrimaNotaEntry } from "@/hooks/usePrimaNota";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function ModificaCollegamentiMovimento({ movimento }: { movimento: PrimaNotaEntry }) {
  const t = useT();
  const cache = useQueryClient();
  const [aperto, setAperto] = useState(false);
  const [originale, setOriginale] = useState(movimento);
  const [commessa, setCommessa] = useState(movimento.order_id);
  const [note, setNote] = useState(movimento.notes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [caricato, setCaricato] = useState("");
  const salva = useMutation({
    mutationFn: async () => {
      const campi: Partial<Pick<PrimaNotaEntry, "order_id" | "notes" | "attachment_name" | "attachment_url">> = {};
      if (commessa !== originale.order_id) campi.order_id = commessa;
      if (note !== (originale.notes ?? "")) campi.notes = note.trim() || null;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error(t("Il file supera il limite di 10 MB."));
        let rif = caricato;
        if (!rif) {
          const estensione = file.name.split(".").pop()?.toLowerCase();
          if (!estensione || !["pdf","png","jpg","jpeg","doc","docx","xls","xlsx"].includes(estensione)) throw new Error(t("Scegli un PDF, un’immagine JPG o PNG, un documento Word o Excel."));
          const percorso = `${originale.company_id}/${crypto.randomUUID()}.${estensione}`;
          const { error } = await supabase.storage.from("prima-nota-attachments").upload(percorso, file);
          if (error) throw error;
          rif = `prima-nota-attachments/${percorso}`;
          setCaricato(rif);
        }
        campi.attachment_url = rif;
        campi.attachment_name = file.name;
      }
      let query = supabase.from("prima_nota_entries").update(campi).eq("company_id", originale.company_id).eq("id", originale.id);
      for (const campo of ["order_id", "notes", "attachment_url"] as const) {
        if (campo in campi) {
          const prima = originale[campo];
          query = prima == null ? query.is(campo, null) : query.eq(campo, prima);
        }
      }
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error(t("Movimento aggiornato o non più modificabile. Riapri il dettaglio."));
    },
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: queryKeys.primaNota.all });
      setAperto(false);
      toast.success(t("Movimento aggiornato"));
    },
    onError: (error) => toast.error(t("Modifica non salvata"), { description: error.message }),
  });

  if (!aperto) return <Button onClick={() => {
    setOriginale(movimento);
    setCommessa(movimento.order_id);
    setNote(movimento.notes ?? "");
    setFile(null);
    setCaricato("");
    setAperto(true);
  }}>{t("Modifica movimento")}</Button>;

  return <fieldset disabled={salva.isPending} className="w-full space-y-3">
    <legend className="mb-2 font-semibold">{t("Modifica movimento")}</legend>
    <p className="text-sm font-medium">{t("Commessa o macrocommessa")}</p>
    <CommessaCombobox ariaLabel={t("Commessa o macrocommessa")} value={commessa} onChange={setCommessa} nessunaLabel={t("Nessuna commessa collegata")} />
    <label className="block text-sm">{t("Note")}<Textarea value={note} onChange={e => setNote(e.target.value)} /></label>
    <label className="block text-sm">{originale.attachment_url ? t("Sostituisci allegato · max 10 MB") : t("Aggiungi allegato · max 10 MB")}
      <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx" onChange={e => { setFile(e.target.files?.[0] ?? null); setCaricato(""); }} />
    </label>
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => setAperto(false)}>{t("Annulla")}</Button>
      <Button disabled={salva.isPending || (commessa === originale.order_id && note === (originale.notes ?? "") && !file)} onClick={() => salva.mutate()}>
        {salva.isPending ? t("Salvataggio…") : t("Salva modifiche")}
      </Button>
    </div>
  </fieldset>;
}
