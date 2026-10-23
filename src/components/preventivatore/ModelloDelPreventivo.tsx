/**
 * Il modello che il PDF del preventivo sta usando, e il modo di rinnovarlo.
 *
 * Il preventivo congela il modello dell'azienda quando nasce (modello_snapshot): le
 * modifiche fatte dopo al modello non entrano da sole. Finché il preventivo è in bozza:
 *   · con un modello: «Aggiorna al modello attuale» lo sostituisce con quello di adesso;
 *   · senza modello (nato senza scegliere l'intervento, usa il modello base): «Usa il
 *     modello» collega quello della libreria che corrisponde al tipo di intervento.
 * Il database lo permette solo in bozza, per la stessa azienda e lo stesso intervento
 * (migrazione modello_preventivo_aggiornabile_in_bozza). Uscito dalla bozza non si mostra.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  TABELLA_PREVENTIVI, TIPO_INTERVENTO_DEL_MODELLO, interventiDelModulo,
  type ModelloPreventivo, type ModuloConModelli,
} from "@/lib/moduli/modelloPreventivo";

interface Props {
  modulo: ModuloConModelli;
  progetto: { id: string; company_id: string; stato?: string | null; tipo_intervento?: string | null } | null | undefined;
  snapshot: ModelloPreventivo<object> | null | undefined;
  /** Il modello dell'azienda per l'intervento, com'è adesso, pronto da congelare. */
  costruisci: (companyId: string, model: { id: string }) => Promise<ModelloPreventivo<object>>;
  onAggiornato: () => unknown;
}

/** Gli interventi della libreria che corrispondono al tipo di intervento del preventivo. */
export function interventiPerTipo(modulo: ModuloConModelli, tipo: string | null | undefined) {
  const tutti = interventiDelModulo(modulo);
  const mappa = TIPO_INTERVENTO_DEL_MODELLO[modulo];
  const adatti = tipo ? tutti.filter((i) => mappa[i.id] === tipo) : [];
  return adatti.length > 0 ? adatti : tutti;
}

export function ModelloDelPreventivo({ modulo, progetto, snapshot, costruisci, onAggiornato }: Props) {
  const scelte = interventiPerTipo(modulo, progetto?.tipo_intervento);
  const [scelto, setScelto] = useState<string>(scelte[0]?.id ?? "");
  const [inCorso, setInCorso] = useState(false);
  if (!progetto || progetto.stato !== "bozza") return null;

  const applica = async (modelId: string) => {
    setInCorso(true);
    try {
      const nuovo = await costruisci(progetto.company_id, { id: modelId });
      // modello_snapshot non è nei tipi generati di Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from(TABELLA_PREVENTIVI[modulo]).update({ modello_snapshot: nuovo })
        .eq("id", progetto.id).eq("company_id", progetto.company_id).eq("stato", "bozza");
      if (error) throw new Error(error.message);
      await onAggiornato();
      toast.success("Modello aggiornato", { description: "Il PDF ora usa il modello di adesso." });
    } catch (e) {
      toast.error("Modello non aggiornato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setInCorso(false);
    }
  };

  if (snapshot) {
    const del = new Date(snapshot.capturedAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Il PDF usa il modello del {del}.</span>
        <Button size="sm" variant="outline" disabled={inCorso} onClick={() => void applica(snapshot.modelId)}>
          {inCorso ? "Aggiorno…" : "Aggiorna al modello attuale"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-xs">
      <span>Questo preventivo usa il modello base: le modifiche ai modelli della libreria non entrano nel PDF.</span>
      {scelte.length > 1 && (
        <select aria-label="Modello della libreria" className="rounded border bg-background px-2 py-1" value={scelto} onChange={(e) => setScelto(e.target.value)}>
          {scelte.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
        </select>
      )}
      <Button size="sm" variant="outline" disabled={inCorso || !scelto} onClick={() => void applica(scelto)}>
        {inCorso ? "Collego…" : scelte.length === 1 ? `Usa il modello «${scelte[0].title}»` : "Usa questo modello"}
      </Button>
    </div>
  );
}
