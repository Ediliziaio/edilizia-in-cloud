/** Le note interne di una fattura: si cercano dalla lista, non finiscono né nell'XML né sul PDF. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { userErrorMessage } from "@/lib/userErrorMessage";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

type Props = {
  tabella: "fatture_ricevute" | "invoices" | "documenti_fiscali";
  id: string;
  companyId: string;
  valore: string | null | undefined;
  puoModificare: boolean;
  chiaviDaAggiornare: string[];
};

export function NoteInterneFattura(props: Props) {
  return <EditorNota key={JSON.stringify([props.tabella, props.companyId, props.id])} {...props} />;
}

function EditorNota({ tabella, id, companyId, valore, puoModificare, chiaviDaAggiornare }: Props) {
  const t = useT();
  const queryClient = useQueryClient();
  const letto = valore ?? null;
  const [versione, setVersione] = useState({ letto, salvato: letto });
  const [bozza, setBozza] = useState<{ base: string | null; testo: string } | null>(null);
  const salvato = versione.letto === letto ? versione.salvato : letto;
  if (versione.letto !== letto) setVersione({ letto, salvato: letto });
  const testo = bozza?.testo ?? salvato ?? "";
  const conflitto = bozza !== null && bozza.base !== salvato;
  const rileggi = () => Promise.all(chiaviDaAggiornare.map(k => queryClient.invalidateQueries({ queryKey: [k] })));
  const salva = useMutation({
    mutationFn: async (modifica: NonNullable<typeof bozza>) => {
      const pulito = modifica.testo.trim() || null;
      const query = supabase.from(tabella).update({ note_interne: pulito }).eq("id", id).eq("company_id", companyId);
      const { data, error } = await (modifica.base === null
        ? query.is("note_interne", null)
        : query.eq("note_interne", modifica.base)).select("id").maybeSingle();
      if (error) throw error;
      return { modificata: !!data, testo: pulito };
    },
    onSuccess: async ({ modificata, testo: nuovoTesto }) => {
      if (!modificata) {
        toast.error(t("La nota è cambiata o non è più modificabile. La tua bozza è ancora qui."));
        await rileggi();
        return;
      }
      setVersione(v => ({ ...v, salvato: nuovoTesto }));
      setBozza(null);
      toast.success(t("Nota salvata"));
      await rileggi();
    },
    onError: (e) => toast.error(t("Nota non salvata"), { description: userErrorMessage(e, t("Riprova tra poco. La tua bozza è ancora qui.")) }),
  });
  const cambiata = testo.trim() !== (salvato ?? "").trim();
  if (!puoModificare && !salvato) return null;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`note-interne-${id}`}>{t("Note interne")}</Label>
      <Textarea id={`note-interne-${id}`} value={puoModificare ? testo : salvato ?? ""}
        onChange={(e) => {
          const base = bozza ? bozza.base : salvato;
          const nuovo = e.target.value;
          setBozza(nuovo === (base ?? "") ? null : { base, testo: nuovo });
        }}
        readOnly={!puoModificare || salva.isPending} maxLength={4000} rows={3}
        placeholder={t("Le vedete solo voi: si cercano dalla lista e non finiscono sul documento.")} />
      {puoModificare && conflitto && <div role="status" className="space-y-2 rounded-md border p-2.5 text-sm">
        <p>{t("La nota è cambiata mentre la stavi modificando.")}</p>
        <p className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-muted-foreground">{salvato || t("La nota salvata è vuota.")}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={salva.isPending} onClick={() => setBozza(null)}>{t("Usa la nota salvata")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={salva.isPending} onClick={() => setBozza({ base: salvato, testo })}>{t("Tieni la mia bozza")}</Button>
        </div>
      </div>}
      {puoModificare && !conflitto && (cambiata || salva.isPending) && (
        <Button type="button" size="sm" disabled={salva.isPending} onClick={() => { if (bozza) salva.mutate(bozza); }}>
          {salva.isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}{t("Salva la nota")}
        </Button>
      )}
    </div>
  );
}
