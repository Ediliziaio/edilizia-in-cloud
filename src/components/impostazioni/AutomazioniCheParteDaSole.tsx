/**
 * Le automazioni che partono da sole, ognuna con il suo interruttore (19/10/2026).
 *
 * Erano accese di base per tutte le aziende, senza un modo per spegnerle: ora
 * partono solo se l'amministratore dell'azienda le accende qui. Il brief del
 * mattino e i messaggi agli operai si accendono invece nelle Automazioni del
 * bot WhatsApp, dove si sceglie anche a chi arrivano.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { MessaggioPerUtente, motivoDelRifiuto, righeToccate } from "@/lib/impostazioni/erroriPerUtente";

type Chiave = "giornale_auto_enabled" | "morning_briefing_enabled" | "promemoria_preventivo_cliente";

const VOCI: Array<{ chiave: Chiave; titolo: string; descrizione: string }> = [
  {
    chiave: "giornale_auto_enabled",
    titolo: "Giornale di cantiere scritto dall'AI",
    descrizione: "Ogni pomeriggio, per le commesse dove quel giorno ci sono rapportini, foto o segnalazioni. Usa il credito AI.",
  },
  {
    chiave: "morning_briefing_enabled",
    titolo: "Brief del mattino ai capisquadra",
    descrizione: "Un riepilogo AI della giornata a chi guida i cantieri. Usa il credito AI.",
  },
  {
    chiave: "promemoria_preventivo_cliente",
    titolo: "Promemoria al cliente per l'offerta in scadenza",
    descrizione: "Un'email al cliente 3 giorni e 1 giorno prima che scada il preventivo inviato. A chi ha fatto il preventivo il promemoria arriva comunque.",
  },
];

export function AutomazioniCheParteDaSole({ companyId, canEdit }: { companyId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [inSalvataggio, setInSalvataggio] = useState<Chiave | null>(null);
  const chiaveQuery = ["automazioni-che-partono-da-sole", companyId];

  const { data: stato, isError, refetch } = useQuery({
    queryKey: chiaveQuery,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies")
        .select("giornale_auto_enabled, morning_briefing_enabled, promemoria_preventivo_cliente")
        .eq("id", companyId).maybeSingle();
      if (error) throw error;
      return (data ?? {}) as Partial<Record<Chiave, boolean>>;
    },
  });

  const cambia = async (chiave: Chiave, acceso: boolean) => {
    setInSalvataggio(chiave);
    try {
      const { data, error } = await supabase.from("companies")
        .update({ [chiave]: acceso } as never).eq("id", companyId).select("id");
      if (error) throw error;
      if (righeToccate(data) === 0) throw new MessaggioPerUtente("Il tuo utente non può cambiare le impostazioni dell'azienda: chiedi all'amministratore.");
      queryClient.setQueryData(chiaveQuery, { ...(stato ?? {}), [chiave]: acceso });
      toast.success(acceso ? "Acceso" : "Spento");
    } catch (e) {
      toast.error(motivoDelRifiuto(e, "Non sono riuscito a salvare: riprova."));
    } finally {
      setInSalvataggio(null);
    }
  };

  return (
    <SezioneImpostazione
      id="cosa-parte-da-solo"
      titolo="Cosa parte da solo"
      descrizione={<>
        Niente parte se non lo accendi tu. Il brief del mattino e i messaggi agli operai si accendono nelle{" "}
        <Link to="/azienda/whatsapp?tab=automazioni" className="underline">Automazioni del bot WhatsApp</Link>, dove scegli anche a chi arrivano.
      </>}
    >
      {isError ? (
        <div className="p-4 text-sm text-muted-foreground">
          Non riesco a leggere le impostazioni.{" "}
          <button type="button" className="underline" onClick={() => void refetch()}>Riprova</button>
        </div>
      ) : (
        <div className="divide-y">
          {VOCI.map((v) => (
            <div key={v.chiave} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <Label htmlFor={`auto-${v.chiave}`} className="text-sm font-medium">{v.titolo}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{v.descrizione}</p>
              </div>
              <Switch
                id={`auto-${v.chiave}`}
                checked={stato?.[v.chiave] === true}
                disabled={!canEdit || !stato || inSalvataggio !== null}
                onCheckedChange={(acceso) => void cambia(v.chiave, acceso)}
                aria-label={v.titolo}
              />
            </div>
          ))}
        </div>
      )}
    </SezioneImpostazione>
  );
}
