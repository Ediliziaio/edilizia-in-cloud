import { useState, useEffect } from "react";
import { useUpdateOpportunity, useDeleteOpportunity, useCompanyStaff, useOpportunityNotes, useAddOpportunityNote } from "@/hooks/useOpportunitiesData";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Trash2, StickyNote, FileText, User, Mail, Phone, MapPin } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface Props {
  opportunity: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stages: { id: string; name: string }[];
}

type Tab = "details" | "notes";

export function OpportunityDetailDialog({ opportunity, open, onOpenChange, stages }: Props) {
  const updateOpp = useUpdateOpportunity();
  const deleteOpp = useDeleteOpportunity();
  const { data: staff = [] } = useCompanyStaff();
  const { data: notes = [] } = useOpportunityNotes(opportunity?.id || null);
  const addNote = useAddOpportunityNote();

  const [tab, setTab] = useState<Tab>("details");
  const [name, setName] = useState("");
  const [stageId, setStageId] = useState("");
  const [status, setStatus] = useState("open");
  const [value, setValue] = useState("");
  const [source, setSource] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followerId, setFollowerId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [oppNotes, setOppNotes] = useState("");
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    if (opportunity) {
      setName(opportunity.name || "");
      setStageId(opportunity.stage_id || "");
      setStatus(opportunity.status || "open");
      setValue(String(opportunity.value || 0));
      setSource(opportunity.source || "");
      setAssignedTo(opportunity.assigned_to || "");
      setFollowerId(opportunity.follower_id || "");
      setCompanyName(opportunity.company_name || "");
      setOppNotes(opportunity.notes || "");
      setTab("details");
      setNewNote("");
    }
  }, [opportunity]);

  if (!opportunity) return null;

  const contact = opportunity.marketing_contacts;

  const handleSave = () => {
    updateOpp.mutate({
      id: opportunity.id,
      name,
      stage_id: stageId,
      status,
      value: parseFloat(value) || 0,
      source: source || null,
      assigned_to: assignedTo || null,
      follower_id: followerId || null,
      company_name: companyName || null,
      notes: oppNotes || null,
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const handleDelete = () => {
    if (!confirm("Eliminare questa opportunità?")) return;
    deleteOpp.mutate(opportunity.id, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;
    addNote.mutate({ opportunityId: opportunity.id, content: newNote.trim() }, {
      onSuccess: () => setNewNote(""),
    });
  };

  const sidebarTabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "details", label: "Dettagli", icon: <FileText className="h-4 w-4" /> },
    { key: "notes", label: "Note", icon: <StickyNote className="h-4 w-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3">
          <DialogTitle className="text-lg">{opportunity.name}</DialogTitle>
          {contact && (
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> {contact.first_name} {contact.last_name || ""}</span>
              {contact.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {contact.city}</span>}
              {contact.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {contact.email}</span>}
              {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {contact.phone}</span>}
            </div>
          )}
        </DialogHeader>

        <Separator />

        <div className="flex flex-1 min-h-0">
          {/* Sidebar tabs */}
          <div className="w-[140px] border-r bg-muted/20 py-2 shrink-0">
            {sidebarTabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors ${tab === t.key ? "bg-primary/10 text-primary font-medium border-r-2 border-primary" : "text-muted-foreground hover:bg-muted/50"}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="p-5">
              {tab === "details" && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome opportunità</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Fase</Label>
                      <Select value={stageId} onValueChange={setStageId}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Stato</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Aperta</SelectItem>
                          <SelectItem value="won">Vinta</SelectItem>
                          <SelectItem value="lost">Persa</SelectItem>
                          <SelectItem value="abandoned">Abbandonata</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Valore (€)</Label>
                      <Input value={value} onChange={(e) => setValue(e.target.value)} type="number" className="h-8 text-sm" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Fonte</Label>
                      <Input value={source} onChange={(e) => setSource(e.target.value)} className="h-8 text-sm" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Titolare</Label>
                      <Select value={assignedTo || "none"} onValueChange={(v) => setAssignedTo(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Non assegnato" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Non assegnato</SelectItem>
                          {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Follower</Label>
                      <Select value={followerId || "none"} onValueChange={(v) => setFollowerId(v === "none" ? "" : v)}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Nessuno" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuno</SelectItem>
                          {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Azienda</Label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-8 text-sm" />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Note</Label>
                    <Textarea value={oppNotes} onChange={(e) => setOppNotes(e.target.value)} rows={3} className="text-sm" />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <Button onClick={handleSave} size="sm" disabled={updateOpp.isPending}>
                      {updateOpp.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salva
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteOpp.isPending}>
                      <Trash2 className="mr-2 h-4 w-4" /> Elimina
                    </Button>
                  </div>
                </div>
              )}

              {tab === "notes" && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Scrivi una nota..."
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      rows={2}
                      className="text-sm flex-1"
                    />
                    <Button size="sm" onClick={handleAddNote} disabled={addNote.isPending || !newNote.trim()} className="self-end">
                      {addNote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Aggiungi"}
                    </Button>
                  </div>
                  <Separator />
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nessuna nota</p>
                  ) : (
                    <div className="space-y-3">
                      {notes.map((note: any) => (
                        <div key={note.id} className="p-3 rounded-lg border bg-muted/20">
                          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                          <p className="text-[11px] text-muted-foreground mt-2">
                            {format(new Date(note.created_at), "d MMM yyyy HH:mm", { locale: it })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
