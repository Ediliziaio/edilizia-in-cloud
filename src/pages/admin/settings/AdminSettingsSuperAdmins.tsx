import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Building } from "lucide-react";
import PlatformTeamTab from "@/components/admin/settings/PlatformTeamTab";
import MultiCompanyUsersTab from "@/components/admin/settings/MultiCompanyUsersTab";

export default function AdminSettingsSuperAdmins() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Gestione Utenti Piattaforma</h1>
        <p className="text-muted-foreground">Gestisci il team interno e gli utenti multi-azienda</p>
      </div>

      <Tabs defaultValue="team" className="space-y-6">
        <TabsList>
          <TabsTrigger value="team" className="gap-2">
            <Users className="h-4 w-4" /> Team Piattaforma
          </TabsTrigger>
          <TabsTrigger value="multi-company" className="gap-2">
            <Building className="h-4 w-4" /> Multi-Azienda
          </TabsTrigger>
        </TabsList>

        <TabsContent value="team">
          <PlatformTeamTab />
        </TabsContent>
        <TabsContent value="multi-company">
          <MultiCompanyUsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
