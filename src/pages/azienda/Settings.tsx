import { useState } from "react";
import { Building2, ListOrdered, Truck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderStatusConfig } from "@/components/settings/OrderStatusConfig";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { SuppliersConfig } from "@/components/settings/SuppliersConfig";

export default function Settings() {
  const { effectiveCompany, refreshAuth } = useAuth();
  const company = effectiveCompany;
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
        <TabsList className="grid w-full grid-cols-3 lg:w-[500px]">
          <TabsTrigger value="profilo" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Profilo Azienda
          </TabsTrigger>
          <TabsTrigger value="stati-ordine" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Stati Ordine
          </TabsTrigger>
          <TabsTrigger value="fornitori" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            Fornitori
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
                Gestisci le informazioni della tua azienda
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Company Info */}
              <div className="flex items-center gap-4">
                {company?.logo_url ? (
                  <img
                    src={company.logo_url}
                    alt={company.name}
                    className="h-16 w-16 rounded-lg object-contain border"
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

              <Separator />

              {/* Logo Uploader */}
              <LogoUploader 
                company={company} 
                onLogoUpdated={refreshAuth} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stati-ordine" className="mt-6">
          <OrderStatusConfig />
        </TabsContent>

        <TabsContent value="fornitori" className="mt-6">
          <SuppliersConfig />
        </TabsContent>
      </Tabs>
    </div>
  );
}

