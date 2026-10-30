import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { PlatformCompanyProvider } from "@/components/admin/PlatformCompanyProvider";
import { PipelinesConfig } from "@/components/settings/PipelinesConfig";
import { Button } from "@/components/ui/button";

export default function AdminSettingsPipelines() {
  return (
    <PlatformCompanyProvider>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pipeline di vendita</h1>
            <p className="text-muted-foreground max-sm:hidden">
              Gestisci pipeline e fasi del CRM interno. Le pipeline delle aziende clienti restano separate.
            </p>
          </div>
          {/* Link secondario: porta fuori dalle impostazioni, al CRM. Prima era «Torna alle opportunità» in evidenza. */}
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link to="/admin/marketing/opportunita">
              Apri le opportunità <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
        <PipelinesConfig />
      </div>
    </PlatformCompanyProvider>
  );
}
