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
import { FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UniformSelect } from "@/components/ui/uniform-select";
import { supabase } from "@/integrations/supabase/client";
import {
  TABELLA_PREVENTIVI, TIPO_INTERVENTO_DEL_MODELLO, interventiDelModulo,
  type ModuloConModelli,
} from "@/lib/moduli/modelloPreventivo";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

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
  const t = useT();
  const scelte: readonly InterventoScelto[] = interventi ?? (modulo ? interventiPerTipo(modulo, progetto?.tipo_intervento) : []);
  const tabellaPreventivi = tabella ?? (modulo ? TABELLA_PREVENTIVI[modulo] : null);
  const [scelta, setScelta] = useState("");
  const scelto = scelte.find((i) => i.id === scelta) ?? scelte[0];
  const modelId = snapshot?.modelId ?? scelto?.id;
  const [inCorso, setInCorso] = useState(false);
  const lock = useRef(false);
  const identity = JSON.stringify([progetto?.id, progetto?.company_id, progetto?.stato, progetto?.updated_at, snapshot]);
  const currentIdentity = useRef<string | null>(identity);
  useEffect(() => {
    currentIdentity.current = identity;
    return () => { currentIdentity.current = null; };
  }, [identity]);
  if (!progetto || progetto.stato !== "bozza" || !tabellaPreventivi || !modelId) return null;

  const applica = async (modelId: string) => {
    if (lock.current) return;
    lock.current = true;
    const expectedIdentity = currentIdentity.current;
    setInCorso(true);
    try {
      const nuovo = await costruisci(progetto.company_id, { id: modelId });
      if (!expectedIdentity || currentIdentity.current !== expectedIdentity)
        throw new Error(t("Il preventivo è cambiato: riapri il modello prima di aggiornarlo."));
      // modello_snapshot non è nei tipi generati di Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from(tabellaPreventivi).update({ modello_snapshot: nuovo })
        .eq("id", progetto.id).eq("company_id", progetto.company_id).eq("stato", "bozza");
      if (progetto.updated_at) query = query.eq("updated_at", progetto.updated_at);
      const { data, error } = await query.select("id, updated_at").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data || data.id !== progetto.id)
        throw new Error(t("Nessun modello aggiornato: il preventivo è cambiato o non è più modificabile. Ricaricalo e riprova."));
      onVersion?.(data);
      await onAggiornato();
      toast.success(t("Modello aggiornato"), { description: t("Il PDF ora usa il modello di adesso.") });
    } catch (e) {
      toast.error(t("Modello non aggiornato"), { description: messaggioErrore(e) });
    } finally {
      lock.current = false;
      setInCorso(false);
    }
  };

  const del = snapshot && new Date(snapshot.capturedAt).toLocaleString(intlCampo(), { dateStyle: "short", timeStyle: "short" });
  const nomeModello = snapshot && scelte.find((i) => i.id === snapshot.modelId)?.title;
  const etichetta = snapshot ? t("Aggiorna al modello attuale") : t("Usa questo modello");
  const attesa = snapshot ? t("Aggiorno…") : t("Collego…");
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t("Modello PDF")}
          title={t("Modello PDF")}
          className="shrink-0 gap-1.5 max-lg:w-10 max-lg:px-0"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span className="hidden lg:inline">{t("Modello PDF")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t("Modello PDF")} className="w-80 max-w-[calc(100vw-1.5rem)] space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{nomeModello ?? t("Modello PDF")}</p>
          <p className="text-sm text-muted-foreground">
            {snapshot ? t("Il PDF usa il modello del {data}.", { data: del ?? "" }) : t("Il preventivo usa il modello base. Puoi collegare un modello della libreria.")}
          </p>
        </div>
        {!snapshot && (scelte.length > 1 ? (
          <UniformSelect
            aria-label={t("Modello della libreria")}
            className="w-full rounded-md border bg-background px-2 py-1 text-sm"
            value={scelto?.id}
            onChange={(e) => setScelta(e.target.value)}
            disabled={inCorso}
          >
            {scelte.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </UniformSelect>
        ) : <p className="text-sm font-medium">{scelto?.title}</p>)}
        <Button type="button" size="sm" variant="outline" disabled={inCorso} onClick={() => void applica(modelId)}>
          {inCorso ? attesa : etichetta}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
