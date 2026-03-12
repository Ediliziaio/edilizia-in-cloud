import { useState } from "react";
import { useOrganigramma, useSyncFromEmployees } from "@/hooks/useOrganigramma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Search, RefreshCw, Users, Building2, MapPin, UserPlus, List, Network } from "lucide-react";
import type { HrProfilo, OrgTreeNode } from "@/types/hr";
import { HrProfiloSheet } from "@/components/hr/HrProfiloSheet";
import { OrgTreeView } from "@/components/hr/OrgTreeView";

const REPARTO_COLORS: Record<string, string> = {
  Direzione: "bg-slate-700 text-white",
  Tecnico: "bg-blue-600 text-white",
  Cantiere: "bg-amber-600 text-white",
  Commerciale: "bg-green-600 text-white",
  Amministrazione: "bg-purple-600 text-white",
};

function getRepartoBadgeClass(reparto: string | null) {
  if (!reparto) return "bg-muted text-muted-foreground";
  return REPARTO_COLORS[reparto] || "bg-sky-500 text-white";
}

export function TabOrganigramma() {
  const { data, isLoading } = useOrganigramma();
  const syncMutation = useSyncFromEmployees();
  const [search, setSearch] = useState("");
  const [filterReparto, setFilterReparto] = useState<string>("__all__");
  const [editingProfilo, setEditingProfilo] = useState<HrProfilo | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const profili = data?.profili || [];
  const reparti = data?.reparti || [];

  const filtered = profili.filter((p) => {
    const matchSearch =
      !search ||
      `${p.nome} ${p.cognome} ${p.mansione || ""} ${p.email || ""}`
        .toLowerCase()
        .includes(search.toLowerCase());
    const matchReparto = filterReparto === "__all__" || p.reparto === filterReparto;
    return matchSearch && matchReparto;
  });

  const handleEdit = (p: HrProfilo) => {
    setEditingProfilo(p);
    setSheetOpen(true);
  };

  const handleNew = () => {
    setEditingProfilo(null);
    setSheetOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Empty state
  if (profili.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
          <Users className="h-16 w-16 text-muted-foreground/50" />
          <div>
            <h3 className="text-lg font-semibold">Nessun dipendente nell'organigramma</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Sincronizza i dipendenti esistenti o aggiungi un nuovo profilo HR.
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
              <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? "animate-spin" : ""}`} />
              Sincronizza da Dipendenti
            </Button>
            <Button variant="outline" onClick={handleNew}>
              <UserPlus className="h-4 w-4 mr-2" />
              Nuovo Profilo
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // KPI cards
  const totalActive = profili.filter((p) => p.attivo).length;
  const uniqueReparti = reparti.length;
  const uniqueSedi = new Set(profili.map((p) => p.sede_id).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      {/* KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{totalActive}</p>
              <p className="text-xs text-muted-foreground">Dipendenti attivi</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{uniqueReparti}</p>
              <p className="text-xs text-muted-foreground">Reparti</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <MapPin className="h-8 w-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{uniqueSedi}</p>
              <p className="text-xs text-muted-foreground">Sedi</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <UserPlus className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{profili.filter((p) => !p.responsabile_id).length}</p>
              <p className="text-xs text-muted-foreground">Senza responsabile</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex gap-2 items-center flex-1 min-w-0">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca dipendente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterReparto} onValueChange={setFilterReparto}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Tutti i reparti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Tutti i reparti</SelectItem>
              {reparti.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sincronizza
          </Button>
          <Button size="sm" onClick={handleNew}>
            <UserPlus className="h-4 w-4 mr-1" />
            Nuovo Profilo
          </Button>
        </div>
      </div>

      {/* List View Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Mansione</TableHead>
                <TableHead>Reparto</TableHead>
                <TableHead>Responsabile</TableHead>
                <TableHead>Contratto</TableHead>
                <TableHead>Assunzione</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nessun risultato trovato
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const responsabile = profili.find((r) => r.id === p.responsabile_id);
                  return (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleEdit(p)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                            style={{ backgroundColor: p.colore_avatar || "#0EA5E9" }}
                          >
                            {p.nome?.[0]}{p.cognome?.[0]}
                          </div>
                          {p.nome} {p.cognome}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.mansione || "—"}</TableCell>
                      <TableCell>
                        {p.reparto ? (
                          <Badge className={getRepartoBadgeClass(p.reparto)} variant="secondary">
                            {p.reparto}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {responsabile ? `${responsabile.nome} ${responsabile.cognome}` : "—"}
                      </TableCell>
                      <TableCell className="text-sm capitalize">{p.tipo_contratto?.replace("_", " ") || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {p.data_assunzione
                          ? new Date(p.data_assunzione).toLocaleDateString("it-IT")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.attivo ? "default" : "secondary"}>
                          {p.attivo ? "Attivo" : "Inattivo"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <HrProfiloSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        profilo={editingProfilo}
        allProfili={profili}
      />
    </div>
  );
}
