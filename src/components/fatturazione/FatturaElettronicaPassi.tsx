/**
 * Impostazioni → Fatturazione → Fattura elettronica, in tre passi (01/10/2026).
 *
 * Con Edilizia in Cloud le fatture passano dallo SDI solo tramite openapi: niente
 * scelta del provider, niente codice destinatario da inventare. Prima c'erano un
 * menù con Aruba e «manuale» (nessuno li usava, se non le aziende demo) e un
 * campo codice libero, e chi entrava non capiva cosa fare né quale codice dare
 * ai fornitori. Ora: 1. invio, 2. ricezione con PIC7CPS, 3. conservazione.
 */
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { conservazioneRetroattivaDal, statoConservazione } from "@/lib/fatturazione/conservazioneAde";
import { CODICE_DESTINATARIO_EIC } from "@/lib/fatturazione/canaleSdi";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export interface StatoCanaleSdi {
  stato?: string;
  last_error?: string | null;
  registered_at?: string | null;
  ricevute_controllate_at?: string | null;
  ricevute_ultimo_errore?: string | null;
}

interface Props {
  /** Azienda dimostrativa: gli invii restano di prova. */
  demo: boolean;
  /** Partita IVA, ragione sociale ed email/PEC SALVATE: la registrazione legge il database. */
  datiPerAttivare: boolean;
  /** Dati anagrafici cambiati e non ancora salvati. */
  anagraficaDaSalvare: boolean;
  canale: StatoCanaleSdi | null | undefined;
  caricamento: boolean;
  ricevute: number | undefined;
  onAttiva: () => void;
  attivando: boolean;
  onControllaRicevute: () => void;
  controllando: boolean;
  conservazioneAderitoIl: string | null | undefined;
  onConservazioneAderitoIl: (valore: string | null) => void;
}

type Esito = "fatto" | "da_fare" | "in_attesa";

function Passo({ numero, titolo, esito, etichetta, children }: {
  numero: number;
  titolo: string;
  esito: Esito;
  etichetta: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex gap-3 py-5 first:pt-0 last:pb-0" aria-label={titolo}>
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          esito === "fatto" && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
          esito === "da_fare" && "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
          esito === "in_attesa" && "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {esito === "fatto" ? <Check className="h-4 w-4" /> : numero}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold">{titolo}</h3>
          <Badge
            variant="outline"
            className={cn(
              "text-[11px] font-medium",
              esito === "fatto" && "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
              esito === "da_fare" && "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
            )}
          >
            {etichetta}
          </Badge>
        </div>
        {children}
      </div>
    </section>
  );
}

const dataLunga = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(intlCampo(), { day: "numeric", month: "long", year: "numeric" });

export function FatturaElettronicaPassi({
  demo, datiPerAttivare, anagraficaDaSalvare, canale, caricamento, ricevute,
  onAttiva, attivando, onControllaRicevute, controllando,
  conservazioneAderitoIl, onConservazioneAderitoIl,
}: Props) {
  const t = useT();
  const stato = canale?.stato ?? "non_attivo";
  const invioAttivo = stato === "registrato" || stato === "attivo";
  const arrivate = ricevute ?? 0;
  const oggi = new Date().toLocaleDateString("en-CA");
  const conservazione = statoConservazione(conservazioneAderitoIl, oggi);

  const copiaCodice = () => {
    void navigator.clipboard?.writeText(CODICE_DESTINATARIO_EIC);
    toast.success(t("Codice {CODICE_DESTINATARIO_EIC} copiato", { CODICE_DESTINATARIO_EIC }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("Fattura elettronica")}</CardTitle>
        <CardDescription>
          {t("Le fatture partono e arrivano dallo SDI tramite openapi.it, il canale di Edilizia in Cloud: niente programmi da installare, nessuna chiave da inserire.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        {/* ── 1. Invio ─────────────────────────────────────────────── */}
        <Passo
          numero={1}
          titolo={t("Invio delle fatture allo SDI")}
          esito={demo ? "in_attesa" : invioAttivo ? "fatto" : "da_fare"}
          etichetta={demo ? t("Prova") : invioAttivo ? t("Attivo") : stato === "errore" ? t("Da ripetere") : t("Da attivare")}
        >
          {caricamento ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> {t("Verifico…")}
            </p>
          ) : demo ? (
            <p className="text-sm text-muted-foreground">
              {t("Azienda dimostrativa: le fatture restano di prova e non partono allo SDI.")}
            </p>
          ) : invioAttivo ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {canale?.registered_at
                  ? t("Attivo dal {data}. Una fattura emessa parte con «Invia allo SDI»: la firma e la trasmette openapi.", { data: dataLunga(canale.registered_at) })
                  : t("Attivo. Una fattura emessa parte con «Invia allo SDI»: la firma e la trasmette openapi.")}
              </p>
              <Button variant="ghost" size="sm" onClick={onAttiva} disabled={attivando} className="gap-1.5 text-xs">
                {attivando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {t("Ricontrolla")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {stato === "errore" && canale?.last_error && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {canale.last_error}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {t("Registra l'azienda sul canale di invio: si fa una volta sola, in pochi secondi.")}
              </p>
              {!datiPerAttivare && (
                <p className="text-sm text-muted-foreground">
                  {t("Prima completa e salva Partita IVA, Ragione sociale e PEC (o email) nella scheda Azienda.")}
                </p>
              )}
              <Button onClick={onAttiva} disabled={attivando || !datiPerAttivare || anagraficaDaSalvare} className="gap-1.5">
                {attivando && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("Attiva l'invio")}
              </Button>
              {anagraficaDaSalvare && (
                <p className="text-xs text-amber-700 dark:text-amber-400">{t("Hai cambiato i dati dell'azienda: salvali prima di attivare.")}</p>
              )}
            </div>
          )}
        </Passo>

        {/* ── 2. Ricezione ─────────────────────────────────────────── */}
        <Passo
          numero={2}
          titolo={t("Ricezione delle fatture dei fornitori")}
          esito={!invioAttivo || demo ? "in_attesa" : arrivate > 0 ? "fatto" : "da_fare"}
          etichetta={!invioAttivo || demo ? t("Dopo l'invio") : arrivate > 0 ? t("Attiva") : t("Da completare")}
        >
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{t("Il tuo codice destinatario")}</p>
              <p className="font-mono text-xl font-semibold tracking-wider">{CODICE_DESTINATARIO_EIC}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copiaCodice} className="ml-auto gap-1.5">
              <Copy className="h-3.5 w-3.5" /> {t("Copia")}
            </Button>
          </div>

          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground marker:text-foreground">
            <li>
              {t("Entra in Fatture e Corrispettivi dell'Agenzia delle Entrate con SPID o CIE, oppure fallo fare al commercialista con la delega.")}
            </li>
            <li>
              {t("Fatturazione elettronica → Registrazione dell'indirizzo telematico → Codice destinatario →")}{" "}
              <b className="font-mono text-foreground">{CODICE_DESTINATARIO_EIC}</b> → {t("Conferma.")}
            </li>
            <li>
              {t("Da quel giorno tutte le fatture dei fornitori arrivano qui da sole, qualunque codice scrivano: le trovi in Fatture ricevute.")}
            </li>
          </ol>

          {arrivate === 0 && (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {t("Finché non lo registri, le fatture continuano ad arrivare dove arrivano oggi (per esempio Aruba). Scegli il giorno del passaggio e avvisa il commercialista; quelle già arrivate lì puoi caricarle a mano in Fatture ricevute.")}
              </span>
            </p>
          )}

          {canale?.ricevute_ultimo_errore && (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{canale.ricevute_ultimo_errore}</span>
            </p>
          )}

          {invioAttivo && !demo && (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{arrivate === 1 ? t("1 fattura arrivata") : t("{arrivate} fatture arrivate", { arrivate })}</Badge>
              <span className="text-xs text-muted-foreground">
                {canale?.ricevute_controllate_at
                  ? t("Ultimo controllo {valore} · ogni ora", { valore: new Date(canale.ricevute_controllate_at).toLocaleString(intlCampo(), { dateStyle: "short", timeStyle: "short" }) })
                  : t("Si controlla ogni ora")}
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={onControllaRicevute} disabled={controllando} className="gap-1.5">
                  {controllando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {t("Controlla adesso")}
                </Button>
                <Button variant="ghost" size="sm" asChild className="gap-1.5">
                  <Link to="/azienda/documenti/fatture-ricevute">
                    {t("Fatture ricevute")} <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </Passo>

        {/* ── 3. Conservazione ─────────────────────────────────────── */}
        <Passo
          numero={3}
          titolo={t("Conservazione a norma")}
          esito={conservazione.stato === "attiva" ? "fatto" : "da_fare"}
          etichetta={conservazione.stato === "attiva" ? t("Attiva") : conservazione.stato === "da_controllare" ? t("Da controllare") : t("Da fare")}
        >
          <p className="text-sm text-muted-foreground">
            {t("Le fatture elettroniche, inviate e ricevute, vanno conservate con un servizio a norma (openapi non lo fa). Il servizio dell'Agenzia delle Entrate è gratuito e le conserva 15 anni: in Fatture e Corrispettivi → Fatturazione elettronica e Conservazione → Accedi alla sezione conservazione, poi accetta la convenzione (il titolare, o il commercialista con la delega). Aderendo oggi copri anche le fatture dal {data}.", { data: dataLunga(conservazioneRetroattivaDal(Number(oggi.slice(0, 4)))) })}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="conservazione-aderito-il">{t("Data di adesione")}</Label>
              <Input
                id="conservazione-aderito-il"
                type="date"
                max={oggi}
                value={conservazioneAderitoIl ?? ""}
                onChange={(e) => onConservazioneAderitoIl(e.target.value || null)}
              />
            </div>
            <p className="text-xs text-muted-foreground sm:pb-2.5">
              {conservazione.stato === "attiva"
                ? t("Si rinnova da sola: il prossimo rinnovo è il {prossimoRinnovo}.", { prossimoRinnovo: dataLunga(conservazione.prossimoRinnovo) })
                : conservazione.stato === "da_segnare"
                  ? t("Quando hai aderito, segna qui la data: vedrai quando controllare i rinnovi.")
                  : null}
            </p>
          </div>
          {conservazione.stato === "da_controllare" && (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{t("La convenzione si è rinnovata da sola il {rinnovataIl}. Controlla nel portale che risulti attiva: ad alcuni il rinnovo non è risultato. Se manca, aderisci di nuovo e porta in conservazione le fatture del periodo scoperto.", { rinnovataIl: dataLunga(conservazione.rinnovataIl) })}</span>
            </p>
          )}
        </Passo>
      </CardContent>
    </Card>
  );
}
