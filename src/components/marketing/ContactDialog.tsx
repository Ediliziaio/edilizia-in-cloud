import { useState, useEffect, useId, useRef } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComuneAutocomplete } from "@/components/shared/ComuneAutocomplete";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagSelector } from "@/components/marketing/TagSelector";
import { SedeSelect } from "@/components/sedi/SedeSelect";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cleanPhone } from "@/lib/contactUtils";
import { avvisiDatiFiscali } from "@/lib/preventivatore/datiFiscaliCliente";

export interface ContactFormData {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  company_name: string;
  /** Codice fiscale e partita IVA (30/10/2026): i preventivi li prendono dal contatto. */
  fiscal_code?: string;
  vat_number?: string;
  city: string;
  province: string;
  tags: string[];
  notes: string;
  source: string;
  // v8.6.42 — sede operativa di pertinenza (per analytics LeadPerSedeChart)
  sede_id?: string | null;
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
  fiscal_code: "",
  vat_number: "",
  city: "",
  province: "",
  tags: [],
  notes: "",
  source: "manuale",
  sede_id: null,
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// cleanPhone is now imported from @/lib/contactUtils

function isValidItalianPhone(phone: string): boolean {
  const cleaned = cleanPhone(phone);
  if (!cleaned) return true; // empty is ok (handled by required check)
  return /^(\+39)?[03]\d{8,10}$/.test(cleaned);
}

export function ContactDialog({ open, onOpenChange, onSave, initialData, isEditing, companyId, editingContactId }: ContactDialogProps) {
  const formId = useId();
  const savingRef = useRef(false);
  const [form, setForm] = useState<ContactFormData>(emptyForm);
  const avvisi = avvisiDatiFiscali({ tipo: "azienda", codiceFiscale: form.fiscal_code, partitaIva: form.vat_number });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Il genitore passa initialData come oggetto nuovo a ogni render: con la
  // dipendenza sull'oggetto qualsiasi aggiornamento della pagina mentre il
  // dialog è aperto (refetch, focus della finestra) cancellava quello che
  // l'utente stava scrivendo. Si resetta solo se cambia il CONTENUTO.
  const chiaveDati = JSON.stringify(initialData ?? null);
  useEffect(() => {
    if (open) {
      setForm({ ...emptyForm, ...initialData });
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, chiaveDati]);

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
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("email", email)
        .neq("id", excludeId)
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        const c = data[0];
        return `Email già presente per ${c.first_name || ""} ${c.last_name || ""}`.trim();
      }
    }
    if (phone) {
      const { data, error } = await supabase
        .from("marketing_contacts")
        .select("id, first_name, last_name")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .neq("id", excludeId)
        .limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        const c = data[0];
        return `Telefono già presente per ${c.first_name || ""} ${c.last_name || ""}`.trim();
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    if (savingRef.current) return;
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setErrors({});
    savingRef.current = true;
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
    } catch {
      setErrors({ general: "Impossibile salvare il contatto. Riprova." });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!savingRef.current) onOpenChange(next); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Modifica Contatto" : "Nuovo Contatto"}</DialogTitle>
        </DialogHeader>
        <fieldset disabled={saving} aria-busy={saving} className="space-y-4 max-sm:space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-first_name`}>Nome *</Label>
              <Input id={`${formId}-first_name`} value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-last_name`}>Cognome</Label>
              <Input id={`${formId}-last_name`} value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-phone`}>Telefono {!form.email.trim() ? "*" : ""}</Label>
              <Input
                id={`${formId}-phone`}
                aria-invalid={!!errors.phone}
                aria-describedby={errors.phone ? `${formId}-phone-error` : undefined}
                value={form.phone}
                onChange={(e) => { setForm((f) => ({ ...f, phone: e.target.value })); setErrors((prev) => ({ ...prev, phone: undefined, general: undefined })); }}
                placeholder="+39 3xx xxxxxxx"
              />
              {errors.phone && <p id={`${formId}-phone-error`} role="alert" className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-email`}>Email {!form.phone.trim() ? "*" : ""}</Label>
              <Input
                type="email"
                id={`${formId}-email`}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? `${formId}-email-error` : undefined}
                value={form.email}
                onChange={(e) => { setForm((f) => ({ ...f, email: e.target.value })); setErrors((prev) => ({ ...prev, email: undefined, general: undefined })); }}
              />
              {errors.email && <p id={`${formId}-email-error`} role="alert" className="text-xs text-destructive">{errors.email}</p>}
            </div>
          </div>
          {errors.general && <p role="alert" className="text-sm text-destructive">{errors.general}</p>}
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-company_name`}>Azienda</Label>
            <Input id={`${formId}-company_name`} value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contatto-cf">Codice fiscale</Label>
              <Input id="contatto-cf" className="font-mono [&:not(:placeholder-shown)]:uppercase" maxLength={20} placeholder="16 caratteri" value={form.fiscal_code ?? ""} onChange={(e) => setForm((f) => ({ ...f, fiscal_code: e.target.value }))} />
              {avvisi.codiceFiscale && <p role="status" className="text-xs text-amber-700">{avvisi.codiceFiscale}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contatto-piva">Partita IVA</Label>
              <Input id="contatto-piva" className="font-mono" inputMode="numeric" maxLength={20} placeholder="Se è un'azienda" value={form.vat_number ?? ""} onChange={(e) => setForm((f) => ({ ...f, vat_number: e.target.value }))} />
              {avvisi.partitaIva && <p role="status" className="text-xs text-amber-700">{avvisi.partitaIva}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-city`}>Città</Label>
              <ComuneAutocomplete
                id={`${formId}-city`}
                value={form.city}
                onValueChange={(v) => setForm((f) => ({ ...f, city: v }))}
                onSelect={(c) => setForm((f) => ({ ...f, city: c.comune, province: c.provinciaSigla }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-province`}>Provincia</Label>
              <Input id={`${formId}-province`} value={form.province} onChange={(e) => setForm((f) => ({ ...f, province: e.target.value }))} placeholder="Es: MI, RM, NA" maxLength={2} />
            </div>
          </div>
          {/* Mobile no: tag e sede si sistemano dalla scheda o dal computer. */}
          <div className="space-y-1.5 max-sm:hidden">
            <Label>Tag</Label>
            <TagSelector
              selectedTags={form.tags}
              onTagsChange={(tags) => setForm((f) => ({ ...f, tags }))}
            />
          </div>
          {/* v8.6.42 — Sede operativa di pertinenza (per LeadPerSedeChart) */}
          <SedeSelect
            id={`${formId}-sede`}
            label="Sede operativa"
            placeholder="Sede operativa (opzionale)"
            value={form.sede_id}
            onChange={(id) => setForm((f) => ({ ...f, sede_id: id }))}
            className="space-y-1.5 max-sm:hidden"
          />
          <div className="space-y-1.5">
            <Label htmlFor={`${formId}-notes`}>Note</Label>
            <Textarea id={`${formId}-notes`} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} className="max-sm:min-h-[60px]" />
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.first_name.trim() || !hasEmailOrPhone}>
            {saving ? "Salvataggio..." : isEditing ? "Salva" : "Aggiungi"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
