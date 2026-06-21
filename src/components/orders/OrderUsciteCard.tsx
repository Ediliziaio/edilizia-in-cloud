/**
 * OrderUsciteCard — uscite di magazzino registrate per una commessa.
 *
 * Mostra le uscite (warehouse_uscite con order_id = questa commessa) con stato
 * registrata / DDT creato, e permette di generare il DDT direttamente da qui
 * (RPC create_ddt_from_uscita) — stesso "doppio controllo" della scheda Uscite.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpFromLine, FileText, Loader2, ExternalLink, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { useUsciteByOrder, useCreateDdtFromUscita, type UscitaRow } from "@/hooks/warehouse/useWarehouseUscita";

const STATO: Record<UscitaRow["stato"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  registrata: { label: "Registrata", variant: "secondary" },
  ddt_creato: { label: "DDT creato", variant: "default" },
  annullata: { label: "Annullata", variant: "outline" },
};

export function OrderUsciteCard({ orderId }: { orderId: string }) {
  const navigate = useNavigate();
  const { isNative } = useBillingMode();
  const { generate: generateDDT } = useShipmentDDTPDF();
  const { data: uscite = [], isLoading } = useUsciteByOrder(orderId);
  const createDdt = useCreateDdtFromUscita();
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const handleCreateDdt = async (u: UscitaRow) => {
    setCreatingId(u.id);
    try {
      const res = await createDdt.mutateAsync({ uscitaId: u.id });
      toast.success(`DDT ${res.numero_ddt} creato dalla uscita ${u.numero}`);
      if (res.documento_id) {
        if (isNative) navigate(`/azienda/documenti/${res.documento_id}`);
        else void generateDDT(res.documento_id);
      }
    } catch (e) {
      toast.error(`Errore creazione DDT: ${(e as Error).message}`);
    } finally {
      setCreatingId(null);
    }
  };

  // Card sempre presente: anche vuota spiega come registrare un'uscita.
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" /> Uscite di magazzino
        </CardTitle>
        <CardDescription className="text-xs">
          Merce uscita dal magazzino per questa commessa. Da qui generi il <strong>DDT</strong> quando vuoi.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Caricamento…</div>
        ) : uscite.length === 0 ? (
          <div className="px-4 pb-4 text-sm text-muted-foreground">
            Nessuna uscita registrata. La registri da <strong>Magazzino → Uscita merce</strong> scegliendo
            questa commessa come destinazione (Cantiere).
          </div>
        ) : (
          <div className="divide-y">
            {uscite.map((u) => {
              const badge = STATO[u.stato];
              const nRighe = Array.isArray(u.righe) ? u.righe.length : 0;
              return (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-medium">{u.numero}</span>
                      <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                      {u.vettore && u.vettore.tipo !== "mittente" && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Truck className="h-3 w-3" /> {"ragione_sociale" in u.vettore ? u.vettore.ragione_sociale : "vettore"}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {new Date(u.data).toLocaleDateString("it-IT")} · {nRighe} {nRighe === 1 ? "articolo" : "articoli"}
                      {u.note ? ` · ${u.note}` : ""}
                    </div>
                  </div>
                  {u.stato === "registrata" ? (
                    <Button size="sm" onClick={() => handleCreateDdt(u)} disabled={creatingId === u.id}>
                      {creatingId === u.id ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                      Crea DDT
                    </Button>
                  ) : u.documento_id ? (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/azienda/documenti/${u.documento_id}`)}>
                      <ExternalLink className="h-4 w-4 mr-2" /> Apri DDT
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
