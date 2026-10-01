import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
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
            <p className="text-muted-foreground">
              Gestisci pipeline e fasi del CRM interno. Le pipeline delle aziende clienti restano separate.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/admin/marketing/opportunita">
              <ArrowLeft className="mr-2 h-4 w-4" /> Torna alle opportunità
            </Link>
          </Button>
        </div>
        <PipelinesConfig />
      </div>
    </PlatformCompanyProvider>
  );
}
