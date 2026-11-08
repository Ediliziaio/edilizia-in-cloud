// src/components/settings/TipiLavoroConfig.tsx
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { useProfiloLavori } from "@/hooks/useProfiloLavori";
import { ETICHETTE_TIPI, regolaDiPartenzaMisure, TIPI_CON_MISURE, TIPI_LAVORO, type TipoLavoro } from "@/lib/orders/tipiLavoro";

interface Props {
  puoModificare: boolean;
  evidenziata?: boolean;
}

/**
 * «I lavori che facciamo» (07/11/2026): decide quali modelli e proposte vede
 * l'azienda quando apre una commessa. Chi fa solo serramenti vede solo serramenti.
 * Finché l'azienda non sceglie, valgono i lavori del suo settore.
 */
export default function TipiLavoroConfig({ puoModificare, evidenziata = false }: Props) {
  const { salva, misureRegola } = useImpostazioniAvvio();
  const { profilo } = useProfiloLavori();
  const attivi = new Set(profilo.tipi);

  const cambia = (tipo: TipoLavoro, acceso: boolean) => {
    const scelti = TIPI_LAVORO.filter((t) => (t === tipo ? acceso : attivi.has(t)));
    // Togliere tutto vuol dire «non lo so»: si torna al settore.
    salva.mutate({ tipiLavoro: scelti.length ? scelti : null });
  };

  const regolaDi = (t: TipoLavoro) => misureRegola[t] ?? regolaDiPartenzaMisure(t);
  const cambiaRegola = (t: TipoLavoro, sopralluogo: boolean) =>
    salva.mutate({ misureRegola: { ...misureRegola, [t]: sopralluogo ? "sopralluogo" : "definitive" } });

  const spiegazione = profilo.origine === "scelti"
    ? "Scelti dall'azienda."
    : profilo.origine === "settore"
      ? "Per ora li deduciamo dal settore dell'azienda: confermali o cambiali."
      : "Non sappiamo ancora che lavori fate, quindi ti proponiamo tutti i modelli. Spunta i vostri e vedrai solo quelli.";

  return (
    <SezioneImpostazione
      id="lavori"
      titolo="I lavori che facciamo"
      descrizione="Quando apri una commessa ti proponiamo solo i modelli standard di questi lavori. I modelli già nella lista della tua azienda restano tutti."
      ambito={<AmbitoImpostazione>Commesse nuove</AmbitoImpostazione>}
      azione={<span>Si salva subito</span>}
      evidenziata={evidenziata}
    >
      <div className="px-4 py-4">
        <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0" disabled={!puoModificare || salva.isPending}>
          <legend className="sr-only">I lavori che facciamo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIPI_LAVORO.map((t) => (
              <div key={t} className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox id={`tipo-lavoro-${t}`} checked={attivi.has(t)} onCheckedChange={(v) => cambia(t, v === true)} disabled={!puoModificare || salva.isPending} />
                <Label htmlFor={`tipo-lavoro-${t}`} className="cursor-pointer text-sm font-normal">{ETICHETTE_TIPI[t]}</Label>
              </div>
            ))}
          </div>
          {profilo.tipi.some((t) => TIPI_CON_MISURE.includes(t)) && (
            <div className="space-y-2 pt-2">
              <p className="text-sm font-medium">Si ordina dopo il sopralluogo</p>
              <p className="text-xs text-muted-foreground">Spunta se le misure definitive le prende un tecnico dopo il contratto: l'ordine aspetta la conferma. Senza spunta valgono quelle del preventivo.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {profilo.tipi.filter((t) => TIPI_CON_MISURE.includes(t)).map((t) => (
                  <div key={t} className="flex items-center gap-3 rounded-lg border p-3">
                    <Checkbox id={`misure-regola-${t}`} aria-label={`Sopralluogo per ${ETICHETTE_TIPI[t]}`} checked={regolaDi(t) === "sopralluogo"} onCheckedChange={(v) => cambiaRegola(t, v === true)} disabled={!puoModificare || salva.isPending} />
                    <Label htmlFor={`misure-regola-${t}`} className="cursor-pointer text-sm font-normal">{ETICHETTE_TIPI[t]}</Label>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <p role="status">{spiegazione}</p>
            {profilo.origine === "scelti" && puoModificare && (
              <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => salva.mutate({ tipiLavoro: null })}>
                Torna a quelli del settore
              </Button>
            )}
          </div>
        </fieldset>
      </div>
    </SezioneImpostazione>
  );
}
