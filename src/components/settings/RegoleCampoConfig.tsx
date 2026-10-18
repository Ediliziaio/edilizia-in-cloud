/**
 * Impostazioni → Rapportini e presenze.
 *
 * Il software si adatta all'azienda, non il contrario: qui l'azienda sceglie
 * come lavorano i suoi cantieri e l'app degli operai e dei capocantiere si
 * comporta di conseguenza. Le tre scelte sono affiancate da una prova del flusso
 * e dai collegamenti alle risorse operative; senza scelte l'app funziona come sempre.
 *
 * Il titolo della pagina lo mette il layout delle Impostazioni. Le scelte si salvano insieme, con «Salva modifiche»
 * (la barra resta in vista mentre si scorre), e uscire con una scelta cambiata chiede conferma.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, Info, Loader2, Save, Users, CalendarDays, ListChecks, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRegoleAzienda, useSalvaRegoleAzienda } from "@/hooks/useRegoleCampo";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { useSettingsFloatingBar } from "@/hooks/useSettingsFloatingBar";
import { RegoleCampoAnteprima } from "@/components/settings/RegoleCampoAnteprima";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  GIORNI_INDIETRO_PROPOSTI, REGOLE_COME_OGGI, SCOSTAMENTI_PROPOSTI, SCOSTAMENTO_PREDEFINITO, oreInTesto,
  scostamento, type ChiCompila, type OreDalle, type RegoleCampo,
} from "@/lib/campo/regoleCampo";
import { giorniIndietroValidi } from "@/lib/campo/workDay";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { IndiceSezioni, SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const SEZIONI = [
  { id: "chi-scrive", etichetta: "Chi compila" },
  { id: "ore", etichetta: "Ore e presenze" },
  { id: "avviso", etichetta: "Controllo ore" },
  { id: "giorni", etichetta: "Giorni indietro" },
  { id: "in-pratica", etichetta: "Anteprima" },
];

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
      ? "Dove c’è un responsabile, gli operai timbrano entrata e uscita: niente promemoria del rapportino e niente ore da scrivere. Il capocantiere racconta il cantiere; i capisquadra rendicontano la propria squadra."
      : r.chiCompila === "ore_proprie"
        ? "Dove c’è un responsabile, ogni operaio manda solo le proprie ore; il responsabile racconta lavori, foto e avanzamento. Senza un responsabile assegnato resta il flusso «ognuno il suo»."
        : "Ogni operaio scrive il rapportino della sua giornata. Il capocantiere può aggiungere la squadra.",
  );
  righe.push(
    r.chiCompila === "ore_proprie"
      ? "Con il flusso misto anche il responsabile conferma solo le proprie ore: non inserisce le presenze degli altri."
      : r.oreDalle === "timbrature"
      ? "Nel rapportino di squadra le ore partono da quelle timbrate: il capo le controlla, aggiunge chi non ha timbrato e può correggerle."
      : "Nel rapportino di squadra il capo scrive a mano le ore di ognuno.",
  );
  righe.push(
    r.chiCompila === "ore_proprie"
      ? "Il controllo degli scostamenti riguarda le presenze di squadra: nel flusso misto la preferenza è conservata per gli altri flussi."
      : r.avvisoScostamentoMinuti != null
      ? `Se le ore scritte sono diverse da quelle timbrate di più di ${oreInTesto(r.avvisoScostamentoMinuti / 60)}, il capo vede un avviso.`
      : "Nessun avviso sulle differenze tra ore scritte e ore timbrate.",
  );
  const giorni = giorniIndietroValidi(r.giorniIndietro);
  righe.push(
    giorni === 0
      ? "Il rapportino si manda nel giorno del lavoro; le giornate passate le sistema l’ufficio."
      : giorni === 1
        ? "Il rapportino si manda oggi o il giorno dopo; anche una timbratura dimenticata si chiede entro ieri."
        : `Il rapportino e le correzioni delle timbrature si mandano fino a ${giorni} giorni dopo; l’ufficio approva.`,
  );
  // Vale qualunque sia la scelta: una riga in più, non un riquadro a parte.
  righe.push("Se il capo ha già registrato le ore di una persona, il giornaliero personale non le ripropone. Eventuali ore aggiuntive devono essere indicate esplicitamente.");
  righe.push("Le ditte subappaltatrici rendicontano il proprio incarico; queste scelte organizzano il lavoro dei dipendenti. L’approvazione resta all’ufficio secondo i permessi Ordini, separata dalla firma del cliente.");
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
  const isAdmin = role === "company_admin" || role === "super_admin";
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const companyId = effectiveCompany?.id;
  const { data, isLoading, isError, refetch } = useRegoleAzienda(companyId);
  const salva = useSalvaRegoleAzienda(companyId);
  const { evidenziata, vai } = useVaiASezione(!!companyId && !isLoading && !isError && !!data);
  const { contenitore, barra, stile, altezza } = useSettingsFloatingBar();

  // Le modifiche non ancora salvate: si parte da ciò che c'è, si salva a richiesta. La bozza è di UN'azienda: se si cambia
  // azienda (super amministratore) quella dell'altra non si vede.
  const [bozzaAzienda, setBozzaAzienda] = useState<{ companyId: string | undefined; regole: RegoleCampo } | null>(null);
  const bozza = bozzaAzienda && bozzaAzienda.companyId === companyId ? bozzaAzienda.regole : null;
  const salvate = data?.regole ?? REGOLE_COME_OGGI;
  const regole = bozza ?? salvate;
  const modificato = bozza != null && (
    bozza.chiCompila !== salvate.chiCompila ||
    bozza.oreDalle !== salvate.oreDalle ||
    bozza.avvisoScostamentoMinuti !== salvate.avvisoScostamentoMinuti ||
    bozza.giorniIndietro !== salvate.giorniIndietro
  );
  const cambia = (parte: Partial<RegoleCampo>) => {
    if (!puoModificare || !companyId || !data || salva.isPending) return;
    setBozzaAzienda({ companyId, regole: { ...regole, ...parte } });
  };
  const annulla = () => setBozzaAzienda(null);
  useSettingsDraftGuard(modificato || salva.isPending);

  const conferma = () => {
    if (!puoModificare || !companyId || !data || !modificato || salva.isPending) return;
    salva.mutate(regole, {
      onSuccess: () => { setBozzaAzienda((precedente) => precedente?.companyId === companyId ? null : precedente); toast.success("Impostazioni salvate"); },
      onError: (errore) => toast.error(messaggioErroreSalvataggio(errore)),
    });
  };

  const flussoMisto = regole.chiCompila === "ore_proprie";
  const bloccato = !puoModificare || salva.isPending;
  // Il database accetta anche soglie personalizzate: non mostrare un campo vuoto per una scelta già salvata.
  const soglie = [...new Set<number>([...SCOSTAMENTI_PROPOSTI, ...(regole.avvisoScostamentoMinuti == null ? [] : [regole.avvisoScostamentoMinuti])])].sort((a, b) => a - b);
  const esempio = scostamento(9, 8, regole.avvisoScostamentoMinuti);
  const collegamenti = [
    { titolo: "Operai e squadre", descrizione: "Persone, composizione e responsabile delle squadre interne.", to: "/azienda/manodopera?tab=operai&vista=squadre", icona: Users, visibile: isAdmin || permissions.canViewOperai },
    { titolo: "Squadre e calendari lavori", descrizione: "Disponibilità e calendari delle risorse: usa le stesse squadre.", to: "/azienda/impostazioni/calendari-lavori?tab=squadre", icona: CalendarDays, visibile: isAdmin || permissions.canViewSettingsOrders },
    { titolo: "Commesse e rapportini", descrizione: "Assegna persone e responsabili alla commessa; qui l’ufficio controlla e approva i rapportini.", to: "/azienda/ordini", icona: ClipboardCheck, visibile: isAdmin || permissions.canViewOrders },
    { titolo: "Fasi e avanzamento", descrizione: "Modelli delle fasi e chi può spuntare le sottofasi nell’app.", to: "/azienda/impostazioni/modelli-fasi#regole", icona: ListChecks, visibile: isAdmin || permissions.canViewSettingsOrders },
  ].filter((link) => link.visibile);

  if (!companyId) return <Alert><AlertDescription>Seleziona un’azienda per consultare le regole dei rapportini.</AlertDescription></Alert>;
  if (isLoading || (!data && !isError)) {
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
    <div className="w-full min-w-0 space-y-4 [&_section]:scroll-mt-44 sm:[&_section]:scroll-mt-32" data-testid="regole-campo-pagina">
      <p className="text-sm text-muted-foreground">
        Scegli chi compila il giornaliero, come raccogliere le ore e quando segnalare una differenza.
        Le regole valgono per tutti i cantieri dell’azienda; persone e responsabili si assegnano nelle commesse.
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

      <div ref={contenitore} className="sticky top-2 z-20" style={{ height: altezza }}>
      <div ref={barra} style={stile} className="z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur">
        <IndiceSezioni voci={SEZIONI} onVai={vai} />
        {puoModificare && (
          <div className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:w-auto">
            <p
              role="status"
              className={cn(
                "mr-auto text-xs",
                "text-muted-foreground",
                modificato && !salva.isPending && "font-medium text-amber-700 dark:text-amber-400",
              )}
            >
              {salva.isPending ? "Salvataggio…" : modificato ? "Modifiche non salvate" : "Nessuna modifica"}
            </p>
            {modificato && (
              <Button size="sm" variant="ghost" aria-label="Annulla le modifiche" onClick={annulla} disabled={salva.isPending}>
                <span className="hidden sm:inline" aria-hidden="true">Annulla le modifiche</span><span className="sm:hidden" aria-hidden="true">Annulla</span>
              </Button>
            )}
            <Button size="sm" onClick={conferma} disabled={!modificato || salva.isPending}>
              {salva.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salva modifiche
            </Button>
          </div>
        )}
      </div>
      </div>

      <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" data-testid="regole-campo-colonne">
        <fieldset disabled={bloccato} className="m-0 min-w-0 space-y-4 border-0 p-0">


        <SezioneImpostazione
          id="chi-scrive"
          evidenziata={evidenziata === "chi-scrive"}
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
                scelta={regole.chiCompila === "ognuno"} disabilitata={bloccato}
              />
              <Opzione
                value="capo" titolo="Lo scrive il capocantiere"
                descrizione="Il capocantiere invia il giornaliero del cantiere; i capisquadra possono rendicontare la propria squadra. Gli operai timbrano entrata e uscita. Senza un responsabile assegnato, ciascuno compila il proprio giornaliero."
                scelta={regole.chiCompila === "capo"} disabilitata={bloccato}
              />
              <Opzione
                value="ore_proprie" titolo="Il racconto al capo, le ore a ognuno"
                descrizione="Lavori, foto e avanzamento li racconta il responsabile. Ogni persona, incluso il responsabile, conferma solo le proprie ore: niente presenze degli altri nello stesso rapportino. Senza un responsabile assegnato, ciascuno compila il proprio giornaliero."
                scelta={regole.chiCompila === "ore_proprie"} disabilitata={bloccato}
              />
            </RadioGroup>
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione
          id="ore"
          evidenziata={evidenziata === "ore"}
          titolo="Da dove vengono le ore di ognuno?"
          descrizione="Vale per il rapportino di squadra, quello in cui il capo segna chi ha lavorato."
        >
          <div className="px-4 py-4">
            {regole.chiCompila === "ore_proprie" && <p role="status" className="mb-3 text-sm text-muted-foreground">Nel flusso misto ognuno conferma le proprie ore. Questa preferenza viene conservata per quando scegli un flusso con presenze di squadra.</p>}
            <RadioGroup
              aria-labelledby="ore-titolo"
              value={regole.oreDalle}
              onValueChange={(v) => cambia({ oreDalle: v as OreDalle })}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
            >
              <Opzione
                value="capo" titolo="Le scrive il capo"
                descrizione="Il capo scrive a mano le ore di ogni persona che era in cantiere."
                scelta={regole.oreDalle === "capo"} disabilitata={bloccato || flussoMisto}
              />
              <Opzione
                value="timbrature" titolo="Dalle timbrature"
                descrizione="Le ore partono da quelle timbrate in cantiere. Il capo le controlla, aggiunge chi non ha timbrato (ditte, chi non ha l’app, chi ha dimenticato) e può correggere."
                scelta={regole.oreDalle === "timbrature"} disabilitata={bloccato || flussoMisto}
              />
            </RadioGroup>
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione
          id="avviso"
          evidenziata={evidenziata === "avviso"}
          titolo="Avviso se le ore non tornano"
          descrizione="Confronta le presenze inserite dal responsabile con le timbrature disponibili. È un avviso, non un blocco all’invio."
          ambito={flussoMisto ? <Badge variant="outline">Preferenza conservata</Badge> : undefined}
        >
          <div className="space-y-3 px-4 py-4">
            {flussoMisto && <p className="text-sm text-muted-foreground">Nel flusso misto non si inseriscono presenze di squadra: il controllo si riattiva scegliendo uno degli altri flussi.</p>}
            <div className="flex items-center gap-3">
              <Switch
                id="avviso-scostamento"
                checked={regole.avvisoScostamentoMinuti != null}
                disabled={bloccato || flussoMisto}
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
                  disabled={bloccato || flussoMisto}
                >
                  <SelectTrigger className="h-9 w-32" aria-label="Differenza che fa scattare l’avviso">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {soglie.map((m) => (
                      <SelectItem key={m} value={String(m)}>{oreInTesto(m / 60)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!flussoMisto && regole.avvisoScostamentoMinuti != null && (
              <div className="rounded-lg border bg-muted/30 p-3 text-xs" role="region" aria-label="Esempio del controllo ore">
                <p className="font-medium">Esempio: 8 h timbrate · 9 h registrate</p>
                <p className={cn("mt-1", esempio?.fuori ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>
                  {esempio?.fuori ? "Il capo vede un avviso: la differenza di 1 h supera la soglia scelta." : "Nessun avviso: la differenza di 1 h non supera la soglia scelta."}
                </p>
                <p className="mt-1 text-muted-foreground">Se manca una timbratura, il confronto non è disponibile. La prova non registra ore.</p>
              </div>
            )}
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione
          id="giorni"
          evidenziata={evidenziata === "giorni"}
          titolo="Fino a quanti giorni indietro dall’app?"
          descrizione="Vale per il rapportino e per la richiesta di correzione di una timbratura dimenticata. Le giornate più vecchie le sistema l’ufficio."
        >
          <div className="flex flex-wrap items-center gap-2 px-4 py-4 text-sm">
            <span className="text-muted-foreground">Si può mandare</span>
            <Select
              value={String(giorniIndietroValidi(regole.giorniIndietro))}
              onValueChange={(v) => cambia({ giorniIndietro: Number(v) })}
              disabled={bloccato}
            >
              <SelectTrigger className="h-9 w-52" aria-label="Giorni indietro ammessi dall’app">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set<number>([...GIORNI_INDIETRO_PROPOSTI, giorniIndietroValidi(regole.giorniIndietro)])].sort((a, b) => a - b).map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g === 0 ? "solo il giorno stesso" : g === 1 ? "oggi e ieri" : `fino a ${g} giorni prima`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SezioneImpostazione>

        </fieldset>

        <aside className="min-w-0 space-y-4" aria-label="Anteprima e collegamenti">
          <RegoleCampoAnteprima regole={regole} modificato={modificato} dettagli={inPratica(regole)} evidenziata={evidenziata === "in-pratica"} />
          {collegamenti.length > 0 && <section className="rounded-lg border bg-card" aria-labelledby="collegamenti-campo-titolo">
            <header className="border-b px-4 py-3">
              <h2 id="collegamenti-campo-titolo" className="text-base font-semibold">Completa l’organizzazione del cantiere</h2>
              <p className="mt-1 text-xs text-muted-foreground">Queste regole usano persone, squadre e incarichi già presenti nel gestionale.</p>
            </header>
            <div className="divide-y">
              {collegamenti.map(({ titolo, descrizione, to, icona: Icona }) => (
                <Link key={to} to={to} className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                  <Icona className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{titolo}</span><span className="mt-0.5 block text-xs text-muted-foreground">{descrizione}</span></span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>}
          <p className="px-1 text-xs text-muted-foreground">Le ore approvate alimentano la manodopera della commessa secondo i costi delle persone e degli incarichi. Le tariffe di vendita del listino servono invece a preparare i preventivi.</p>
          {(isAdmin || permissions.canViewSettingsOrders) && <p className="px-1 text-xs text-muted-foreground">Altre regole dell’app: <Link to="/azienda/impostazioni/modelli-fasi#regole" className="font-medium text-primary underline">chi può spuntare le sottofasi</Link>.</p>}
        </aside>
      </div>
    </div>
  );
}
