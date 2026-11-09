import { StatoSalvataggio } from "@/components/impostazioni/StatoSalvataggio";
/**
 * Impostazioni → Rapportini e presenze.
 *
 * Il software si adatta all'azienda, non il contrario: qui l'azienda sceglie
 * come lavorano i suoi cantieri e l'app degli operai e dei capocantiere si
 * comporta di conseguenza. Le tre scelte sono affiancate da una prova del flusso
 * e dai collegamenti alle risorse operative; senza scelte l'app funziona come sempre.
 *
 * Il titolo della pagina lo mette il layout delle Impostazioni. Le scelte si salvano insieme, con «Salva modifiche»
 * (il salvataggio compare in basso solo quando c’è qualcosa da salvare), e uscire con una scelta cambiata chiede conferma.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowUpRight, Info, Loader2, Save, Users, CalendarDays, ListChecks, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRegoleAzienda, useSalvaRegoleAzienda } from "@/hooks/useRegoleCampo";
import { useVaiASezione } from "@/hooks/useVaiASezione";
import { RegoleCampoAnteprima } from "@/components/settings/RegoleCampoAnteprima";
import { ChiFaCosaRiquadro } from "@/components/settings/ChiFaCosaRiquadro";
import { ModuliCantiereConfig, type StatoModulo } from "@/components/settings/ModuliCantiereConfig";
import { BozzaGiornaleSerale, useBozzaGiornaleSerale } from "@/components/settings/BozzaGiornaleSerale";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSettingsDraftGuard } from "@/hooks/useSettingsDraftGuard";
import {
  GIORNI_INDIETRO_PROPOSTI, REGOLE_COME_OGGI, SCOSTAMENTI_PROPOSTI, SCOSTAMENTO_PREDEFINITO, oreInTesto,
  scostamento, type ChiCompila, type OreDalle, type RegoleCampo,
} from "@/lib/campo/regoleCampo";
import { giorniIndietroValidi } from "@/lib/campo/workDay";
import { AvvisoSolaLetturaImpostazioni } from "@/components/impostazioni/AvvisoSolaLetturaImpostazioni";
import { SezioneImpostazione } from "@/components/impostazioni/SezioneImpostazione";
import VociRapportinoConfig from "@/components/settings/VociRapportinoConfig";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// Una scheda per argomento. Le àncore vecchie (#ore, #giorni…) continuano a portare alla scheda giusta.
type Scheda = "compila" | "ore" | "moduli" | "voci" | "verbali" | "giornale";
const SCHEDE: Array<{ id: Scheda; etichetta: string; soloScrivania?: boolean }> = [
  { id: "compila", etichetta: "Chi compila" },
  { id: "ore", etichetta: "Ore" },
  { id: "moduli", etichetta: "Cosa si scrive", soloScrivania: true },
  { id: "voci", etichetta: "Voci e costi", soloScrivania: true },
  { id: "verbali", etichetta: "Verbali", soloScrivania: true },
  { id: "giornale", etichetta: "Giornale" },
];
const SCHEDA_DI_ANCORA: Record<string, Scheda> = {
  "chi-fa-cosa": "compila", "chi-scrive": "compila", "in-pratica": "compila", ore: "ore", avviso: "ore", giorni: "ore",
  parti: "moduli", "campi-propri": "moduli", "voci-rapportino": "voci", verbali: "verbali", "bozza-giornale": "giornale",
};

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
  const mobile = useIsMobile();
  const isAdmin = role === "company_admin" || role === "super_admin";
  const puoModificare = !permissions.isLoading && (role === "company_admin" || role === "super_admin" || !!permissions.canEditSettingsOrders);
  const companyId = effectiveCompany?.id;
  const { data, isLoading, isError, refetch } = useRegoleAzienda(companyId);
  const salva = useSalvaRegoleAzienda(companyId);
  const bozzaSerale = useBozzaGiornaleSerale(companyId);
  const { evidenziata } = useVaiASezione(!!companyId && !isLoading && !isError && !!data);
  const { hash } = useLocation();
  const [scheda, setScheda] = useState<Scheda>(() => SCHEDA_DI_ANCORA[hash.slice(1)] ?? "compila");
  useEffect(() => { const s = SCHEDA_DI_ANCORA[hash.slice(1)]; if (s) setScheda(s); }, [hash]);
  const pannello = (id: Scheda) => (scheda === id ? "space-y-4" : "hidden");

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
  // I modelli (rapportino e verbali) si salvano con lo stesso bottone delle regole: uno solo per tutta la pagina.
  const [statoRapportino, setStatoRapportino] = useState<StatoModulo | null>(null);
  const [statoVerbale, setStatoVerbale] = useState<StatoModulo | null>(null);
  const modelliCambiati = [statoRapportino, statoVerbale].filter((m): m is StatoModulo => !!m?.modificato);
  const inCorso = salva.isPending || !!statoRapportino?.inCorso || !!statoVerbale?.inCorso;
  const daSalvare = modificato || modelliCambiati.length > 0;
  const annulla = () => { setBozzaAzienda(null); modelliCambiati.forEach((m) => m.annulla()); };
  useSettingsDraftGuard(modificato || salva.isPending);

  const salvaModelli = async () => {
    let tutti = true;
    for (const m of modelliCambiati) tutti = (await m.salva()) && tutti;
    if (tutti) toast.success("Impostazioni salvate");
  };
  const conferma = () => {
    if (!puoModificare || !companyId || !data || !daSalvare || inCorso) return;
    if (!modificato) { void salvaModelli(); return; }
    salva.mutate(regole, {
      onSuccess: () => { setBozzaAzienda((precedente) => precedente?.companyId === companyId ? null : precedente); void salvaModelli(); },
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
      {!data?.sceltaFatta && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Non hai ancora scelto: per ora tutto funziona come sempre. Puoi cambiare idea quando vuoi.
          </AlertDescription>
        </Alert>
      )}
      {!permissions.isLoading && !puoModificare && <AvvisoSolaLetturaImpostazioni permesso="Configurazione Ordini" />}

      <div role="tablist" aria-label="Argomenti" className="flex min-w-0 max-w-full gap-1 overflow-x-auto border-b">
        {SCHEDE.filter((x) => !(mobile && x.soloScrivania)).map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={scheda === x.id} onClick={() => setScheda(x.id)}
            className={cn("tap-compact -mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors", scheda === x.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {x.etichetta}
          </button>
        ))}
      </div>

      {/* Compare solo con qualcosa da salvare; su telefono sta sopra la barra di navigazione. */}
      {puoModificare && (
        <div className={cn("fixed inset-x-4 bottom-24 z-40 flex items-center justify-between gap-3 rounded-lg border bg-card p-2 pl-3 shadow-lg md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2", !daSalvare && "hidden")}>
          <StatoSalvataggio modificato={daSalvare} inCorso={inCorso} />
          <div className="flex shrink-0 items-center gap-1">
            <Button size="sm" variant="ghost" aria-label="Annulla le modifiche" onClick={annulla} disabled={inCorso}>Annulla</Button>
            <Button size="sm" aria-label="Salva modifiche" onClick={conferma} disabled={!daSalvare || inCorso}>
              {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salva
            </Button>
          </div>
        </div>
      )}

      <div className="min-w-0 space-y-4" data-testid="regole-campo-colonne">
        <fieldset disabled={bloccato} className="m-0 min-w-0 border-0 p-0">
        <div className={pannello("compila")}>


        <SezioneImpostazione
          id="chi-scrive"
          evidenziata={evidenziata === "chi-scrive"}
          titolo="Chi scrive il rapportino?"
          descrizione="Vale per tutti i cantieri. Dove manca il capocantiere, ognuno scrive il suo."
        >
          <div className="px-4 py-4">
            <RadioGroup
              aria-labelledby="chi-scrive-titolo"
              value={regole.chiCompila}
              onValueChange={(v) => cambia({ chiCompila: v as ChiCompila })}
              className="grid gap-3"
            >
              <Opzione
                value="ognuno" titolo="Ogni operaio scrive il suo"
                descrizione="Ognuno scrive ore, lavori e foto della sua giornata."
                scelta={regole.chiCompila === "ognuno"} disabilitata={bloccato}
              />
              <Opzione
                value="capo" titolo="Scrive tutto il capocantiere"
                descrizione="Il capocantiere scrive il rapportino della squadra, con le ore di ognuno. Gli operai timbrano e basta."
                scelta={regole.chiCompila === "capo"} disabilitata={bloccato}
              />
              <Opzione
                value="ore_proprie" titolo="Il capocantiere scrive i lavori, ognuno le sue ore"
                descrizione="Il capocantiere racconta cosa si è fatto, con foto e avanzamento. Ogni operaio manda solo le sue ore."
                scelta={regole.chiCompila === "ore_proprie"} disabilitata={bloccato}
              />
            </RadioGroup>
          </div>
        </SezioneImpostazione>

        <details className="group">
          <summary className="cursor-pointer px-1 text-sm font-medium text-primary">Vedi cosa fa ognuno con questa scelta</summary>
          <div className="mt-3 space-y-4">
      <ChiFaCosaRiquadro
        regole={regole}
        modificato={modificato}
        evidenziata={evidenziata === "chi-fa-cosa"}
        bozzaSerale={bozzaSerale.data}
        linkVisibili={{
          capo: isAdmin || permissions.canViewOrders,
          ufficio: isAdmin || permissions.canViewOrders,
          giornale: isAdmin || permissions.canViewGiornaleLavori,
        }}
      />

            <RegoleCampoAnteprima regole={regole} modificato={modificato} dettagli={inPratica(regole)} evidenziata={evidenziata === "in-pratica"} />
          </div>
        </details>
        </div>

        <div className={pannello("ore")}>
        {flussoMisto && <p role="status" className="rounded-lg border bg-muted/30 px-4 py-3 text-sm">Ogni persona manda le proprie ore: il capocantiere non le scrive per gli altri, quindi non c’è altro da impostare qui oltre ai giorni indietro.</p>}
        <div className={flussoMisto ? "hidden" : "space-y-4"}>
        <SezioneImpostazione
          id="ore"
          evidenziata={evidenziata === "ore"}
          titolo="Il capocantiere come segna le ore della squadra?"
        >
          <div className="px-4 py-4">
            <RadioGroup
              aria-labelledby="ore-titolo"
              value={regole.oreDalle}
              onValueChange={(v) => cambia({ oreDalle: v as OreDalle })}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
            >
              <Opzione
                value="capo" titolo="Le scrive a mano"
                descrizione="Per ogni persona che era in cantiere."
                scelta={regole.oreDalle === "capo"} disabilitata={bloccato || flussoMisto}
              />
              <Opzione
                value="timbrature" titolo="Partono dalle timbrature"
                descrizione="Le controlla, corregge e aggiunge chi non ha timbrato."
                scelta={regole.oreDalle === "timbrature"} disabilitata={bloccato || flussoMisto}
              />
            </RadioGroup>
          </div>
        </SezioneImpostazione>

        <SezioneImpostazione
          id="avviso"
          evidenziata={evidenziata === "avviso"}
          titolo="Avviso se le ore non tornano con le timbrature"
        >
          <div className="space-y-3 px-4 py-4">
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

        </div>
        <SezioneImpostazione
          id="giorni"
          evidenziata={evidenziata === "giorni"}
          titolo="Fino a quanti giorni indietro dal cantiere?"
          descrizione="Oltre, sistema l’ufficio."
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

        </div>
        </fieldset>

        {/* Fuori dal fieldset: è una colonna dell'azienda, con un permesso diverso, e si salva subito. */}
        <div className={pannello("giornale")}>
          <BozzaGiornaleSerale companyId={companyId} canEdit={isAdmin || permissions.canEditSettingsProfile} evidenziata={evidenziata === "bozza-giornale"} />
        </div>

        <details className={scheda === "compila" ? "group" : "hidden"} aria-label="Collegamenti">
          <summary className="cursor-pointer px-1 text-sm font-medium text-muted-foreground">Persone, squadre e incarichi</summary>
          <div className="mt-3 space-y-4">
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
          </div>
        </details>
      </div>

      <div className={pannello("moduli")}><ModuliCantiereConfig tipo="rapportino" onStato={setStatoRapportino} evidenziate={{ parti: evidenziata === "parti", "campi-propri": evidenziata === "campi-propri" }} /></div>
      <div className={pannello("voci")}><div id="voci-rapportino"><VociRapportinoConfig /></div></div>
      <div className={pannello("verbali")}><ModuliCantiereConfig tipo="verbale" onStato={setStatoVerbale} evidenziate={{ verbali: evidenziata === "verbali" }} /></div>
    </div>
  );
}
