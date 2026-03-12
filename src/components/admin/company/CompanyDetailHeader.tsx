import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Building2, Mail, LogIn, Calendar, MapPin, Globe } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import type { Company, CompanyStatus } from "@/types/auth";
import { statusConfig, sectorLabels } from "@/lib/companyUtils";

interface CompanyDetailHeaderProps {
  company: Company;
  onBack: () => void;
  onImpersonate: () => void;
}

export function CompanyDetailHeader({ company, onBack, onImpersonate }: CompanyDetailHeaderProps) {
  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;
  const sectorLabel = sectorLabels[company.sector] || company.sector;

  const createdDate = format(new Date(company.created_at), "d MMM yyyy", { locale: it });
  const daysSinceCreation = differenceInDays(new Date(), new Date(company.created_at));

  const trialDaysLeft = company.trial_ends_at
    ? differenceInDays(new Date(company.trial_ends_at), new Date())
    : null;

  return (
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
                  {company.city && (
                    <>
                      <Separator orientation="vertical" className="h-3.5" />
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5" />
                        {company.city}
                        {company.province ? ` (${company.province})` : ""}
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

          <Button onClick={onImpersonate} className="shrink-0">
            <LogIn className="h-4 w-4 mr-2" />
            Accedi come Admin
          </Button>
        </div>
      </div>
    </Card>
  );
}
