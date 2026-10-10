import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Save } from "lucide-react";
import { toast } from "sonner";

import { FEABannerEsVsFea } from "@/components/fea/FEABannerEsVsFea";
import {
  AmbitoImpostazione,
  RigaImpostazione,
  RigaInterruttore,
  SezioneImpostazione,
} from "@/components/impostazioni/SezioneImpostazione";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { usePermissions } from "@/hooks/usePermissions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { TESTO_RECESSO_DI_LEGGE, eLaFraseSalvataPerSbaglio } from "@/lib/fea/testoRecessoDiLegge";
import { userErrorMessage } from "@/lib/userErrorMessage";

type FeaConfig = Database["public"]["Tables"]["fea_configurazione"]["Row"];
type PreventivoImpostazioni = Pick<
  Database["public"]["Tables"]["preventivo_impostazioni"]["Row"],
  "firma_digitale_abilitata"
>;

/** Quello che il titolare ha cambiato e non ha ancora salvato: un campo assente = non toccato. */
type Bozza = { firma?: boolean; testo?: string };

type EsitoSalvataggio = { firmaScritta: boolean; testoScritto: boolean; errore: unknown };

export default function SettingsFirmaElettronica() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  // La firma dei preventivi e il testo del recesso li cambia chi ha le
  // integrazioni in modifica: è la regola del database dal 26/09/2026.
  const puoModificare = usePermissions().canEditSettingsIntegrations;

  const [bozza, setBozza] = useState<Bozza>({});

  const { data: feaConfig, isLoading: isLoadingFea, isError: isErrorFea, refetch: riprovaFea } = useQuery<FeaConfig | null>({
    queryKey: ["fea-configurazione", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fea_configurazione")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  const { data: preventivoSettings, isLoading: isLoadingPreventivi, isError: isErrorPreventivi, refetch: riprovaPreventivi } = useQuery<PreventivoImpostazioni | null>({
    queryKey: ["preventivo-impostazioni-firma", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("preventivo_impostazioni")
        .select("firma_digitale_abilitata")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
  });

  // I valori mostrati sono quelli del database, a meno che il titolare non li abbia cambiati.
  const firmaDalServer = preventivoSettings?.firma_digitale_abilitata ?? true;
  const testoDalServer = feaConfig?.testo_recesso_b2c ?? "";
  const firmaPreventivi = bozza.firma ?? firmaDalServer;
  const testoRecessoB2c = bozza.testo ?? testoDalServer;
  const firmaCambiata = bozza.firma !== undefined && bozza.firma !== firmaDalServer;
  const testoCambiato = bozza.testo !== undefined && bozza.testo.trim() !== testoDalServer.trim();
  const isDirty = firmaCambiata || testoCambiato;

  // Ricaricamento e link interni chiedono conferma se ci sono modifiche non salvate.
  useSettingsDraftGuard(isDirty);

  // Si scrive soltanto ciò che è cambiato. Prima ogni salvataggio, anche col solo interruttore toccato, riscriveva
  // anche il testo del recesso (con una frase che non parlava di recesso). Il campo vuoto resta vuoto (`null`): il
  // cliente legge allora il testo di legge. Le due scritture sono indipendenti: se una fallisce, l'altra resta fatta.
  const saveMutation = useMutation({
    mutationFn: async (): Promise<EsitoSalvataggio> => {
      if (!companyId) throw new Error("Azienda non disponibile.");
      if (!puoModificare) throw new Error("Le impostazioni della firma le cambia chi ha il permesso «Integrazioni» in modifica.");
      const testo = testoRecessoB2c.trim();
      const [esitoTesto, esitoFirma] = await Promise.all([
        testoCambiato
          ? supabase
              .from("fea_configurazione")
              .upsert(
                { company_id: companyId, testo_recesso_b2c: testo || null, updated_at: new Date().toISOString() },
                { onConflict: "company_id" },
              )
          : null,
        firmaCambiata
          ? supabase
              .from("preventivo_impostazioni")
              .upsert(
                {
                  company_id: companyId,
                  firma_digitale_abilitata: firmaPreventivi,
                  // Prima riga dell'azienda: la colonna ha come predefinito 20 e «Marginalità cantieri» la usa come
                  // margine obiettivo di ripiego (20% invece del 10% di sempre). Come fa «Prezzo e margini», alla
                  // creazione si scrive vuota; con la riga già presente non si tocca.
                  ...(preventivoSettings ? {} : { soglia_margine_visibile: null }),
                },
                { onConflict: "company_id" },
              )
          : null,
      ]);
      return {
        testoScritto: !!esitoTesto && !esitoTesto.error,
        firmaScritta: !!esitoFirma && !esitoFirma.error,
        errore: esitoTesto?.error ?? esitoFirma?.error ?? null,
      };
    },
    onSuccess: async (esito) => {
      await Promise.all([
        esito.testoScritto ? queryClient.invalidateQueries({ queryKey: ["fea-configurazione", companyId] }) : null,
        esito.firmaScritta ? queryClient.invalidateQueries({ queryKey: ["preventivo-impostazioni-firma", companyId] }) : null,
        esito.firmaScritta ? queryClient.invalidateQueries({ queryKey: ["preventivo-impostazioni", companyId] }) : null,
      ]);
      // Si toglie dalla bozza solo ciò che è stato scritto davvero: il resto resta da salvare.
      setBozza((prima) => {
        const resto = { ...prima };
        if (esito.firmaScritta) delete resto.firma;
        if (esito.testoScritto) delete resto.testo;
        return resto;
      });
      if (esito.errore) {
        toast.error(esito.firmaScritta || esito.testoScritto ? "Una parte è stata salvata, il resto no" : "Non sono riuscito a salvare", {
          description: userErrorMessage(esito.errore),
        });
      } else {
        toast.success("Impostazioni salvate");
      }
    },
    onError: (error) => {
      toast.error("Non sono riuscito a salvare", { description: userErrorMessage(error) });
    },
  });

  const isLoading = isLoadingFea || isLoadingPreventivi;
  const isErrorConfig = isErrorFea || isErrorPreventivi;
  const { evidenziata } = useVaiASezione(!isLoading && !isErrorConfig);

  if (isErrorConfig) {
    return (
      <div className="max-w-3xl space-y-4">
        <Alert variant="destructive">
          <AlertTitle>Non riesco a leggere le impostazioni della firma</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Nessuna modifica verrà salvata.
            <Button size="sm" variant="outline" onClick={() => { void riprovaFea(); void riprovaPreventivi(); }}>
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const comandiSpenti = isLoading || !puoModificare || saveMutation.isPending;

  return (
    <div className="max-w-3xl space-y-4">
      {!puoModificare && (
        <Alert>
          <AlertDescription>
            Stai consultando le impostazioni: le cambia chi ha il permesso «Integrazioni» in modifica.
          </AlertDescription>
        </Alert>
      )}

      <SezioneImpostazione
        id="firma-sul-preventivo"
        titolo="Firma dei preventivi"
        descrizione="Il cliente firma dal link che riceve, senza stampare niente."
        ambito={<AmbitoImpostazione>Preventivo generico</AmbitoImpostazione>}
        evidenziata={evidenziata === "firma-sul-preventivo"}
      >
        <RigaInterruttore
          id="firma-preventivi"
          titolo="Firma elettronica sui preventivi"
          descrizione="Il cliente firma il preventivo online, con il codice OTP, dal link che riceve. Il PDF non porta più il codice QR."
          checked={firmaPreventivi}
          disabled={comandiSpenti}
          onCheckedChange={(valore) => setBozza((prima) => ({ ...prima, firma: valore }))}
        >
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer py-1">Cosa cambia se lo spengo</summary>
            <p className="mt-1">
              È il valore di partenza dei nuovi preventivi: nel singolo preventivo si può cambiare. Quando mandi un
              preventivo al cliente per la firma, la firma online c'è sempre. La stessa impostazione c'è anche in
              Modelli di preventivo → Prezzo e margini.
            </p>
          </details>
        </RigaInterruttore>
      </SezioneImpostazione>

      <SezioneImpostazione
        id="ripensamento"
        titolo="Firma con il codice"
        descrizione="Preventivi fotovoltaici, ordini, varianti e documenti di cantiere che mandi a firmare con il codice."
        ambito={<AmbitoImpostazione>Clienti privati</AmbitoImpostazione>}
        evidenziata={evidenziata === "ripensamento"}
      >
        <RigaImpostazione
          titolo="Informativa sul diritto di ripensamento"
          htmlFor="testo-recesso"
          descrizione="La legge il cliente privato prima di firmare, nella pagina di firma con il codice, sotto il titolo «Diritto di recesso». Se la lasci vuota vale il testo di legge: 14 giorni, senza dover dare spiegazioni."
        >
          <div className="mt-2 space-y-2">
            {eLaFraseSalvataPerSbaglio(testoDalServer) && (
              <Alert variant="destructive">
                <AlertTitle>Questo testo non è un diritto di ripensamento</AlertTitle>
                <AlertDescription>
                  È la frase che questa pagina metteva da sola nel campo. Il cliente privato la legge adesso al posto
                  dell'informativa dei 14 giorni. Cancellala e salva: tornerà il testo di legge.
                </AlertDescription>
              </Alert>
            )}
            <Textarea
              id="testo-recesso"
              aria-describedby="testo-recesso-descrizione testo-recesso-dove"
              value={testoRecessoB2c}
              onChange={(event) => setBozza((prima) => ({ ...prima, testo: event.target.value }))}
              rows={5}
              disabled={comandiSpenti}
              placeholder="Vuota: il cliente legge il testo di legge."
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer py-1">Testo di legge che vale se lasci vuoto</summary>
              <p className="mt-1">{TESTO_RECESSO_DI_LEGGE}</p>
            </details>
            <p id="testo-recesso-dove" className="text-xs text-muted-foreground">
              Il cliente non la legge se firma il preventivo dal suo link: quella si scrive in{" "}
              <Link to="/azienda/impostazioni/condizioni-firma" className="text-primary underline">
                Firma e condizioni
              </Link>
              .
            </p>
          </div>
        </RigaImpostazione>
      </SezioneImpostazione>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1 text-sm text-muted-foreground">
        <span>Le firme non partono da questa pagina: partono dal preventivo, dall'ordine o dal documento.</span>
        <Link to="/azienda/firma-elettronica" className="text-primary underline">
          Archivio delle firme
        </Link>
      </div>

      <details className="rounded-lg border bg-card px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Come funziona la firma</summary>
        <div className="mt-3 space-y-3">
          <p className="text-muted-foreground">
            Il cliente riceve un'email con un link sicuro e un codice (OTP) collegato alla richiesta. Ogni firma finisce
            nell'archivio delle firme, con lo stato e il registro di quello che è successo.
          </p>
          <FEABannerEsVsFea dismissible={false} />
        </div>
      </details>

      {puoModificare ? (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <div className="flex items-center gap-3 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
            <p
              role="status"
              className={cn(
                "text-xs",
                isDirty && !saveMutation.isPending ? "font-medium text-amber-700 dark:text-amber-400" : "text-muted-foreground max-sm:sr-only",
              )}
            >
              {saveMutation.isPending ? "Salvataggio…" : isDirty ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
            </p>
            <Button className="gap-2" onClick={() => saveMutation.mutate()} disabled={isLoading || saveMutation.isPending || !isDirty}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {saveMutation.isPending ? "Salvataggio..." : isDirty ? "Salva impostazioni" : "Impostazioni salvate"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
