import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  FileText,
  Type,
  FolderPlus,
  Search,
  MoreHorizontal,
  Trash2,
  Plus,
  Database,
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

export default function PlatformKnowledgeBasePage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newText, setNewText] = useState("");
  const queryClient = useQueryClient();

  // Fetch global KB docs (agent_id IS NULL)
  const { data: docs, isLoading } = useQuery({
    queryKey: ["ai-kb-global"],
    queryFn: async (): Promise<KBDoc[]> => {
      const { data, error } = await supabase
        .from("ai_agent_knowledge_docs" as never)
        .select("*")
        .is("agent_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as KBDoc[];
    },
  });

  const addDoc = useMutation({
    mutationFn: async (doc: { name: string; type: string; source_url?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      const { data: profile } = await supabase
        .from("profiles" as never)
        .select("company_id")
        .eq("id", user.id)
        .single();

      const companyId = (profile as { company_id: string } | null)?.company_id;
      if (!companyId) throw new Error("Nessuna azienda associata");

      const { error } = await supabase.from("ai_agent_knowledge_docs" as never).insert({
        company_id: companyId,
        name: doc.name,
        type: doc.type,
        source_url: doc.source_url || null,
        created_by: user.id,
        agent_id: null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-kb-global"] });
      toast.success("Documento aggiunto");
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
      queryClient.invalidateQueries({ queryKey: ["ai-kb-global"] });
      toast.success("Documento eliminato");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = (docs ?? []).filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || d.type === typeFilter;
    return matchSearch && matchType;
  });

  const typeIcon = (type: string) => {
    switch (type) {
      case "url": return <Globe className="h-4 w-4 text-blue-500" />;
      case "file": return <FileText className="h-4 w-4 text-orange-500" />;
      case "text": return <Type className="h-4 w-4 text-green-500" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const handleAdd = () => {
    if (!newName.trim()) return;
    const type = addMode!;
    addDoc.mutate({
      name: newName.trim(),
      type,
      source_url: type === "url" ? newUrl.trim() : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <Badge variant="outline" className="gap-1">
            <Database className="h-3 w-3" />
            {docs?.length ?? 0} documenti
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddMode("url")}>
            <Globe className="h-4 w-4 mr-1" /> Aggiungi URL
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddMode("file")}>
            <FileText className="h-4 w-4 mr-1" /> Aggiungi file
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddMode("text")}>
            <Type className="h-4 w-4 mr-1" /> Crea testo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cerca documenti..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i tipi</SelectItem>
            <SelectItem value="url">URL</SelectItem>
            <SelectItem value="file">File</SelectItem>
            <SelectItem value="text">Testo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
          <Database className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Nessun documento nella Knowledge Base</p>
          <Button size="sm" onClick={() => setAddMode("text")}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi il primo documento
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data creazione</TableHead>
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
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeleteId(doc.id)}
                        >
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

      {/* Add document dialog */}
      <Dialog open={!!addMode} onOpenChange={(open) => !open && setAddMode(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {addMode === "url" && "Aggiungi URL"}
              {addMode === "file" && "Aggiungi file"}
              {addMode === "text" && "Crea testo"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome documento *</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Es. FAQ aziendali"
              />
            </div>
            {addMode === "url" && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://www.esempio.it/pagina"
                />
              </div>
            )}
            {addMode === "file" && (
              <div className="space-y-2">
                <Label>File</Label>
                <p className="text-sm text-muted-foreground">
                  L'upload file sarà disponibile nella prossima versione. Per ora, puoi incollare il contenuto come testo.
                </p>
              </div>
            )}
            {addMode === "text" && (
              <div className="space-y-2">
                <Label>Contenuto</Label>
                <Textarea
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  placeholder="Incolla qui il contenuto testuale..."
                  rows={6}
                />
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

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare questo documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Il documento verrà rimosso dalla Knowledge Base. Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteId && deleteDoc.mutate(deleteId)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
