import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Globe, FileText, Type, Search, MoreHorizontal, Trash2, Plus, Database,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface KBDoc {
  id: string;
  agent_id: string | null;
  company_id: string;
  elevenlabs_doc_id: string | null;
  name: string;
  type: string;
  source_url: string | null;
  created_by: string;
  created_at: string;
}

type AddMode = "url" | "file" | "text" | null;

interface AgentKBTabProps {
  agentId: string;
  companyId: string;
}

export function AgentKBTab({ agentId, companyId }: AgentKBTabProps) {
  const [search, setSearch] = useState("");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newText, setNewText] = useState("");
  const queryClient = useQueryClient();

  const { data: docs, isLoading } = useQuery({
    queryKey: ["ai-kb-agent", agentId],
    queryFn: async (): Promise<KBDoc[]> => {
      const { data, error } = await supabase
        .from("ai_agent_knowledge_docs" as never)
        .select("*")
        .eq("agent_id", agentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KBDoc[];
    },
  });

  // Also fetch global docs count
  const { data: globalDocs } = useQuery({
    queryKey: ["ai-kb-global-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("ai_agent_knowledge_docs" as never)
        .select("id", { count: "exact", head: true })
        .is("agent_id", null);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const addDoc = useMutation({
    mutationFn: async (doc: { name: string; type: string; source_url?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const { error } = await supabase.from("ai_agent_knowledge_docs" as never).insert({
        company_id: companyId,
        agent_id: agentId,
        name: doc.name,
        type: doc.type,
        source_url: doc.source_url || null,
        created_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-kb-agent", agentId] });
      toast.success("Documento aggiunto all'agente");
      setAddMode(null);
      setNewName("");
      setNewUrl("");
      setNewText("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDoc = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_agent_knowledge_docs" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-kb-agent", agentId] });
      toast.success("Documento rimosso");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (docs ?? []).filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const typeIcon = (type: string) => {
    switch (type) {
      case "url": return <Globe className="h-4 w-4 text-primary" />;
      case "file": return <FileText className="h-4 w-4 text-accent-foreground" />;
      case "text": return <Type className="h-4 w-4 text-secondary-foreground" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    addDoc.mutate({
      name: newName.trim(),
      type: addMode!,
      source_url: addMode === "url" ? newUrl.trim() : undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-lg border bg-muted/30 p-4 flex items-start gap-3">
        <Database className="h-5 w-5 text-primary mt-0.5" />
        <div className="text-sm">
          <p className="font-medium">Knowledge Base dell'agente</p>
          <p className="text-muted-foreground">
            Documenti specifici per questo agente. Oltre a questi, l'agente ha accesso ai{" "}
            <strong>{globalDocs ?? 0} documenti globali</strong> della piattaforma.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca documenti..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddMode("url")}>
            <Globe className="h-4 w-4 mr-1" /> URL
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddMode("text")}>
            <Type className="h-4 w-4 mr-1" /> Testo
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <Database className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Nessun documento specifico per questo agente
          </p>
          <Button size="sm" variant="outline" onClick={() => setAddMode("text")}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi documento
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {typeIcon(doc.type)}
                      <span className="truncate">{doc.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs capitalize">{doc.type}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(doc.created_at), "d MMM yyyy", { locale: it })}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(doc.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add dialog */}
      <Dialog open={!!addMode} onOpenChange={(open) => !open && setAddMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addMode === "url" ? "Aggiungi URL" : "Crea documento testo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es. FAQ prodotto" />
            </div>
            {addMode === "url" && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://..." />
              </div>
            )}
            {addMode === "text" && (
              <div className="space-y-2">
                <Label>Contenuto</Label>
                <Textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={6} placeholder="Incolla qui..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMode(null)}>Annulla</Button>
            <Button onClick={handleAdd} disabled={!newName.trim() || addDoc.isPending}>
              {addDoc.isPending ? "Salvataggio..." : "Aggiungi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo documento?</AlertDialogTitle>
            <AlertDialogDescription>L'azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteId && deleteDoc.mutate(deleteId)}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
