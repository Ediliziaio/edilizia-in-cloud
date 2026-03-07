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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Globe, FileText, Type, Search, MoreHorizontal, Trash2, Plus, Database,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { KBDocument } from "../types/knowledgeBase.types";

type AddMode = "url" | "file" | "text" | null;

interface KnowledgeBaseDocumentListProps {
  docs: KBDocument[];
  isLoading: boolean;
  queryKey: string[];
  agentId?: string | null;
  companyId?: string;
  showTypeFilter?: boolean;
  showRagIndicator?: boolean;
}

const typeIcon = (type: string) => {
  switch (type) {
    case "url": return <Globe className="h-4 w-4 text-primary" />;
    case "file": return <FileText className="h-4 w-4 text-accent-foreground" />;
    case "text": return <Type className="h-4 w-4 text-secondary-foreground" />;
    default: return <FileText className="h-4 w-4" />;
  }
};

export function KnowledgeBaseDocumentList({
  docs,
  isLoading,
  queryKey,
  agentId = null,
  companyId,
  showTypeFilter = false,
  showRagIndicator = false,
}: KnowledgeBaseDocumentListProps) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newText, setNewText] = useState("");
  const queryClient = useQueryClient();

  const addDoc = useMutation({
    mutationFn: async (doc: { name: string; type: string; source_url?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Non autenticato");

      let cId = companyId;
      if (!cId) {
        const { data: profile } = await supabase
          .from("profiles" as never)
          .select("company_id")
          .eq("id", user.id)
          .single();
        cId = (profile as { company_id: string } | null)?.company_id;
      }
      if (!cId) throw new Error("Nessuna azienda associata");

      const { error } = await supabase.from("ai_agent_knowledge_docs" as never).insert({
        company_id: cId,
        agent_id: agentId,
        name: doc.name,
        type: doc.type,
        source_url: doc.source_url || null,
        created_by: user.id,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Documento aggiunto");
      resetForm();
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
      queryClient.invalidateQueries({ queryKey });
      toast.success("Documento eliminato");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setAddMode(null);
    setNewName("");
    setNewUrl("");
    setNewText("");
  };

  const filtered = docs.filter((d) => {
    const matchSearch = d.name.toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || d.type === typeFilter;
    return matchSearch && matchType;
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    addDoc.mutate({
      name: newName.trim(),
      type: addMode!,
      source_url: addMode === "url" ? newUrl.trim() : undefined,
    });
  };

  // Rough storage estimate
  const storageBytes = docs.reduce((acc, d) => acc + (d.name.length * 2) + 200, 0);
  const storageLabel = storageBytes < 1024 ? `${storageBytes} B` : `${(storageBytes / 1024).toFixed(1)} KB`;

  return (
    <div className="space-y-4">
      {/* Actions row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cerca documenti..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {showTypeFilter && (
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
          )}
          {showRagIndicator && (
            <Badge variant="outline" className="text-xs gap-1">
              <Database className="h-3 w-3" />
              RAG: {storageLabel} / 1.0 MB
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setAddMode("url")}>
            <Globe className="h-4 w-4 mr-1" /> URL
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAddMode("file")}>
            <FileText className="h-4 w-4 mr-1" /> File
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
          <p className="text-muted-foreground text-sm">Nessun documento trovato</p>
          <Button size="sm" variant="outline" onClick={() => setAddMode("text")}>
            <Plus className="h-4 w-4 mr-1" /> Aggiungi documento
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
      <Dialog open={!!addMode} onOpenChange={(open) => !open && resetForm()}>
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
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Es. FAQ aziendali" />
            </div>
            {addMode === "url" && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://www.esempio.it" />
              </div>
            )}
            {addMode === "file" && (
              <p className="text-sm text-muted-foreground">
                L'upload file sarà disponibile nella prossima versione.
              </p>
            )}
            {addMode === "text" && (
              <div className="space-y-2">
                <Label>Contenuto</Label>
                <Textarea value={newText} onChange={(e) => setNewText(e.target.value)} rows={6} placeholder="Incolla qui il contenuto..." />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Annulla</Button>
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
