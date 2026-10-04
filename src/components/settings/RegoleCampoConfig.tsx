/**
 * Impostazioni → Rapportini e presenze.
 *
 * Il software si adatta all'azienda, non il contrario: qui l'azienda sceglie
 * come lavorano i suoi cantieri e l'app degli operai e dei capocantiere si
 * comporta di conseguenza. Tre scelte, in parole semplici; senza scelte
 * l'app funziona come sempre.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, Info, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRegoleAzienda, useSalvaRegoleAzienda } from "@/hooks/useRegoleCampo";
import {
  REGOLE_COME_OGGI, SCOSTAMENTI_PROPOSTI, SCOSTAMENTO_PREDEFINITO, oreInTesto,
  type ChiCompila, type OreDalle, type RegoleCampo,
} from "@/lib/campo/regoleCampo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
      <RadioGroupItem id={id} value={value} disabled={disabilitata} className="mt-1" />
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
  return righe;
}

export default function RegoleCampoConfig() {
  const { effectiveCompany, role } = useAuth();
  const permissions = usePermissions();
  const puoModificare = role === "company_admin" || role === "super_admin" || permissions.canEditSettingsOrders;
  const { data, isLoading, isError, refetch } = useRegoleAzienda(effectiveCompany?.id);
  const salva = useSalvaRegoleAzienda(effectiveCompany?.id);

  // Le modifiche non ancora salvate: si parte da ciò che c'è, si salva a richiesta.
  const [bozza, setBozza] = useState<RegoleCampo | null>(null);
  useEffect(() => { setBozza(null); }, [effectiveCompany?.id]);
  const salvate = data?.regole ?? REGOLE_COME_OGGI;
  const regole = bozza ?? salvate;
  const modificato = bozza != null && (
    bozza.chiCompila !== salvate.chiCompila ||
    bozza.oreDalle !== salvate.oreDalle ||
    bozza.avvisoScostamentoMinuti !== salvate.avvisoScostamentoMinuti
  );
  const cambia = (parte: Partial<RegoleCampo>) => setBozza({ ...regole, ...parte });

  const conferma = () => {
    salva.mutate(regole, {
      onSuccess: () => { setBozza(null); toast.success("Impostazioni salvate"); },
      onError: () => toast.error("Non sono riuscito a salvare. Riprova tra poco."),
    });
  };

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-40 w-full" /><Skeleton className="h-40 w-full" /></div>;
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
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl md:hidden">Rapportini e presenze</h1>
        <p className="text-sm text-muted-foreground">
          Ogni azienda lavora a modo suo: qui scegli come funziona la tua. L’app degli operai e dei capocantiere
          si adatta alle tue scelte, su tutti i cantieri.
        </p>
      </div>

      {!data?.sceltaFatta && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Non hai ancora scelto: per ora tutto funziona come sempre. Puoi cambiare idea quando vuoi.
          </AlertDescription>
        </Alert>
      )}
      {!puoModificare && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>Puoi vedere queste scelte, ma solo un amministratore può cambiarle.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Chi scrive il rapportino del cantiere?</CardTitle>
          <CardDescription>Il racconto della giornata: cosa si è fatto, foto, materiali, avanzamento.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
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
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Da dove vengono le ore di ognuno?</CardTitle>
          <CardDescription>Vale per il rapportino di squadra, quello in cui il capo segna chi ha lavorato.</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Avviso se le ore non tornano</CardTitle>
          <CardDescription>
            Aiuta a non far pesare sulla commessa ore che non ci sono state, e a non perdere quelle vere.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
        </CardContent>
      </Card>

      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          <strong>Qualunque sia la tua scelta:</strong> una persona non si conta mai due volte nello stesso giorno e
          cantiere. Se il capo l’ha già segnata, il suo rapportino personale non chiede più le ore.
        </AlertDescription>
      </Alert>

      <Card className="bg-muted/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">In pratica, con queste scelte</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {inPratica(regole).map((riga) => <li key={riga}>{riga}</li>)}
          </ul>
        </CardContent>
      </Card>

      {puoModificare && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={conferma} disabled={!modificato || salva.isPending}>
            {salva.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salva le scelte
          </Button>
          {modificato && (
            <Button variant="ghost" onClick={() => setBozza(null)} disabled={salva.isPending}>
              <RotateCcw className="mr-2 h-4 w-4" />Annulla le modifiche
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
