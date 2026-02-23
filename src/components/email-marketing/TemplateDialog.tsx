import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplateEditor } from "./TemplateEditor";
import { useAuth } from "@/contexts/AuthContext";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: any;
}

export function TemplateDialog({ open, onOpenChange, template }: TemplateDialogProps) {
  const { user, company } = useAuth();
  const qc = useQueryClient();
  const isEdit = !!template;

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [folder, setFolder] = useState("Home");

  useEffect(() => {
    if (open) {
      setName(template?.name || "");
      setSubject(template?.subject || "");
      setHtmlContent(template?.html_content || "");
      setFolder(template?.folder || "Home");
    }
  }, [open, template]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        subject,
        html_content: htmlContent,
        folder,
        type: "html" as const,
        company_id: company!.id,
        created_by: user!.id,
      };
      if (isEdit) {
        const { error } = await supabase.from("email_templates").update(payload).eq("id", template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("email_templates").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Template aggiornato" : "Template creato");
      qc.invalidateQueries({ queryKey: ["email-templates"] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Modifica template" : "Nuovo template"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Modifica il contenuto del template email" : "Crea un nuovo template email personalizzato"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Nome template</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. Welcome Email" />
            </div>
            <div>
              <Label>Cartella</Label>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Home" />
            </div>
          </div>
          <div>
            <Label>Oggetto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Oggetto dell'email" />
          </div>
          <div>
            <Label>Contenuto HTML</Label>
            <TemplateEditor value={htmlContent} onChange={setHtmlContent} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || mutation.isPending}>
            {mutation.isPending ? "Salvataggio..." : isEdit ? "Salva" : "Crea template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
