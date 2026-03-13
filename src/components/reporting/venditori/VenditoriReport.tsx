import { BarChart3, Target, Activity, TrendingUp, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";

const SUB_TABS = [
  { value: "dashboard", label: "Dashboard", icon: BarChart3 },
  { value: "pipeline", label: "Pipeline", icon: TrendingUp },
  { value: "performance", label: "Performance", icon: Users },
  { value: "obiettivi", label: "Obiettivi", icon: Target },
  { value: "attivita", label: "Attività", icon: Activity },
];

export default function VenditoriReport() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {SUB_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value} className="text-xs sm:text-sm gap-1.5">
              <Icon className="h-3.5 w-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {SUB_TABS.map(({ value, label, icon: Icon }) => (
          <TabsContent key={value} value={value} className="mt-6">
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Icon className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">{label}</h3>
              <p className="text-sm text-muted-foreground/70 mt-1">
                In arrivo con SALES-REP-02+
              </p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
