import { useState, useEffect } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useEmailTemplatesPaginated } from "@/hooks/useEmailCampaignsPaginated";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FolderPlus, FileText, MoreHorizontal, Pencil, Trash2, Copy, FolderInput, ChevronRight, ChevronLeft } from "lucide-react";
import { TemplateDialog } from "./TemplateDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function EmailTemplatesTab() {
  const { effectiveCompany: company, user } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Home" },
  ]);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Move to folder
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);

  // Reset page on filter change
  useEffect(() => { setPage(0); }, [search, currentFolderId]);

  const { data: templateData, isLoading } = useEmailTemplatesPaginated(
    company?.id,
    { search, folderId: currentFolderId },
    { page, perPage }
  );

  const templates = templateData?.data ?? [];
  const totalCount = templateData?.total ?? 0;

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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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
    onError: (e: any) => toast.error(e.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (template: any) => {
      const { error } = await supabase.from("email_templates").insert({
        company_id: company!.id,
        created_by: user!.id,
        name: `Copia di ${template.name}`,
        subject: template.subject,
        html_content: template.html_content,
        json_content: template.json_content,
        type: template.type,
        folder: template.folder,
        folder_id: template.folder_id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template duplicato");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, folder_id }: { id: string; folder_id: string | null }) => {
      const { error } = await supabase.from("email_templates").update({ folder_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Template spostato");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      setMoveTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentFolders = folders.filter((f: any) => f.parent_id === currentFolderId);

  const totalPages = Math.ceil(totalCount / perPage);
  const showing = totalCount > 0
    ? `${page * perPage + 1} - ${Math.min((page + 1) * perPage, totalCount)} di ${totalCount}`
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
          <Button size="sm" onClick={() => { setEditTemplate(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuovo template
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cerca modelli di email..." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
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
                        <DropdownMenuItem onClick={() => duplicateMutation.mutate(t)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplica
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setMoveTarget(t.id); setMoveFolderId(t.folder_id || null); }}>
                          <FolderInput className="h-4 w-4 mr-2" /> Sposta in cartella
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
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

      {/* Delete dialog */}
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

      {/* Move to folder dialog */}
      <Dialog open={!!moveTarget} onOpenChange={(open) => !open && setMoveTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sposta in cartella</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Cartella di destinazione</Label>
            <Select value={moveFolderId || "__home__"} onValueChange={(v) => setMoveFolderId(v === "__home__" ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__home__">Home (nessuna cartella)</SelectItem>
                {folders.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveTarget(null)}>Annulla</Button>
            <Button
              onClick={() => moveTarget && moveMutation.mutate({ id: moveTarget, folder_id: moveFolderId })}
              disabled={moveMutation.isPending}
            >
              {moveMutation.isPending ? "Spostamento..." : "Sposta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
