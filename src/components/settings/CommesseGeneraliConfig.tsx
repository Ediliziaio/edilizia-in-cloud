// src/components/settings/CommesseGeneraliConfig.tsx
// Impostazioni → Commesse generali: quali tipi l'azienda usa. Spento = la scelta non compare
// da nessuna parte; le generali già create restano visibili e si possono ancora usare.
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AmbitoImpostazione, RigaInterruttore, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { messaggioGenerale, useImpostazioniCommesseGenerali } from "@/hooks/useCommesseGenerali";
import { DEFINIZIONI_MODELLI, MODELLI_GENERALE, isModelloGenerale, type ModelloGenerale } from "@/lib/orders/commesseGenerali";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Quante generali ha già l'azienda per ogni tipo: spegnendo un tipo usato, si dice che restano. */
function useGeneraliPerModello() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["commesse-generali-per-modello", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<Partial<Record<ModelloGenerale, number>>> => {
      try {
        const { data, error } = await db.from("commesse_generali").select("modello").eq("company_id", companyId!);
        if (error) throw error;
        const conti: Partial<Record<ModelloGenerale, number>> = {};
        for (const r of (data ?? []) as { modello: unknown }[]) if (isModelloGenerale(r.modello)) conti[r.modello] = (conti[r.modello] ?? 0) + 1;
        return conti;
      } catch {
        return {};
      }
    },
  });
}

export default function CommesseGeneraliConfig({ puoModificare, evidenziata = false }: { puoModificare: boolean; evidenziata?: boolean }) {
  const { modelli, disponibile, isLoading, salva } = useImpostazioniCommesseGenerali();
  const { data: conti = {} } = useGeneraliPerModello();

  const cambia = (m: ModelloGenerale, acceso: boolean) => {
    const scelti = acceso ? [...modelli, m] : modelli.filter((x) => x !== m);
    salva.mutate(scelti, {
      onSuccess: () => toast.success(acceso ? `«${DEFINIZIONI_MODELLI[m].nome}» è attivo: lo trovi in «Nuova commessa»` : `«${DEFINIZIONI_MODELLI[m].nome}» è spento`),
      onError: (e) => toast.error(messaggioGenerale(e, "questa impostazione")),
    });
  };

  return (
    <SezioneImpostazione
      id="tipi"
      titolo="Tipi di commessa generale"
      descrizione="Una commessa generale raccoglie più commesse e ne somma i numeri. Accendi solo i tipi che usi: gli altri non compaiono da nessuna parte."
      ambito={<AmbitoImpostazione>Tutta l'azienda</AmbitoImpostazione>}
      azione={<span>Si salva subito</span>}
      evidenziata={evidenziata}
    >
      {!disponibile && (
        <div className="px-4 py-3">
          <Alert>
            <AlertDescription>Le commesse generali non sono ancora disponibili per la tua azienda. Riprova più tardi.</AlertDescription>
          </Alert>
        </div>
      )}
      {MODELLI_GENERALE.map((m) => {
        const def = DEFINIZIONI_MODELLI[m];
        const acceso = modelli.includes(m);
        const esistenti = conti[m] ?? 0;
        return (
          <RigaInterruttore
            key={m}
            id={`modello-generale-${m}`}
            titolo={def.nome}
            descrizione={def.perChi}
            checked={acceso}
            disabled={!puoModificare || !disponibile || isLoading || salva.isPending}
            onCheckedChange={(v) => cambia(m, v)}
          >
            <p className="mt-1 text-xs text-muted-foreground">
              Dentro ci sono {def.figlia.tante.toLowerCase()}. Esempio: {def.esempio}.
            </p>
            {!acceso && esistenti > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {esistenti === 1 ? "Hai già una commessa generale di questo tipo: resta visibile." : `Hai già ${esistenti} commesse generali di questo tipo: restano visibili.`}
              </p>
            )}
          </RigaInterruttore>
        );
      })}
    </SezioneImpostazione>
  );
}
