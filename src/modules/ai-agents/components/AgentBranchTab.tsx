import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GitBranch, MoreHorizontal, Plus, Trash2 } from "lucide-react";

interface Branch {
  id: string;
  name: string;
  trafficSplit: number;
  createdBy: string;
  updatedAt: string;
}

export function AgentBranchTab() {
  const [branches, setBranches] = useState<Branch[]>([
    {
      id: "main",
      name: "Principale",
      trafficSplit: 100,
      createdBy: "Sistema",
      updatedAt: new Date().toISOString(),
    },
  ]);

  const handleCreate = () => {
    const newBranch: Branch = {
      id: `branch-${Date.now()}`,
      name: `Branch ${branches.length + 1}`,
      trafficSplit: 0,
      createdBy: "Utente",
      updatedAt: new Date().toISOString(),
    };
    setBranches((prev) => [...prev, newBranch]);
  };

  const handleDelete = (id: string) => {
    if (id === "main") return;
    setBranches((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-medium">Branch</h3>
        </div>
        <Button size="sm" onClick={handleCreate} className="gap-1">
          <Plus className="h-4 w-4" /> Crea branch
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Divisione traffico</TableHead>
              <TableHead>Creato da</TableHead>
              <TableHead>Aggiornato</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {branches.map((branch) => (
              <TableRow key={branch.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {branch.name}
                    {branch.id === "main" && <Badge variant="secondary" className="text-[10px]">Principale</Badge>}
                  </div>
                </TableCell>
                <TableCell>{branch.trafficSplit}%</TableCell>
                <TableCell className="text-muted-foreground">{branch.createdBy}</TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {new Date(branch.updatedAt).toLocaleDateString("it")}
                </TableCell>
                <TableCell>
                  {branch.id !== "main" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => handleDelete(branch.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
