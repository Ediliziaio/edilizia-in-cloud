/**
 * Tesserino di cantiere, lato ufficio (scheda dipendente → Documenti, 23/11/2026).
 *
 * Il QR del tesserino porta alla verifica pubblica (/tesserino#<codice>). Se il tesserino si perde o viene copiato,
 * l'ufficio rigenera il codice: il QR vecchio risponde «non riconosciuto» e l'operaio vede il nuovo nella sua app.
 * Il codice non si legge dal browser (la tabella è chiusa): lo restituisce solo `tesserino_rigenera`, e qui serve
 * per provare subito la verifica.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ExternalLink, Loader2, QrCode, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { supabase } from "@/integrations/supabase/client";
import { indirizzoVerificaTesserino } from "@/lib/campo/tesserino";

export function TesserinoQrUfficio({ profiloId, nome, puoModificare }: { profiloId: string; nome: string; puoModificare: boolean }) {
  const confirm = useConfirm();
  const [nuovoIndirizzo, setNuovoIndirizzo] = useState<string | null>(null);
  const rigenera = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("tesserino_rigenera", { p_profilo: profiloId });
      if (error) throw error;
      return data as string;
    },
    onSuccess: codice => {
      setNuovoIndirizzo(indirizzoVerificaTesserino(window.location.origin, codice));
      toast.success("QR del tesserino rigenerato. Il vecchio non funziona più.");
    },
    onError: () => toast.error("Non sono riuscito a rigenerare il QR. Riprova."),
  });

  async function chiedi() {
    if (rigenera.isPending) return;
    const ok = await confirm({
      title: `Rigenerare il QR del tesserino di ${nome}?`,
      description: "Il QR attuale smette subito di funzionare: chi lo inquadra vedrà «tesserino non riconosciuto». "
        + "Il nuovo compare nell'app del lavoratore (Altro → Tesserino). Fallo se il tesserino è stato perso o copiato.",
      confirmLabel: "Rigenera",
      variant: "destructive",
    });
    if (ok) rigenera.mutate();
  }

  return (
    <section aria-labelledby={`tesserino-${profiloId}`} className="mb-4 rounded-xl border bg-white p-3 dark:bg-background">
      <h4 id={`tesserino-${profiloId}`} className="flex items-center gap-2 text-sm font-semibold">
        <QrCode className="size-4 text-orange-700" aria-hidden="true" /> Tesserino di cantiere
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">
        Il QR del tesserino mostra a chi controlla in cantiere se la persona è in forza e se formazione sulla sicurezza
        e visita medica sono valide. Si basa sui documenti di questa scheda.
      </p>
      {puoModificare && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => void chiedi()} disabled={rigenera.isPending}>
            {rigenera.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <RefreshCw className="mr-1.5 size-4" />}
            Rigenera QR
          </Button>
          {nuovoIndirizzo && (
            <a href={nuovoIndirizzo} target="_blank" rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-primary underline">
              <ExternalLink className="size-4" aria-hidden="true" /> Prova la verifica
            </a>
          )}
        </div>
      )}
    </section>
  );
}
