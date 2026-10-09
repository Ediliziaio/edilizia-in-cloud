// src/components/settings/NuovaCommessaConfig.tsx
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AmbitoImpostazione, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { useImpostazioniAvvio } from "@/hooks/useImpostazioniAvvio";
import { useModelliFasi } from "@/hooks/useModelliFasi";
import { CONTROLLI_AVVIO, CONTROLLI_DI_PARTENZA, type ControlloAvvio } from "@/lib/orders/nuovaCommessa";

const NESSUNO = "__nessuno__";

interface NuovaCommessaConfigProps {
  puoModificare: boolean;
  /** La sezione è quella a cui porta l'indirizzo con l'àncora (`…/modelli-fasi#nuova-commessa`). */
  evidenziata?: boolean;
  /** Porta alla sezione dei modelli (nella stessa pagina): per chi non ne ha ancora, è il passo da fare. */
  onVaiAiModelli?: () => void;
}

/** «Quando apri una commessa»: le fasi di partenza e cosa controllare. Tutto facoltativo. */
export default function NuovaCommessaConfig({ puoModificare, evidenziata = false, onVaiAiModelli }: NuovaCommessaConfigProps) {
  const { modelli, isLoading: modelliInCaricamento, disponibile } = useModelliFasi();
  const { modelloFasi, controlli, salva } = useImpostazioniAvvio();
  // Solo i modelli già dell'azienda si possono scegliere: quelli di partenza diventano suoi con «Importa modelli standard»
  // (la pagina dei modelli non scrive niente da sola quando si apre, dall'08/10/2026). Nel modulo di nuova commessa invece
  // si offrono anche i modelli di partenza non ancora importati.
  const propri = modelli.filter((m) => m.origine === "azienda");
  // Senza modelli suoi il menu offre solo «Nessuna»: si dice perché e qual è il passo da fare.
  const senzaModelliPropri = !modelliInCaricamento && disponibile !== false && propri.length === 0;

  const cambiaControllo = (chiave: ControlloAvvio, attivo: boolean) => {
    const scelti = new Set(attivo ? [...controlli, chiave] : controlli.filter((c) => c !== chiave));
    salva.mutate({ controlli: CONTROLLI_DI_PARTENZA.filter((c) => scelti.has(c)) });
  };

  return (
    <SezioneImpostazione
      id="nuova-commessa"
      titolo="Quando apri una commessa"
      descrizione="Con quali fasi parte una commessa nuova e cosa ti ricorda il riquadro «Cantiere da organizzare». Sono scelte facoltative."
      ambito={<AmbitoImpostazione>Commesse nuove</AmbitoImpostazione>}
      azione={<span>Si salva subito</span>}
      evidenziata={evidenziata}
    >
      <div className="space-y-2 px-4 py-4">
        <Label htmlFor="fasi-di-partenza" className="text-sm font-medium">Fasi di partenza</Label>
        <Select
          value={modelloFasi ?? NESSUNO}
          onValueChange={(v) => salva.mutate({ modelloFasi: v === NESSUNO ? null : v })}
          disabled={!puoModificare}
        >
          <SelectTrigger id="fasi-di-partenza" className="max-w-sm" aria-label="Fasi di partenza" aria-describedby="fasi-di-partenza-descrizione">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NESSUNO}>Nessuna: le scelgo io, commessa per commessa</SelectItem>
            {propri.map((m) => (
              <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id="fasi-di-partenza-descrizione" className="text-xs text-muted-foreground">
          Una commessa che nasce senza fasi le riceve da questo modello (si può cambiare o togliere nel modulo di nuova commessa). Le commesse che hai già non cambiano.
        </p>
        {senzaModelliPropri && (
          <p role="note" className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {puoModificare ? (
              <>
                Non hai ancora modelli tuoi. Importa quelli standard o creane uno nella sezione{" "}
                {onVaiAiModelli ? (
                  <a
                    href="#modelli"
                    onClick={(evento) => { evento.preventDefault(); onVaiAiModelli(); }}
                    className="font-medium text-primary underline"
                  >
                    «Modelli di fasi»
                  </a>
                ) : (
                  <strong className="font-medium text-foreground">«Modelli di fasi»</strong>
                )}
                , poi scegli qui.
              </>
            ) : (
              "Non ci sono ancora modelli dell'azienda: li prepara chi gestisce le impostazioni delle commesse."
            )}
          </p>
        )}
      </div>

      {/* Il fieldset sta dentro un blocco: il suo «legend» non deve cadere sulla riga di separazione fra i blocchi. */}
      <div className="px-4 py-4">
        <fieldset className="m-0 min-w-0 space-y-2 border-0 p-0" disabled={!puoModificare}>
          <legend className="mb-2 text-sm font-medium">Cosa ti ricorda «Cantiere da organizzare»</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {CONTROLLI_AVVIO.map((c) => (
              <div key={c.chiave} className="flex items-center gap-3 rounded-lg border p-3">
                <Checkbox
                  id={`controllo-${c.chiave}`}
                  checked={controlli.includes(c.chiave)}
                  onCheckedChange={(v) => cambiaControllo(c.chiave, v === true)}
                  disabled={!puoModificare}
                />
                <Label htmlFor={`controllo-${c.chiave}`} className="cursor-pointer text-sm font-normal">{c.etichetta}</Label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Il riquadro compare nella panoramica di una commessa solo se manca qualcosa di quello che spunti qui. Togli quello che non usi.
          </p>
        </fieldset>
      </div>
    </SezioneImpostazione>
  );
}
