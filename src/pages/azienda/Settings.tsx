import { useState } from "react";
import { Building2, ListOrdered, Truck, Key, Users, UserCheck, HardHat } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OrderStatusConfig } from "@/components/settings/OrderStatusConfig";
import { LogoUploader } from "@/components/settings/LogoUploader";
import { SuppliersConfig } from "@/components/settings/SuppliersConfig";
import { ChangePasswordForm } from "@/components/settings/ChangePasswordForm";
import { UsersConfig } from "@/components/settings/UsersConfig";
import { SalespeopleConfig } from "@/components/settings/SalespeopleConfig";
import Employees from "@/pages/azienda/Employees";

export default function Settings() {
  const { effectiveCompany, refreshAuth, role } = useAuth();
  const company = effectiveCompany;
  const [activeTab, setActiveTab] = useState("stati-ordine");

  // Only company_admin can see Users and Salespeople tabs
  const isAdmin = role === "company_admin" || role === "super_admin";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni</h1>
        <p className="text-muted-foreground">
          Configura le impostazioni della tua azienda
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-7' : 'grid-cols-4'} lg:w-[${isAdmin ? '1000' : '650'}px]`}>
          <TabsTrigger value="profilo" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Profilo</span>
          </TabsTrigger>
          <TabsTrigger value="stati-ordine" className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            <span className="hidden sm:inline">Stati</span>
          </TabsTrigger>
          <TabsTrigger value="fornitori" className="flex items-center gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Fornitori</span>
          </TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="utenti" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Utenti</span>
              </TabsTrigger>
              <TabsTrigger value="venditori" className="flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Venditori</span>
              </TabsTrigger>
              <TabsTrigger value="operai" className="flex items-center gap-2">
                <HardHat className="h-4 w-4" />
                <span className="hidden sm:inline">Operai</span>
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="sicurezza" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            <span className="hidden sm:inline">Sicurezza</span>
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

        {isAdmin && (
          <>
            <TabsContent value="utenti" className="mt-6">
              <UsersConfig />
            </TabsContent>

            <TabsContent value="venditori" className="mt-6">
              <SalespeopleConfig />
            </TabsContent>
            <TabsContent value="operai" className="mt-6">
              <Employees />
            </TabsContent>
          </>
        )}

        <TabsContent value="sicurezza" className="mt-6">
          <ChangePasswordForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}

