import { useState } from "react";
import { Percent, Lock, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

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
      const { error } = await supabase
        .from("companies")
        .update({ [key]: next } as never)
        .eq("id", effectiveCompany.id);
      if (error) throw error;
      toast({ title: next ? labels.on : labels.off });
      await refreshAuth();
    } catch (e) {
      apply(previous); // rollback
      toast({
        title: "Errore",
        description: e instanceof Error ? e.message : "Impossibile aggiornare l'impostazione.",
        variant: "destructive",
      });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
              bonusMultipli ? "bg-amber-500/10" : "bg-muted"
            }`}
          >
            <Percent className={`h-5 w-5 ${bonusMultipli ? "text-amber-600" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="bonus-multipli-toggle" className="text-sm font-semibold">
              Bonus edilizi multipli
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dividi una commessa su più agevolazioni (es. metà Ecobonus infissi, metà misure
              antintrusione): due pratiche, due causali di bonifico parlante, ritenuta 11% calcolata
              su ciascuna. Spento (impostazione normale) la commessa ha il solo interruttore Bonus
              Edilizio, come sempre.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving === "bonus_multipli_enabled" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="bonus-multipli-toggle"
            checked={bonusMultipli}
            disabled={saving !== null}
            onCheckedChange={(v) =>
              toggle("bonus_multipli_enabled", v, setBonusMultipli, {
                on: "Bonus edilizi multipli attivati",
                off: "Bonus edilizi multipli disattivati",
              })
            }
          />
        </div>
      </div>

      <Separator />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
              bloccaPrezzo ? "bg-sky-500/10" : "bg-muted"
            }`}
          >
            <Lock className={`h-5 w-5 ${bloccaPrezzo ? "text-sky-600" : "text-muted-foreground"}`} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="blocca-prezzo-toggle" className="text-sm font-semibold">
              Blocca prezzo
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Registra le somme versate per bloccare il listino: entrano con bonifico ordinario, non
              fanno parte del piano rate e vanno restituite prima dei bonifici parlanti, altrimenti
              il cliente perde la detrazione su quell'importo.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saving === "blocca_prezzo_enabled" && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="blocca-prezzo-toggle"
            checked={bloccaPrezzo}
            disabled={saving !== null}
            onCheckedChange={(v) =>
              toggle("blocca_prezzo_enabled", v, setBloccaPrezzo, {
                on: "Blocca prezzo attivato",
                off: "Blocca prezzo disattivato",
              })
            }
          />
        </div>
      </div>
    </div>
  );
}
