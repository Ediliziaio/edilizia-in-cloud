import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitPublicLeadToCrm } from "@/lib/publicLeadSubmit";
import { getRenderLeadContext } from "@/lib/renderLeadContext";

type RenderLeadModalProps = {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type RenderLeadForm = {
  nome: string;
  azienda: string;
  telefono: string;
  email: string;
  progetto: string;
  privacyConsent: boolean;
  marketingConsent: boolean;
};

const INITIAL_FORM: RenderLeadForm = {
  nome: "",
  azienda: "",
  telefono: "",
  email: "",
  progetto: "",
  privacyConsent: false,
  marketingConsent: false,
};

export function RenderLeadModal({ slug, open, onOpenChange }: RenderLeadModalProps) {
  const context = useMemo(() => getRenderLeadContext(slug), [slug]);
  const [form, setForm] = useState<RenderLeadForm>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof RenderLeadForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const label = context?.label ?? "Render AI";
  const pagePath = context?.pagePath ?? `/funzionalita/${slug}`;

  const reset = () => {
    setForm(INITIAL_FORM);
    setErrors({});
    setSubmitted(false);
    setSubmitError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      window.setTimeout(reset, 180);
    }
  };

  const validate = () => {
    const nextErrors: Partial<Record<keyof RenderLeadForm, string>> = {};
    if (!form.nome.trim()) nextErrors.nome = "Inserisci nome e cognome";
    if (!form.azienda.trim()) nextErrors.azienda = "Inserisci il nome azienda";
    if (!form.telefono.trim()) {
      nextErrors.telefono = "Inserisci il telefono";
    } else if (!/^[+0-9\s()-]{8,}$/.test(form.telefono.trim())) {
      nextErrors.telefono = "Numero non valido";
    }
    if (!form.email.trim()) {
      nextErrors.email = "Inserisci l'email";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      nextErrors.email = "Email non valida";
    }
    if (!form.privacyConsent) nextErrors.privacyConsent = "Devi accettare la Privacy Policy";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const target = event.target as HTMLInputElement;
    const value = target.type === "checkbox" ? target.checked : target.value;
    const name = target.name as keyof RenderLeadForm;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const projectNote = form.progetto.trim();
      await submitPublicLeadToCrm({
        nome: form.nome,
        email: form.email,
        telefono: form.telefono,
        azienda: form.azienda,
        messaggio: `[RICHIESTA RENDER] Modulo: ${label}${projectNote ? ` | Progetto: ${projectNote}` : ""}`,
        source: "render_landing_inline_form",
        marketing_consent: form.marketingConsent,
        render_slug: slug,
        page_path: pagePath,
        context_label: label,
        tags: ["richiesta-render", `richiesta-${slug}`, "modulo-render-in-page"],
      });
      setSubmitted(true);
    } catch (error) {
      console.error("[render-lead-modal] submit error", error);
      setSubmitError("Non siamo riusciti a inviare la richiesta. Riprova tra qualche istante.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = (field: keyof RenderLeadForm) =>
    `w-full rounded-xl border px-4 py-3 text-sm text-slate-950 outline-none transition focus:ring-2 ${
      errors[field]
        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
        : "border-slate-200 focus:border-[#F97415] focus:ring-orange-100"
    }`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl border-slate-200 p-0 sm:max-w-xl">
        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-950 to-slate-800 px-6 py-6 text-white">
          <DialogHeader>
            <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-orange-300/25 bg-orange-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-100">
              <Sparkles className="h-3.5 w-3.5" />
              Modulo dedicato
            </div>
            <DialogTitle className="text-2xl font-black tracking-tight text-white">
              Richiedi informazioni su {label}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-slate-300">
              Resti su questa pagina: la richiesta entra nel CRM superadmin con i tag del render corretto.
            </DialogDescription>
          </DialogHeader>
        </div>

        {submitted ? (
          <div className="px-6 py-9 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-9 w-9 text-emerald-600" />
            </div>
            <h3 className="mt-5 text-xl font-black text-slate-950">Richiesta ricevuta</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-600">
              Ti ricontattiamo con una demo mirata su {label}. Il lead e' gia stato salvato nel CRM.
            </p>
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              className="mt-6 rounded-xl bg-[#F97415] px-6 py-3 text-sm font-extrabold text-white transition hover:bg-[#D95E0B]"
            >
              Chiudi
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-6" noValidate>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <input
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  placeholder="Nome e cognome *"
                  className={inputClass("nome")}
                />
                {errors.nome && <p className="mt-1 text-xs text-red-500">{errors.nome}</p>}
              </div>
              <div>
                <input
                  name="azienda"
                  value={form.azienda}
                  onChange={handleChange}
                  placeholder="Azienda *"
                  className={inputClass("azienda")}
                />
                {errors.azienda && <p className="mt-1 text-xs text-red-500">{errors.azienda}</p>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <input
                  name="telefono"
                  type="tel"
                  value={form.telefono}
                  onChange={handleChange}
                  placeholder="Telefono *"
                  className={inputClass("telefono")}
                />
                {errors.telefono && <p className="mt-1 text-xs text-red-500">{errors.telefono}</p>}
              </div>
              <div>
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Email *"
                  className={inputClass("email")}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
              </div>
            </div>

            <div>
              <textarea
                name="progetto"
                value={form.progetto}
                onChange={handleChange}
                rows={3}
                placeholder={context?.messagePlaceholder || "Che render vuoi vedere nella demo?"}
                className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-[#F97415] focus:ring-2 focus:ring-orange-100"
              />
            </div>

            <div className="space-y-3 rounded-2xl bg-slate-50 p-4">
              <label className="flex items-start gap-3 text-xs leading-5 text-slate-600">
                <input
                  name="privacyConsent"
                  type="checkbox"
                  checked={form.privacyConsent}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#F97415]"
                />
                <span>
                  Accetto la Privacy Policy e autorizzo il contatto per questa richiesta.
                </span>
              </label>
              {errors.privacyConsent && (
                <p className="pl-7 text-xs text-red-500">{errors.privacyConsent}</p>
              )}
              <label className="flex items-start gap-3 text-xs leading-5 text-slate-600">
                <input
                  name="marketingConsent"
                  type="checkbox"
                  checked={form.marketingConsent}
                  onChange={handleChange}
                  className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#F97415]"
                />
                <span>Voglio ricevere aggiornamenti su render AI, cantieri e funzionalita.</span>
              </label>
            </div>

            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#F97415] px-5 py-4 text-sm font-extrabold text-white shadow-lg shadow-orange-200 transition hover:bg-[#D95E0B] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? "Invio in corso..." : `Invia richiesta ${label}`}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
