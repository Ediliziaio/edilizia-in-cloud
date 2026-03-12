import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDocumentiFiscali } from "@/hooks/useDocumentiFiscali";
import { creaFatturaDaDDT } from "@/lib/fatturazione/fatturazioneAvanzata";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

export default function DDTList() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"tutti" | "da_fatturare" | "fatturati">("tutti");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useDocumentiFiscali({ tipo: "ddt" });
  const ddts = data?.documenti ?? [];

  const filtered = ddts.filter((d) => {
    if (filter === "da_fatturare") return !d.ddt_fatturato;
    if (filter === "fatturati") return !!d.ddt_fatturato;
    return true;
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.id)));
    }
  };

  const handleCreaFattura = async () => {
    try {
      setCreating(true);
      const prefilled = await creaFatturaDaDDT(Array.from(selected));
      navigate("/azienda/documenti/nuovo?tipo=fattura", { state: { prefilled } });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Check if all selected DDTs belong to the same client
  const selectedDocs = ddts.filter((d) => selected.has(d.id));
  const uniqueClients = new Set(selectedDocs.map((d) => d.anagrafica_id).filter(Boolean));
  const canCreate = selected.size > 0 && uniqueClients.size <= 1;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Documenti di Trasporto</h1>
          <p className="text-sm text-muted-foreground">{ddts.length} DDT totali</p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <Button
              onClick={handleCreaFattura}
              disabled={!canCreate || creating}
              size="sm"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : (
                <FileText className="h-4 w-4 mr-1" />
              )}
              Crea fattura da {selected.size} DDT
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => navigate("/azienda/documenti/nuovo?tipo=ddt")}
          >
            <Plus className="h-4 w-4 mr-1" /> Nuovo DDT
          </Button>
        </div>
      </div>

      {!canCreate && selected.size > 0 && uniqueClients.size > 1 && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          I DDT selezionati appartengono a clienti diversi. Seleziona solo DDT dello stesso cliente.
        </div>
      )}

      <Tabs value={filter} onValueChange={(v) => { setFilter(v as any); setSelected(new Set()); }}>
        <TabsList>
          <TabsTrigger value="tutti">Tutti</TabsTrigger>
          <TabsTrigger value="da_fatturare">Da fatturare</TabsTrigger>
          <TabsTrigger value="fatturati">Fatturati</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          Nessun DDT trovato
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium">Numero</th>
                  <th className="p-3 text-left font-medium">Data</th>
                  <th className="p-3 text-left font-medium">Cliente</th>
                  <th className="p-3 text-right font-medium">N. articoli</th>
                  <th className="p-3 text-left font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ddt) => (
                  <tr
                    key={ddt.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/azienda/documenti/${ddt.id}/dettaglio`)}
                  >
                    <td className="p-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(ddt.id)}
                        onCheckedChange={() => toggleSelect(ddt.id)}
                      />
                    </td>
                    <td className="p-3 font-mono">{ddt.numero}</td>
                    <td className="p-3">{ddt.data_emissione}</td>
                    <td className="p-3">{ddt.cliente_snapshot?.ragione_sociale ?? "—"}</td>
                    <td className="p-3 text-right">{ddt.righe?.length ?? 0}</td>
                    <td className="p-3">
                      {ddt.ddt_fatturato ? (
                        <Badge variant="default" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Fatturato
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 text-amber-700">
                          Da fatturare
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
