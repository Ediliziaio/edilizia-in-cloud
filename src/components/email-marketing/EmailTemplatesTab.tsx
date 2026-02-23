import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FolderPlus, FileText, MoreHorizontal, Pencil, Trash2, ChevronRight, ChevronLeft, Upload, Copy, BookOpen } from "lucide-react";
import { TemplateDialog } from "./TemplateDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function EmailTemplatesTab() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Home" },
  ]);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["email-templates", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_templates")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["email-folders", company?.id, "template"],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_folders")
        .select("*")
        .eq("company_id", company!.id)
        .eq("folder_type", "template");
      if (error) throw error;
      return data || [];
    },
  });

  const createFolderMut = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("email_folders").insert({
        company_id: company!.id,
        name,
        folder_type: "template",
        parent_id: currentFolderId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cartella creata");
      qc.invalidateQueries({ queryKey: ["email-folders"] });
      setFolderDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template eliminato");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setDeleteTarget(null);
    },
  });

  const currentFolders = folders.filter((f: any) => f.parent_id === currentFolderId);

  const filtered = templates.filter((t: any) => {
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase());
    const matchFolder = currentFolderId ? t.folder_id === currentFolderId : !t.folder_id;
    return matchSearch && matchFolder;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const showing = filtered.length > 0
    ? `Presentazione ${page * perPage + 1} - ${Math.min((page + 1) * perPage, filtered.length)} di ${filtered.length} risultati`
    : "";

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
    setPage(0);
  };

  const navigateToBreadcrumb = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath[newPath.length - 1].id);
    setPage(0);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Modelli di email</h3>
          <p className="text-sm text-muted-foreground">Crea e gestisci i tuoi template email</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="h-4 w-4 mr-1" /> Crea cartella
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" /> Nuovo
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
                <FileText className="h-4 w-4 mr-2" /> Modello vuoto
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
                <Copy className="h-4 w-4 mr-2" /> Da campagna esistente
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
                <BookOpen className="h-4 w-4 mr-2" /> Libreria modelli
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
                <Upload className="h-4 w-4 mr-2" /> Importa HTML
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cerca modelli di email..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm">
        {folderPath.map((fp, i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <button
              onClick={() => navigateToBreadcrumb(i)}
              className={`hover:underline ${i === folderPath.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"}`}
            >
              {fp.name}
            </button>
          </div>
        ))}
      </div>

      {/* Subfolders */}
      {currentFolders.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {currentFolders.map((f: any) => (
            <Button key={f.id} variant="outline" size="sm" onClick={() => navigateToFolder(f.id, f.name)}>
              <FolderPlus className="h-4 w-4 mr-1" /> {f.name}
            </Button>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : paged.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nessun template trovato</p>
            <Button onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Crea il tuo primo template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titolo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Aggiornato il</TableHead>
                <TableHead>Cartella</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">{t.type}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(t.updated_at), "dd MMM yyyy", { locale: it })}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.folder_id ? (folders.find((f: any) => f.id === t.folder_id)?.name || "—") : "Home"}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => { setEditTemplate(t); setDialogOpen(true); }}>
                          <Pencil className="h-4 w-4 mr-2" /> Modifica
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(t.id)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{showing}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Precedente
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                Successivo <ChevronRight className="h-4 w-4" />
              </Button>
              <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-[100px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / pagina</SelectItem>
                  <SelectItem value="25">25 / pagina</SelectItem>
                  <SelectItem value="50">50 / pagina</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}

      <TemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} template={editTemplate} />
      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={(name) => createFolderMut.mutate(name)}
        isPending={createFolderMut.isPending}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina template</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro di voler eliminare questo template? L'azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Eliminazione..." : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
