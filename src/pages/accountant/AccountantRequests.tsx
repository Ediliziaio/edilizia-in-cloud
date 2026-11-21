/**
 * /commercialista/richieste — storico delle richieste di modifica inviate
 * dal commercialista alle aziende clienti (workflow approval_required).
 *
 * Mostra status badge, payload preview, decision_note se rifiutate.
 */

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { StudioPageHeader } from "@/components/accountant/StudioPageHeader";
import { NuovaRichiestaStudio } from "@/components/accountant/NuovaRichiestaStudio";
import { RichiestaStudioDettagli } from "@/components/accountant/RichiestaStudioDettagli";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  Hourglass,
  ListChecks,
  Loader2,
  Plus,
  XCircle,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import {
  useMyChangeRequests,
  type ChangeRequestRow,
} from "@/hooks/accountant/useAccountantChangeRequests";
import { useAccountantCompanies, useAccountantFirm } from "@/hooks/accountant/useAccountantPortalData";

function StatusBadge({ status }: { status: ChangeRequestRow["status"] }) {
  if (status === "pending")
    return (
      <Badge variant="secondary" className="gap-1">
        <Clock className="h-3 w-3" /> In attesa
      </Badge>
    );
  if (status === "approved")
    return (
      <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700">
        <CheckCircle2 className="h-3 w-3" /> Approvata
      </Badge>
    );
  if (status === "rejected")
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Rifiutata
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Hourglass className="h-3 w-3" /> Scaduta
    </Badge>
  );
}

function operationLabel(op: string) {
  if (op === "create") return "Crea";
  if (op === "update") return "Modifica";
  if (op === "delete") return "Elimina";
  return op;
}

function resourceLabel(t: string) {
  const map: Record<string, string> = {
    prima_nota: "Prima nota",
    scadenza: "Scadenza",
    costo: "Costo",
    doc_fiscale: "Documento fiscale",
    work_log: "Giornale lavori",
    ticket: "Ticket",
    foto_cantiere: "Foto cantiere",
    bank_transaction: "Movimento bancario",
    commessa_descrizione: "Descrizione commessa",
    proposta: "Richiesta libera",
  };
  return map[t] ?? t;
}

const REQUEST_FILTERS = [
  { value: "pending", label: "In attesa", title: "In attesa di risposta", description: "In attesa di una decisione da parte dell’azienda." },
  { value: "approved", label: "Approvate", title: "Approvate" },
  { value: "rejected", label: "Rifiutate", title: "Rifiutate" },
  { value: "expired", label: "Scadute", title: "Scadute", description: "L’azienda non ha risposto entro la scadenza." },
] as const;

export default function AccountantRequests() {
  useSEO({ title: "Le mie richieste — Studio", noindex: true });

  const [params, setParams] = useSearchParams();
  const { data: firm } = useAccountantFirm();
  const { data: requests = [], isLoading, isError, refetch } = useMyChangeRequests(firm?.id);
  const { data: companies = [], isSuccess: deleghePronte, isError: delegheError, refetch: refetchDeleghe } = useAccountantCompanies();
  const aziendeApprovazione = companies.filter((row) => row.status === "active" && row.access_mode === "approval_required");

  const status = REQUEST_FILTERS.find((item) => item.value === params.get("stato"))?.value ?? "all";
  const companyFilter = params.get("filtroAzienda") || "all";
  const aziendaIniziale = params.get("azienda") ?? "";
  const commessaIniziale = params.get("commessa") ?? "";
  const [composerOverride, setComposerOverride] = useState<boolean | null>(null);
  const composerOpen = composerOverride ?? Boolean(aziendaIniziale || commessaIniziale);

  const companyById = new Map(companies.map((row) => [row.company_id, row.company?.name ?? "Azienda"]));
  const historyCompanies = [...new Set(requests.map((row) => row.company_id))];
  if (companyFilter !== "all" && !historyCompanies.includes(companyFilter)) historyCompanies.push(companyFilter);
  historyCompanies.sort((a, b) => (companyById.get(a) ?? "").localeCompare(companyById.get(b) ?? "", "it"));

  const companyRequests = companyFilter === "all" ? requests : requests.filter((row) => row.company_id === companyFilter);
  const sections = REQUEST_FILTERS.map((filter) => ({
    ...filter, requests: companyRequests.filter((row) => row.status === filter.value),
  }));
  const visibleSections = sections.filter((section) => section.requests.length > 0 && (status === "all" || status === section.value));

  function updateFilter(name: string, value: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value === "all") next.delete(name);
      else next.set(name, value);
      return next;
    }, { replace: true });
  }

  return (
    <div className="space-y-5">
      <StudioPageHeader title="Le mie richieste" icon={ListChecks}
        description="Proposte inviate alle aziende con accesso «Con approvazione»." action={
          <Button type="button" variant={composerOpen ? "outline" : "default"} aria-expanded={composerOpen}
            aria-controls={composerOpen ? "studio-request-composer" : undefined}
            onClick={() => setComposerOverride(!composerOpen)}>
            {!composerOpen && <Plus aria-hidden="true" className="mr-1.5 size-4" />}
            {composerOpen ? "Chiudi proposta" : "Nuova richiesta"}
          </Button>
        } />
      {composerOpen && (
        <div id="studio-request-composer">
          {firm && deleghePronte ? (
            <NuovaRichiestaStudio key={JSON.stringify([aziendaIniziale, commessaIniziale])} studioId={firm.id}
              aziende={aziendeApprovazione} aziendaIniziale={aziendaIniziale} commessaIniziale={commessaIniziale} />
          ) : delegheError ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4 text-sm">
              Impossibile verificare le deleghe.
              <Button variant="outline" size="sm" onClick={() => void refetchDeleghe()}>Riprova</Button>
            </div>
          ) : (
            <p role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Caricamento deleghe…</p>
          )}
        </div>
      )}

      <section aria-labelledby="studio-request-history" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="studio-request-history" className="text-base font-semibold">Storico richieste</h2>
          {historyCompanies.length > 0 && (
            <select aria-label="Filtra richieste per azienda" value={companyFilter}
              onChange={(event) => updateFilter("filtroAzienda", event.target.value)}
              className="h-9 min-w-0 max-w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring">
              <option value="all">Tutte le aziende</option>
              {historyCompanies.map((id) => <option key={id} value={id}>{companyById.get(id) ?? "Azienda"}</option>)}
            </select>
          )}
        </div>
        {isError && (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4 text-sm">
            Impossibile caricare lo storico.
            <Button variant="outline" size="sm" onClick={() => void refetch()}>Riprova</Button>
          </div>
        )}
        {isLoading && (
          <p role="status" className="flex items-center gap-2 rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Caricamento richieste…
          </p>
        )}
        {!isError && !isLoading && requests.length === 0 && (
          <div className="rounded-xl border bg-card p-5 text-sm">
            <p className="font-medium">Nessuna richiesta inviata</p>
            <p className="mt-1 text-muted-foreground">Qui vedrai le proposte inviate e le decisioni delle aziende.</p>
          </div>
        )}
        {requests.length > 0 && (
          <>
            <div role="group" aria-label="Filtra lo storico per stato" className="flex flex-wrap gap-1.5">
              {[{ value: "all", label: "Tutte", requests: companyRequests }, ...sections].map(({ value, label, requests: rows }) => (
                <Button type="button" key={value} size="sm" variant={status === value ? "default" : "outline"}
                  aria-pressed={status === value} onClick={() => updateFilter("stato", value)}>
                  {label} <span aria-hidden="true" className="ml-1.5 tabular-nums opacity-70">{rows.length}</span>
                </Button>
              ))}
            </div>
            {visibleSections.length === 0 && (
              <p role="status" className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Nessuna richiesta corrisponde ai filtri.</p>
            )}
            {visibleSections.map((section) => (
              <RequestsSection key={section.value} title={section.title}
                description={"description" in section ? section.description : undefined}
                requests={section.requests} companyById={companyById} />
            ))}
          </>
        )}
      </section>
    </div>
  );
}

function RequestsSection({
  title,
  description,
  requests,
  companyById,
}: {
  title: string;
  description?: string;
  requests: ChangeRequestRow[];
  companyById: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader className="space-y-1 px-4 py-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="divide-y border-t p-0">
        {requests.map((req) => (
          <div
            key={req.id}
            className="min-w-0 break-words px-4 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={req.status} />
                <Badge variant="outline">
                  {operationLabel(req.operation)} · {resourceLabel(req.resource_type)}
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">
                  {companyById.get(req.company_id) ?? "Azienda"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(req.created_at).toLocaleDateString("it-IT", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <RichiestaStudioDettagli richiesta={req} />
            {req.decision_note && (
              <p className="mt-2 rounded border-l-2 border-muted bg-muted/40 p-2 text-xs italic text-muted-foreground">
                Nota azienda: {req.decision_note}
              </p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
