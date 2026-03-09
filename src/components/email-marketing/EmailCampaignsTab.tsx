import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, FolderPlus, Mail, Zap, Users, MoreHorizontal, Trash2, ChevronRight, ChevronLeft, Send, Copy, Pencil, FolderInput } from "lucide-react";
import { CampaignCreateDropdown } from "./CampaignCreateDropdown";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  draft: { label: "Bozza", variant: "secondary" },
  scheduled: { label: "Pianificata", variant: "outline" },
  sending: { label: "In invio", variant: "default", className: "bg-amber-500 hover:bg-amber-600 text-white border-0 animate-pulse" },
  sent: { label: "Inviata", variant: "default", className: "bg-green-600 hover:bg-green-700 text-white border-0" },
  failed: { label: "Fallita", variant: "destructive" },
  paused: { label: "In pausa", variant: "outline", className: "border-amber-400 text-amber-600" },
  completed: { label: "Completata", variant: "default", className: "bg-green-600 hover:bg-green-700 text-white border-0" },
};

const CATEGORIES = [
  { id: "all", label: "Campagne email", icon: Mail },
  { id: "automation", label: "Campagne di flusso", icon: Zap },
  { id: "bulk", label: "Campagne Azione in blocco", icon: Users },
];

export function EmailCampaignsTab() {
  const { effectiveCompany: company, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Home" },
  ]);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(10);

  // Rename dialog
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Move to folder dialog
  const [moveTarget, setMoveTarget] = useState<string | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["email-campaigns", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("id, name, status, type, subject, sender_name, sender_email, folder_id, json_content, html_content, preview_text, scheduled_at, created_at, updated_at")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 120_000,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["email-folders", company?.id, "campaign"],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_folders")
        .select("id, name, parent_id")
        .eq("company_id", company!.id)
        .eq("folder_type", "campaign");
      if (error) throw error;
      return data || [];
    },
  });

  const createFolderMut = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase.from("email_folders").insert({
        company_id: company!.id,
        name,
        folder_type: "campaign",
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
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna eliminata");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (campaign: any) => {
      const { error } = await supabase.from("email_campaigns").insert({
        company_id: company!.id,
        created_by: user!.id,
        name: `Copia di ${campaign.name}`,
        status: "draft",
        type: campaign.type,
        html_content: campaign.html_content,
        subject: campaign.subject,
        preview_text: campaign.preview_text,
        sender_name: campaign.sender_name,
        sender_email: campaign.sender_email,
        folder_id: campaign.folder_id,
        json_content: campaign.json_content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna duplicata");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("email_campaigns").update({ name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna rinominata");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      setRenameTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, folder_id }: { id: string; folder_id: string | null }) => {
      const { error } = await supabase.from("email_campaigns").update({ folder_id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna spostata");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      setMoveTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentFolders = folders.filter((f: any) => f.parent_id === currentFolderId);

  const filtered = campaigns.filter((c: any) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || c.type === category;
    const matchFolder = currentFolderId ? c.folder_id === currentFolderId : !c.folder_id;
    return matchSearch && matchCategory && matchFolder;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice(page * perPage, (page + 1) * perPage);
  const showing = filtered.length > 0
    ? `${page * perPage + 1} - ${Math.min((page + 1) * perPage, filtered.length)} di ${filtered.length}`
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
    <div className="flex flex-col md:flex-row gap-0 min-h-[500px]">
      {/* Mobile category selector */}
      <div className="md:hidden mb-4">
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(0); }}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop Sidebar */}
      <div className="hidden md:block w-56 border-r pr-3 space-y-1 shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setCategory(cat.id); setPage(0); }}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              category === cat.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            <cat.icon className="h-4 w-4" />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 md:pl-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Campagne</h3>
            <p className="text-sm text-muted-foreground">Gestisci e invia campagne email</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
              <FolderPlus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Crea cartella</span>
            </Button>
            <CampaignCreateDropdown />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cerca campagna..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
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
              <Send className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Nessuna campagna trovata</p>
              <CampaignCreateDropdown />
            </CardContent>
          </Card>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titolo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="hidden sm:table-cell">Ultimo aggiornamento</TableHead>
                  <TableHead className="hidden sm:table-cell">Data di esecuzione</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.map((c: any) => {
                  const badge = STATUS_BADGE[c.status] || { label: c.status, variant: "secondary" as const, className: "" };
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/azienda/marketing/email/campagna/${c.id}/${c.json_content ? 'builder' : 'editor'}`)}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {c.type === "broadcast" ? "Email" : c.type === "automation" ? "Flusso" : c.type === "bulk" ? "Blocco" : c.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {format(new Date(c.updated_at), "dd MMM yyyy", { locale: it })}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {c.scheduled_at
                          ? format(new Date(c.scheduled_at), "dd MMM yyyy HH:mm", { locale: it })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setRenameTarget({ id: c.id, name: c.name }); setRenameValue(c.name); }}>
                              <Pencil className="h-4 w-4 mr-2" /> Rinomina
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicateMutation.mutate(c)}>
                              <Copy className="h-4 w-4 mr-2" /> Duplica
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setMoveTarget(c.id); setMoveFolderId(c.folder_id || null); }}>
                              <FolderInput className="h-4 w-4 mr-2" /> Sposta in cartella
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(c.id)}>
                              <Trash2 className="h-4 w-4 mr-2" /> Elimina
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
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
      </div>

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
            <AlertDialogTitle>Elimina campagna</AlertDialogTitle>
            <AlertDialogDescription>Sei sicuro di voler eliminare questa campagna? L'azione non può essere annullata.</AlertDialogDescription>
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

      {/* Rename dialog */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Rinomina campagna</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nome</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameValue.trim() && renameTarget) {
                  renameMutation.mutate({ id: renameTarget.id, name: renameValue.trim() });
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>Annulla</Button>
            <Button
              onClick={() => renameTarget && renameMutation.mutate({ id: renameTarget.id, name: renameValue.trim() })}
              disabled={!renameValue.trim() || renameMutation.isPending}
            >
              {renameMutation.isPending ? "Salvataggio..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
