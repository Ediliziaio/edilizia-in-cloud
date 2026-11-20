import { useSearchParams } from "react-router-dom";
import BankConnectionsCard from "@/components/integrations/BankConnectionsCard";
import { ContiBancariManuali } from "@/components/settings/ContiBancariManuali";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsBanca() {
  const { effectiveCompany } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "manuali" ? "manuali" : "collegati";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 max-sm:text-lg">Banca</h1>
      <Tabs value={tab} onValueChange={(value) => {
        const next = new URLSearchParams(params);
        next.set("tab", value);
        setParams(next, { replace: true });
      }}>
        <TabsList aria-label="Gestione conti bancari">
          <TabsTrigger value="collegati">Conti collegati</TabsTrigger>
          <TabsTrigger value="manuali">Conti manuali</TabsTrigger>
        </TabsList>
        <TabsContent value="collegati" className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">
            Collega i conti correnti dell'azienda in sola lettura. I movimenti arrivano da soli e si
            abbinano a fatture e costi. Le credenziali si inseriscono sul sito della banca.
          </p>
          <BankConnectionsCard />
        </TabsContent>
        <TabsContent value="manuali" className="pt-2">
          <ContiBancariManuali key={effectiveCompany?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
