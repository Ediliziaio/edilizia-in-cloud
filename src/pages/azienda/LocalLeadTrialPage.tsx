import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FishLiveVoice,
  type LocalLeadVoice,
} from "@/components/agenti/FishLiveVoice";
import { Button } from "@/components/ui/button";
import { FishCallbackCard } from "@/components/telephony/FishCallbackCard";
import { CallTranscript } from "@/components/telephony/CallTranscript";
import {
  createLocalAssistanceClient,
  type LocalLeadSnapshot,
  type LocalLeadSetup,
} from "@/lib/localAssistanceClient";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

const scenarios = ["lead_appointment", "lead_handoff"];
const shortId = (id: string) => id.slice(-8).toUpperCase();
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat(intlCampo(), {
    dateStyle: "medium",
    timeZone: "Europe/Rome",
  }).format(new Date(date.slice(0, 10) + "T12:00:00Z"));

export default function LocalLeadTrialPage() {
  const t = useT();
  const [client] = useState(createLocalAssistanceClient);
  const [setup, setSetup] = useState<LocalLeadSetup | null>(null);
  const [trial, setTrial] = useState<LocalLeadSnapshot | null>(null);
  const [error, setError] = useState("");
  const [openCallbackId, setOpenCallbackId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const trialId = params.get("prova");

  async function refresh(id: string) {
    try {
      setTrial(await client.leadSnapshot(id));
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : t("Esito locale da verificare."),
      );
    }
  }
  useEffect(() => {
    let active = true;
    void client
      .bootstrap()
      .then(() => client.leadSetup())
      .then((data) => {
        if (active) setSetup(data);
      })
      .catch(() => {
        if (active) setError("Il backend locale del centralino non risponde.");
      });
    return () => {
      active = false;
    };
  }, [client]);
  useEffect(() => {
    if (!setup || !trialId) return;
    let active = true;
    void client.leadSnapshot(trialId).then(
      (data) => {
        if (!active) return;
        setTrial(data);
        setError("");
      },
      (error: unknown) => {
        if (active) setError(error instanceof Error ? error.message : "Esito locale da verificare.");
      },
    );
    return () => { active = false; };
  }, [client, setup, trialId]);

  const localLead: LocalLeadVoice | undefined = setup && {
    day: setup.day,
    async open(scenario) {
      const session = await client.leadOpen(scenario);
      setParams({ prova: session.local_trial_id }, { replace: true });
      return session;
    },
    async execute(id, tool, parameters, transcript) {
      const result = await client.leadTool(id, tool, parameters, transcript);
      await refresh(id);
      return result;
    },
    async save(id, transcript) {
      const result = await client.leadTranscript(id, transcript);
      await refresh(id);
      return result;
    },
  };
  return (
    <main className="mx-auto max-w-6xl space-y-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{t("Collaudo lead e CRM")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("Fish Drama 3 · Giulia · Contatto, agenda e attività nel database locale")}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/azienda/centralino">{t("Torna al centralino")}</Link>
        </Button>
      </header>
      <p className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
        {t("Le conversazioni usano un lead fittizio e una sessione privata Fish. Gli esiti sono salvati nell’azienda di test. Il passaggio all’operatore simula una chiamata al primo operatore libero.")}
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-md border p-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {setup && !setup.ready && (
        <p role="status" className="text-sm">
          {t("Configura FISH_API_KEY nel file privato .env.fish.local per avviare la voce.")}
        </p>
      )}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="min-w-0 rounded-lg border bg-card p-3">
          {localLead ? (
            <FishLiveVoice
              companyId="collaudo-locale"
              agentId="lead"
              ready={setup.ready}
              initialScenario={scenarios[0]}
              availableScenarios={scenarios}
              localLead={localLead}
            />
          ) : !error ? (
            <p role="status" className="text-sm text-muted-foreground">
              {t("Carico l’azienda di test…")}
            </p>
          ) : null}
        </section>
        {trial && (
          <aside
            className="space-y-2 rounded-lg border bg-card p-3 text-sm"
            aria-label={t("Dati salvati nel gestionale locale")}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{t("Dati salvati")}</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh(trial.id)}
              >
                {t("Rileggi")}
              </Button>
            </div>
            <dl className="divide-y">
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">{t("Scheda lead")}</dt>
                <dd>
                  {trial.contact.name} · {shortId(trial.contact.id)}
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">{t("Opportunità")}</dt>
                <dd>{shortId(trial.opportunityId)}</dd>
              </div>
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">{t("Appuntamento")}</dt>
                <dd>
                  {trial.appointment
                    ? t("{appointment_date} alle {appointment_time} · {id}", { appointment_date: String(dateLabel(trial.appointment.appointment_date) ?? ""), appointment_time: trial.appointment.appointment_time.slice(0, 5), id: String(shortId(trial.appointment.id) ?? "") })
                    : t("In attesa")}
                </dd>
                {trial.appointment?.opportunity_id && (
                  <dd className="text-xs text-muted-foreground">{t("Collegato all’opportunità {opportunity_id}", { opportunity_id: String(shortId(trial.appointment.opportunity_id) ?? "") })}</dd>
                )}
              </div>
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">
                  {t("Nota commerciale")}
                </dt>
                <dd>{trial.outcome?.note || t("In attesa")}</dd>
                {trial.outcome?.next_action && (
                  <dd className="text-xs text-muted-foreground">
                    {trial.outcome.next_action}
                  </dd>
                )}
              </div>
            </dl>
            <details id="scheda-chiamata" className="rounded-md border p-2">
              <summary className="cursor-pointer font-medium">{t("Scheda chiamata CRM")}</summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {trial.contact.name} {t("· Uscita ·")} {trial.call.terminata_il ? t("Completata") : t("In corso")}
                </p>
                <CallTranscript turns={trial.transcript} />
              </div>
            </details>
            <section className="space-y-2" aria-label={t("Richiami di Silvio")}>
              <h3 className="font-semibold">{t("Richiami di Silvio")}</h3>
              {trial.callback ? (
                <FishCallbackCard
                  callback={trial.callback}
                  open={openCallbackId === trial.callback.id}
                  onToggle={() => setOpenCallbackId(openCallbackId === trial.callback.id ? null : trial.callback.id)}
                >
                  <CallTranscript turns={trial.transcript} />
                </FishCallbackCard>
              ) : <p className="text-xs text-muted-foreground">{t("Nessun richiamo confermato.")}</p>}
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}
