import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Trash2, UserPlus, Crown, Pencil, GripVertical, BarChart3, Shuffle } from "lucide-react";
import {
  DndContext,
  closestCenter,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  company_id: string;
  leader_id: string | null;
  created_at: string;
  round_robin_index: number;
}

interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role_in_team: string;
  joined_at: string;
  profile?: { first_name: string; last_name: string; email: string };
}

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

const COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
];

// --- Draggable Member Item ---
function DraggableMember({ member, team, onRemove, onSetLeader, isOverlay }: {
  member: TeamMember;
  team: Team;
  onRemove: (id: string) => void;
  onSetLeader: (teamId: string, userId: string) => void;
  isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
    data: { type: "member", member, teamId: team.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  const initials = member.profile
    ? `${member.profile.first_name?.[0] || ""}${member.profile.last_name?.[0] || ""}`.toUpperCase()
    : "?";

  return (
    <div
      ref={setNodeRef}
      style={isOverlay ? undefined : style}
      className={`flex items-center justify-between gap-2 rounded-md border p-2 bg-card ${isOverlay ? "shadow-lg ring-2 ring-primary/30" : ""}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
          <GripVertical className="h-4 w-4" />
        </button>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <p className="text-sm font-medium truncate">
          {member.profile ? `${member.profile.first_name} ${member.profile.last_name}` : "—"}
        </p>
        {team.leader_id === member.user_id && (
          <Badge variant="secondary" className="text-xs gap-1">
            <Crown className="h-3 w-3" /> Leader
          </Badge>
        )}
      </div>
      {!isOverlay && (
        <div className="flex gap-1">
          {team.leader_id !== member.user_id && (
            <Button variant="ghost" size="icon" className="h-6 w-6" title="Imposta come leader"
              onClick={() => onSetLeader(team.id, member.user_id)}>
              <Crown className="h-3 w-3" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
            onClick={() => onRemove(member.id)}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// --- Droppable Team Container ---
function DroppableTeamZone({ teamId, children }: { teamId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `team-drop-${teamId}`, data: { type: "team", teamId } });
  return (
    <div ref={setNodeRef} className={`min-h-[40px] space-y-2 rounded-md transition-colors ${isOver ? "bg-primary/5 ring-1 ring-primary/20" : ""}`}>
      {children}
    </div>
  );
}

// --- KPI Mini Stats ---
function TeamKpiBar({ membersCount, hasLeader, color }: { membersCount: number; hasLeader: boolean; color: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
      <div className="flex items-center gap-1">
        <Users className="h-3 w-3" />
        <span>{membersCount} membri</span>
      </div>
      <div className="flex items-center gap-1">
        <Crown className="h-3 w-3" />
        <span>{hasLeader ? "Leader assegnato" : "Nessun leader"}</span>
      </div>
      <div className="flex items-center gap-1">
        <BarChart3 className="h-3 w-3" />
        <span className="font-medium" style={{ color }}>Attivo</span>
      </div>
    </div>
  );
}

export default function SettingsTeams() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [addMemberTeamId, setAddMemberTeamId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formColor, setFormColor] = useState(COLORS[0]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [activeDragMember, setActiveDragMember] = useState<TeamMember | null>(null);
  const [activeDragTeam, setActiveDragTeam] = useState<Team | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Fetch teams
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Team[];
    },
  });

  // Fetch all team members with profiles
  const { data: allMembers = [] } = useQuery({
    queryKey: ["team-members", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("*, profile:profiles(first_name, last_name, email)")
        .eq("company_id", companyId!);
      if (error) throw error;
      return (data ?? []).map((m: any) => ({
        ...m,
        profile: Array.isArray(m.profile) ? m.profile[0] : m.profile,
      })) as TeamMember[];
    },
  });

  // Fetch company profiles for adding members
  const { data: companyProfiles = [] } = useQuery({
    queryKey: ["company-profiles-for-teams", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .eq("company_id", companyId!)
        .order("first_name");
      if (error) throw error;
      return data as Profile[];
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("teams").insert({
        company_id: companyId!,
        name: formName.trim(),
        description: formDesc.trim() || null,
        color: formColor,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teams"] }); setCreateOpen(false); resetForm(); toast.success("Team creato"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTeam) return;
      const { error } = await supabase.from("teams")
        .update({ name: formName.trim(), description: formDesc.trim() || null, color: formColor, updated_at: new Date().toISOString() })
        .eq("id", editTeam.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teams"] }); setEditTeam(null); resetForm(); toast.success("Team aggiornato"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teams"] }); queryClient.invalidateQueries({ queryKey: ["team-members"] }); toast.success("Team eliminato"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const { error } = await supabase.from("team_members").insert({
        team_id: teamId, user_id: userId, company_id: companyId!, role_in_team: "member",
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team-members"] }); setAddMemberTeamId(null); setSelectedUserId(""); toast.success("Membro aggiunto"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["team-members"] }); toast.success("Membro rimosso"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setLeaderMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const { error } = await supabase.from("teams").update({ leader_id: userId, updated_at: new Date().toISOString() }).eq("id", teamId);
      if (error) throw error;
      await supabase.from("team_members").update({ role_in_team: "member" }).eq("team_id", teamId).neq("user_id", userId);
      await supabase.from("team_members").update({ role_in_team: "leader" }).eq("team_id", teamId).eq("user_id", userId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["teams"] }); queryClient.invalidateQueries({ queryKey: ["team-members"] }); toast.success("Leader impostato"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Move member between teams (drag & drop)
  const moveMemberMutation = useMutation({
    mutationFn: async ({ memberId, newTeamId }: { memberId: string; newTeamId: string }) => {
      const { error } = await supabase.from("team_members")
        .update({ team_id: newTeamId, role_in_team: "member" })
        .eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      toast.success("Membro spostato nel nuovo team");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Round-robin test
  const roundRobinMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const { data, error } = await supabase.rpc("assign_round_robin", { p_team_id: teamId });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (userId, teamId) => {
      if (!userId) {
        toast.info("Nessun membro nel team per l'assegnazione");
        return;
      }
      const profile = companyProfiles.find((p) => p.id === userId);
      toast.success(`Round-robin: assegnato a ${profile ? `${profile.first_name} ${profile.last_name}` : userId}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setFormName(""); setFormDesc(""); setFormColor(COLORS[0]);
  }

  function openEdit(team: Team) {
    setFormName(team.name); setFormDesc(team.description || ""); setFormColor(team.color || COLORS[0]); setEditTeam(team);
  }

  const getMembersForTeam = useCallback((teamId: string) => allMembers.filter((m) => m.team_id === teamId), [allMembers]);

  function getAvailableUsers(teamId: string) {
    const memberIds = getMembersForTeam(teamId).map((m) => m.user_id);
    return companyProfiles.filter((p) => !memberIds.includes(p.id));
  }

  // Drag handlers
  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const member = allMembers.find((m) => m.id === active.id);
    if (member) {
      setActiveDragMember(member);
      const team = teams.find((t) => t.id === member.team_id);
      setActiveDragTeam(team || null);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveDragMember(null);
    setActiveDragTeam(null);

    if (!over) return;

    const member = allMembers.find((m) => m.id === active.id);
    if (!member) return;

    let targetTeamId: string | null = null;

    // Dropped on a team drop zone
    if (String(over.id).startsWith("team-drop-")) {
      targetTeamId = String(over.id).replace("team-drop-", "");
    }
    // Dropped on another member (get their team)
    else {
      const overMember = allMembers.find((m) => m.id === over.id);
      if (overMember) targetTeamId = overMember.team_id;
    }

    if (targetTeamId && targetTeamId !== member.team_id) {
      moveMemberMutation.mutate({ memberId: member.id, newTeamId: targetTeamId });
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Caricamento...</div>;
  }

  // Global KPI
  const totalMembers = allMembers.length;
  const teamsWithLeader = teams.filter((t) => t.leader_id).length;
  const avgMembersPerTeam = teams.length > 0 ? (totalMembers / teams.length).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestione Team</h2>
          <p className="text-muted-foreground">Crea, gestisci e trascina membri tra i team</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Team
        </Button>
      </div>

      {/* KPI Dashboard */}
      {teams.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="rounded-full p-2 bg-primary/10"><Users className="h-4 w-4 text-primary" /></div>
              <div><p className="text-2xl font-bold leading-none">{teams.length}</p><p className="text-xs text-muted-foreground">Team</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="rounded-full p-2 bg-emerald-500/10"><Users className="h-4 w-4 text-emerald-600" /></div>
              <div><p className="text-2xl font-bold leading-none">{totalMembers}</p><p className="text-xs text-muted-foreground">Membri totali</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="rounded-full p-2 bg-amber-500/10"><Crown className="h-4 w-4 text-amber-600" /></div>
              <div><p className="text-2xl font-bold leading-none">{teamsWithLeader}/{teams.length}</p><p className="text-xs text-muted-foreground">Con leader</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4 flex items-center gap-3">
              <div className="rounded-full p-2 bg-violet-500/10"><BarChart3 className="h-4 w-4 text-violet-600" /></div>
              <div><p className="text-2xl font-bold leading-none">{avgMembersPerTeam}</p><p className="text-xs text-muted-foreground">Media membri</p></div>
            </CardContent>
          </Card>
        </div>
      )}

      {teams.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <p className="text-lg font-medium">Nessun team creato</p>
            <p className="text-sm text-muted-foreground mb-4">Crea il primo team per organizzare il tuo staff</p>
            <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Crea Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => {
              const members = getMembersForTeam(team.id);
              return (
                <Card key={team.id} className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: team.color || COLORS[0] }} />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color || COLORS[0] }} />
                        <CardTitle className="text-base">{team.name}</CardTitle>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Round-robin"
                          onClick={() => roundRobinMutation.mutate(team.id)}
                          disabled={roundRobinMutation.isPending}>
                          <Shuffle className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(team)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Elimina team</AlertDialogTitle>
                              <AlertDialogDescription>Vuoi eliminare il team "{team.name}"? I membri non verranno eliminati.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annulla</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(team.id)}>Elimina</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    {team.description && <p className="text-sm text-muted-foreground mt-1">{team.description}</p>}
                    <TeamKpiBar membersCount={members.length} hasLeader={!!team.leader_id} color={team.color || COLORS[0]} />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Membri ({members.length})</span>
                      <Button variant="outline" size="sm" onClick={() => setAddMemberTeamId(team.id)}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                      </Button>
                    </div>
                    <DroppableTeamZone teamId={team.id}>
                      <SortableContext items={members.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                        {members.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded-md">
                            Trascina qui un membro
                          </p>
                        ) : (
                          members.map((m) => (
                            <DraggableMember
                              key={m.id}
                              member={m}
                              team={team}
                              onRemove={(id) => removeMemberMutation.mutate(id)}
                              onSetLeader={(tid, uid) => setLeaderMutation.mutate({ teamId: tid, userId: uid })}
                            />
                          ))
                        )}
                      </SortableContext>
                    </DroppableTeamZone>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          <DragOverlay>
            {activeDragMember && activeDragTeam && (
              <DraggableMember
                member={activeDragMember}
                team={activeDragTeam}
                onRemove={() => {}}
                onSetLeader={() => {}}
                isOverlay
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={createOpen || !!editTeam} onOpenChange={(open) => { if (!open) { setCreateOpen(false); setEditTeam(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTeam ? "Modifica Team" : "Nuovo Team"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Es. Squadra Nord" />
            </div>
            <div>
              <Label>Descrizione</Label>
              <Textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="Descrizione opzionale" rows={2} />
            </div>
            <div>
              <Label>Colore</Label>
              <div className="flex gap-2 mt-1">
                {COLORS.map((c) => (
                  <button key={c} type="button"
                    className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: formColor === c ? "hsl(var(--foreground))" : "transparent" }}
                    onClick={() => setFormColor(c)} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={() => editTeam ? updateMutation.mutate() : createMutation.mutate()}>
              {editTeam ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={!!addMemberTeamId} onOpenChange={(open) => { if (!open) { setAddMemberTeamId(null); setSelectedUserId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi membro al team</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Utente</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger><SelectValue placeholder="Seleziona un utente" /></SelectTrigger>
              <SelectContent>
                {addMemberTeamId && getAvailableUsers(addMemberTeamId).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.first_name} {p.last_name} — {p.email}</SelectItem>
                ))}
                {addMemberTeamId && getAvailableUsers(addMemberTeamId).length === 0 && (
                  <SelectItem value="_none" disabled>Nessun utente disponibile</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button disabled={!selectedUserId || addMemberMutation.isPending}
              onClick={() => addMemberTeamId && addMemberMutation.mutate({ teamId: addMemberTeamId, userId: selectedUserId })}>
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
