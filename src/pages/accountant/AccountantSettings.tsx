/**
 * /commercialista/profilo — impostazioni studio (read-only base).
 * In iterazione successiva: edit form per name, vat, branding, contratti.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, FileSignature, Mail, Phone, ShieldCheck } from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { useAccountantFirm } from "@/hooks/accountant/useAccountantPortalData";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    pending: { label: "In attesa", color: "bg-amber-100 text-amber-800" },
    sent: { label: "Inviato", color: "bg-blue-100 text-blue-800" },
    signed: { label: "Firmato", color: "bg-emerald-100 text-emerald-800" },
    approved: { label: "Approvato", color: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "Rifiutato", color: "bg-red-100 text-red-800" },
  };
  const cfg = map[status] || { label: status, color: "bg-slate-100 text-slate-700" };
  return <Badge className={cfg.color}>{cfg.label}</Badge>;
}

export default function AccountantSettings() {
  useSEO({ title: "Profilo studio", noindex: true });
  const { data: firm } = useAccountantFirm();

  if (!firm) return null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Profilo studio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Dati dello studio commercialista, contratti e branding.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-blue-700" />
            Anagrafica studio
          </CardTitle>
          <CardDescription>Dati identificativi pubblici dello studio.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Ragione sociale
              </dt>
              <dd className="mt-1 text-sm font-semibold">{firm.name}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                P.IVA
              </dt>
              <dd className="mt-1 text-sm">{firm.vat_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Codice fiscale
              </dt>
              <dd className="mt-1 text-sm">{firm.fiscal_code ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </dt>
              <dd className="mt-1">
                <Badge variant={firm.status === "active" ? "default" : "outline"}>
                  {firm.status}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Email
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                {firm.email ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Telefono
              </dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                {firm.phone ?? "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-blue-700" />
            Contratti e compliance
          </CardTitle>
          <CardDescription>
            Stato dei documenti contrattuali tra studio e Edilizia in Cloud.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Contratto di servizio
              </dt>
              <dd className="mt-1">
                <StatusBadge status={firm.contract_status} />
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                DPA (Data Processing Agreement)
              </dt>
              <dd className="mt-1">
                <StatusBadge status={firm.dpa_status} />
              </dd>
            </div>
          </dl>
          {(firm.contract_status === "pending" || firm.dpa_status === "pending") && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50 p-3 text-xs text-amber-900">
              <ShieldCheck className="-mt-0.5 mr-1 inline h-3.5 w-3.5" />
              Contratto e DPA in pending: contatta l'amministratore Edilizia in Cloud per
              completare la firma e attivare tutte le funzionalità.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
