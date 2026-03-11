import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, MoreHorizontal, Pencil, Trash2, Users, List, ArrowLeft, Search, UserPlus, UserMinus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CreateListDialog } from "./CreateListDialog";

interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
}

interface ListMember {
  id: string;
  contact_id: string;
  added_at: string;
  contact: {
    id: string;
    first_name: string;
    last_name: string | null;
    phone: string | null;
    email: string | null;
    company_name: string | null;
    tags: string[];
  };
}

export function ContactListsView() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [selectedList, setSelectedList] = useState<{ id: string; name: string; description: string | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ContactList | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // Fetch lists
  const { data: lists = [], isLoading } = useQuery({
    queryKey: queryKeys.contactLists.list(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_contact_lists")
        .select("id, name, description, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const { data: counts, error: countError } = await supabase
        .from("marketing_contact_list_members")
        .select("list_id")
        .in("list_id", (data || []).map(l => l.id));
      if (countError) throw countError;

      const countMap: Record<string, number> = {};
      (counts || []).forEach(c => {
        countMap[c.list_id] = (countMap[c.list_id] || 0) + 1;
      });

      return (data || []).map(l => ({ ...l, member_count: countMap[l.id] || 0 })) as ContactList[];
    },
    enabled: !!companyId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.contactLists.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.listMembers.all });
  };

  // Save list (create/edit)
  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; description: string }) => {
      if (!companyId) throw new Error("No company");
      if (editingList) {
        const { error } = await supabase
          .from("marketing_contact_lists")
          .update({ name: data.name, description: data.description || null })
          .eq("id", editingList.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("marketing_contact_lists")
          .insert({ company_id: companyId, name: data.name, description: data.description || null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingList ? "Lista aggiornata" : "Lista creata");
      invalidate();
      setEditingList(null);
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  // Delete list
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_contact_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Lista eliminata");
      invalidate();
      setDeleteConfirm(null);
      if (selectedList) setSelectedList(null);
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  // Remove member(s)
  const removeMembersMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      if (!selectedList) return;
      const { error } = await supabase
        .from("marketing_contact_list_members")
        .delete()
        .eq("list_id", selectedList.id)
        .in("contact_id", contactIds);
      if (error) throw error;
    },
    onSuccess: (_, contactIds) => {
      toast.success(`${contactIds.length} contatt${contactIds.length === 1 ? "o rimosso" : "i rimossi"} dalla lista`);
      setSelectedMemberIds(new Set());
      invalidate();
    },
    onError: () => toast.error("Errore nella rimozione"),
  });

  const handleToggleMember = useCallback((id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // If a list is selected, show detail view
  if (selectedList) {
    return (
      <ListDetailView
        listId={selectedList.id}
        listName={selectedList.name}
        listDescription={selectedList.description}
        companyId={companyId}
        memberSearch={memberSearch}
        setMemberSearch={setMemberSearch}
        selectedMemberIds={selectedMemberIds}
        onToggleMember={handleToggleMember}
        onToggleAll={(members: ListMember[]) => {
          setSelectedMemberIds(prev =>
            prev.size === members.length ? new Set() : new Set(members.map(m => m.contact_id))
          );
        }}
        onBack={() => { setSelectedList(null); setMemberSearch(""); setSelectedMemberIds(new Set()); }}
        onRemoveMembers={(ids) => removeMembersMutation.mutate(ids)}
      />
    );
  }

  // Lists grid view
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {lists.length} {lists.length === 1 ? "lista" : "liste"}
        </p>
        <Button size="sm" onClick={() => { setEditingList(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Nuova Lista
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <List className="h-12 w-12 mx-auto text-muted-foreground/40" />
          <p className="text-muted-foreground">Nessuna lista creata</p>
          <Button variant="outline" onClick={() => { setEditingList(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Crea la tua prima lista
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => setSelectedList({ id: list.id, name: list.name, description: list.description })}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{list.name}</h3>
                    {list.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{list.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {list.member_count} contatti
                      </span>
                      <span>{format(new Date(list.created_at), "dd MMM yyyy", { locale: it })}</span>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => { setEditingList(list); setDialogOpen(true); }}>
                        <Pencil className="h-4 w-4 mr-2" /> Rinomina
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm(list)}>
                        <Trash2 className="h-4 w-4 mr-2" /> Elimina
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateListDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(data) => saveMutation.mutateAsync(data)}
        initialData={editingList ? { name: editingList.name, description: editingList.description || "" } : undefined}
        isEditing={!!editingList}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare la lista "{deleteConfirm?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              I contatti al suo interno non verranno eliminati, verrà rimossa solo la lista e le associazioni.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── List Detail View ───────────────────────────────────────────────────────

import { getInitials, getAvatarColor } from "@/lib/contactUtils";

interface ListDetailViewProps {
  listId: string;
  listName: string;
  listDescription: string | null;
  companyId: string | undefined;
  memberSearch: string;
  setMemberSearch: (s: string) => void;
  selectedMemberIds: Set<string>;
  onToggleMember: (id: string) => void;
  onToggleAll: (members: ListMember[]) => void;
  onBack: () => void;
  onRemoveMembers: (ids: string[]) => void;
}

function ListDetailView({
  listId, listName, listDescription, companyId,
  memberSearch, setMemberSearch, selectedMemberIds,
  onToggleMember, onToggleAll, onBack, onRemoveMembers,
}: ListDetailViewProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: members = [], isLoading } = useQuery({
    queryKey: queryKeys.listMembers.byList(listId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contact_list_members")
        .select("id, contact_id, added_at, marketing_contacts(id, first_name, last_name, phone, email, company_name, tags)")
        .eq("list_id", listId);
      if (error) throw error;
      return (data || []).map((d: any) => ({
        id: d.id,
        contact_id: d.contact_id,
        added_at: d.added_at,
        contact: d.marketing_contacts,
      })) as ListMember[];
    },
  });

  const filtered = members.filter(m => {
    if (!memberSearch.trim()) return true;
    const s = memberSearch.toLowerCase();
    const c = m.contact;
    return (
      c.first_name?.toLowerCase().includes(s) ||
      c.last_name?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.phone?.toLowerCase().includes(s) ||
      c.company_name?.toLowerCase().includes(s)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every(m => selectedMemberIds.has(m.contact_id));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold truncate">{listName}</h2>
          {listDescription && <p className="text-sm text-muted-foreground">{listDescription}</p>}
        </div>
        <Badge variant="secondary">{members.length} contatti</Badge>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Aggiungi contatti
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca nella lista..."
          className="pl-9"
          value={memberSearch}
          onChange={(e) => setMemberSearch(e.target.value)}
        />
      </div>

      {/* Bulk actions */}
      {selectedMemberIds.size > 0 && (
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2 text-sm">
          <span className="font-medium">{selectedMemberIds.size} selezionati</span>
          <Button size="sm" variant="outline" onClick={() => onRemoveMembers(Array.from(selectedMemberIds))}>
            <UserMinus className="h-4 w-4 mr-1" /> Rimuovi dalla lista
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox checked={allSelected} onCheckedChange={() => onToggleAll(filtered)} />
              </TableHead>
              <TableHead>Nome del Contatto</TableHead>
              <TableHead>Telefono</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Azienda</TableHead>
              <TableHead>Tag</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">Caricamento...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  {memberSearch ? "Nessun risultato" : "Nessun contatto in questa lista"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const c = m.contact;
                const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
                return (
                  <TableRow key={m.id} className="group">
                    <TableCell>
                      <Checkbox checked={selectedMemberIds.has(m.contact_id)} onCheckedChange={() => onToggleMember(m.contact_id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(fullName)}`}>
                          {getInitials(c.first_name, c.last_name)}
                        </div>
                        <span className="font-medium">{fullName}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{c.phone || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.email || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{c.company_name || "—"}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemoveMembers([m.contact_id])}
                        title="Rimuovi dalla lista"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AddContactsToListDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        listId={listId}
        companyId={companyId}
        onDone={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.listMembers.byList(listId) });
          queryClient.invalidateQueries({ queryKey: queryKeys.contactLists.all });
        }}
      />
    </div>
  );
}

// ─── Add Contacts to List Dialog ────────────────────────────────────────────

interface AddContactsToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  companyId: string | undefined;
  onDone: () => void;
}

function AddContactsToListDialog({ open, onOpenChange, listId, companyId, onDone }: AddContactsToListDialogProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Fetch existing member IDs
  const { data: existingIds = [] } = useQuery({
    queryKey: queryKeys.listMembers.ids(listId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_contact_list_members")
        .select("contact_id")
        .eq("list_id", listId);
      if (error) throw error;
      return (data || []).map(d => d.contact_id);
    },
    enabled: open,
  });

  // Search contacts
  const { data: contacts = [] } = useQuery({
    queryKey: queryKeys.listMembers.searchContacts(companyId, search),
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, phone, email, company_name")
        .eq("company_id", companyId)
        .order("first_name")
        .limit(50);

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!companyId,
  });

  const existingSet = new Set(existingIds);

  const addMutation = useMutation({
    mutationFn: async () => {
      const rows = Array.from(selected).map(contactId => ({ list_id: listId, contact_id: contactId }));
      const { error } = await supabase.from("marketing_contact_list_members").upsert(rows, { onConflict: "list_id,contact_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selected.size} contatti aggiunti alla lista`);
      setSelected(new Set());
      setSearch("");
      onOpenChange(false);
      onDone();
    },
    onError: () => toast.error("Errore nell'aggiunta"),
  });

  const toggleContact = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aggiungi contatti alla lista</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca contatti..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">Nessun contatto trovato</p>
            ) : (
              contacts.map((c) => {
                const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
                const alreadyIn = existingSet.has(c.id);
                return (
                  <label
                    key={c.id}
                    className={`flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer ${alreadyIn ? "opacity-50" : ""}`}
                  >
                    <Checkbox
                      checked={alreadyIn || selected.has(c.id)}
                      disabled={alreadyIn}
                      onCheckedChange={() => toggleContact(c.id)}
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0 ${getAvatarColor(fullName)}`}>
                        {getInitials(c.first_name, c.last_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{fullName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                    {alreadyIn && <span className="text-xs text-muted-foreground shrink-0">Già nella lista</span>}
                  </label>
                );
              })
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{selected.size} selezionati</span>
            <Button onClick={() => addMutation.mutate()} disabled={selected.size === 0 || addMutation.isPending}>
              <UserPlus className="h-4 w-4 mr-1" /> Aggiungi {selected.size > 0 ? `(${selected.size})` : ""}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
