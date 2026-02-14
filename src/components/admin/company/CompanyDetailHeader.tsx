import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Building2, Mail, LogIn } from "lucide-react";
import type { Company, CompanyStatus } from "@/types/auth";
import { statusConfig } from "@/lib/companyUtils";

interface CompanyDetailHeaderProps {
  company: Company;
  onBack: () => void;
  onImpersonate: () => void;
}

export function CompanyDetailHeader({ company, onBack, onImpersonate }: CompanyDetailHeaderProps) {
  const companyStatus = (company.status || "trial") as CompanyStatus;
  const statusCfg = statusConfig[companyStatus] || statusConfig.trial;

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-4">
          {company.logo_url ? (
            <img src={company.logo_url} alt={company.name} className="h-12 w-12 rounded-xl object-cover" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{company.name}</h1>
              <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{company.email}</span>
              {company.business_name && <span>· {company.business_name}</span>}
            </div>
          </div>
        </div>
      </div>
      <Button onClick={onImpersonate}>
        <LogIn className="h-4 w-4 mr-2" />
        Accedi come Admin
      </Button>
    </div>
  );
}
