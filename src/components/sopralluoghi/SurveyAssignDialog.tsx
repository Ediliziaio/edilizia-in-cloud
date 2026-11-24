/**
 * SurveyAssignDialog — assegna utenti (subappaltatori, operai, tecnici)
 * a un sopralluogo. Crea anche una notifica all'utente assegnato, ma solo se
 * quell'utente non ha spento "Task assegnato" fra le sue preferenze: prima la
 * notifica partiva comunque, e la preferenza in Mio profilo non contava nulla.
 *
 * La lettura sta qui perché qui sta anche l'inserimento della notifica (la
 * policy di `user_notification_preferences` è per azienda, quindi il collega
 * la legge). Se un giorno l'inserimento si sposta su trigger o edge function,
 * il controllo va spostato con lui.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { assignUser, unassignUser, listAssignees } from "@/lib/api/surveys";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { useTecniciAzienda } from "@/hooks/useTecniciAzienda";
import { ETICHETTA_GRUPPO, gruppiTecnici, ordinaPerTecnico } from "@/lib/sopralluoghi/sceltaTecnico";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, X, Check } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  const t = useT();
  const qc = useQueryClient();
  const companyId = useEffectiveCompanyId();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [fieldAuthorized,setFieldAuthorized] = useState(false);
  const [selectedRole, setSelectedRole] = useState<"technician" | "subcontractor" | "employee" | "observer">("technician");

  const { data: assignees = [], isError: assigneesError } = useQuery({
    queryKey: ["survey-assignees", surveyId, companyId],
    enabled: open,
    queryFn: () => listAssignees(surveyId),
  });

  // Solo lo staff (mai i clienti, che sono anch'essi profili dell'azienda), tecnici in cima:
  // stessa regola di «Pianifica» e dell'appuntamento (lib/sopralluoghi/sceltaTecnico).
  const { data: staff = [] } = useCompanyStaffUsers(open ? companyId : null);
  const tecnici = useTecniciAzienda(companyId, open);
  const members = ordinaPerTecnico(staff, tecnici);

  const assignedIds = new Set((assignees as Array<{ user_id: string }>).map((a) => a.user_id));

  const assignMut = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) throw new Error(t("Seleziona un utente"));
      await assignUser(surveyId, selectedUserId, selectedRole, fieldAuthorized);

      const member = members.find((m) => m.id === selectedUserId);
      const memberName = member ? [member.first_name, member.last_name].filter(Boolean).join(" ") || member.email : "utente";

      // La preferenza dell'assegnatario decide: `task_assigned_in_app`.
      // Riga assente = utente che non ha mai toccato le preferenze → default true.
      const { data: pref } = await supabase
        .from("user_notification_preferences")
        .select("task_assigned_in_app")
        .eq("user_id", selectedUserId)
        .maybeSingle();
      const vuoleNotifica = pref?.task_assigned_in_app ?? true;

      if (vuoleNotifica) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from("notifications").insert({
          user_id: selectedUserId,
          type: "generic",
          title: "Nuovo sopralluogo assegnato",
          body: `Sei stato assegnato come ${ROLE_LABEL[selectedRole].label} a un sopralluogo.`,
          action_url: selectedRole === "employee" || selectedRole === "subcontractor" ? `/campo/sopralluoghi/${surveyId}` : `/azienda/sopralluoghi/${surveyId}`,
          entity_type: "survey",
          entity_id: surveyId,
        });
      }

      return { memberName, notificato: vuoleNotifica };
    },
    onSuccess: ({ memberName, notificato }) => {
      toast.success(t("{nome} assegnato come {ruolo}", { nome: memberName, ruolo: t(ROLE_LABEL[selectedRole].label) }), {
        description: notificato ? undefined : t("Non è stata inviata la notifica: ha spento gli avvisi di assegnazione."),
      });
      setSelectedUserId("");
      setFieldAuthorized(false);
      qc.invalidateQueries({ queryKey: ["survey-assignees", surveyId] });
    },
    onError: (e) => toast.error(t("Assegnazione fallita"), { description: String(e) }),
  });

  const unassignMut = useMutation({
    mutationFn: (userId: string) => unassignUser(surveyId, userId),
    onSuccess: () => {
      toast.success(t("Assegnazione rimossa"));
      qc.invalidateQueries({ queryKey: ["survey-assignees", surveyId] });
    },
  });
  const authorizationMut = useMutation({
    mutationFn:async({userId,authorized}:{userId:string;authorized:boolean})=>{
      const {error}=await supabase.from("survey_assignees" as never).update({field_authorized:authorized} as never).eq("survey_id",surveyId).eq("user_id",userId).select("user_id").single();
      if(error) throw new Error(t("Autorizzazione non aggiornata. Riprova."));
    },
    onSuccess:()=>{void qc.invalidateQueries({queryKey:["survey-assignees",surveyId]});toast.success(t("Autorizzazione app operai aggiornata"));},
    onError:(e)=>toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-orange-600" />
            {t("Assegna sopralluogo")}
          </DialogTitle>
          <DialogDescription>
            {t("Assegna una persona. Per l’app operai serve anche l’autorizzazione esplicita qui sotto; assegnare non abilita automaticamente l’accesso.")}
          </DialogDescription>
        </DialogHeader>

        {assigneesError&&<p role="alert" className="text-sm text-red-700">{t("Assegnazioni non disponibili: non assegnare nuovamente la stessa persona. Riprova.")}</p>}
        {/* Lista assegnati */}
        {assignees.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">{t("Già assegnati ({n})", { n: assignees.length })}</p>
            <div className="space-y-1">
              {(assignees as Array<{ user_id: string; role: string;field_authorized:boolean }>).map((a) => {
                const m = members.find((mb) => mb.id === a.user_id);
                const cfg = ROLE_LABEL[a.role] ?? ROLE_LABEL.technician;
                return (
                  <div key={a.user_id} className="flex items-center gap-2 p-2 rounded-md border bg-muted/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {m ? [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email : a.user_id.slice(0, 8)}
                      </p>
                      <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                        {t(cfg.label)}
                      </Badge>
                      <label className="mt-2 flex items-center gap-2 text-xs"><Checkbox checked={a.field_authorized===true} disabled={authorizationMut.isPending} onCheckedChange={checked=>authorizationMut.mutate({userId:a.user_id,authorized:checked===true})}/>{t("Accesso autorizzato dall’app operai")}</label>
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
        <label className="flex min-h-12 items-start gap-3 rounded-xl border p-3 text-sm"><Checkbox checked={fieldAuthorized} onCheckedChange={checked=>setFieldAuthorized(checked===true)}/><span>{t("Autorizza questo sopralluogo nell’app operai")}<span className="mt-1 block text-xs text-muted-foreground">{t("Solo utenti dell’azienda con ruolo operaio/subappaltatore. Osservatore: sola lettura. Non abilita l’area amministrativa né la gestione dei preventivi.")}</span></span></label>
        <div className="space-y-3 pt-2 border-t">
          <p className="text-xs font-semibold text-muted-foreground">{t("Aggiungi nuovo")}</p>
          <div>
            <Label className="text-xs">{t("Utente")}</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger>
                <SelectValue placeholder={t("Scegli utente…")} />
              </SelectTrigger>
              <SelectContent>
                {gruppiTecnici(members.filter((m) => !assignedIds.has(m.id)), tecnici).map((g) => (
                  <SelectGroup key={g.gruppo}>
                    <SelectLabel>{ETICHETTA_GRUPPO[g.gruppo]}</SelectLabel>
                    {g.persone.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {[m.first_name, m.last_name].filter(Boolean).join(" ") || m.email}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">{t("Ruolo")}</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as typeof selectedRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{t(v.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("Chiudi")}</Button>
          <Button
            onClick={() => assignMut.mutate()}
            disabled={!selectedUserId || assignMut.isPending || assigneesError}
            className="gap-2 bg-orange-600 hover:bg-orange-700"
          >
            {assignMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {t("Assegna")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
