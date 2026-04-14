import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, CalendarDays, FileText, MapPin, CalendarCheck, Network, Receipt, Navigation, FolderOpen } from "lucide-react";
import { TabOrganigramma } from "./tabs/TabOrganigramma";
import { TabTimbrature } from "./tabs/TabTimbrature";
import { TabPresenze } from "./tabs/TabPresenze";
import { TabRichieste } from "./tabs/TabRichieste";
import { TabSedi } from "./tabs/TabSedi";
import { TabFestivita } from "./tabs/TabFestivita";
import { TabProfili } from "./tabs/TabProfili";
import { TabCedolini } from "./tabs/TabCedolini";
import { TabGpsPercorsi } from "./tabs/TabGpsPercorsi";
import { TabDocumenti } from "./tabs/TabDocumenti";
import { useFleetTrackAccess } from "@/hooks/useFleetTrackAccess";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";

export default function PersonalePage() {
  const hasFleetTrack = useFleetTrackAccess();
  const { isScopriPlan } = useSubscriptionLimits();

  if (isScopriPlan) return <UpgradeScopriWall type="hr_completo" inline />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personale & HR</h1>
        <p className="text-muted-foreground">Gestione presenze, ferie, timbrature e anagrafiche del personale.</p>
      </div>

      <Tabs defaultValue="organigramma" className="w-full">
        <TabsList className="flex flex-nowrap h-auto gap-1 p-1 w-full justify-start overflow-x-auto scrollbar-none">
          <TabsTrigger value="organigramma" className="gap-1.5 shrink-0">
            <Network className="h-4 w-4" /> Organigramma
          </TabsTrigger>
          <TabsTrigger value="profili" className="gap-1.5 shrink-0">
            <Users className="h-4 w-4" /> Profili
          </TabsTrigger>
          <TabsTrigger value="timbrature" className="gap-1.5 shrink-0">
            <Clock className="h-4 w-4" /> Timbrature
          </TabsTrigger>
          <TabsTrigger value="presenze" className="gap-1.5 shrink-0">
            <CalendarDays className="h-4 w-4" /> Presenze
          </TabsTrigger>
          <TabsTrigger value="richieste" className="gap-1.5 shrink-0">
            <FileText className="h-4 w-4" /> Richieste
          </TabsTrigger>
          <TabsTrigger value="sedi" className="gap-1.5 shrink-0">
            <MapPin className="h-4 w-4" /> Sedi
          </TabsTrigger>
          <TabsTrigger value="festivita" className="gap-1.5 shrink-0">
            <CalendarCheck className="h-4 w-4" /> Festività
          </TabsTrigger>
          <TabsTrigger value="cedolini" className="gap-1.5 shrink-0">
            <Receipt className="h-4 w-4" /> Cedolini
          </TabsTrigger>
          <TabsTrigger value="documenti" className="gap-1.5 shrink-0">
            <FolderOpen className="h-4 w-4" /> Documenti
          </TabsTrigger>
          {hasFleetTrack && (
            <TabsTrigger value="gps-percorsi" className="gap-1.5 shrink-0">
              <Navigation className="h-4 w-4" /> GPS Percorsi
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="organigramma">
          <TabOrganigramma />
        </TabsContent>
        <TabsContent value="profili">
          <TabProfili />
        </TabsContent>
        <TabsContent value="timbrature">
          <TabTimbrature />
        </TabsContent>
        <TabsContent value="presenze">
          <TabPresenze />
        </TabsContent>
        <TabsContent value="richieste">
          <TabRichieste />
        </TabsContent>
        <TabsContent value="sedi">
          <TabSedi />
        </TabsContent>
        <TabsContent value="festivita">
          <TabFestivita />
        </TabsContent>
        <TabsContent value="cedolini">
          <TabCedolini />
        </TabsContent>
        <TabsContent value="documenti">
          <TabDocumenti />
        </TabsContent>
        {hasFleetTrack && (
          <TabsContent value="gps-percorsi">
            <TabGpsPercorsi />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
