import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RigaInterruttore } from "@/components/impostazioni/SezioneImpostazione";
import { MessaggioPerUtente, motivoDelRifiuto, righeToccate } from "@/lib/impostazioni/erroriPerUtente";

/**
 * Due interruttori opt-in nati da una richiesta specifica (serramentisti che
 * spezzano il contratto su due agevolazioni e incassano blocca prezzo):
 *
 *  • Bonus edilizi multipli → la commessa si ripartisce su più agevolazioni,
 *    ognuna con la sua causale di bonifico parlante e la sua ritenuta 11%.
 *    Default OFF: è una richiesta specifica di chi apre due pratiche sullo
 *    stesso contratto, le altre aziende vedono il solo Sì/No di sempre.
 *  • Blocca prezzo → versamenti che bloccano il listino, arrivano con bonifico
 *    ORDINARIO e vanno restituiti prima dei bonifici parlanti. Default ON per
 *    tutti: serve a chiunque incassi somme da ridare indietro. Chi non lo usa
 *    lo spegne da qui.
 *
 * 09/10/2026: righe della pagina (titolo, testo e interruttore collegati) e il salvataggio controlla l'esito:
 * se la regola di accesso non lascia modificare l'azienda l'aggiornamento non tocca righe, e prima la pagina
 * diceva «Bonus … attivati» lo stesso.
 */

type FlagKey = "bonus_multipli_enabled" | "blocca_prezzo_enabled";

export function BonusFiscaliToggles() {
  const { effectiveCompany, refreshAuth } = useAuth();
  const { toast } = useToast();

  const company = effectiveCompany as
    | { bonus_multipli_enabled?: boolean; blocca_prezzo_enabled?: boolean }
    | null;

  const [bonusMultipli, setBonusMultipli] = useState<boolean>(company?.bonus_multipli_enabled === true);
  // Default ON: solo un false esplicito spegne il blocca prezzo.
  const [bloccaPrezzo, setBloccaPrezzo] = useState<boolean>(company?.blocca_prezzo_enabled !== false);
  const [saving, setSaving] = useState<FlagKey | null>(null);

  const toggle = async (
    key: FlagKey,
    next: boolean,
    apply: (v: boolean) => void,
    labels: { on: string; off: string },
  ) => {
    if (!effectiveCompany?.id) return;
    const previous = !next;
    setSaving(key);
    apply(next); // ottimistico

    try {
      const { data, error } = await supabase
        .from("companies")
        .update({ [key]: next } as never)
        .eq("id", effectiveCompany.id)
        .select("id");
      if (error) throw error;
      if (righeToccate(data) === 0) throw new MessaggioPerUtente("Il tuo utente non può modificare i dati dell'azienda: chiedi a un amministratore.");
      toast({ title: next ? labels.on : labels.off });
      await refreshAuth();
    } catch (e) {
      apply(previous); // rollback
      toast({
        title: "Non salvato",
        description: motivoDelRifiuto(e, "Impossibile aggiornare l'impostazione."),
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  const inCorso = (chiave: FlagKey) => (saving === chiave ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Salvataggio" /> : undefined);

  return (
    <>
      <RigaInterruttore
        id="bonus-multipli-toggle"
        titolo="Bonus edilizi multipli"
        descrizione="Per le commesse con più agevolazioni sullo stesso contratto (per esempio metà Ecobonus infissi, metà sicurezza): ogni agevolazione ha la sua pratica, la sua causale di bonifico e la sua ritenuta dell'11%. Spento, la commessa ha il solo interruttore «Bonus edilizio»."
        checked={bonusMultipli}
        disabled={saving !== null}
        ambito={inCorso("bonus_multipli_enabled")}
        onCheckedChange={(v) =>
          toggle("bonus_multipli_enabled", v, setBonusMultipli, {
            on: "Bonus edilizi multipli attivati",
            off: "Bonus edilizi multipli disattivati",
          })
        }
      />
      <RigaInterruttore
        id="blocca-prezzo-toggle"
        titolo="Blocca prezzo"
        descrizione="Per registrare le somme versate dal cliente per bloccare il prezzo del listino: entrano con bonifico ordinario, non fanno parte delle rate e vanno restituite prima dei bonifici parlanti, altrimenti il cliente perde la detrazione su quell'importo."
        checked={bloccaPrezzo}
        disabled={saving !== null}
        ambito={inCorso("blocca_prezzo_enabled")}
        onCheckedChange={(v) =>
          toggle("blocca_prezzo_enabled", v, setBloccaPrezzo, {
            on: "Blocca prezzo attivato",
            off: "Blocca prezzo disattivato",
          })
        }
      />
    </>
  );
}
