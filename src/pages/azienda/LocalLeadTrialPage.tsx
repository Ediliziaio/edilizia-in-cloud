import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  FishLiveVoice,
  type LocalLeadVoice,
} from "@/components/agenti/FishLiveVoice";
import { Button } from "@/components/ui/button";
import { FishCallbackCard } from "@/components/silvio/FishCallbackCard";
import { CallTranscript } from "@/components/telephony/CallTranscript";
import {
  createLocalAssistanceClient,
  type LocalLeadSnapshot,
  type LocalLeadSetup,
} from "@/lib/localAssistanceClient";

const scenarios = ["lead_appointment", "lead_handoff"];
const shortId = (id: string) => id.slice(-8).toUpperCase();
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeZone: "Europe/Rome",
  }).format(new Date(date.slice(0, 10) + "T12:00:00Z"));

export default function LocalLeadTrialPage() {
  const client = useMemo(createLocalAssistanceClient, []);
  const [setup, setSetup] = useState<LocalLeadSetup | null>(null);
  const [trial, setTrial] = useState<LocalLeadSnapshot | null>(null);
  const [error, setError] = useState("");
  const [openCallbackId, setOpenCallbackId] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const trialId = params.get("prova");

  const refresh = useCallback(async (id: string) => {
    try {
      setTrial(await client.leadSnapshot(id));
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Esito locale da verificare.",
      );
    }
  }, [client]);
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
    if (setup && trialId) void refresh(trialId);
  }, [refresh, setup, trialId]);

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
          <h1 className="text-lg font-semibold">Collaudo lead e CRM</h1>
          <p className="text-xs text-muted-foreground">
            Fish Drama 3 · Giulia · Contatto, agenda e attività nel database
            locale
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link to="/azienda/centralino">Torna al centralino</Link>
        </Button>
      </header>
      <p className="rounded-md border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
        Le conversazioni usano un lead fittizio e una sessione privata Fish. Gli
        esiti sono salvati nell’azienda di test. Il passaggio all’operatore
        simula una chiamata al primo operatore libero.
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
          Configura FISH_API_KEY nel file privato .env.fish.local per avviare la
          voce.
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
              Carico l’azienda di test…
            </p>
          ) : null}
        </section>
        {trial && (
          <aside
            className="space-y-2 rounded-lg border bg-card p-3 text-sm"
            aria-label="Dati salvati nel gestionale locale"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">Dati salvati</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refresh(trial.id)}
              >
                Rileggi
              </Button>
            </div>
            <dl className="divide-y">
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">Scheda lead</dt>
                <dd>
                  {trial.contact.name} · {shortId(trial.contact.id)}
                </dd>
              </div>
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">Opportunità</dt>
                <dd>{shortId(trial.opportunityId)}</dd>
              </div>
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">Appuntamento</dt>
                <dd>
                  {trial.appointment
                    ? `${dateLabel(trial.appointment.appointment_date)} alle ${trial.appointment.appointment_time.slice(0, 5)} · ${shortId(trial.appointment.id)}`
                    : "In attesa"}
                </dd>
                {trial.appointment?.opportunity_id && (
                  <dd className="text-xs text-muted-foreground">
                    Collegato all’opportunità{" "}
                    {shortId(trial.appointment.opportunity_id)}
                  </dd>
                )}
              </div>
              <div className="py-2">
                <dt className="text-xs text-muted-foreground">
                  Nota commerciale
                </dt>
                <dd>{trial.outcome?.note || "In attesa"}</dd>
                {trial.outcome?.next_action && (
                  <dd className="text-xs text-muted-foreground">
                    {trial.outcome.next_action}
                  </dd>
                )}
              </div>
            </dl>
            <details id="scheda-chiamata" className="rounded-md border p-2">
              <summary className="cursor-pointer font-medium">Scheda chiamata CRM</summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {trial.contact.name} · Uscita · {trial.call.terminata_il ? "Completata" : "In corso"}
                </p>
                <CallTranscript turns={trial.transcript} />
              </div>
            </details>
            <section className="space-y-2" aria-label="Richiami di Silvio">
              <h3 className="font-semibold">Richiami di Silvio</h3>
              {trial.callback ? (
                <FishCallbackCard
                  callback={trial.callback}
                  open={openCallbackId === trial.callback.id}
                  onToggle={() => setOpenCallbackId(openCallbackId === trial.callback.id ? null : trial.callback.id)}
                >
                  <CallTranscript turns={trial.transcript} />
                </FishCallbackCard>
              ) : <p className="text-xs text-muted-foreground">Nessun richiamo confermato.</p>}
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}
