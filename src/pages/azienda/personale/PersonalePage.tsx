import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComingSoonPlaceholder } from "@/components/users/ComingSoonPlaceholder";
import { Users, Clock, CalendarDays, FileText, MapPin, CalendarCheck, Network } from "lucide-react";
import { TabOrganigramma } from "./tabs/TabOrganigramma";
import { TabTimbrature } from "./tabs/TabTimbrature";

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
          <ComingSoonPlaceholder
            icon={Users}
            title="Profili Dipendenti"
            description="Anagrafica completa del personale"
            comingSoonText="La gestione profili sarà disponibile nel prossimo aggiornamento."
          />
        </TabsContent>
        <TabsContent value="timbrature">
          <ComingSoonPlaceholder
            icon={Clock}
            title="Timbrature"
            description="Registrazione entrate, uscite e pause"
            comingSoonText="Il sistema timbrature sarà disponibile nel prossimo aggiornamento."
          />
        </TabsContent>
        <TabsContent value="presenze">
          <ComingSoonPlaceholder
            icon={CalendarDays}
            title="Presenze & Foglio Ore"
            description="Riepilogo giornaliero delle presenze"
            comingSoonText="Il foglio presenze sarà disponibile nel prossimo aggiornamento."
          />
        </TabsContent>
        <TabsContent value="richieste">
          <ComingSoonPlaceholder
            icon={FileText}
            title="Richieste Ferie & Permessi"
            description="Gestione richieste assenze"
            comingSoonText="Le richieste ferie/permessi saranno disponibili nel prossimo aggiornamento."
          />
        </TabsContent>
        <TabsContent value="sedi">
          <ComingSoonPlaceholder
            icon={MapPin}
            title="Sedi"
            description="Gestione sedi operative per la timbratura"
            comingSoonText="La gestione sedi sarà disponibile nel prossimo aggiornamento."
          />
        </TabsContent>
        <TabsContent value="festivita">
          <ComingSoonPlaceholder
            icon={CalendarCheck}
            title="Festività"
            description="Calendario festività aziendali"
            comingSoonText="Il calendario festività sarà disponibile nel prossimo aggiornamento."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
