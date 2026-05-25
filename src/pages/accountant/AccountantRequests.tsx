/**
 * /commercialista/richieste — storico delle richieste di modifica inviate
 * dal commercialista alle aziende clienti (workflow approval_required).
 *
 * Mostra status badge, payload preview, decision_note se rifiutate.
 */

import { useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  Clock,
  Hourglass,
  ListChecks,
  Loader2,
  XCircle,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import {
  useMyChangeRequests,
  type ChangeRequestRow,
} from "@/hooks/accountant/useAccountantChangeRequests";
import { useAccountantCompanies } from "@/hooks/accountant/useAccountantPortalData";

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
  };
  return map[t] ?? t;
}

export default function AccountantRequests() {
  useSEO({ title: "Le mie richieste — Studio", noindex: true });

  const { data: requests = [], isLoading } = useMyChangeRequests();
  const { data: companies = [] } = useAccountantCompanies();

  const companyById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(c.company_id, c.company?.name ?? "Azienda"));
    return m;
  }, [companies]);

  const grouped = useMemo(() => {
    const pending = requests.filter((r) => r.status === "pending");
    const approved = requests.filter((r) => r.status === "approved");
    const rejected = requests.filter((r) => r.status === "rejected");
    const expired = requests.filter((r) => r.status === "expired");
    return { pending, approved, rejected, expired };
  }, [requests]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Le mie richieste</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Storico delle modifiche che hai proposto alle aziende clienti
          (modalità "approvazione richiesta").
        </p>
      </header>

      {isLoading && (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento richieste...
          </CardContent>
        </Card>
      )}

      {!isLoading && requests.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <ListChecks className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium">Nessuna richiesta inviata</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le richieste di modifica che invii per aziende con accesso
                "approvazione richiesta" appariranno qui.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!isLoading && requests.length > 0 && (
        <>
          {grouped.pending.length > 0 && (
            <RequestsSection
              title="In attesa di risposta"
              description="L'azienda non ha ancora approvato o rifiutato."
              requests={grouped.pending}
              companyById={companyById}
            />
          )}
          {grouped.approved.length > 0 && (
            <RequestsSection
              title="Approvate"
              requests={grouped.approved}
              companyById={companyById}
            />
          )}
          {grouped.rejected.length > 0 && (
            <RequestsSection
              title="Rifiutate"
              requests={grouped.rejected}
              companyById={companyById}
            />
          )}
          {grouped.expired.length > 0 && (
            <RequestsSection
              title="Scadute"
              description="L'azienda non ha risposto entro 7 giorni — la richiesta è automaticamente annullata."
              requests={grouped.expired}
              companyById={companyById}
            />
          )}
        </>
      )}
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
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-2">
        {requests.map((req) => (
          <div
            key={req.id}
            className="rounded-lg border bg-card p-3 shadow-sm"
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
