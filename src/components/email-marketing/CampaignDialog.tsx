import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: any;
}

export function CampaignDialog({ open, onOpenChange, campaign }: CampaignDialogProps) {
  const { user, company } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!campaign;

  const [name, setName] = useState(campaign?.name || "");
  const [subject, setSubject] = useState(campaign?.subject || "");
  const [type, setType] = useState(campaign?.type || "broadcast");
  const [templateId, setTemplateId] = useState(campaign?.template_id || "");
  const [abEnabled, setAbEnabled] = useState(campaign?.ab_test_enabled || false);
  const [abSubjectB, setAbSubjectB] = useState(campaign?.ab_subject_b || "");
  const [scheduledAt, setScheduledAt] = useState(campaign?.scheduled_at?.slice(0, 16) || "");

  const { data: templates = [] } = useQuery({
    queryKey: ["email-templates-select", company?.id],
    enabled: !!company?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from("email_templates").select("id, name").eq("company_id", company!.id);
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        subject,
        type,
        template_id: templateId || null,
        ab_test_enabled: abEnabled,
        ab_subject_b: abEnabled ? abSubjectB : null,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        status: scheduledAt ? "scheduled" : "draft",
        company_id: company!.id,
        created_by: user!.id,
      };
      if (isEdit) {
        const { error } = await supabase.from("email_campaigns").update(payload).eq("id", campaign.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_campaigns").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Campagna aggiornata" : "Campagna creata");
      qc.invalidateQueries({ queryKey: ["email-campaigns"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica campagna" : "Nuova campagna"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome campagna</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Newsletter Marzo" />
          </div>
          <div>
            <Label>Oggetto email</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oggetto dell'email" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="broadcast">Broadcast</SelectItem>
                  <SelectItem value="automation">Automazione</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Nessuno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessuno</SelectItem>
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Pianifica invio</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={abEnabled} onCheckedChange={setAbEnabled} />
            <Label>Test A/B sull'oggetto</Label>
          </div>
          {abEnabled && (
            <div>
              <Label>Oggetto variante B</Label>
              <Input value={abSubjectB} onChange={(e) => setAbSubjectB(e.target.value)} placeholder="Variante B" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || !subject || mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : isEdit ? "Salva" : "Crea campagna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
