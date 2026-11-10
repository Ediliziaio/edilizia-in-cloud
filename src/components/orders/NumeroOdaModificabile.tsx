// Il numero dell'ordine al fornitore, in testata, con la matita per cambiarlo.
// Il numero resta unico nell'azienda (uq_oda_number_company): un doppione torna
// come «Il numero X è già usato da un altro ordine».
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { messaggioErroreNumeroOda } from "@/lib/acquisti/numerazioneOda";

export function NumeroOdaModificabile({ odaId, companyId, numero, puoModificare }: {
  odaId: string;
  companyId: string;
  numero: string;
  puoModificare: boolean;
}) {
  const queryClient = useQueryClient();
  const [inModifica, setInModifica] = useState(false);
  const [bozza, setBozza] = useState(numero);
  const [errore, setErrore] = useState<string | null>(null);
  const [salvataggio, setSalvataggio] = useState(false);

  const apri = () => { setBozza(numero); setErrore(null); setInModifica(true); };
  const chiudi = () => { if (!salvataggio) { setInModifica(false); setErrore(null); } };

  const salva = async (e: FormEvent) => {
    e.preventDefault();
    const nuovo = bozza.trim();
    if (!nuovo) { setErrore("Scrivi il numero dell'ordine"); return; }
    if (nuovo.length > 60) { setErrore("Al massimo 60 caratteri"); return; }
    if (nuovo === numero) { setInModifica(false); return; }
    setSalvataggio(true);
    setErrore(null);
    const { error } = await supabase
      .from("purchase_orders")
      .update({ oda_number: nuovo })
      .eq("id", odaId)
      .eq("company_id", companyId)
      .select("id")
      .single();
    setSalvataggio(false);
    if (error) {
      setErrore(messaggioErroreNumeroOda(error, nuovo));
      return;
    }
    setInModifica(false);
    toast.success(`Numero dell'ordine cambiato in ${nuovo}`);
    void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(odaId) });
  };

  if (!inModifica) {
    return (
      <span className="inline-flex items-center gap-1">
        OdA {numero}
        {puoModificare && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground"
            aria-label="Cambia il numero dell'ordine" title="Cambia il numero" onClick={apri}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
      </span>
    );
  }

  return (
    <form onSubmit={salva} className="inline-flex flex-col gap-1" aria-label="Numero dell'ordine">
      <span className="inline-flex items-center gap-1">
        <span>OdA</span>
        <Input
          autoFocus
          aria-label="Numero dell'ordine"
          aria-invalid={!!errore}
          className="h-8 w-44 text-base font-semibold"
          value={bozza}
          maxLength={60}
          disabled={salvataggio}
          onChange={(e) => { setBozza(e.target.value); setErrore(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") chiudi(); }}
        />
        <Button type="submit" size="icon" variant="ghost" className="h-8 w-8" aria-label="Salva il numero" disabled={salvataggio}>
          {salvataggio ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8" aria-label="Annulla" disabled={salvataggio} onClick={chiudi}>
          <X className="h-4 w-4" />
        </Button>
      </span>
      {errore && <span role="alert" className="text-xs font-normal text-destructive">{errore}</span>}
    </form>
  );
}
