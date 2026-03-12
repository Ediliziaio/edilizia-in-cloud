import { useState } from "react";
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
                  <img
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
                    <DropdownMenuItem onClick={onExport}>
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
                Questa azione è <strong>irreversibile</strong>. Tutti i dati dell'azienda (ordini, clienti, team, documenti) verranno eliminati permanentemente.
              </span>
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
              Elimina Definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
