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
import type { HrProfilo } from "@/types/hr";
import { HrProfiloSheet } from "@/components/hr/HrProfiloSheet";
import { OrgTreeView } from "@/components/hr/OrgTreeView";
import type { OrgTreeNode as OrgTreeNodeType } from "@/types/hr";

function filterTree(
  nodes: OrgTreeNodeType[],
  search: string,
  reparto: string
): OrgTreeNodeType[] {
  if (!search && reparto === "__all__") return nodes;

  const searchLower = search.toLowerCase();

  function nodeMatches(node: OrgTreeNodeType): boolean {
    const matchSearch =
      !search ||
      `${node.nome} ${node.cognome} ${node.mansione || ""} ${node.email || ""}`
        .toLowerCase()
        .includes(searchLower);
    const matchReparto = reparto === "__all__" || node.reparto === reparto;
    return matchSearch && matchReparto;
  }

  function filterRecursive(nodes: OrgTreeNodeType[]): OrgTreeNodeType[] {
    const result: OrgTreeNodeType[] = [];
    for (const node of nodes) {
      const filteredChildren = filterRecursive(node.children);
      if (nodeMatches(node) || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
    return result;
  }

  return filterRecursive(nodes);
}

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
  const [viewMode, setViewMode] = useState<"tree" | "list">(
    typeof window !== "undefined" && window.innerWidth < 640 ? "list" : "tree"
  );

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
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <Users className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{totalActive}</p>
              <p className="text-xs text-muted-foreground truncate">Dipendenti attivi</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <Building2 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{uniqueReparti}</p>
              <p className="text-xs text-muted-foreground truncate">Reparti</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <MapPin className="h-6 w-6 sm:h-8 sm:w-8 text-amber-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{uniqueSedi}</p>
              <p className="text-xs text-muted-foreground truncate">Sedi</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
            <UserPlus className="h-6 w-6 sm:h-8 sm:w-8 text-green-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xl sm:text-2xl font-bold">{profili.filter((p) => !p.responsabile_id).length}</p>
              <p className="text-xs text-muted-foreground truncate">Senza resp.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 sm:flex-none sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca dipendente..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterReparto} onValueChange={setFilterReparto}>
            <SelectTrigger className="flex-1 sm:w-[160px] sm:flex-none">
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
        <div className="flex gap-2 items-center">
          <div className="flex border rounded-md overflow-hidden">
            <Button variant={viewMode === "tree" ? "default" : "ghost"} size="sm" className="rounded-none hidden sm:flex" onClick={() => setViewMode("tree")}>
              <Network className="h-4 w-4 mr-1" />Albero
            </Button>
            <Button variant={viewMode === "list" ? "default" : "ghost"} size="sm" className="rounded-none" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4 mr-1" />Lista
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
            <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline ml-1">Sincronizza</span>
          </Button>
          <Button size="sm" onClick={handleNew}>
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline ml-1">Nuovo Profilo</span>
          </Button>
        </div>
      </div>

      {/* Tree View */}
      {viewMode === "tree" && data?.tree && (
        <OrgTreeView
          tree={filterTree(data.tree, search, filterReparto)}
          onNodeClick={(node) => handleEdit(node as HrProfilo)}
        />
      )}

      {/* List View Table */}
      {viewMode === "list" && (
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
      )}

      <HrProfiloSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        profilo={editingProfilo}
        allProfili={profili}
      />
    </div>
  );
}
