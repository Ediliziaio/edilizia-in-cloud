import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, MoreHorizontal, Pencil, Trash2, Users, List, ArrowLeft, Search, UserPlus, UserMinus, X, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { filtriRicercaContatti } from "@/lib/ricerca/ricercaContatti";
import { useDebounce } from "@/hooks/useDebounce";
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
import type { ContactFilters } from "./ContactFiltersSheet";
import { countActiveContactFilters } from "./ContactFiltersSheet";
import { RigaMobile } from "@/components/mobile/FiltriMobile";

/** Quanti iscritti mostrare per pagina nel dettaglio di una lista. */
const MEMBRI_PER_PAGINA = 50;

/**
 * La regola di una lista automatica. Il vocabolario e' chiuso e combacia con
 * quello che il database sa leggere in `contatto_corrisponde_regola`.
 */
type EsclusioneRegola = { escludi_tag?: string[] };

export type RegolaLista = EsclusioneRegola & (
  | { tipo: "tag"; tag: string }
  | { tipo: "tag_uno_di"; valori: string[] }
  | { tipo: "fonte"; valori: string[] }
  | { tipo: "fatturato_minimo"; euro: number }
  | { tipo: "email_contattabile" }
  | { tipo: "email_pec" }
  | { tipo: "solo_telefono" }
  | { tipo: "senza_contatti"; con_piva?: boolean; con_sito?: boolean }
  | { tipo: "campo_personalizzato"; campo: string; valori: string[] }
  | { tipo: "campo_valorizzato"; campo: string }
  | { tipo: "regione"; valori: string[] }
  | { tipo: "provincia"; valori: string[] }
  | { tipo: "ateco"; prefissi: string[] }
  | { tipo: "tutte"; regole: RegolaLista[] }
  | { tipo: "qualsiasi"; regole: RegolaLista[] }
  | { tipo: "non"; regola: RegolaLista }
);

/** La regola detta a parole, per chi guarda la lista e vuole sapere chi ci finisce. */
function descriviRegola(r: RegolaLista | null): string {
  if (!r) return "";
  const condizione = descriviCondizione(r);
  if (!condizione) return "Regola non riconosciuta";
  const esclusi = r.escludi_tag?.length
    ? `, tranne chi ha ${r.escludi_tag.map((t) => `"${t}"`).join(" o ")}`
    : "";
  return `Ci entra chi ${condizione}${esclusi}`;
}

const CAMPI_LEGGIBILI: Record<string, string> = {
  website: "il sito", region: "la regione", province: "la provincia", city: "la citta'",
  phone: "il telefono", email: "l'email", vat_number: "la partita IVA",
  ateco_code: "il codice ATECO", company_name: "il nome dell'azienda",
};

/** Il pezzo di frase che segue «Ci entra chi»; null se la regola non si sa leggere. */
function descriviCondizione(r: RegolaLista): string | null {
  switch (r.tipo) {
    case "tag":
      return `ha il tag "${r.tag}"`;
    case "tag_uno_di":
      return `ha uno dei tag ${r.valori.map((t) => `"${t}"`).join(", ")}`;
    case "fonte":
      return `arriva da ${r.valori.join(" o ")}`;
    case "fatturato_minimo":
      return `fattura almeno ${new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(r.euro)}`;
    case "email_contattabile":
      return "ha un'email e non si e' disiscritto";
    case "email_pec":
      return "ha un'email PEC";
    case "solo_telefono":
      return "ha un numero di telefono ma non un'email";
    case "senza_contatti":
      if (r.con_sito) return "non ha ne' email ne' telefono, ma ha il sito";
      if (r.con_piva) return "ha la partita IVA ma ne' email ne' telefono";
      return "non ha ne' email ne' telefono";
    case "campo_personalizzato":
      return `ha "${r.campo}" fra: ${r.valori.join(", ")}`;
    case "campo_valorizzato":
      return `ha ${CAMPI_LEGGIBILI[r.campo] ?? `"${r.campo}"`}`;
    case "regione":
      return `sta in ${r.valori.join(", ")}`;
    case "provincia":
      return `sta in provincia di ${r.valori.join(", ")}`;
    case "ateco":
      return `ha un codice ATECO che inizia con ${r.prefissi.join(", ")}`;
    case "tutte":
    case "qualsiasi": {
      const parti = (r.regole ?? []).map((x) => descriviCondizione(x));
      if (!parti.length || parti.some((x) => !x)) return null;
      return parti.join(r.tipo === "tutte" ? "; e " : " oppure ");
    }
    case "non": {
      const dentro = r.regola ? descriviCondizione(r.regola) : null;
      if (!dentro) return null;
      return r.regola.tipo === "tutte" || r.regola.tipo === "qualsiasi" || dentro.startsWith("non ")
        ? `non rientra in: ${dentro}`
        : `non ${dentro}`;
    }
    default:
      return null;
  }
}

interface ContactList {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  member_count: number;
  /** Presente = lista DINAMICA: la lista e' i filtri, non i membri. */
  filters: ContactFilters | null;
  /** Presente = lista AUTOMATICA: gli iscritti li decide la regola, non le mani. */
  regola: RegolaLista | null;
  regola_aggiornata_il: string | null;
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

type ListMemberRow = Omit<ListMember, "contact"> & {
  marketing_contacts: ListMember["contact"] | ListMember["contact"][] | null;
};

async function assertListBelongsToCompany(listId: string, companyId: string | undefined) {
  if (!companyId) throw new Error("Azienda non selezionata");
  const { data, error } = await supabase
    .from("marketing_contact_lists")
    .select("id")
    .eq("id", listId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Lista non trovata per questa azienda");
}

async function assertContactsBelongToCompany(contactIds: string[], companyId: string | undefined) {
  if (!companyId) throw new Error("Azienda non selezionata");
  if (contactIds.length === 0) return [];

  const { data, error } = await supabase
    .from("marketing_contacts")
    .select("id")
    .eq("company_id", companyId)
    .in("id", contactIds);
  if (error) throw error;

  const allowedIds = (data || []).map((row) => row.id);
  if (allowedIds.length !== contactIds.length) {
    throw new Error("Alcuni contatti selezionati non appartengono alla lista aziendale corrente");
  }
  return allowedIds;
}

export function ContactListsView({ onApplyDynamic }: { onApplyDynamic?: (filters: ContactFilters) => void } = {}) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingList, setEditingList] = useState<ContactList | null>(null);
  const [selectedList, setSelectedList] = useState<{ id: string; name: string; description: string | null; regola: RegolaLista | null } | null>(null);
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
        .select("id, name, description, created_at, filters, regola, regola_aggiornata_il")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Il conteggio si chiede al database, una lista alla volta. Scaricare le
      // iscrizioni per contarle qui non funziona: PostgREST ne restituisce al
      // massimo 1000, e con liste da decine di migliaia di contatti finivano
      // tutte nella prima e le altre risultavano vuote.
      const countMap: Record<string, number> = {};
      await Promise.all(
        (data || []).map(async (l) => {
          const { count, error: countError } = await supabase
            .from("marketing_contact_list_members")
            .select("contact_id", { count: "exact", head: true })
            .eq("list_id", l.id);
          if (countError) throw countError;
          countMap[l.id] = count ?? 0;
        }),
      );

      return ((data || []) as any[]).map(l => ({ ...l, member_count: countMap[l.id] || 0 })) as ContactList[];
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
          .eq("id", editingList.id)
          .eq("company_id", companyId);
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
      if (!companyId) throw new Error("No company");
      const { error } = await supabase
        .from("marketing_contact_lists")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
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
      await assertListBelongsToCompany(selectedList.id, companyId);
      const safeContactIds = await assertContactsBelongToCompany(contactIds, companyId);
      if (safeContactIds.length === 0) return;
      const { error } = await supabase
        .from("marketing_contact_list_members")
        .delete()
        .eq("list_id", selectedList.id)
        .in("contact_id", safeContactIds);
      if (error) throw error;
    },
    onSuccess: (_, contactIds) => {
      toast.success(`${contactIds.length} contatt${contactIds.length === 1 ? "o rimosso" : "i rimossi"} dalla lista`);
      setSelectedMemberIds(new Set());
      invalidate();
    },
    onError: () => toast.error("Errore nella rimozione"),
  });

  // I trigger tengono tutto allineato riga per riga e di notte passa il
  // controllo generale. Questo bottone serve quando non si vuole aspettare:
  // p.es. dopo un import fatto con i trigger spenti.
  const riallinea = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { data, error } = await supabase.rpc("risincronizza_liste_azienda", { p_azienda: companyId });
      if (error) throw new Error(error.message);
      const righe = (data ?? []) as Array<{ lista: string; aggiunti: number; rimossi: number }>;
      return righe.reduce((somma, r) => somma + (r.aggiunti ?? 0) + (r.rimossi ?? 0), 0);
    },
    onSuccess: (mosse) => {
      toast.success(mosse === 0 ? "Le liste erano già in pari" : `${mosse} contatti spostati fra le liste`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const listeAutomatiche = lists.filter((l) => l.regola).length;

  const handleToggleMember = useCallback((id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
        regola={selectedList.regola}
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
      {/* Mobile no: creare e riallineare le liste è lavoro da scrivania. */}
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:hidden">
        <p className="text-sm text-muted-foreground">
          {lists.length} {lists.length === 1 ? "lista" : "liste"}
          {listeAutomatiche > 0 && `, di cui ${listeAutomatiche} che si aggiornano da sole`}
        </p>
        <div className="flex items-center gap-2">
          {listeAutomatiche > 0 && (
            <Button size="sm" variant="outline" disabled={riallinea.isPending} onClick={() => riallinea.mutate()}>
              <RefreshCw className={`h-4 w-4 mr-1 ${riallinea.isPending ? "animate-spin" : ""}`} />
              {riallinea.isPending ? "Sto aggiornando…" : "Aggiorna adesso"}
            </Button>
          )}
          <Button size="sm" onClick={() => { setEditingList(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Nuova Lista
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Caricamento...</div>
      ) : lists.length === 0 ? (
        <div className="text-center py-16 space-y-3 max-sm:py-8">
          <List className="h-12 w-12 mx-auto text-muted-foreground/40 max-sm:hidden" />
          <p className="text-muted-foreground max-sm:text-[13px]">Nessuna lista creata</p>
          <Button variant="outline" className="max-sm:hidden" onClick={() => { setEditingList(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Crea la tua prima lista
          </Button>
        </div>
      ) : (
        <>
        {/* Mobile: una riga per lista (nome e contatti o filtri); il tocco fa
            come la scheda del computer. Descrizione, regola e data restano lì. */}
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
          {lists.map((list) => (
            <RigaMobile
              key={list.id}
              titolo={list.name}
              sottotitolo={
                list.filters
                  ? `Dinamica · ${countActiveContactFilters(list.filters)} ${countActiveContactFilters(list.filters) === 1 ? "filtro" : "filtri"}`
                  : list.regola
                    ? "Si aggiorna da sola"
                    : undefined
              }
              valore={list.filters ? undefined : list.member_count.toLocaleString("it-IT")}
              onClick={() =>
                list.filters
                  ? onApplyDynamic?.(list.filters)
                  : setSelectedList({ id: list.id, name: list.name, description: list.description, regola: list.regola })
              }
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-sm:hidden">
          {lists.map((list) => (
            <Card
              key={list.id}
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() =>
                list.filters
                  ? onApplyDynamic?.(list.filters)
                  : setSelectedList({ id: list.id, name: list.name, description: list.description, regola: list.regola })
              }
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{list.name}</h3>
                    {list.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{list.description}</p>
                    )}
                    {list.regola && (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                        <RefreshCw className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="line-clamp-2">{descriviRegola(list.regola)}</span>
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-3 text-xs text-muted-foreground">
                      {list.filters ? (
                        <Badge variant="outline" className="h-5 text-[10px] gap-1 border-primary/40 text-primary">
                          <Search className="h-3 w-3" /> Dinamica · {countActiveContactFilters(list.filters)} {countActiveContactFilters(list.filters) === 1 ? "filtro" : "filtri"}
                        </Badge>
                      ) : (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5 shrink-0" />
                          <span className="tabular-nums">{list.member_count.toLocaleString("it-IT")}</span> contatti
                        </span>
                      )}
                      {list.regola && (
                        <Badge variant="secondary" className="h-5 text-[10px]">Si aggiorna da sola</Badge>
                      )}
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
        </>
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
  regola: RegolaLista | null;
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
  listId, listName, listDescription, regola, companyId,
  memberSearch, setMemberSearch, selectedMemberIds,
  onToggleMember, onToggleAll, onBack, onRemoveMembers,
}: ListDetailViewProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [pagina, setPagina] = useState(0);
  const queryClient = useQueryClient();
  const ricerca = useDebounce(memberSearch.trim(), 300);

  // Tornando a cercare si riparte dalla prima pagina, altrimenti si resta su
  // una pagina che il nuovo filtro non ha.
  const chiaveRicerca = `${listId}|${ricerca}`;
  const [ultimaChiave, setUltimaChiave] = useState(chiaveRicerca);
  if (ultimaChiave !== chiaveRicerca) {
    setUltimaChiave(chiaveRicerca);
    setPagina(0);
  }

  // Ricerca e pagine le fa il database: una lista da 25.000 contatti non entra
  // nel browser, e PostgREST si ferma comunque a 1000 righe per volta.
  const { data: risultato, isLoading } = useQuery({
    queryKey: ["list-members", companyId, listId, ricerca, pagina],
    queryFn: async () => {
      await assertListBelongsToCompany(listId, companyId);
      let query = supabase
        .from("marketing_contact_list_members")
        .select(
          "id, contact_id, added_at, marketing_contacts!inner(id, first_name, last_name, phone, email, company_name, tags)",
          { count: "exact" },
        )
        .eq("list_id", listId);

      for (const filtro of filtriRicercaContatti(ricerca)) {
        query = query.or(filtro, { referencedTable: "marketing_contacts" });
      }

      const da = pagina * MEMBRI_PER_PAGINA;
      const { data, error, count } = await query
        .order("added_at", { ascending: false })
        .range(da, da + MEMBRI_PER_PAGINA - 1);
      if (error) throw error;

      const righe = ((data || []) as ListMemberRow[]).flatMap((row) => {
        const contact = Array.isArray(row.marketing_contacts)
          ? row.marketing_contacts[0]
          : row.marketing_contacts;
        if (!contact) return [];
        return [{
          id: row.id,
          contact_id: row.contact_id,
          added_at: row.added_at,
          contact,
        }];
      });
      return { righe, totale: count ?? 0 };
    },
    enabled: !!companyId && !!listId,
    placeholderData: (precedente) => precedente,
  });

  const filtered = risultato?.righe ?? [];
  const totale = risultato?.totale ?? 0;
  const ultimaPagina = Math.max(0, Math.ceil(totale / MEMBRI_PER_PAGINA) - 1);

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
        <Badge variant="secondary">{totale.toLocaleString("it-IT")} contatti</Badge>
        {!regola && (
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> Aggiungi contatti
          </Button>
        )}
      </div>

      {regola && (
        <div className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium">Questa lista si aggiorna da sola</p>
            <p className="text-muted-foreground">
              {descriviRegola(regola)}. I contatti entrano ed escono appena cambiano, quindi qui non si
              aggiunge e non si toglie nessuno a mano: al primo aggiornamento tornerebbe come prima.
            </p>
          </div>
        </div>
      )}

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
      {selectedMemberIds.size > 0 && !regola && (
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
                {!regola && <Checkbox checked={allSelected} onCheckedChange={() => onToggleAll(filtered)} />}
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
                  {ricerca ? "Nessun risultato" : "Nessun contatto in questa lista"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((m) => {
                const c = m.contact;
                const fullName = `${c.first_name} ${c.last_name || ""}`.trim();
                return (
                  <TableRow key={m.id} className="group">
                    <TableCell>
                      {!regola && (
                        <Checkbox checked={selectedMemberIds.has(m.contact_id)} onCheckedChange={() => onToggleMember(m.contact_id)} />
                      )}
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
                      {!regola && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                          onClick={() => onRemoveMembers([m.contact_id])}
                          title="Rimuovi dalla lista"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totale > MEMBRI_PER_PAGINA && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Da {(pagina * MEMBRI_PER_PAGINA + 1).toLocaleString("it-IT")} a{" "}
            {Math.min((pagina + 1) * MEMBRI_PER_PAGINA, totale).toLocaleString("it-IT")} di{" "}
            {totale.toLocaleString("it-IT")}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 0} onClick={() => setPagina(p => Math.max(0, p - 1))}>
              Precedenti
            </Button>
            <Button variant="outline" size="sm" disabled={pagina >= ultimaPagina} onClick={() => setPagina(p => p + 1)}>
              Successivi
            </Button>
          </div>
        </div>
      )}

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

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearch("");
      setSelected(new Set());
    }
    onOpenChange(nextOpen);
  };

  // Search contacts
  const { data: contacts = [] } = useQuery({
    queryKey: queryKeys.listMembers.searchContacts(companyId, search),
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name, phone, email, company_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("first_name")
        .limit(50);
      for (const filtro of filtriRicercaContatti(search)) query = query.or(filtro);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!companyId,
  });

  // "Già nella lista" si chiede solo per i contatti che si vedono adesso.
  // Chiedere tutti gli iscritti non funzionava: oltre i 1000 la risposta si
  // tronca e su una lista grande i contatti già dentro sembravano aggiungibili.
  const visibleIds = contacts.map(c => c.id);
  const { data: existingIds = [] } = useQuery({
    queryKey: ["list-member-ids", listId, visibleIds.join(",")],
    queryFn: async () => {
      await assertListBelongsToCompany(listId, companyId);
      if (visibleIds.length === 0) return [];
      const { data, error } = await supabase
        .from("marketing_contact_list_members")
        .select("contact_id")
        .eq("list_id", listId)
        .in("contact_id", visibleIds);
      if (error) throw error;
      return (data || []).map(d => d.contact_id);
    },
    enabled: open && visibleIds.length > 0,
  });

  const existingSet = new Set(existingIds);

  const addMutation = useMutation({
    mutationFn: async () => {
      await assertListBelongsToCompany(listId, companyId);
      const contactIds = await assertContactsBelongToCompany(Array.from(selected), companyId);
      if (contactIds.length === 0) return;
      const rows = contactIds.map(contactId => ({ list_id: listId, contact_id: contactId }));
      const { error } = await supabase.from("marketing_contact_list_members").upsert(rows, { onConflict: "list_id,contact_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`${selected.size} contatti aggiunti alla lista`);
      setSelected(new Set());
      setSearch("");
      handleOpenChange(false);
      onDone();
    },
    onError: () => toast.error("Errore nell'aggiunta"),
  });

  const toggleContact = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
