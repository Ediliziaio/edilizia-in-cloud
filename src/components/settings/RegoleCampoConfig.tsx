/**
 * Impostazioni → Rapportini e presenze.
 *
 * Il software si adatta all'azienda, non il contrario: qui l'azienda sceglie
 * come lavorano i suoi cantieri e l'app degli operai e dei capocantiere si
 * comporta di conseguenza. Tre scelte, in parole semplici; senza scelte
 * l'app funziona come sempre.
 *
 * Il titolo della pagina lo mette il layout delle Impostazioni. Le scelte si salvano insieme, con «Salva modifiche»
 * (la barra resta in vista mentre si scorre), e uscire con una scelta cambiata chiede conferma.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Info, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRegoleAzienda, useSalvaRegoleAzienda } from "@/hooks/useRegoleCampo";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  REGOLE_COME_OGGI, SCOSTAMENTI_PROPOSTI, SCOSTAMENTO_PREDEFINITO, oreInTesto,
  type ChiCompila, type OreDalle, type RegoleCampo,
} from "@/lib/campo/regoleCampo";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

function Opzione({
  value, titolo, descrizione, scelta, disabilitata,
}: { value: string; titolo: string; descrizione: string; scelta: boolean; disabilitata: boolean }) {
  const id = `regola-${value}`;
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors",
        scelta ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        disabilitata && "cursor-not-allowed opacity-70",
      )}
    >
      <RadioGroupItem id={id} value={value} disabled={disabilitata} className="mt-1 shrink-0" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titolo}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{descrizione}</span>
      </span>
    </Label>
  );
}

/** «In pratica»: cosa vedranno operai e capi con queste scelte, a parole. */
function inPratica(r: RegoleCampo): string[] {
  const righe: string[] = [];
  righe.push(
    r.chiCompila === "capo"
      ? "Dove c’è un capocantiere, gli operai timbrano entrata e uscita e basta: niente promemoria del rapportino e niente ore da scrivere. Il rapportino del cantiere lo manda il capocantiere."
      : r.chiCompila === "ore_proprie"
        ? "Dove c’è un capocantiere, ogni operaio manda solo le sue ore; il racconto del cantiere (lavori, foto, avanzamento) lo fa il capocantiere. Un cantiere senza capocantiere resta come «ognuno il suo»."
        : "Ogni operaio scrive il rapportino della sua giornata. Il capocantiere può aggiungere la squadra.",
  );
  righe.push(
    r.oreDalle === "timbrature"
      ? "Nel rapportino di squadra le ore partono da quelle timbrate: il capo le controlla, aggiunge chi non ha timbrato e può correggerle."
      : "Nel rapportino di squadra il capo scrive a mano le ore di ognuno.",
  );
  righe.push(
    r.avvisoScostamentoMinuti != null
      ? `Se le ore scritte sono diverse da quelle timbrate di più di ${oreInTesto(r.avvisoScostamentoMinuti / 60)}, il capo vede un avviso.`
      : "Nessun avviso sulle differenze tra ore scritte e ore timbrate.",
  );
  // Vale qualunque sia la scelta: una riga in più, non un riquadro a parte.
  righe.push("Una persona non si conta mai due volte nello stesso giorno e cantiere: se il capo l’ha già segnata, il suo rapportino personale non chiede più le ore.");
  return righe;
}

/** Il database risponde in italiano per i rifiuti che l'utente può causare; gli altri errori non arrivano al titolare con il loro testo. */
function messaggioErroreSalvataggio(errore: unknown): string {
  const e = errore as { code?: string; message?: string } | null;
  if (e?.code === "42501") return "Non hai il permesso di cambiare queste scelte: le cambia chi ha «Configurazione Ordini» in modifica.";
  if (e?.code === "22023" && e.message) return e.message;
  return "Non sono riuscito a salvare. Riprova tra poco.";
}

export default function RegoleCampoConfig() {
  const { effectiveCompany, role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const companyId = effectiveCompany?.id;
  const { data, isLoading, isError, refetch } = useRegoleAzienda(companyId);
  const salva = useSalvaRegoleAzienda(companyId);

  // Le modifiche non ancora salvate: si parte da ciò che c'è, si salva a richiesta. La bozza è di UN'azienda: se si cambia
  // azienda (super amministratore) quella dell'altra non si vede.
  const [bozzaAzienda, setBozzaAzienda] = useState<{ companyId: string | undefined; regole: RegoleCampo } | null>(null);
  const bozza = bozzaAzienda && bozzaAzienda.companyId === companyId ? bozzaAzienda.regole : null;
  const salvate = data?.regole ?? REGOLE_COME_OGGI;
  const regole = bozza ?? salvate;
  const modificato = bozza != null && (
    bozza.chiCompila !== salvate.chiCompila ||
    bozza.oreDalle !== salvate.oreDalle ||
    bozza.avvisoScostamentoMinuti !== salvate.avvisoScostamentoMinuti
  );
  const cambia = (parte: Partial<RegoleCampo>) => {
    if (!puoModificare) return;
    setBozzaAzienda({ companyId, regole: { ...regole, ...parte } });
  };
  const annulla = () => setBozzaAzienda(null);
  useSettingsDraftGuard(modificato || salva.isPending);

  const conferma = () => {
    if (!puoModificare || !modificato || salva.isPending) return;
    salva.mutate(regole, {
      onSuccess: () => { setBozzaAzienda(null); toast.success("Impostazioni salvate"); },
      onError: (errore) => toast.error(messaggioErroreSalvataggio(errore)),
    });
  };

  if (isLoading) {
    return <div className="space-y-4" role="status" aria-label="Caricamento delle scelte"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;
  }
  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription className="flex flex-wrap items-center gap-3">
          Non riesco a leggere le impostazioni.
          <Button size="sm" variant="outline" onClick={() => refetch()}>Riprova</Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        Ogni azienda lavora a modo suo: qui scegli come funziona la tua. L’app degli operai e dei capocantiere
        si adatta alle tue scelte, su tutti i cantieri.
      </p>

      {!data?.sceltaFatta && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Non hai ancora scelto: per ora tutto funziona come sempre. Puoi cambiare idea quando vuoi.
          </AlertDescription>
        </Alert>
      )}
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}

      {/* disabled su un fieldset spegne ogni campo e pulsante che contiene. */}
      <fieldset disabled={!puoModificare || salva.isPending} className="m-0 min-w-0 space-y-4 border-0 p-0">
        {/* Il salvataggio resta in vista mentre si scorre: prima i pulsanti stavano in fondo, dopo cinque riquadri. */}
        {puoModificare && (
          <div className="sticky top-2 z-20 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
            <p
              role="status"
              className={cn(
                "mr-auto text-xs",
                salva.isPending || modificato ? "text-muted-foreground" : "sr-only",
                modificato && !salva.isPending && "font-medium text-amber-700 dark:text-amber-400",
              )}
            >
              {salva.isPending ? "Salvataggio…" : modificato ? "Modifiche non salvate" : "Nessuna modifica da salvare"}
            </p>
            {modificato && (
              <Button size="sm" variant="ghost" onClick={annulla} disabled={salva.isPending}>
                Annulla le modifiche
              </Button>
            )}
            <Button size="sm" onClick={conferma} disabled={!modificato || salva.isPending}>
              {salva.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salva modifiche
            </Button>
          </div>
        )}

        <SezioneImpostazione
          id="chi-scrive"
          titolo="Chi scrive il rapportino del cantiere?"
          descrizione="Il racconto della giornata: cosa si è fatto, foto, materiali, avanzamento."
        >
          <div className="px-4 py-4">
            <RadioGroup
              aria-labelledby="chi-scrive-titolo"
              value={regole.chiCompila}
              onValueChange={(v) => cambia({ chiCompila: v as ChiCompila })}
              className="grid gap-3"
            >
              <Opzione
                value="ognuno" titolo="Ognuno il suo"
                descrizione="Ogni operaio scrive il rapportino della propria giornata. Il capocantiere può aggiungere la squadra."
                scelta={regole.chiCompila === "ognuno"} disabilitata={!puoModificare}
              />
              <Opzione
                value="capo" titolo="Lo scrive il capocantiere"
                descrizione="Un solo rapportino per cantiere e per giorno, del capocantiere (o del caposquadra per la sua squadra). Gli operai timbrano entrata e uscita e basta. Un cantiere senza capocantiere resta come «ognuno il suo»."
                scelta={regole.chiCompila === "capo"} disabilitata={!puoModificare}
              />
              <Opzione
                value="ore_proprie" titolo="Il racconto al capo, le ore a ognuno"
                descrizione="Il racconto del cantiere (lavori, foto, avanzamento) lo fa il capocantiere; ogni operaio manda solo le proprie ore. Un cantiere senza capocantiere resta come «ognuno il suo»."
                scelta={regole.chiCompila === "ore_proprie"} disabilitata={!puoModificare}
              />
            </RadioGroup>
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione
          id="ore"
          titolo="Da dove vengono le ore di ognuno?"
          descrizione="Vale per il rapportino di squadra, quello in cui il capo segna chi ha lavorato."
        >
          <div className="px-4 py-4">
            <RadioGroup
              aria-labelledby="ore-titolo"
              value={regole.oreDalle}
              onValueChange={(v) => cambia({ oreDalle: v as OreDalle })}
              className="grid gap-3"
            >
              <Opzione
                value="capo" titolo="Le scrive il capo"
                descrizione="Il capo scrive a mano le ore di ogni persona che era in cantiere."
                scelta={regole.oreDalle === "capo"} disabilitata={!puoModificare}
              />
              <Opzione
                value="timbrature" titolo="Dalle timbrature"
                descrizione="Le ore partono da quelle timbrate in cantiere. Il capo le controlla, aggiunge chi non ha timbrato (ditte, chi non ha l’app, chi ha dimenticato) e può correggere."
                scelta={regole.oreDalle === "timbrature"} disabilitata={!puoModificare}
              />
            </RadioGroup>
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione
          id="avviso"
          titolo="Avviso se le ore non tornano"
          descrizione="Aiuta a non far pesare sulla commessa ore che non ci sono state, e a non perdere quelle vere."
        >
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-center gap-3">
              <Switch
                id="avviso-scostamento"
                checked={regole.avvisoScostamentoMinuti != null}
                disabled={!puoModificare}
                onCheckedChange={(acceso) => cambia({ avvisoScostamentoMinuti: acceso ? SCOSTAMENTO_PREDEFINITO : null })}
              />
              <Label htmlFor="avviso-scostamento" className="text-sm">
                Avvisa il capo quando le ore scritte sono diverse da quelle timbrate
              </Label>
            </div>
            {regole.avvisoScostamentoMinuti != null && (
              <div className="flex flex-wrap items-center gap-2 pl-12 text-sm">
                <span className="text-muted-foreground">Se la differenza supera</span>
                <Select
                  value={String(regole.avvisoScostamentoMinuti)}
                  onValueChange={(v) => cambia({ avvisoScostamentoMinuti: Number(v) })}
                  disabled={!puoModificare}
                >
                  <SelectTrigger className="h-9 w-32" aria-label="Differenza che fa scattare l’avviso">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCOSTAMENTI_PROPOSTI.map((m) => (
                      <SelectItem key={m} value={String(m)}>{oreInTesto(m / 60)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione id="in-pratica" titolo="In pratica, con queste scelte">
          <ul className="list-disc space-y-1.5 px-4 py-4 pl-9 text-sm">
            {inPratica(regole).map((riga) => <li key={riga}>{riga}</li>)}
          </ul>
        </SezioneImpostazione>
      </fieldset>

      <p className="text-xs text-muted-foreground">
        Altre regole per chi lavora in cantiere:{" "}
        <Link to="/azienda/impostazioni/modelli-fasi#regole" className="font-medium text-primary underline">
          chi può spuntare le sottofasi
        </Link>
        .
      </p>
    </div>
  );
}
