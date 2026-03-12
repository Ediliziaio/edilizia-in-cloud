import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Clock, CalendarDays, FileText, MapPin, CalendarCheck, Network } from "lucide-react";
import { TabOrganigramma } from "./tabs/TabOrganigramma";
import { TabTimbrature } from "./tabs/TabTimbrature";
import { TabPresenze } from "./tabs/TabPresenze";
import { TabRichieste } from "./tabs/TabRichieste";
import { TabSedi } from "./tabs/TabSedi";
import { TabFestivita } from "./tabs/TabFestivita";
import { TabProfili } from "./tabs/TabProfili";

export default function PersonalePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Personale & HR</h1>
        <p className="text-muted-foreground">Gestione presenze, ferie, timbrature e anagrafiche del personale.</p>
      </div>

      <Tabs defaultValue="organigramma" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="organigramma" className="gap-1.5">
            <Network className="h-4 w-4" /> Organigramma
          </TabsTrigger>
          <TabsTrigger value="profili" className="gap-1.5">
            <Users className="h-4 w-4" /> Profili
          </TabsTrigger>
          <TabsTrigger value="timbrature" className="gap-1.5">
            <Clock className="h-4 w-4" /> Timbrature
          </TabsTrigger>
          <TabsTrigger value="presenze" className="gap-1.5">
            <CalendarDays className="h-4 w-4" /> Presenze
          </TabsTrigger>
          <TabsTrigger value="richieste" className="gap-1.5">
            <FileText className="h-4 w-4" /> Richieste
          </TabsTrigger>
          <TabsTrigger value="sedi" className="gap-1.5">
            <MapPin className="h-4 w-4" /> Sedi
          </TabsTrigger>
          <TabsTrigger value="festivita" className="gap-1.5">
            <CalendarCheck className="h-4 w-4" /> Festività
          </TabsTrigger>
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
      </Tabs>
    </div>
  );
}
