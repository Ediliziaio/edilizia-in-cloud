/**
 * WarehouseUsciteTab — elenco delle USCITE merce registrate (Fase 1) con il
 * "doppio controllo": ogni uscita registrata può poi diventare un DDT (Fase 2)
 * tramite il bottone "Crea DDT" (RPC create_ddt_from_uscita).
 *
 * Le uscite con DDT già creato mostrano il link al documento.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowUpFromLine, FileText, Loader2, User, HardHat, PencilLine, ExternalLink, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useBillingMode } from "@/contexts/BillingModeContext";
import { useShipmentDDTPDF } from "@/hooks/useShipmentDDTPDF";
import { useWarehouseUscite, useCreateDdtFromUscita, type UscitaRow } from "@/hooks/warehouse/useWarehouseUscita";

const STATO_BADGE: Record<UscitaRow["stato"], { label: string; variant: "default" | "secondary" | "outline" }> = {
  registrata: { label: "Registrata", variant: "secondary" },
  ddt_creato: { label: "DDT creato", variant: "default" },
  annullata: { label: "Annullata", variant: "outline" },
};

const TIPO_ICON = { cliente: User, cantiere: HardHat, libero: PencilLine } as const;

function destinatarioLabel(u: UscitaRow): string {
  return (
    u.cliente_snapshot?.ragione_sociale ||
    u.destinatario_libero?.ragione_sociale ||
    (u.destinatario_tipo === "cantiere" ? "Cantiere/commessa" : u.destinatario_tipo === "cliente" ? "Cliente" : "Destinatario libero")
  );
}

export function WarehouseUsciteTab({ warehouseFilter }: { warehouseFilter: string | null }) {
  const navigate = useNavigate();
  const { isNative } = useBillingMode();
  const { generate: generateDDT } = useShipmentDDTPDF();
  const { data: uscite = [], isLoading } = useWarehouseUscite(warehouseFilter);
  const createDdt = useCreateDdtFromUscita();
  const [search, setSearch] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return uscite;
    return uscite.filter((u) => `${u.numero} ${destinatarioLabel(u)}`.toLowerCase().includes(q));
  }, [uscite, search]);

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowUpFromLine className="h-4 w-4 text-muted-foreground" /> Uscite merce
        </CardTitle>
        <CardDescription>
          Le uscite registrate. Da qui crei il <strong>DDT</strong> quando vuoi (doppio controllo): prima registri l'uscita, poi generi il documento.
        </CardDescription>
        <Input className="mt-2 max-w-xs" placeholder="Cerca per numero o destinatario…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {isLoading && <div className="py-10 text-center text-sm text-muted-foreground">Caricamento…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nessuna uscita registrata. Usa <strong>"Uscita merce"</strong> per registrarne una.
            </div>
          )}
          {filtered.map((u) => {
            const Icon = TIPO_ICON[u.destinatario_tipo] ?? PencilLine;
            const badge = STATO_BADGE[u.stato];
            const nRighe = Array.isArray(u.righe) ? u.righe.length : 0;
            return (
              <div key={u.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-medium">{u.numero}</span>
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3" /> {destinatarioLabel(u)}
                    </span>
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
      </CardContent>
    </Card>
  );
}
