import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, FolderPlus, Mail, Zap, Users, MoreHorizontal, Pencil, Trash2, ChevronRight, Send } from "lucide-react";
import { CampaignDialog } from "./CampaignDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Bozza", variant: "secondary" },
  scheduled: { label: "Pianificata", variant: "outline" },
  sending: { label: "In invio", variant: "default" },
  sent: { label: "Inviata", variant: "default" },
  paused: { label: "In pausa", variant: "destructive" },
};

const CATEGORIES = [
  { id: "all", label: "Campagne email", icon: Mail },
  { id: "automation", label: "Campagne di flusso", icon: Zap },
  { id: "bulk", label: "Campagne Azione in blocco", icon: Users },
];

export function EmailCampaignsTab() {
  const { company } = useAuth();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editCampaign, setEditCampaign] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "Home" },
  ]);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["email-campaigns", company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("company_id", company!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["email-folders", company?.id, "campaign"],
    enabled: !!company?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_folders")
        .select("*")
        .eq("company_id", company!.id)
        .eq("folder_type", "campaign");
      if (error) throw error;
      return data || [];
    },
  });

  const createFolderMut = useMutation({
    mutationFn: async () => {
      const name = prompt("Nome cartella:");
      if (!name) return;
      const { error } = await supabase.from("email_folders").insert({
        company_id: company!.id,
        name,
        folder_type: "campaign",
        parent_id: currentFolderId,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cartella creata"); qc.invalidateQueries({ queryKey: ["email-folders"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campagna eliminata"); qc.invalidateQueries({ queryKey: ["email-campaigns"] }); },
  });

  const currentFolders = folders.filter((f: any) => f.parent_id === currentFolderId);

  const filtered = campaigns.filter((c: any) => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = category === "all" || c.type === category;
    const matchFolder = currentFolderId ? c.folder_id === currentFolderId : !c.folder_id;
    return matchSearch && matchCategory && matchFolder;
  });

  const navigateToFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setFolderPath([...folderPath, { id: folderId, name: folderName }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath[newPath.length - 1].id);
  };

  return (
    <div className="flex gap-0 min-h-[500px]">
      {/* Sidebar */}
      <div className="w-56 border-r pr-3 space-y-1 shrink-0">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategory(cat.id)}
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
      <div className="flex-1 pl-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Campagne</h3>
            <p className="text-sm text-muted-foreground">Gestisci e invia campagne email</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => createFolderMut.mutate()}>
              <FolderPlus className="h-4 w-4 mr-1" /> Crea cartella
            </Button>
            <Button size="sm" onClick={() => { setEditCampaign(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Nuovo
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Cerca campagna..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
              <Send className="h-10 w-10 text-muted-foreground" />
              <p className="text-muted-foreground">Nessuna campagna</p>
              <Button onClick={() => { setEditCampaign(null); setDialogOpen(true); }}>
                <Plus className="h-4 w-4 mr-1" /> Crea campagna
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titolo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ultimo aggiornamento</TableHead>
                <TableHead>Data di esecuzione</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c: any) => {
                const badge = STATUS_BADGE[c.status] || { label: c.status, variant: "secondary" as const };
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {c.type === "broadcast" ? "Email" : c.type === "automation" ? "Flusso" : c.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(c.updated_at), "dd MMM yyyy", { locale: it })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.scheduled_at
                        ? format(new Date(c.scheduled_at), "dd MMM yyyy HH:mm", { locale: it })
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditCampaign(c); setDialogOpen(true); }}>
                            <Pencil className="h-4 w-4 mr-2" /> Modifica
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(c.id)}>
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
        )}
      </div>

      <CampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} campaign={editCampaign} />
    </div>
  );
}
