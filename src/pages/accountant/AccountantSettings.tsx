/**
 * /commercialista/profilo — impostazioni studio editabili.
 *
 * Form per anagrafica studio (nome, P.IVA, CF, email, telefono).
 * Status contratti read-only (deciso da super_admin di Edilizia in Cloud).
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Building2,
  FileSignature,
  Loader2,
  Mail,
  Phone,
  Save,
  ShieldCheck,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useSEO } from "@/hooks/useSEO";
import { useAccountantFirm } from "@/hooks/accountant/useAccountantPortalData";
import { supabase } from "@/integrations/supabase/client";

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

interface FirmFormState {
  name: string;
  vat_number: string;
  fiscal_code: string;
  email: string;
  phone: string;
}

export default function AccountantSettings() {
  useSEO({ title: "Profilo studio", noindex: true });
  const queryClient = useQueryClient();
  const { data: firm, isLoading } = useAccountantFirm();

  const [form, setForm] = useState<FirmFormState>({
    name: "",
    vat_number: "",
    fiscal_code: "",
    email: "",
    phone: "",
  });
  const [dirty, setDirty] = useState(false);
  const [hydratedId, setHydratedId] = useState<string | null>(null);

  // Idrata il form al cambio di studio (identità), NON a ogni refetch: così un
  // refetch in background (es. focus finestra) non cancella le modifiche non salvate.
  if (firm && firm.id !== hydratedId) {
    setHydratedId(firm.id);
    setForm({
      name: firm.name ?? "",
      vat_number: firm.vat_number ?? "",
      fiscal_code: firm.fiscal_code ?? "",
      email: firm.email ?? "",
      phone: firm.phone ?? "",
    });
    setDirty(false);
  }

  const update = useMutation({
    mutationFn: async (input: FirmFormState) => {
      if (!firm) throw new Error("Studio non caricato");
      const { error } = await supabase
        .from("accountant_firms")
        .update({
          name: input.name.trim(),
          vat_number: input.vat_number.trim() || null,
          fiscal_code: input.fiscal_code.trim() || null,
          email: input.email.trim() || null,
          phone: input.phone.trim() || null,
        })
        .eq("id", firm.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Anagrafica aggiornata");
      queryClient.invalidateQueries({ queryKey: ["accountant", "firm"] });
      setDirty(false);
    },
    onError: (error: Error) => {
      toast.error("Errore salvataggio", { description: error.message });
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!firm) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/40" />
          <div>
            <h2 className="text-base font-semibold">Studio non trovato</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Non risulta uno studio associato al tuo account. Ricarica la pagina o
              contatta l'amministratore.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  function set<K extends keyof FirmFormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.name.trim()) {
                toast.error("Nome studio obbligatorio");
                return;
              }
              update.mutate(form);
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="firm-name">
                  Ragione sociale <span className="text-red-600">*</span>
                </Label>
                <Input
                  id="firm-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firm-vat">P.IVA</Label>
                <Input
                  id="firm-vat"
                  value={form.vat_number}
                  onChange={(e) => set("vat_number", e.target.value)}
                  inputMode="numeric"
                  maxLength={20}
                  placeholder="IT01234567890"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firm-cf">Codice fiscale</Label>
                <Input
                  id="firm-cf"
                  value={form.fiscal_code}
                  onChange={(e) => set("fiscal_code", e.target.value.toUpperCase())}
                  maxLength={16}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <div className="flex h-10 items-center">
                  <Badge variant={firm.status === "active" ? "default" : "outline"}>
                    {firm.status}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firm-email" className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5" />
                  Email
                </Label>
                <Input
                  id="firm-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="firm-phone" className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  Telefono
                </Label>
                <Input
                  id="firm-phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  maxLength={30}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t pt-4">
              {dirty && (
                <span className="text-xs text-amber-700">Modifiche non salvate</span>
              )}
              <Button
                type="submit"
                disabled={!dirty || update.isPending}
                className="gap-2"
              >
                {update.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvataggio...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Salva modifiche
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSignature className="h-4 w-4 text-blue-700" />
            Contratti e compliance
          </CardTitle>
          <CardDescription>
            Stato dei documenti contrattuali tra studio e Edilizia in Cloud
            (gestiti dall'amministratore, sola lettura).
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
              Contratto e DPA in pending: contatta l'amministratore Edilizia in Cloud
              per completare la firma e attivare tutte le funzionalità.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
