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
import { X, Send, CheckCircle2, Loader2, Star, Phone } from "lucide-react";
import { submitPublicLeadToCrm } from "@/lib/publicLeadSubmit";

// Helper exportato in coabitazione col componente: pattern intenzionale per
// trigger globale del modal via custom event. Il warning HMR di
// react-refresh è benigno in prod (no hot-reload critico per landing).
// eslint-disable-next-line react-refresh/only-export-components
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
  /** Qualificazione lead facoltativa: aiuta il commerciale a prioritizzare. */
  cantieri: string;
  privacy: boolean;
  marketing: boolean;
}

const INITIAL: FormState = {
  nome: "",
  email: "",
  telefono: "",
  azienda: "",
  cantieri: "",
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

  // Chiusura modale + reset stato form. Dichiarata PRIMA del useEffect ESC
  // così la dep `close` è risolvibile dal react-hooks/exhaustive-deps senza
  // doverlo escludere via comment. useCallback con deps vuote → stable ref.
  const close = useCallback(() => {
    setOpen(false);
    // Reset dopo animazione
    setTimeout(() => {
      setForm(INITIAL);
      setErrors({});
      setSubmitted(false);
    }, 250);
  }, []);

  // ESC per chiudere (richiede `close` stable già definito sopra)
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
  }, [open, close]);

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
    ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = ev.target;
    const checked = ev.target instanceof HTMLInputElement && ev.target.type === "checkbox"
      ? ev.target.checked
      : undefined;
    setForm((p) => ({ ...p, [name]: checked !== undefined ? checked : value }));
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
        // Qualificazione: arriva al commerciale come nota + tag filtrabile.
        messaggio: form.cantieri ? `Cantieri attivi: ${form.cantieri}` : null,
        tags: form.cantieri ? [`cantieri:${form.cantieri}`] : [],
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
            <p className="text-[#111111]/60 text-sm leading-relaxed mb-5">
              Ti contattiamo entro <strong>24 ore lavorative</strong> per attivarti la prova gratuita e fissare la demo di 30 minuti.
              Controlla anche la casella spam.
            </p>
            {/* Speed-to-lead: chi vuole fare subito non deve aspettare la
                nostra chiamata — gli diamo il canale immediato. */}
            <div className="mb-5 rounded-xl bg-[#F97415]/5 border border-[#F97415]/15 p-4">
              <p className="text-[#111111]/70 text-xs font-semibold mb-2.5">
                Vuoi fare prima? Parliamo subito:
              </p>
              <a
                href="tel:+390287198520"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-[#111111] text-white font-semibold text-sm hover:bg-[#F97415] transition-colors"
              >
                <Phone className="w-4 h-4" />
                Chiama ora: 02 87198520
              </a>
              <p className="text-[#111111]/40 text-[10px] mt-2">
                Lun–Ven 9:00–18:00 · rispondiamo in italiano
              </p>
            </div>
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
                Lascia i tuoi dati: ti attiviamo la prova gratuita con setup guidato incluso e demo sui numeri della tua impresa.
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

              {/* Qualificazione facoltativa: aumenta la personalizzazione
                  percepita e dà al commerciale la priorità del lead. */}
              <div>
                <select
                  name="cantieri"
                  value={form.cantieri}
                  onChange={handleChange}
                  className={`w-full px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97415]/30 focus:border-[#F97415] transition-all bg-white ${
                    form.cantieri ? "text-[#111111]" : "text-gray-400"
                  }`}
                >
                  <option value="">Quanti cantieri attivi avete? (facoltativo)</option>
                  <option value="1-3">1–3 cantieri</option>
                  <option value="4-10">4–10 cantieri</option>
                  <option value="10+">Più di 10 cantieri</option>
                </select>
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
                    <Link to="/privacy-policy/" target="_blank" rel="noopener" className="text-[#F97415] hover:text-[#C94F06] underline font-semibold">
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
                    Acconsento a ricevere comunicazioni commerciali e novità via email e telefono, anche tramite assistente automatico. <span className="opacity-60">Facoltativo.</span>
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

              {/* Social proof nel punto più fragile del funnel: il form */}
              <div className="flex items-center justify-center gap-1.5 pt-2">
                <span className="flex items-center gap-0.5">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} size={12} className="fill-amber-400 text-amber-400" />
                  ))}
                </span>
                <span className="text-[11px] font-semibold text-[#111111]/70">4.9/5</span>
                <span className="text-[11px] text-[#111111]/40">·</span>
                <span className="text-[11px] text-[#111111]/55">150+ imprese edili attive</span>
              </div>

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
