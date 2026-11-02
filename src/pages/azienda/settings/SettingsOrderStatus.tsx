// MP-IMP-001 Fase 2 — gating gestito da withCompanyPermission("canViewSettingsOrders") in companyRoutes.tsx
// Il titolo e la frase della pagina li mette già il layout delle Impostazioni: qui c'è solo il contenuto.
import { useState } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrderStatusConfig } from "@/components/settings/OrderStatusConfig";
import { PlaybookEditorDialog } from "@/components/orders/PlaybookEditorDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function SettingsOrderStatus() {
  const { effectiveCompany } = useAuth();
  const [flussoAperto, setFlussoAperto] = useState(false);

  return (
    <div className="space-y-4">
      <OrderStatusConfig />
      {/* Il flusso vale per tutta l'azienda: sta qui e non nel menu della singola commessa. */}
      {effectiveCompany?.id && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-primary" aria-hidden="true" /> Flusso di lavoro commessa</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Le attività standard di ogni commessa: chi fa cosa e quando. Si applicano dalla commessa, o da sole a quelle nuove.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setFlussoAperto(true)}>Gestisci flusso</Button>
            </CardContent>
          </Card>
          {flussoAperto && <PlaybookEditorDialog open onOpenChange={setFlussoAperto} companyId={effectiveCompany.id} vertical={effectiveCompany.vertical} />}
        </>
      )}
    </div>
  );
}
