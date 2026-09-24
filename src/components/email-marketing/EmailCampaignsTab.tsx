import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmailCampaignsPaginated } from "@/hooks/useEmailCampaignsPaginated";
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
import { Search, FolderPlus, Folder, MoreHorizontal, Trash2, ChevronRight, ChevronLeft, Send, Copy, Pencil, FolderInput, BarChart3 } from "lucide-react";
import { CampaignCreateDropdown } from "./CampaignCreateDropdown";
import { CampaignDetailDialog } from "./CampaignDetailDialog";
import { CreateFolderDialog } from "./CreateFolderDialog";
import { useEmailMarketingBase } from "./useEmailMarketingBase";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }> = {
  // La bozza è la più quieta (prima era il badge più scuro della pagina); la
  // pianificata in blu, perché è quella che partirà da sola.
  draft: { label: "Bozza", variant: "outline", className: "text-muted-foreground" },
  scheduled: { label: "Pianificata", variant: "outline", className: "border-blue-300 text-blue-700 dark:border-blue-800 dark:text-blue-300" },
  sending: { label: "In invio", variant: "default", className: "bg-amber-500 hover:bg-amber-600 text-white border-0 animate-pulse" },
  sent: { label: "Inviata", variant: "default", className: "bg-green-600 hover:bg-green-700 text-white border-0" },
  failed: { label: "Fallita", variant: "destructive" },
  paused: { label: "In pausa", variant: "outline", className: "border-amber-400 text-amber-600" },
  completed: { label: "Completata", variant: "default", className: "bg-green-600 hover:bg-green-700 text-white border-0" },
};

/** Chip di stato: «Inviate» comprende anche le completate (per l'utente è lo stesso). */
const FILTRI_STATO = [
  ["all", "Tutte"], ["draft", "Bozze"], ["scheduled", "Pianificate"],
  ["sending", "In invio"], ["sent", "Inviate"], ["failed", "Fallite"],
] as const;

/** Campagne già partite: aprendole si guardano i risultati, non l'editor. */
const GIA_PARTITE = new Set(["sent", "sending", "completed"]);

/** «120 inviate · 3 non partite» per chi è partita, «—» per il resto. */
function esitoInvio(c: { status: string; sent_count?: number | null; failed_count?: number | null; total_recipients?: number | null }): string {
  if (c.status === "sending") {
    const tot = c.total_recipients ?? 0;
    return tot > 0 ? `in corso · ${(c.sent_count ?? 0).toLocaleString("it-IT")} di ${tot.toLocaleString("it-IT")}` : "in corso";
  }
  if (!GIA_PARTITE.has(c.status) && c.status !== "failed") return "—";
  const inviate = c.sent_count ?? 0;
  const fallite = c.failed_count ?? 0;
  const pezzi = [`${inviate.toLocaleString("it-IT")} inviate`];
  if (fallite > 0) pezzi.push(`${fallite.toLocaleString("it-IT")} non partite`);
  return pezzi.join(" · ");
}

export function EmailCampaignsTab() {
  const { effectiveCompany: company, user } = useAuth();
  const navigate = useNavigate();
  const emailBase = useEmailMarketingBase();
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 350);
  const [statusFilter, setStatusFilter] = useState("all");
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

  // Campaign results drill-down dialog
  const [detailTarget, setDetailTarget] = useState<{ id: string; name: string } | null>(null);

  // La pagina torna alla prima dove cambiano i filtri (ricerca, stato,
  // cartella), non in un effetto: così non si ridisegna due volte.

  // Una sola lista. Le sezioni «Campagne di flusso» e «Azione in blocco»
  // filtravano su tipi che nessuna schermata crea (24/09/2026): erano sempre
  // vuote. I flussi stanno in Automazioni.
  const { data: campaignData, isLoading } = useEmailCampaignsPaginated(
    company?.id,
    { search, category: "all", folderId: currentFolderId, status: statusFilter },
    { page, perPage }
  );

  const campaigns = campaignData?.data ?? [];
  const totalCount = campaignData?.total ?? 0;

  const { data: folders = [] } = useQuery({
    queryKey: queryKeys.emailFolders.byType(company?.id, "campaign"),
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const createFolderMut = useMutation({
    mutationFn: async (name: string) => {
      if (!company?.id) throw new Error("Azienda non disponibile");
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
      qc.invalidateQueries({ queryKey: queryKeys.emailFolders.all });
      setFolderDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!company?.id) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("email_campaigns")
        .delete()
        .eq("id", id)
        .eq("company_id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna eliminata");
      qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (riga: { id: string }) => {
      if (!company?.id || !user?.id) throw new Error("Sessione non disponibile");
      // La riga della lista non ha pubblico, A/B e tracciamento (la lista non
      // li carica): copiandola da lì la copia perdeva a chi mandare. Si rilegge
      // la campagna intera.
      const { data: campaign, error: readError } = await supabase
        .from("email_campaigns")
        .select("*")
        .eq("id", riga.id)
        .eq("company_id", company.id)
        .single();
      if (readError) throw readError;
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
        // Advanced settings (Bug 4 fix)
        segment_json: campaign.segment_json,
        ab_test_enabled: campaign.ab_test_enabled ?? false,
        ab_subject_b: campaign.ab_subject_b,
        ab_split_percent: campaign.ab_split_percent ?? 50,
        ab_winner_criteria: campaign.ab_winner_criteria ?? "open_rate",
        ab_test_duration_hours: campaign.ab_test_duration_hours ?? 4,
        track_clicks: campaign.track_clicks ?? false,
        utm_tracking: campaign.utm_tracking ?? false,
        auto_tag: campaign.auto_tag ?? false,
        resend_to_unopened: campaign.resend_to_unopened ?? false,
        template_id: campaign.template_id ?? null,
        // la copia è una bozza: niente scheduling ereditato (prima restava
        // send_mode="scheduled" senza data → tab Programma incoerente)
        send_mode: "immediate",
        scheduled_at: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna duplicata");
      qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      if (!company?.id) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("email_campaigns")
        .update({ name })
        .eq("id", id)
        .eq("company_id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna rinominata");
      qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
      setRenameTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moveMutation = useMutation({
    mutationFn: async ({ id, folder_id }: { id: string; folder_id: string | null }) => {
      if (!company?.id) throw new Error("Azienda non disponibile");
      const { error } = await supabase
        .from("email_campaigns")
        .update({ folder_id })
        .eq("id", id)
        .eq("company_id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campagna spostata");
      qc.invalidateQueries({ queryKey: queryKeys.emailCampaigns.all });
      setMoveTarget(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const currentFolders = useMemo(() => folders.filter((f: any) => f.parent_id === currentFolderId), [folders, currentFolderId]);

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

  const filtriAttivi = !!search.trim() || statusFilter !== "all";
  const dentroCartella = folderPath.length > 1;
  const azzeraFiltri = () => { setSearchInput(""); setStatusFilter("all"); setPage(0); };

  return (
    <div className="space-y-4">
      {/* Una riga sola: ricerca, stato, azioni. Pagina e scheda dicono già
          «Email Marketing › Campagne»: un terzo titolo spingeva giù la tabella. */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Cerca in tutte le cartelle…" value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(0); }} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTRI_STATO.map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              onClick={() => { setStatusFilter(v); setPage(0); }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                statusFilter === v ? "border-primary bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFolderDialogOpen(true)}>
            <FolderPlus className="mr-1 h-4 w-4" /> <span className="hidden sm:inline">Crea cartella</span>
          </Button>
          <CampaignCreateDropdown />
        </div>
      </div>

      {/* Il percorso serve solo dentro una cartella: in Home diceva «Home» e basta. */}
      {dentroCartella && (
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
      )}

      {/* Subfolders */}
      {currentFolders.length > 0 && !search.trim() && (
        <div className="flex flex-wrap gap-2">
          {currentFolders.map((f: any) => (
            <Button key={f.id} variant="outline" size="sm" onClick={() => navigateToFolder(f.id, f.name)}>
              <Folder className="mr-1 h-4 w-4" /> {f.name}
            </Button>
          ))}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Caricamento...</div>
      ) : campaigns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <Send className="h-9 w-9 text-muted-foreground" />
            {filtriAttivi ? (
              <>
                <p className="font-medium text-foreground">Nessuna campagna con questi filtri</p>
                <Button variant="outline" size="sm" onClick={azzeraFiltri}>Mostra tutte</Button>
              </>
            ) : dentroCartella ? (
              <p className="font-medium text-foreground">Questa cartella è vuota</p>
            ) : (
              <>
                <p className="font-medium text-foreground">Ancora nessuna campagna</p>
                <p className="max-w-md text-sm text-muted-foreground">
                  Scegli a chi scrivere, prepara il messaggio e mandalo subito o pianificalo: la trovi qui con i risultati.
                </p>
                <CampaignCreateDropdown />
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Titolo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead className="hidden md:table-cell">Invio</TableHead>
                <TableHead className="hidden sm:table-cell">Data di invio</TableHead>
                <TableHead className="hidden lg:table-cell">Ultima modifica</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c: any) => {
                const badge = STATUS_BADGE[c.status] || { label: c.status, variant: "secondary" as const, className: "" };
                // Solo per le bozze: su una campagna già partita «da completare» non ha senso.
                const isIncomplete = c.status === "draft" && (!c.subject || !c.html_content);
                const partita = GIA_PARTITE.has(c.status);
                // Quando è partita: data vera di invio; prima: quella pianificata.
                const dataInvio = partita ? (c.sent_at ?? c.scheduled_at) : c.scheduled_at;
                return (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => partita
                      ? setDetailTarget({ id: c.id, name: c.name })
                      : navigate(`${emailBase}/campagna/${c.id}/${c.json_content ? "builder" : "editor"}`)}
                  >
                    <TableCell className="font-medium">
                      <div className="flex flex-col gap-1">
                        <span>{c.name}</span>
                        {c.subject && <span className="text-xs font-normal text-muted-foreground line-clamp-1">{c.subject}</span>}
                        {isIncomplete && (
                          <span className="text-xs font-normal text-amber-600">Da completare prima dell'invio</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={badge.variant} className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {esitoInvio(c)}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {dataInvio ? format(new Date(dataInvio), "dd MMM yyyy HH:mm", { locale: it }) : "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {format(new Date(c.updated_at), "dd MMM yyyy", { locale: it })}
                    </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {["sent", "sending", "completed"].includes(c.status) && (
                              <>
                                <DropdownMenuItem onClick={() => setDetailTarget({ id: c.id, name: c.name })}>
                                  <BarChart3 className="h-4 w-4 mr-2" /> Risultati
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
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
                            <DropdownMenuItem
                              className="text-destructive"
                              disabled={c.status === "sending"}
                              onClick={() => setDeleteTarget(c.id)}
                            >
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

            {/* Pagination: con dieci campagne o meno è solo rumore. */}
            {totalCount > 10 && (
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
            )}
          </>
        )}

      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onConfirm={(name) => createFolderMut.mutate(name)}
        isPending={createFolderMut.isPending}
      />

      <CampaignDetailDialog
        campaignId={detailTarget?.id ?? null}
        campaignName={detailTarget?.name}
        onClose={() => setDetailTarget(null)}
      />

      {/* Delete dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina campagna</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare questa campagna? L'azione non può essere annullata e verrà applicata solo ai dati della tua azienda.
            </AlertDialogDescription>
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
