import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft, Building2, Mail, LogIn, Calendar, MapPin, Globe,
  MoreVertical, Pencil, PauseCircle, PlayCircle, Trash2, Download, Loader2,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import type { Company, CompanyStatus } from "@/types/auth";
import { statusConfig, sectorLabels } from "@/lib/companyUtils";

interface CompanyDetailHeaderProps {
  company: Company;
  onBack: () => void;
  onImpersonate: () => void;
  onEdit?: () => void;
  onSuspend?: () => void;
  onReactivate?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  isUpdatingStatus?: boolean;
}

export function CompanyDetailHeader({
  company, onBack, onImpersonate, onEdit, onSuspend, onReactivate, onDelete, onExport, isUpdatingStatus,
}: CompanyDetailHeaderProps) {
  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;
  const sectorLabel = sectorLabels[company.sector] || company.sector;

  const createdDate = format(new Date(company.created_at), "d MMM yyyy", { locale: it });
  const daysSinceCreation = differenceInDays(new Date(), new Date(company.created_at));

  const trialDaysLeft = company.trial_ends_at
    ? differenceInDays(new Date(company.trial_ends_at), new Date())
    : null;

  // Delete confirmation state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Peso reale del clic (F5-03).
  // La conferma chiedeva di digitare il nome, ma non diceva quanto si stava
  // cancellando: con 702 vincoli a cascata su companies, "elimina" può
  // significare tre righe o quattordicimila. Si interroga solo a dialogo
  // aperto, perché è un conteggio che tocca molte tabelle.
  const { data: impatto, isLoading: impattoInCorso } = useQuery({
    queryKey: ["impatto-cancellazione", company.id],
    enabled: showDeleteDialog,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_impatto_cancellazione" as never, {
        p_company_id: company.id,
      } as never);
      if (error) throw error;
      return data as unknown as {
        record_totali: number;
        tabelle_coinvolte: number;
        dettaglio: Array<{ tabella: string; record: number; comportamento: string }> | null;
      };
    },
  });
  const canConfirmDelete = deleteConfirmText.trim().toLowerCase() === company.name.trim().toLowerCase();

  // Suspend confirmation state
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);

  const isSuspended = companyStatus === "suspended";

  return (
    <>
      <Card className="overflow-hidden">
        {/* Status accent bar */}
        <div
          className={`h-1 ${
            companyStatus === "active"
              ? "bg-emerald-500"
              : companyStatus === "trial"
              ? "bg-primary"
              : companyStatus === "suspended"
              ? "bg-muted-foreground"
              : "bg-destructive"
          }`}
        />
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <Button variant="ghost" size="icon" onClick={onBack} className="mt-1 shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-4">
                {company.logo_url ? (
                  <img width={56} height={56} loading="lazy"
                    src={company.logo_url}
                    alt={company.name}
                    className="h-14 w-14 rounded-xl object-cover ring-2 ring-border"
                  />
                ) : (
                  <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center ring-2 ring-border">
                    <Building2 className="h-7 w-7 text-primary" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-bold text-foreground">{company.name}</h1>
                    <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                    {companyStatus === "trial" && trialDaysLeft !== null && (
                      <Badge
                        variant="outline"
                        className={
                          trialDaysLeft <= 3
                            ? "border-destructive/30 text-destructive"
                            : "border-primary/30 text-primary"
                        }
                      >
                        {trialDaysLeft > 0 ? `${trialDaysLeft}gg rimanenti` : "Scaduto"}
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5" />
                      {company.email}
                    </span>
                    {sectorLabel && (
                      <>
                        <Separator orientation="vertical" className="h-3.5" />
                        <span className="flex items-center gap-1.5">
                          <Globe className="h-3.5 w-3.5" />
                          {sectorLabel}
                        </span>
                      </>
                    )}
                    {(company as any).city && (
                      <>
                        <Separator orientation="vertical" className="h-3.5" />
                        <span className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {(company as any).city}
                          {(company as any).province ? ` (${(company as any).province})` : ""}
                        </span>
                      </>
                    )}
                    <Separator orientation="vertical" className="h-3.5" />
                    <span className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      Creata il {createdDate}
                      <span className="text-muted-foreground/60">({daysSinceCreation}gg fa)</span>
                    </span>
                  </div>

                  {company.business_name && company.business_name !== company.name && (
                    <p className="text-xs text-muted-foreground/70">
                      Ragione sociale: {company.business_name}
                      {company.vat_number ? ` · P.IVA: ${company.vat_number}` : ""}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Button onClick={onImpersonate}>
                <LogIn className="h-4 w-4 mr-2" />
                Accedi come Admin
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {onEdit && (
                    <DropdownMenuItem onClick={onEdit}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Modifica
                    </DropdownMenuItem>
                  )}
                  {onExport && (
                    <DropdownMenuItem onClick={onExport} className="hidden sm:flex">
                      <Download className="h-4 w-4 mr-2" />
                      Esporta Dati
                    </DropdownMenuItem>
                  )}
                  {(onSuspend || onReactivate) && (
                    <>
                      <DropdownMenuSeparator />
                      {isSuspended && onReactivate ? (
                        <DropdownMenuItem onClick={onReactivate} disabled={isUpdatingStatus}>
                          {isUpdatingStatus ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <PlayCircle className="h-4 w-4 mr-2 text-emerald-600" />
                          )}
                          Riattiva Azienda
                        </DropdownMenuItem>
                      ) : onSuspend ? (
                        <DropdownMenuItem
                          onClick={() => setShowSuspendDialog(true)}
                          disabled={isUpdatingStatus}
                          className="text-amber-600 focus:text-amber-600"
                        >
                          {isUpdatingStatus ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <PauseCircle className="h-4 w-4 mr-2" />
                          )}
                          Sospendi Azienda
                        </DropdownMenuItem>
                      ) : null}
                    </>
                  )}
                  {onDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setShowDeleteDialog(true)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Elimina Azienda
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </Card>

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={showSuspendDialog} onOpenChange={setShowSuspendDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sospendi {company.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              L'azienda non potrà più accedere alla piattaforma. Potrai riattivare l'accesso in qualsiasi momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => {
                onSuspend?.();
                setShowSuspendDialog(false);
              }}
            >
              <PauseCircle className="h-4 w-4 mr-2" />
              Sospendi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Double-Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={(open) => {
        setShowDeleteDialog(open);
        if (!open) setDeleteConfirmText("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">Elimina {company.name}?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                L'azienda sparisce subito dall'operatività e i suoi utenti non
                possono più accedere. I dati restano conservati e{" "}
                <strong>ripristinabili per 30 giorni</strong>; dopo quel termine
                vengono eliminati definitivamente.
              </span>
              <span className="block text-sm">
                Prima della cancellazione viene salvato un export completo
                (anagrafica, team, commesse, preventivi, fatture, clienti).
              </span>
              {impattoInCorso && (
                <span className="block text-sm text-muted-foreground">
                  Calcolo di quanti dati verranno coinvolti…
                </span>
              )}
              {impatto && impatto.record_totali > 0 && (
                <span className="block rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                  <span className="block text-sm font-medium text-destructive">
                    {impatto.record_totali.toLocaleString("it-IT")} record in{" "}
                    {impatto.tabelle_coinvolte} tabelle
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {(impatto.dettaglio ?? []).slice(0, 5).map((r) => (
                      <span key={r.tabella} className="mr-2 inline-block">
                        {r.tabella}: <strong>{r.record.toLocaleString("it-IT")}</strong>
                      </span>
                    ))}
                  </span>
                </span>
              )}
              <span className="block text-sm">
                Per confermare, digita il nome dell'azienda: <strong>{company.name}</strong>
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder={company.name}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            className="border-destructive/30 focus-visible:ring-destructive/30"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canConfirmDelete}
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                onDelete?.();
                setShowDeleteDialog(false);
                setDeleteConfirmText("");
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Cancella azienda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
