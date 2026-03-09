import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { SuppliersConfig } from "@/components/settings/SuppliersConfig";
import { SuppliersOperational } from "@/pages/azienda/Suppliers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Truck } from "lucide-react";

export default function SettingsSuppliers() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const isAdmin = role === "company_admin" || role === "super_admin";

  useEffect(() => {
    if (!isAdmin) {
      navigate("/azienda", { replace: true });
    }
  }, [isAdmin, navigate]);

  if (!isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Truck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Fornitori</h1>
      </div>

      <Tabs defaultValue="anagrafica">
        <TabsList>
          <TabsTrigger value="anagrafica">Anagrafica</TabsTrigger>
          <TabsTrigger value="operativo">Operativo</TabsTrigger>
        </TabsList>
        <TabsContent value="anagrafica" className="mt-4">
          <SuppliersConfig />
        </TabsContent>
        <TabsContent value="operativo" className="mt-4">
          <SuppliersOperational />
        </TabsContent>
      </Tabs>
    </div>
  );
}
