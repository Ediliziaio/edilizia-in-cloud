// src/components/settings/AcquistiMaterialiConfig.tsx
// Impostazioni → Acquisti e materiali: se i materiali si comprano solo dopo la
// validazione del tecnico, e i dati che servono al fabbisogno (giorni di
// consegna, promemoria all'ufficio acquisti).
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RigaImpostazione, RigaInterruttore, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useImpostazioniAcquisti, useQuantiValidatori, type ImpostazioniAcquisti } from "@/hooks/useImpostazioniAcquisti";

export default function AcquistiMaterialiConfig({ puoModificare }: { puoModificare: boolean }) {
  const { impostazioni, isLoading, salva, salvaConferma } = useImpostazioniAcquisti();
  // Il modulo riparte dai valori salvati quando arrivano (o cambiano da un'altra scheda).
  const chiave = `${impostazioni.validazione_obbligatoria}-${impostazioni.giorni_consegna_predefiniti}-${impostazioni.promemoria_attivo}-${impostazioni.conferma_giorni_promemoria}-${impostazioni.conferma_tolleranza_mm}`;
  return <Modulo key={chiave} iniziali={impostazioni} isLoading={isLoading} salva={salva} salvaConferma={salvaConferma} puoModificare={puoModificare} />;
}

function Modulo({ iniziali, isLoading, salva, salvaConferma, puoModificare }: {
  iniziali: ImpostazioniAcquisti;
  isLoading: boolean;
  salva: ReturnType<typeof useImpostazioniAcquisti>["salva"];
  salvaConferma: ReturnType<typeof useImpostazioniAcquisti>["salvaConferma"];
  puoModificare: boolean;
}) {
  const validatori = useQuantiValidatori();
  const [giorniConferma, setGiorniConferma] = useState(String(iniziali.conferma_giorni_promemoria ?? 3));
  const [tolleranza, setTolleranza] = useState(String(iniziali.conferma_tolleranza_mm ?? 5));
  const salvaControllo = () => {
    const g = Number(giorniConferma);
    const t = Number(tolleranza.replace(",", "."));
    if (!Number.isInteger(g) || g < 1 || g > 60 || !Number.isFinite(t) || t < 0 || t > 50) {
      setGiorniConferma(String(iniziali.conferma_giorni_promemoria ?? 3));
      setTolleranza(String(iniziali.conferma_tolleranza_mm ?? 5));
      return;
    }
    if (g !== iniziali.conferma_giorni_promemoria || t !== iniziali.conferma_tolleranza_mm) salvaConferma.mutate({ giorni: g, tolleranza: t });
  };
  const [bozza, setBozza] = useState<ImpostazioniAcquisti>(iniziali);
  const [giorni, setGiorni] = useState(String(iniziali.giorni_consegna_predefiniti));

  const bloccato = !puoModificare || isLoading || salva.isPending;
  const scrivi = (nuove: ImpostazioniAcquisti) => {
    setBozza(nuove);
    salva.mutate(nuove);
  };
  const salvaGiorni = () => {
    // Vuoto non vuol dire zero: si torna al valore salvato.
    const n = giorni.trim() === "" ? Number.NaN : Number(giorni);
    if (!Number.isInteger(n) || n < 0 || n > 365) {
      setGiorni(String(bozza.giorni_consegna_predefiniti));
      return;
    }
    if (n !== bozza.giorni_consegna_predefiniti) scrivi({ ...bozza, giorni_consegna_predefiniti: n });
  };

  return (
    <div className="space-y-4">
      <SezioneImpostazione
        id="validazione"
        titolo="Validazione del tecnico"
        descrizione="La distinta dei materiali, calcolata dal computo, la controlla il tecnico prima che la veda l'ufficio acquisti."
      >
        <RigaInterruttore
          id="validazione-obbligatoria"
          titolo="I materiali si comprano solo dopo la validazione del tecnico"
          descrizione={bozza.validazione_obbligatoria
            ? "Acceso: nessun ordine né richiesta d'offerta per i materiali di una fase che il tecnico non ha validato, o che non è in una fase."
            : "Spento: si ordina come sempre. Solo una fase mandata al tecnico resta ferma finché lui non la valida o la rimanda indietro."}
          checked={bozza.validazione_obbligatoria}
          disabled={bloccato}
          onCheckedChange={(v) => scrivi({ ...bozza, validazione_obbligatoria: v })}
        >
          {bozza.validazione_obbligatoria && validatori.data === 0 && (
            <Alert className="mt-2">
              <AlertDescription className="text-xs">
                Nessun dipendente ha il permesso «Valida distinta»: per ora può validare solo l'amministratore.
                Lo assegni in Dipendenti → Permessi, altrimenti gli acquisti restano fermi ad aspettarlo.
              </AlertDescription>
            </Alert>
          )}
        </RigaInterruttore>
      </SezioneImpostazione>

      <SezioneImpostazione
        id="fabbisogno"
        titolo="Fabbisogno e promemoria"
        descrizione="Entro quando ordinare: l'inizio della fase meno i giorni di consegna del fornitore."
      >
        <RigaImpostazione
          titolo="Giorni di consegna predefiniti"
          descrizione="Quando il fornitore non ha i suoi giorni di consegna (si scrivono nella sua scheda)."
          htmlFor="giorni-consegna"
          comando={
            <div className="flex items-center gap-1.5">
              <Input
                id="giorni-consegna"
                inputMode="numeric"
                className="h-8 w-16 text-right tabular-nums"
                value={giorni}
                disabled={bloccato}
                onChange={(e) => setGiorni(e.target.value)}
                onBlur={salvaGiorni}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                aria-describedby="giorni-consegna-descrizione"
              />
              <span className="text-xs text-muted-foreground">giorni</span>
            </div>
          }
        />
        <RigaInterruttore
          id="promemoria-acquisti"
          titolo="Promemoria all'ufficio acquisti"
          descrizione="Ogni mattina una notifica con i materiali da ordinare in ritardo o entro 7 giorni. Arriva a chi ha il permesso «Acquisti» e agli amministratori."
          checked={bozza.promemoria_attivo}
          disabled={bloccato}
          onCheckedChange={(v) => scrivi({ ...bozza, promemoria_attivo: v })}
        />
      </SezioneImpostazione>

      <SezioneImpostazione
        id="controllo-conferma"
        titolo="Conferma del fornitore"
        descrizione="Per i beni su misura: quanto può scostarsi una misura e quanto aspettare la conferma."
      >
        <RigaImpostazione
          titolo="Tolleranza sulle misure"
          descrizione="Fino a questo scarto la differenza è gialla, oltre è un errore."
          htmlFor="conferma-tolleranza"
          comando={
            <div className="flex items-center gap-1.5">
              <Input id="conferma-tolleranza" inputMode="decimal" className="h-8 w-16 text-right tabular-nums" value={tolleranza} disabled={bloccato}
                onChange={(e) => setTolleranza(e.target.value)} onBlur={salvaControllo} />
              <span className="text-xs text-muted-foreground">mm</span>
            </div>
          }
        />
        <RigaImpostazione
          titolo="Promemoria se la conferma non arriva"
          descrizione="Dopo quanti giorni dall'invio dell'ordine, se nessuna conferma è stata controllata."
          htmlFor="conferma-giorni"
          comando={
            <div className="flex items-center gap-1.5">
              <Input id="conferma-giorni" inputMode="numeric" className="h-8 w-16 text-right tabular-nums" value={giorniConferma} disabled={bloccato}
                onChange={(e) => setGiorniConferma(e.target.value)} onBlur={salvaControllo} />
              <span className="text-xs text-muted-foreground">giorni</span>
            </div>
          }
        />
      </SezioneImpostazione>

      {!puoModificare && (
        <p className="text-xs text-muted-foreground">Le cambia l'amministratore o chi modifica la configurazione ordini.</p>
      )}
      {salva.isError && (
        <Button type="button" size="sm" variant="outline" onClick={() => salva.mutate(bozza)}>Riprova a salvare</Button>
      )}
    </div>
  );
}
