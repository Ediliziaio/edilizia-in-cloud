import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Phone,
  ShieldCheck,
} from "lucide-react";
import {
  fishNumberConnectionKey,
  useFishNumberConnectionStatus,
  type ConnectionRequest,
  type ConnectionStatus,
} from "@/hooks/useFishNumberConnectionStatus";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/contexts/AuthContext";
import { callFishAgent } from "@/lib/fishAgentProxy";
import { connectionStatusLabel, onboardingPhone } from "@/lib/fishOnboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NumberConnectionGuide } from "@/components/telephony/NumberConnectionGuide";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

export function FishNumberConnectionRequest({
  companyId,
  agentId,
  onSubmitted,
  localPreview = false,
}: {
  companyId: string;
  agentId: string;
  onSubmitted?: () => void;
  localPreview?: boolean;
}) {
  const t = useT();
  const cache = useQueryClient();
  const { isAdmin } = usePermissions();
  const auth = useAuth();
  const isSuperAdmin = auth.role === "super_admin" && !auth.viewAsRole;
  const canManage = isAdmin || isSuperAdmin;
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const usesExistingNumber = mode === "existing";
  const [number, setNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [sip, setSip] = useState("unknown");
  const [notes, setNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reply, setReply] = useState("");
  const queryKey = fishNumberConnectionKey(companyId, agentId);
  const state = useFishNumberConnectionStatus(companyId, agentId, canManage);
  const operation = useMutation({
    mutationFn: async (status?: string) => {
      if (status === "company_reply")
        return callFishAgent<{ request: ConnectionRequest }>(
          companyId,
          agentId,
          "provide_number_information",
          { request_id: state.data!.request!.id, company_reply: reply },
        );
      if (status)
        return callFishAgent<{ request: ConnectionRequest }>(
          companyId,
          agentId,
          "review_number_connection",
          {
            request_id: state.data!.request!.id,
            status,
            platform_notes: reviewNotes,
          },
        );
      return callFishAgent<{
        request: ConnectionRequest;
        already_requested?: boolean;
      }>(companyId, agentId, "request_number_connection", {
        number_mode: mode,
        existing_number: usesExistingNumber ? number : "",
        carrier: usesExistingNumber ? carrier : "",
        sip_available: usesExistingNumber ? sip : "unknown",
        notes,
      });
    },
    onSuccess: (data) => {
      cache.setQueryData<ConnectionStatus>(queryKey, (previous) => ({
        ...previous,
        request: data.request,
      }));
      void cache.invalidateQueries({ queryKey });
      void cache.invalidateQueries({
        queryKey: ["fish-connection-queue", companyId],
      });
      onSubmitted?.();
    },
  });
  const request = state.data?.request;
  const line = state.data?.line;
  const needsLineCheck = request?.status === "ready" && !line;
  if (!canManage)
    return (
      <p className="text-sm text-muted-foreground">
        {t("Un amministratore dell’azienda può richiedere e seguire il collegamento del numero.")}
      </p>
    );
  if (state.isPending)
    return (
      <div className="flex items-center gap-2 p-4 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("Leggo lo stato del numero…")}
      </div>
    );
  if (state.isError)
    return (
      <div role="alert" className="space-y-3 rounded-xl border p-4 text-sm">
        <p>{t("Non riesco a leggere lo stato della richiesta.")}</p>
        <Button variant="outline" onClick={() => state.refetch()}>
          {t("Riprova")}
        </Button>
      </div>
    );
  return (
    <section
      className="space-y-3"
      aria-label={t("Collegamento del numero aziendale")}
    >
      <div className="flex items-center gap-2">
        <div className="shrink-0 rounded-md bg-sky-50 p-1.5 text-sky-700 dark:bg-sky-950 dark:text-sky-200">
          <Phone aria-hidden="true" className="size-4" />
        </div>
        <h2 className="text-base font-semibold">{t("Collega il numero aziendale")}</h2>
      </div>
      {localPreview && <p className="text-sm text-muted-foreground">{t("Prova la richiesta con il numero dimostrativo")} <strong>+39 000 000 0002</strong>.</p>}
      {request && request.status !== "cancelled" ? (
        <div className="space-y-2.5 rounded-lg border bg-background p-3">
          <div
            role="status"
            className="flex items-center gap-2 text-sm font-semibold"
          >
            {request.status === "ready" && line ? (
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-emerald-700 dark:text-emerald-300"
              />
            ) : (
              <Clock3
                aria-hidden="true"
                className="size-4 text-orange-700 dark:text-orange-300"
              />
            )}
            {localPreview
              ? t("Richiesta di prova registrata")
              : needsLineCheck ? t("Collegamento da verificare") : connectionStatusLabel[request.status] ? t(connectionStatusLabel[request.status]) : request.status}
          </div>
          <p className="text-sm">
            {request.number_mode === "existing"
              ? t("Numero da mantenere: {existing_number}", { existing_number: String(request.existing_number ?? "") })
              : t("Hai richiesto una nuova linea aziendale.")}
          </p>
          <p className="text-xs leading-5 text-muted-foreground">
            {localPreview
              ? t("Richiesta dimostrativa salvata nel gestionale locale.")
              : needsLineCheck
              ? t("Serve una verifica aggiornata del numero richiesto per questo assistente.")
              : request.status === "awaiting_company"
                ? t("La piattaforma ha bisogno delle informazioni indicate qui sotto per proseguire.")
                : request.status === "ready"
                  ? t("La piattaforma ha completato la verifica.")
                  : t("La piattaforma verifica operatore, compatibilità e configurazione della linea.")}
          </p>
          {line && (
            <dl className="grid gap-2 rounded-lg border bg-muted/20 p-2.5 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">{t("Entrata")}</dt>
                <dd className="mt-1 font-medium">{t("{number} · configurata", { number: String(line.number ?? "") })}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  {t("Uscita con lo stesso numero")}
                </dt>
                <dd className="mt-1 font-medium">
                  {line.outbound
                    ? t("Configurata")
                    : t("Da abilitare con l’operatore")}
                </dd>
              </div>
            </dl>
          )}
          {request.platform_notes && (
            <p className="rounded-xl bg-muted p-3 text-sm leading-6">
              {request.platform_notes}
            </p>
          )}
          {request.company_reply && (
            <p className="rounded-xl border p-3 text-sm leading-6">{t("Informazioni inviate: {company_reply}", { company_reply: String(request.company_reply ?? "") })}</p>
          )}
          {request.status === "awaiting_company" && (
            <div className="space-y-3">
              <Label htmlFor={`request-reply-${agentId}`}>
                {t("Le informazioni richieste")}
              </Label>
              <Textarea
                id={`request-reply-${agentId}`}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={1000}
                disabled={operation.isPending}
              />
              <Button
                disabled={operation.isPending || !reply.trim()}
                onClick={() => operation.mutate("company_reply")}
              >
                {t("Invia informazioni")}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("Riferimento {valore} · {valore2}", { valore: request.id.slice(0, 8).toUpperCase(), valore2: new Date(request.created_at).toLocaleDateString(intlCampo()) })}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => state.refetch()}
              disabled={state.isFetching}
            >
              {t("Aggiorna stato")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            operation.mutate(undefined);
          }}
        >
          <fieldset
            className="grid gap-1.5 min-[360px]:grid-cols-2"
            disabled={operation.isPending}
          >
            <legend className="sr-only">{t("Quale numero vuoi usare?")}</legend>
            {(
              [
                ["existing", "Mantieni il tuo numero"],
                ["new", "Richiedi una nuova linea"],
              ] as const
            ).map(([value, title]) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium sm:text-sm ${mode === value ? "border-sky-600 bg-sky-50 dark:bg-sky-950/45" : "bg-background"}`}
              >
                <input
                  type="radio"
                  name={`number-mode-${agentId}`}
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="shrink-0 accent-sky-700"
                />
                {t(title)}
              </label>
            ))}
          </fieldset>
          {usesExistingNumber && (
            <div>
              <Label htmlFor={`line-number-${agentId}`}>{t("Numero aziendale")}</Label>
              <Input
                id={`line-number-${agentId}`}
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder="+39…"
                type="tel"
                maxLength={30}
                required
                disabled={operation.isPending}
                aria-describedby={`line-number-help-${agentId}`}
              />
              <p
                id={`line-number-help-${agentId}`}
                className="mt-1 text-xs text-muted-foreground"
              >
                {t("Usa il prefisso internazionale. Mantieni lo zero dei fissi italiani.")}
              </p>
            </div>
          )}
          <details className="rounded-lg border px-2.5 py-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("Dati facoltativi")}
            </summary>
            <div className="mt-2 grid min-w-0 gap-2.5 sm:grid-cols-2">
              {usesExistingNumber && (
                <>
                  <div>
                    <Label htmlFor={`line-carrier-${agentId}`}>
                      {t("Operatore telefonico")}
                    </Label>
                    <Input
                      id={`line-carrier-${agentId}`}
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      placeholder={t("Se lo conosci")}
                      maxLength={120}
                      disabled={operation.isPending}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`line-sip-${agentId}`}>
                      {t("Avete un centralino VoIP o SIP?")}
                    </Label>
                    <Select
                      value={sip}
                      onValueChange={setSip}
                      disabled={operation.isPending}
                    >
                      <SelectTrigger
                        id={`line-sip-${agentId}`}
                        aria-label={t("Disponibilità centralino VoIP")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unknown">{t("Non lo so")}</SelectItem>
                        <SelectItem value="yes">{t("Sì")}</SelectItem>
                        <SelectItem value="no">{t("No")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor={`line-notes-${agentId}`}>
                  {t("Note, facoltative")}
                </Label>
                <Textarea
                  id={`line-notes-${agentId}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder={t("Per esempio: AI fuori orario e richiami con lo stesso numero.")}
                  disabled={operation.isPending}
                />
              </div>
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button
              type="submit"
              size="sm"
              disabled={
                operation.isPending ||
                (usesExistingNumber &&
                  !/^\+[1-9]\d{7,14}$/.test(onboardingPhone(number)))
              }
            >
              {operation.isPending ? (
                <>
                  <Loader2
                    aria-hidden="true"
                    className="mr-2 size-4 animate-spin"
                  />
                  {t("Invio richiesta…")}
                </>
              ) : (
                localPreview ? t("Salva richiesta di prova") : t("Richiedi il collegamento")
              )}
            </Button>
            <p className="flex items-center gap-1.5 text-xs leading-4 text-muted-foreground">
              <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
              {localPreview ? t("Richiesta di prova") : usesExistingNumber ? t("Verifichiamo la linea con il tuo operatore.") : t("La richiesta avvia la verifica di una nuova linea.")}
            </p>
          </div>
        </form>
      )}
      <NumberConnectionGuide />
      {operation.isError && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {operation.error.message}
        </p>
      )}
      {isSuperAdmin && request && (
        <details className="rounded-xl border p-4">
          <summary className="cursor-pointer text-sm font-medium">
            {t("Gestione della piattaforma")}
          </summary>
          <div className="mt-4 space-y-3">
            <Label htmlFor={`review-notes-${agentId}`}>
              {t("Indicazioni per l’azienda")}
            </Label>
            <Textarea
              id={`review-notes-${agentId}`}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              maxLength={1000}
            />
            <div className="flex flex-wrap gap-2">
              {[
                ["in_review", "Prendi in carico"],
                ["awaiting_company", "Richiedi informazioni"],
                ["ready", "Verifica linea pronta"],
              ].map(([status, label]) => (
                <Button
                  key={status}
                  variant="outline"
                  size="sm"
                  disabled={operation.isPending}
                  onClick={() => operation.mutate(status)}
                >
                  {t(label)}
                </Button>
              ))}
            </div>
          </div>
        </details>
      )}
    </section>
  );
}
