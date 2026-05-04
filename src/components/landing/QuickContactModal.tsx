/**
 * QuickContactModal — Modulo contatto rapido per la landing.
 * Si apre da qualsiasi CTA "Inizia Gratis / Richiedi Demo" tramite l'helper
 * openContactModal() (evento custom "open-contact-modal").
 *
 * Form essenziale (nome, email, telefono, azienda) + 2 consensi GDPR.
 * Persistenza: invia alla funzione pubblica che salva la richiesta e crea/aggiorna
 * il contatto nel CRM.
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { X, Send, CheckCircle2, Loader2 } from "lucide-react";
import { submitPublicLeadToCrm } from "@/lib/publicLeadSubmit";

export function openContactModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-contact-modal"));
  }
}

interface FormState {
  nome: string;
  email: string;
  telefono: string;
  azienda: string;
  privacy: boolean;
  marketing: boolean;
}

const INITIAL: FormState = {
  nome: "",
  email: "",
  telefono: "",
  azienda: "",
  privacy: false,
  marketing: false,
};

export default function QuickContactModal() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Listener per evento custom
  useEffect(() => {
    const handler = () => {
      setOpen(true);
      setSubmitted(false);
    };
    window.addEventListener("open-contact-modal", handler);
    return () => window.removeEventListener("open-contact-modal", handler);
  }, []);

  // ESC per chiudere
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    // Reset dopo animazione
    setTimeout(() => {
      setForm(INITIAL);
      setErrors({});
      setSubmitted(false);
    }, 250);
  }, []);

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nome.trim()) e.nome = "Inserisci il tuo nome";
    if (!form.email.trim()) e.email = "Inserisci l'email";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Email non valida";
    if (!form.telefono.trim()) e.telefono = "Inserisci il telefono";
    if (!form.azienda.trim()) e.azienda = "Inserisci il nome azienda";
    if (!form.privacy) e.privacy = "Devi accettare la Privacy Policy";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleChange = (
    ev: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, type, value, checked } = ev.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    if (errors[name as keyof FormState]) {
      setErrors((p) => ({ ...p, [name]: undefined }));
    }
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await submitPublicLeadToCrm({
        nome: form.nome,
        email: form.email,
        telefono: form.telefono,
        azienda: form.azienda,
        source: "home_quick_modal",
        marketing_consent: form.marketing,
      });
      setSubmitted(true);
    } catch {
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qcm-title"
    >
      {/* Backdrop */}
      <button
        aria-label="Chiudi"
        onClick={close}
        className="absolute inset-0 bg-[#111111]/70 backdrop-blur-sm"
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-100 max-h-[92vh] overflow-y-auto">
        <button
          onClick={close}
          aria-label="Chiudi modulo"
          className="absolute top-3 right-3 p-2 rounded-full text-[#111111]/40 hover:text-[#111111] hover:bg-gray-100 transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          /* SUCCESS STATE */
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[#F97415]/10 flex items-center justify-center">
              <CheckCircle2 className="w-9 h-9 text-[#F97415]" />
            </div>
            <h3 className="text-xl font-bold text-[#111111] mb-2">
              Richiesta ricevuta!
            </h3>
            <p className="text-[#111111]/60 text-sm leading-relaxed mb-6">
              Ti contattiamo entro <strong>24 ore lavorative</strong> per fissare la demo gratuita di 30 minuti.
              Controlla anche la casella spam.
            </p>
            <button
              onClick={close}
              className="px-6 py-2.5 rounded-full bg-[#F97415] text-white font-semibold text-sm hover:bg-[#C94F06] transition-colors"
            >
              Chiudi
            </button>
          </div>
        ) : (
          /* FORM */
          <div className="p-6 md:p-7">
            <div className="mb-5">
              <p className="text-[10px] font-bold tracking-widest uppercase text-[#F97415] mb-1.5">
                Demo Gratuita · 31 giorni di prova
              </p>
              <h3 id="qcm-title" className="text-xl font-extrabold text-[#111111] leading-tight">
                Inizia Gratis Adesso
              </h3>
              <p className="text-[#111111]/55 text-sm mt-1.5">
                Lascia i tuoi dati: ti contattiamo entro 24h per la demo personalizzata.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3" noValidate>
              <div>
                <input
                  type="text"
                  name="nome"
                  value={form.nome}
                  onChange={handleChange}
                  placeholder="Nome e cognome *"
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.nome ? "border-red-400 focus:ring-red-200" : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
                  }`}
                />
                {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome}</p>}
              </div>

              <div>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="Email *"
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.email ? "border-red-400 focus:ring-red-200" : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
                  }`}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>

              <div>
                <input
                  type="tel"
                  name="telefono"
                  value={form.telefono}
                  onChange={handleChange}
                  placeholder="Telefono *"
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.telefono ? "border-red-400 focus:ring-red-200" : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
                  }`}
                />
                {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono}</p>}
              </div>

              <div>
                <input
                  type="text"
                  name="azienda"
                  value={form.azienda}
                  onChange={handleChange}
                  placeholder="Nome azienda *"
                  className={`w-full px-3.5 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-all ${
                    errors.azienda ? "border-red-400 focus:ring-red-200" : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
                  }`}
                />
                {errors.azienda && <p className="text-red-500 text-xs mt-1">{errors.azienda}</p>}
              </div>

              {/* Consensi GDPR */}
              <div className="pt-2 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="privacy"
                    checked={form.privacy}
                    onChange={handleChange}
                    className={`mt-0.5 w-4 h-4 rounded border-2 cursor-pointer accent-[#F97415] flex-shrink-0 ${
                      errors.privacy ? "border-red-400" : "border-gray-300"
                    }`}
                  />
                  <span className="text-[11px] text-[#111111]/70 leading-relaxed">
                    <strong className="text-[#F97415]">*</strong> Accetto la{" "}
                    <Link to="/privacy-policy" target="_blank" rel="noopener" className="text-[#F97415] hover:text-[#C94F06] underline font-semibold">
                      Privacy Policy
                    </Link>{" "}
                    (art. 6.1.b GDPR — gestione richiesta demo).
                  </span>
                </label>
                {errors.privacy && <p className="text-red-500 text-xs ml-6">{errors.privacy}</p>}

                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    name="marketing"
                    checked={form.marketing}
                    onChange={handleChange}
                    className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 cursor-pointer accent-[#F97415] flex-shrink-0"
                  />
                  <span className="text-[11px] text-[#111111]/70 leading-relaxed">
                    Acconsento a ricevere comunicazioni commerciali e novità via email/telefono. <span className="opacity-60">Facoltativo.</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full mt-3 py-3 rounded-xl bg-[#F97415] hover:bg-[#C94F06] text-white font-bold text-sm tracking-wide transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shadow-lg shadow-[#F97415]/25"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Invio in corso...
                  </>
                ) : (
                  <>
                    Richiedi Demo Gratuita <Send className="w-4 h-4" />
                  </>
                )}
              </button>

              <p className="text-center text-[10px] text-[#111111]/40 leading-relaxed pt-1">
                Titolare: Domus Group S.r.l. — Risposta entro 24h lavorative.
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
