import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSipPilot,
  SIP_GUIDE,
  SIP_TRANSPORTS,
  type SipPilotInput,
} from "@/lib/fishSipPilot";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const defaults: SipPilotInput = {
  number: "",
  testCaller: "",
  officeGroup: "Ufficio",
  officeSeconds: 15,
  terminationHost: "",
  terminationTransport: "auto",
};

export function LocalSipPilotSetup() {
  const t = useT();
  const [form, setForm] = useState(defaults);
  const [draft, setDraft] = useState<ReturnType<typeof buildSipPilot>>();
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");

  function update<K extends keyof SipPilotInput>(
    key: K,
    value: SipPilotInput[K],
  ) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setDraft(undefined);
    setError("");
    setCopyStatus("");
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setDraft(buildSipPilot(form));
      setError("");
    } catch (cause) {
      setDraft(undefined);
      setError(
        cause instanceof Error
          ? cause.message
          : t("Controlla le impostazioni SIP."),
      );
    }
  }

  async function copyRequest() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft.requestToCarrier);
      setCopyStatus(t("Testo copiato."));
    } catch {
      setCopyStatus(t("Seleziona il testo qui sotto per copiarlo."));
    }
  }

  function downloadDraft() {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft.plan, null, 2) + "\n"], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "configurazione-sip-collaudo.json";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <section
      id="configurazione-sip"
      aria-labelledby="sip-pilot-title"
      className="eic-motion-panel scroll-mt-6 space-y-5 rounded-2xl border bg-card p-5 sm:p-6"
    >
      <div>
        <h2 id="sip-pilot-title" className="text-xl font-semibold">
          {t("Prepara il collegamento del numero reale")}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t("Genera la bozza SIP e il testo per l’operatore. I dati del modulo restano in questa scheda del browser.")}
        </p>
      </div>
      <form autoComplete="off" className="space-y-4" onSubmit={prepare}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="sip-company-number">
              {t("Numero aziendale da mantenere")}
            </Label>
            <Input
              id="sip-company-number"
              type="tel"
              placeholder="+39…"
              maxLength={32}
              value={form.number}
              onChange={(e) => update("number", e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("Usa il formato internazionale. Per i fissi italiani mantieni lo zero.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sip-pilot-caller">
              {t("Telefono da usare per la prova")}
            </Label>
            <Input
              id="sip-pilot-caller"
              type="tel"
              placeholder={t("+39… (facoltativo per la bozza)")}
              maxLength={32}
              value={form.testCaller}
              onChange={(e) => update("testCaller", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("Un telefono distinto dal numero aziendale, da cui chiamare e su cui ricevere il richiamo.")}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sip-office-group">
              {t("Gruppo o interno dell’ufficio")}
            </Label>
            <Input
              id="sip-office-group"
              value={form.officeGroup}
              maxLength={80}
              onChange={(e) => update("officeGroup", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sip-office-seconds">
              {t("Attesa prima di passare all’AI")}
            </Label>
            <select
              id="sip-office-seconds"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={form.officeSeconds}
              onChange={(e) => update("officeSeconds", Number(e.target.value))}
            >
              {[5, 10, 15, 20, 30].map((seconds) => (
                <option value={seconds} key={seconds}>{t("{seconds} secondi", { seconds })}</option>
              ))}
            </select>
          </div>
        </div>
        <details className="rounded-xl border p-4 text-sm">
          <summary className="cursor-pointer font-medium">
            {t("Dati di uscita SIP, se forniti dall’operatore")}
          </summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sip-termination-host">{t("Host SIP di uscita")}</Label>
              <Input
                id="sip-termination-host"
                value={form.terminationHost}
                maxLength={260}
                onChange={(e) => update("terminationHost", e.target.value)}
                placeholder="sip.operatore.it:5061"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sip-transport">{t("Trasporto")}</Label>
              <select
                id="sip-transport"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={form.terminationTransport}
                onChange={(e) =>
                  update(
                    "terminationTransport",
                    e.target.value as SipPilotInput["terminationTransport"],
                  )
                }
              >
                {SIP_TRANSPORTS.map((transport) => (
                  <option key={transport} value={transport}>
                    {transport === "auto"
                      ? t("Automatico")
                      : transport.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {t("Le credenziali vanno scambiate tramite il canale sicuro dell’operatore.")}
          </p>
        </details>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="eic-motion-button">
          {t("Prepara configurazione SIP")}
        </Button>
      </form>

      {draft && (
        <div
          className="eic-motion-enter space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20"
          aria-label={t("Bozza SIP locale")}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">{t("Bozza pronta per la verifica")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("{officeGroup} per {officeSeconds} secondi, poi Fish se nessuno risponde. Numero previsto per il richiamo {callerId}.", { officeGroup: String(draft.plan.carrier.inbound.officeGroup ?? ""), officeSeconds: String(draft.plan.carrier.inbound.officeSeconds ?? ""), callerId: String(draft.plan.carrier.outbound.callerId ?? "") })}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={downloadDraft}
            >
              {t("Scarica bozza JSON")}
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Label htmlFor="sip-request-to-carrier">
              {t("Testo per l’operatore")}
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void copyRequest()}
            >
              {t("Copia testo")}
            </Button>
          </div>
          <Textarea
            id="sip-request-to-carrier"
            rows={10}
            readOnly
            value={draft.requestToCarrier}
          />
          {copyStatus && (
            <p role="status" className="text-sm text-muted-foreground">
              {copyStatus}
            </p>
          )}
          <a
            href={SIP_GUIDE}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm underline"
          >
            {t("Documentazione SIP di Fish")}
          </a>
        </div>
      )}
    </section>
  );
}
