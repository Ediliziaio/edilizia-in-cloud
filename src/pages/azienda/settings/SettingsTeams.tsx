import { useState } from "react";
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
import { Plus, Users, Trash2, UserPlus, Crown, Pencil } from "lucide-react";

interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  company_id: string;
  leader_id: string | null;
  created_at: string;
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

  // Create team
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setCreateOpen(false);
      resetForm();
      toast.success("Team creato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Update team
  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editTeam) return;
      const { error } = await supabase
        .from("teams")
        .update({ name: formName.trim(), description: formDesc.trim() || null, color: formColor, updated_at: new Date().toISOString() })
        .eq("id", editTeam.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      setEditTeam(null);
      resetForm();
      toast.success("Team aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Delete team
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Team eliminato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Add member
  const addMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const { error } = await supabase.from("team_members").insert({
        team_id: teamId,
        user_id: userId,
        company_id: companyId!,
        role_in_team: "member",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      setAddMemberTeamId(null);
      setSelectedUserId("");
      toast.success("Membro aggiunto");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Remove member
  const removeMemberMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("team_members").delete().eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Membro rimosso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Set leader
  const setLeaderMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      const { error } = await supabase
        .from("teams")
        .update({ leader_id: userId, updated_at: new Date().toISOString() })
        .eq("id", teamId);
      if (error) throw error;
      // Also update role_in_team
      await supabase
        .from("team_members")
        .update({ role_in_team: "member" })
        .eq("team_id", teamId)
        .neq("user_id", userId);
      await supabase
        .from("team_members")
        .update({ role_in_team: "leader" })
        .eq("team_id", teamId)
        .eq("user_id", userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
      toast.success("Leader impostato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function resetForm() {
    setFormName("");
    setFormDesc("");
    setFormColor(COLORS[0]);
  }

  function openEdit(team: Team) {
    setFormName(team.name);
    setFormDesc(team.description || "");
    setFormColor(team.color || COLORS[0]);
    setEditTeam(team);
  }

  function getMembersForTeam(teamId: string) {
    return allMembers.filter((m) => m.team_id === teamId);
  }

  function getAvailableUsers(teamId: string) {
    const memberIds = getMembersForTeam(teamId).map((m) => m.user_id);
    return companyProfiles.filter((p) => !memberIds.includes(p.id));
  }

  const initials = (p: { first_name: string; last_name: string }) =>
    `${p.first_name?.[0] || ""}${p.last_name?.[0] || ""}`.toUpperCase();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Caricamento...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Gestione Team</h2>
          <p className="text-muted-foreground">Crea e gestisci i team della tua azienda</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" /> Nuovo Team
        </Button>
      </div>

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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(team)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Elimina team</AlertDialogTitle>
                            <AlertDialogDescription>
                              Vuoi eliminare il team "{team.name}"? I membri non verranno eliminati.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(team.id)}>
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {team.description && (
                    <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Membri ({members.length})</span>
                    <Button variant="outline" size="sm" onClick={() => setAddMemberTeamId(team.id)}>
                      <UserPlus className="h-3.5 w-3.5 mr-1" /> Aggiungi
                    </Button>
                  </div>
                  {members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun membro assegnato</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 rounded-md border p-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar className="h-7 w-7">
                              <AvatarFallback className="text-xs">
                                {m.profile ? initials(m.profile) : "?"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                {m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : "—"}
                              </p>
                            </div>
                            {team.leader_id === m.user_id && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Crown className="h-3 w-3" /> Leader
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-1">
                            {team.leader_id !== m.user_id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                title="Imposta come leader"
                                onClick={() => setLeaderMutation.mutate({ teamId: team.id, userId: m.user_id })}
                              >
                                <Crown className="h-3 w-3" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive"
                              onClick={() => removeMemberMutation.mutate(m.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
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
                  <button
                    key={c}
                    type="button"
                    className="h-7 w-7 rounded-full border-2 transition-transform hover:scale-110"
                    style={{ backgroundColor: c, borderColor: formColor === c ? "hsl(var(--foreground))" : "transparent" }}
                    onClick={() => setFormColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={!formName.trim() || createMutation.isPending || updateMutation.isPending}
              onClick={() => editTeam ? updateMutation.mutate() : createMutation.mutate()}
            >
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
              <SelectTrigger>
                <SelectValue placeholder="Seleziona un utente" />
              </SelectTrigger>
              <SelectContent>
                {addMemberTeamId && getAvailableUsers(addMemberTeamId).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.first_name} {p.last_name} — {p.email}
                  </SelectItem>
                ))}
                {addMemberTeamId && getAvailableUsers(addMemberTeamId).length === 0 && (
                  <SelectItem value="_none" disabled>Nessun utente disponibile</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              disabled={!selectedUserId || addMemberMutation.isPending}
              onClick={() => addMemberTeamId && addMemberMutation.mutate({ teamId: addMemberTeamId, userId: selectedUserId })}
            >
              Aggiungi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
