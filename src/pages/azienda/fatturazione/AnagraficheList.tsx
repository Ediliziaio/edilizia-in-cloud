import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAnagraficheNative } from "@/hooks/useAnagraficheNative";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Loader2, Upload } from "lucide-react";
import type { AnagraficaNative, TipoCliente } from "@/types/fatturazione";

const TIPO_COLORS: Record<string, string> = {
  B2B: "bg-blue-100 text-blue-700",
  B2C: "bg-green-100 text-green-700",
  PA: "bg-violet-100 text-violet-700",
  Estero: "bg-amber-100 text-amber-700",
};

function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AnagraficheList() {
  const navigate = useNavigate();
  const [tipoTab, setTipoTab] = useState<"tutti" | "cliente" | "fornitore">("tutti");
  const [search, setSearch] = useState("");
  const [tipoCliente, setTipoCliente] = useState<string>("all");
  const [soloAttivi, setSoloAttivi] = useState(true);

  const { data: rawData, isLoading } = useAnagraficheNative(search || undefined);
  const anagrafiche = (rawData ?? []) as unknown as AnagraficaNative[];

  const filtered = useMemo(() => {
    return anagrafiche.filter((a) => {
      if (tipoTab === "cliente" && a.tipo !== "cliente" && a.tipo !== "entrambi") return false;
      if (tipoTab === "fornitore" && a.tipo !== "fornitore" && a.tipo !== "entrambi") return false;
      if (tipoCliente !== "all" && a.tipo_cliente !== tipoCliente) return false;
      if (soloAttivi && !a.attivo) return false;
      return true;
    });
  }, [anagrafiche, tipoTab, tipoCliente, soloAttivi]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Anagrafica</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-1" /> Importa Excel
          </Button>
          <Button size="sm" onClick={() => navigate("/azienda/documenti/anagrafiche/nuovo")}>
            <Plus className="h-4 w-4 mr-1" /> Nuova anagrafica
          </Button>
        </div>
      </div>

      <Tabs value={tipoTab} onValueChange={(v) => setTipoTab(v as any)}>
        <TabsList>
          <TabsTrigger value="tutti">Tutti</TabsTrigger>
          <TabsTrigger value="cliente">Clienti</TabsTrigger>
          <TabsTrigger value="fornitore">Fornitori</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca per nome, P.IVA, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={tipoCliente} onValueChange={setTipoCliente}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="B2B">B2B</SelectItem>
            <SelectItem value="B2C">B2C</SelectItem>
            <SelectItem value="PA">PA</SelectItem>
            <SelectItem value="Estero">Estero</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Switch id="attivi" checked={soloAttivi} onCheckedChange={setSoloAttivi} />
          <Label htmlFor="attivi" className="text-sm">Solo attivi</Label>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">Nessuna anagrafica trovata</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left font-medium">Anagrafica</th>
                  <th className="p-3 text-left font-medium">P.IVA</th>
                  <th className="p-3 text-left font-medium">Tipo</th>
                  <th className="p-3 text-right font-medium">Fatturato</th>
                  <th className="p-3 text-right font-medium">N. fatture</th>
                  <th className="p-3 text-left font-medium">Ultima fattura</th>
                  <th className="p-3 text-left font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => navigate(`/azienda/documenti/anagrafiche/${a.id}`)}
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(a.ragione_sociale ?? `${a.nome} ${a.cognome}`)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium">
                          {a.ragione_sociale ?? `${a.nome ?? ""} ${a.cognome ?? ""}`.trim()}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 font-mono text-xs">{a.partita_iva ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant="secondary" className={TIPO_COLORS[a.tipo_cliente] ?? ""}>
                        {a.tipo_cliente}
                      </Badge>
                    </td>
                    <td className="p-3 text-right font-mono">€ {(a.fatturato_totale ?? 0).toFixed(2)}</td>
                    <td className="p-3 text-right">{a.numero_fatture ?? 0}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {a.ultima_fattura_at ? a.ultima_fattura_at.substring(0, 10) : "—"}
                    </td>
                    <td className="p-3">
                      <Badge variant={a.attivo ? "default" : "secondary"}>
                        {a.attivo ? "Attivo" : "Inattivo"}
                      </Badge>
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
