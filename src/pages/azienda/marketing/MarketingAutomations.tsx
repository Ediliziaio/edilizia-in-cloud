import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutomationFlowsList } from "@/components/marketing/automations/AutomationFlowsList";
import { Plus, Zap } from "lucide-react";

export default function MarketingAutomations() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("all");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Zap className="h-6 w-6 text-orange-500" />
            Automazioni Marketing
          </h1>
          <p className="text-muted-foreground">
            Crea flussi automatici visuali per nurturing, follow-up e gestione lead.
          </p>
        </div>
        <Button onClick={() => navigate("/azienda/marketing/automazioni/nuova")}>
          <Plus className="h-4 w-4 mr-2" /> Nuova Automazione
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="all">Tutte</TabsTrigger>
          <TabsTrigger value="published">Attive</TabsTrigger>
          <TabsTrigger value="draft">Bozza</TabsTrigger>
          <TabsTrigger value="archived">Archiviate</TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-4">
          <AutomationFlowsList statusFilter={tab} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
