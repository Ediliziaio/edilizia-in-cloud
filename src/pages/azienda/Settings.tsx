import { useState } from "react";
import { Building2, Settings as SettingsIcon, ListOrdered } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrderStatusConfig } from "@/components/settings/OrderStatusConfig";

export default function Settings() {
  const { company } = useAuth();
  const [activeTab, setActiveTab] = useState("stati-ordine");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni</h1>
        <p className="text-muted-foreground">
          Configura le impostazioni della tua azienda
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 lg:w-[400px]">
          <TabsTrigger value="profilo" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Profilo Azienda
          </TabsTrigger>
          <TabsTrigger value="stati-ordine" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Stati Ordine
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profilo" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Profilo Azienda
              </CardTitle>
              <CardDescription>
                Modifica le informazioni della tua azienda
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  {company?.logo_url ? (
                    <img
                      src={company.logo_url}
                      alt={company.name}
                      className="h-16 w-16 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-primary" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold text-lg">{company?.name}</h3>
                    <p className="text-muted-foreground">{company?.email}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  La modifica del profilo azienda sarà disponibile a breve
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stati-ordine" className="mt-6">
          <OrderStatusConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}
