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
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  TABELLA_PREVENTIVI, TIPO_INTERVENTO_DEL_MODELLO, interventiDelModulo,
  type ModuloConModelli,
} from "@/lib/moduli/modelloPreventivo";

interface InterventoScelto { id: string; title: string }

interface Props {
  /** Preventivatori edili: tabella e interventi vengono dal modulo. */
  modulo?: ModuloConModelli;
  /** Gli altri (Tetti, Serramenti, Fotovoltaico): la tabella dei preventivi… */
  tabella?: string;
  /** …e gli interventi della libreria che il preventivo può prendere, già adatti al suo tipo. */
  interventi?: readonly InterventoScelto[];
  progetto: { id: string; company_id: string; stato?: string | null; tipo_intervento?: string | null; updated_at?: string | null } | null | undefined;
  snapshot: { modelId: string; capturedAt: string } | null | undefined;
  /** Il modello dell'azienda per l'intervento, com'è adesso, pronto da congelare. */
  costruisci: (companyId: string, model: { id: string }) => Promise<unknown>;
  onAggiornato: () => unknown;
  onVersion?: (updated: { id: string; updated_at?: string }) => void;
}

/** Gli interventi della libreria che corrispondono al tipo di intervento del preventivo. */
export function interventiPerTipo(modulo: ModuloConModelli, tipo: string | null | undefined) {
  const tutti = interventiDelModulo(modulo);
  const mappa = TIPO_INTERVENTO_DEL_MODELLO[modulo];
  const adatti = tipo ? tutti.filter((i) => mappa[i.id] === tipo) : [];
  return adatti.length > 0 ? adatti : tutti;
}

export function ModelloDelPreventivo({ modulo, tabella, interventi, progetto, snapshot, costruisci, onAggiornato, onVersion }: Props) {
  const scelte: readonly InterventoScelto[] = interventi ?? (modulo ? interventiPerTipo(modulo, progetto?.tipo_intervento) : []);
  const tabellaPreventivi = tabella ?? (modulo ? TABELLA_PREVENTIVI[modulo] : null);
  const [scelto, setScelto] = useState<string>(scelte[0]?.id ?? "");
  const [inCorso, setInCorso] = useState(false);
  const lock = useRef(false);
  const identity = JSON.stringify([progetto?.id, progetto?.company_id, progetto?.stato, progetto?.updated_at, snapshot]);
  const currentIdentity = useRef<string | null>(identity);
  useEffect(() => {
    currentIdentity.current = identity;
    return () => { currentIdentity.current = null; };
  }, [identity]);
  if (!progetto || progetto.stato !== "bozza" || !tabellaPreventivi) return null;

  const applica = async (modelId: string) => {
    if (lock.current) return;
    lock.current = true;
    const expectedIdentity = currentIdentity.current;
    setInCorso(true);
    try {
      const nuovo = await costruisci(progetto.company_id, { id: modelId });
      if (!expectedIdentity || currentIdentity.current !== expectedIdentity)
        throw new Error("Il preventivo è cambiato: riapri il modello prima di aggiornarlo.");
      // modello_snapshot non è nei tipi generati di Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from(tabellaPreventivi).update({ modello_snapshot: nuovo })
        .eq("id", progetto.id).eq("company_id", progetto.company_id).eq("stato", "bozza");
      if (progetto.updated_at) query = query.eq("updated_at", progetto.updated_at);
      const { data, error } = await query.select("id, updated_at").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.id !== progetto.id)
        throw new Error("Nessun modello aggiornato: il preventivo è cambiato o non è più modificabile. Ricaricalo e riprova.");
      onVersion?.(data);
      await onAggiornato();
      toast.success("Modello aggiornato", { description: "Il PDF ora usa il modello di adesso." });
    } catch (e) {
      toast.error("Modello non aggiornato", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      lock.current = false;
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
  if (scelte.length === 0) return null;
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
