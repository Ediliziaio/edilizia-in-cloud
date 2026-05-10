/**
 * SurveyAssignDialog — assegna utenti (subappaltatori, operai, tecnici)
 * a un sopralluogo. Crea anche una notifica all'utente assegnato.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { assignUser, unassignUser, listAssignees } from "@/lib/api/surveys";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, X, Check } from "lucide-react";
import { toast } from "sonner";

interface SurveyAssignDialogProps {
  surveyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABEL: Record<string, { label: string; color: string }> = {
  technician:    { label: "Tecnico",        color: "bg-orange-100 text-orange-700" },
  subcontractor: { label: "Subappaltatore", color: "bg-violet-100 text-violet-700" },
  employee:      { label: "Operaio",        color: "bg-emerald-100 text-emerald-700" },
  observer:      { label: "Osservatore",    color: "bg-slate-100 text-slate-700" },
};

export function SurveyAssignDialog({ surveyId, open, onOpenChange }: SurveyAssignDialogProps) {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<"technician" | "subcontractor" | "employee" | "observer">("technician");

  const { data: assignees = [] } = useQuery({
    queryKey: ["survey-assignees", surveyId],
    enabled: open,
    queryFn: () => listAssignees(surveyId),
  });

  const { data: members = [] } = useQuery({
    queryKey: ["company-assignable-members"],
    enabled: open,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, first_name, last_name, email")
        .order("first_name");
      return (data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
    },
  });

  const assignedIds = new Set((assignees as Array<{ user_id: string }>).map((a) => a.user_id));

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error("Seleziona un utente");
      await assignUser(surveyId, selectedUserId, selectedRole);

      // Crea notifica per l'utente assegnato
      const member = members.find((m) => m.id === selectedUserId);
      const memberName = member ? [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email : "utente";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from("notifications").insert({
        user_id: selectedUserId,
        type: "generic",
        title: "Nuovo sopralluogo assegnato",
        body: `Sei stato assegnato come ${ROLE_LABEL[selectedRole].label} a un sopralluogo.`,
        action_url: `/azienda/sopralluoghi/${surveyId}`,
        entity_type: "survey",
        entity_id: surveyId,
      });

      return { memberName };
    },
    onSuccess: ({ memberName }) => {
      toast.success(`${memberName} assegnato come ${ROLE_LABEL[selectedRole].label}`);
      setSelectedUserId("");
      qc.invalidateQueries({ queryKey: ["survey-assignees", surveyId] });
    },
    onError: (e) => toast.error("Assegnazione fallita", { description: String(e) }),
  });

  const unassignMut = useMutation({
    mutationFn: (userId: string) => unassignUser(surveyId, userId),
    onSuccess: () => {
      toast.success("Assegnazione rimossa");
      qc.invalidateQueries({ queryKey: ["survey-assignees", surveyId] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-orange-600" />
            Assegna sopralluogo
          </DialogTitle>
          <DialogDescription>
            Aggiungi tecnici, subappaltatori o operai. Riceveranno una notifica e
            vedranno il sopralluogo nella loro area personale.
          </DialogDescription>
        </DialogHeader>

        {/* Lista assegnati */}
        {assignees.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Già assegnati ({assignees.length})</p>
            <div className="space-y-1">
              {(assignees as Array<{ user_id: string; role: string }>).map((a) => {
                const m = members.find((mb) => mb.id === a.user_id);
                const cfg = ROLE_LABEL[a.role] ?? ROLE_LABEL.technician;
                return (
                  <div key={a.user_id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m ? [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email : a.user_id.slice(0, 8)}
                      </p>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => unassignMut.mutate(a.user_id)}
                      disabled={unassignMut.isPending}
                      className="h-7 w-7 text-rose-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Form aggiungi */}
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-semibold text-muted-foreground">Aggiungi nuovo</p>
          <div>
            <Label className="text-xs">Utente</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli utente…" />
              </SelectTrigger>
              <SelectContent>
                {members
                  .filter((m) => !assignedIds.has(m.id))
                  .map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Ruolo</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as typeof selectedRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Chiudi</Button>
          <Button
            onClick={() => assignMut.mutate()}
            disabled={!selectedUserId || assignMut.isPending}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Assegna
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
