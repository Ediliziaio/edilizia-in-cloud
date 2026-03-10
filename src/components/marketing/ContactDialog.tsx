import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagSelector } from "@/components/marketing/TagSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cleanPhone } from "@/lib/contactUtils";

export interface ContactFormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company_name: string;
  city: string;
  province: string;
  tags: string[];
  notes: string;
  source: string;
}

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: ContactFormData) => Promise<void>;
  initialData?: Partial<ContactFormData>;
  isEditing?: boolean;
  companyId?: string;
  editingContactId?: string;
}

interface FormErrors {
  phone?: string;
  email?: string;
  general?: string;
}

const emptyForm: ContactFormData = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  company_name: "",
  city: "",
  province: "",
  tags: [],
  notes: "",
  source: "manuale",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanPhone(phone: string): string {
  return phone.replace(/[\s\-\.]/g, "");
}

function isValidItalianPhone(phone: string): boolean {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return true; // empty is ok (handled by required check)
  return /^(\+39)?[03]\d{8,10}$/.test(cleaned);
}

export function ContactDialog({ open, onOpenChange, onSave, initialData, isEditing, companyId, editingContactId }: ContactDialogProps) {
  const [form, setForm] = useState<ContactFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, ...initialData });
      setErrors({});
    }
  }, [open, initialData]);

  const hasEmailOrPhone = form.email.trim() !== "" || form.phone.trim() !== "";

  const validate = (): FormErrors => {
    const errs: FormErrors = {};
    const email = form.email.trim();
    const phone = form.phone.trim();

    if (!email && !phone) {
      errs.general = "Inserisci almeno un'email o un telefono";
    }
    if (email && !EMAIL_REGEX.test(email)) {
      errs.email = "Formato email non valido";
    }
    if (phone && !isValidItalianPhone(phone)) {
      errs.phone = "Formato non valido. Es: +39 3xx xxxxxxx, 3xxxxxxxxx, 0x xxxxxxx";
    }
    return errs;
  };

  const checkDuplicates = async (): Promise<string | null> => {
    if (!companyId) return null;
    const excludeId = editingContactId || "00000000-0000-0000-0000-000000000000";
    const email = form.email.trim().toLowerCase();
    const phone = cleanPhone(form.phone);

    if (email) {
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("email", email)
        .neq("id", excludeId)
        .limit(1);
      if (data && data.length > 0) {
        const c = data[0];
        return `Email già presente per ${c.first_name || ""} ${c.last_name || ""}`.trim();
      }
    }
    if (phone) {
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .neq("id", excludeId)
        .limit(1);
      if (data && data.length > 0) {
        const c = data[0];
        return `Telefono già presente per ${c.first_name || ""} ${c.last_name || ""}`.trim();
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const duplicate = await checkDuplicates();
      if (duplicate) {
        toast.error(duplicate);
        return;
      }
      // Normalize phone before saving
      const normalizedForm = {
        ...form,
        phone: form.phone.trim() ? cleanPhone(form.phone) : "",
        email: form.email.trim().toLowerCase(),
      };
      await onSave(normalizedForm);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica Contatto" : "Nuovo Contatto"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cognome</Label>
              <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Telefono {!form.email.trim() ? "*" : ""}</Label>
              <Input
                value={form.phone}
                onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setErrors((prev) => ({ ...prev, phone: undefined, general: undefined })); }}
                placeholder="+39 3xx xxxxxxx"
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Email {!form.phone.trim() ? "*" : ""}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setErrors((prev) => ({ ...prev, email: undefined, general: undefined })); }}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
          </div>
          {errors.general && <p className="text-sm text-destructive">{errors.general}</p>}
          <div className="space-y-1.5">
            <Label>Azienda</Label>
            <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Città</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Provincia</Label>
              <Input value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} placeholder="Es: MI, RM, NA" maxLength={2} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Tag</Label>
            <TagSelector
              selectedTags={form.tags}
              onTagsChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Note</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.first_name.trim() || !hasEmailOrPhone}>
            {saving ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
