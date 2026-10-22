import MarketingVisual from "@/components/marketing/MarketingVisual";
import { useState } from "react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { submitPublicLeadToCrm, attachReferralToLead } from "@/lib/publicLeadSubmit";
import { getRenderLeadContext } from "@/lib/renderLeadContext";

import { demoFaqs as DEMO_FAQS, demoSteps, demoAgenda } from "@/lib/marketing/demoContent";
import { marketingMessages } from "@/lib/marketing/messages";

interface FormData {
  nome: string;
  cognome: string;
  azienda: string;
  telefono: string;
  email: string;
  fatturato: string;
  messaggio: string;
  privacyConsent: boolean;
  marketingConsent: boolean;
}

interface FormErrors {
  nome?: string;
  cognome?: string;
  azienda?: string;
  telefono?: string;
  email?: string;
  fatturato?: string;
  privacyConsent?: string;
}

export default function Demo() {
  const [searchParams] = useSearchParams();
  const renderContext = getRenderLeadContext(searchParams.get("render"));
  const [formData, setFormData] = useState<FormData>({
    nome: "",
    cognome: "",
    azienda: "",
    telefono: "",
    email: "",
    fatturato: "",
    messaggio: "",
    privacyConsent: false,
    marketingConsent: false,
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useSEO({
    title: "Demo Gratuita Gestionale Edilizia",
    description: "Scopri come collegare preventivi, fasi, squadre e costi in una demo personalizzata di circa 30 minuti. Senza impegno, con avvio assistito.",
    canonical: "/demo",
    keywords: "demo gestionale edilizia, prova gratuita software edilizia, demo edilizia in cloud, software gestionale edilizia gratis, trial gestionale cantieri, richiedi demo software impresa edile",
  });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.nome.trim()) newErrors.nome = "Campo obbligatorio";
    if (!formData.cognome.trim()) newErrors.cognome = "Campo obbligatorio";
    if (!formData.azienda.trim()) newErrors.azienda = "Campo obbligatorio";
    if (!formData.telefono.trim()) {
      newErrors.telefono = "Campo obbligatorio";
    } else if (!/^[+0-9\s()-]+$/.test(formData.telefono.trim()) || formData.telefono.replace(/\D/g, "").length < 8) {
      newErrors.telefono = "Numero non valido (min 8 cifre)";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Campo obbligatorio";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Email non valida";
    }
    if (!formData.fatturato) newErrors.fatturato = "Campo obbligatorio";
    if (!formData.privacyConsent) newErrors.privacyConsent = "Devi accettare la Privacy Policy per inviare la richiesta";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const target = e.target as HTMLInputElement;
    const { name, type } = target;
    const value = type === "checkbox" ? target.checked : target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    if (!validate()) {
      // UX: porta il focus al primo campo con errore così l'utente vede subito
      // cosa correggere invece di dover scrollare manualmente. requestAnimationFrame
      // garantisce che il DOM abbia già renderizzato lo stato errors aggiornato.
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector<HTMLElement>('form [aria-invalid="true"]');
        if (firstInvalid) {
          firstInvalid.scrollIntoView({ behavior: "instant", block: "center" });
          (firstInvalid as HTMLInputElement).focus?.({ preventScroll: true });
        }
      });
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fatturatoLabel =
        {
          "fino-300k": "Fino a 300K",
          "300k-1m": "300K – 1M",
          "1m-3m": "1M – 3M",
          "oltre-3m": "Oltre 3M",
          "non-indicato": "Preferisco parlarne durante la demo",
        }[formData.fatturato] ?? formData.fatturato;
      const noteUtente = formData.messaggio.trim();
      const messaggio = `[DEMO] Fatturato annuo: ${fatturatoLabel}${renderContext ? ` | Modulo: ${renderContext.label}` : ""}${noteUtente ? ` | Note: ${noteUtente}` : ""}`;
      // ATTRIBUZIONE REFERRAL: ReferralLanding salva il codice partner in
      // localStorage['ref_code'] quando l'utente arriva da un link referral.
      // Lo recuperiamo qui e lo agganciamo al lead così l'admin può attribuire
      // la conversione al partner giusto (prima questo valore veniva scritto ma
      // mai letto → ogni referral self-serve era perso).
      // Rispettiamo la finestra di attribuzione di 90 giorni: un click più
      // vecchio non deve attribuire una conversione organica al partner.
      let referralCode: string | null = null;
      try {
        const storedCode = localStorage.getItem("ref_code");
        if (storedCode) {
          const storedTs = localStorage.getItem("ref_code_ts");
          const ageDays = storedTs
            ? (Date.now() - new Date(storedTs).getTime()) / 86_400_000
            : 0;
          if (!storedTs || (Number.isFinite(ageDays) && ageDays <= 90)) {
            referralCode = storedCode;
          } else {
            // Scaduto: pulisci così non resta a sporcare i lead futuri.
            localStorage.removeItem("ref_code");
            localStorage.removeItem("ref_code_ts");
          }
        }
      } catch {
        referralCode = null;
      }
      await submitPublicLeadToCrm({
        nome: `${formData.nome.trim()} ${formData.cognome.trim()}`.trim(),
        email: formData.email,
        telefono: formData.telefono,
        azienda: formData.azienda,
        messaggio,
        source: renderContext ? "render_landing" : "demo",
        marketing_consent: formData.marketingConsent,
        render_slug: renderContext?.slug ?? null,
        page_path: renderContext?.pagePath ?? null,
        context_label: renderContext?.label ?? null,
        referral_code: referralCode,
        // Solo tag tipologici stabili. Slug specifico già in metadata (render_slug).
        tags: renderContext ? ["richiesta-render"] : [],
      });
      // La conferma vive su /demo/grazie: una pagina con un indirizzo suo, che
      // si misura come conversione e dove si sceglie subito la data.
      setSubmitted(true);
      navigate("/demo/grazie", { replace: true });
      // Aggancio referral (best-effort, non blocca la UX): l'edge function
      // referral-attach-lead annota il contatto-lead appena creato col partner.
      if (referralCode) {
        void attachReferralToLead(formData.email, referralCode);
      }
    } catch (err) {
      console.error("[demo] submit error", err);
      setSubmitError(
        "Si è verificato un errore nell'invio. Riprova fra qualche istante o scrivici a info@ediliziaincloud.com."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      nome: "",
      cognome: "",
      azienda: "",
      telefono: "",
      email: "",
      fatturato: "",
      messaggio: "",
      privacyConsent: false,
      marketingConsent: false,
    });
    setErrors({});
    setSubmitError(null);
    setSubmitted(false);
  };

  const inputClass = (field: keyof FormErrors) =>
    `w-full px-4 py-3 rounded-lg border text-[#111111] text-base sm:text-sm focus:outline-none focus:ring-2 transition-colors ${
      errors[field]
        ? "border-red-400 focus:ring-red-200"
        : "border-gray-200 focus:ring-eic-orange/30 focus:border-eic-orange"
    }`;

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <HubSeoSchema
        pageName="Demo Gratuita"
        pagePath="/demo"
        pageDescription="Richiedi una demo gratuita di circa 30 minuti: preventivi, fasi, squadre e costi di commessa. Avvio assistito."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Demo Gratuita", url: "/demo" },
        ]}
      />
      <JsonLd
        id="jsonld-contactpage-demo"
        data={{
          "@context": "https://schema.org",
          "@type": "ContactPage",
          "@id": `${SITE_URL}/demo#contactpage`,
          url: `${SITE_URL}/demo`,
          name: "Richiedi una Demo Gratuita — Edilizia in Cloud",
          description:
            "Modulo di contatto per richiedere una demo personalizzata di 30 minuti del gestionale edilizia con AI. Risposta entro 24 ore lavorative.",
          inLanguage: "it-IT",
          isPartOf: { "@id": `${SITE_URL}/#website` },
          about: { "@id": `${SITE_URL}/#organization` },
          mainEntity: { "@id": `${SITE_URL}/#organization` },
        }}
      />
      <JsonLd
        id="jsonld-service-demo"
        data={{
          "@context": "https://schema.org",
          "@type": "Service",
          "@id": `${SITE_URL}/demo#service`,
          name: "Demo personalizzata gestionale edilizia",
          provider: { "@id": `${SITE_URL}/#organization` },
          areaServed: { "@type": "Country", name: "Italia" },
          serviceType: "Consulenza pre-vendita software",
          description:
            "Demo online di circa 30 minuti: preventivi, lavorazioni, fasi, squadre, ore e controllo dei costi della commessa.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "EUR",
            availability: "https://schema.org/InStock",
            url: `${SITE_URL}/demo`,
          },
        }}
      />
      <JsonLd
        id="jsonld-faq-demo"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "@id": `${SITE_URL}/demo#faq`,
          mainEntity: DEMO_FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />
      <LandingNavbar />

      {/* Hero */}
      <section
        style={{ background: "linear-gradient(135deg, #111111 0%, #111111 100%)" }}
        className="pt-28 sm:pt-36 pb-14 sm:pb-20 px-5 sm:px-6 text-center"
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="inline-block px-4 py-1.5 rounded-full text-[10px] sm:text-xs font-bold tracking-widest uppercase mb-5 sm:mb-6"
            style={{ background: "rgba(249,116,21,0.18)", color: "#F97415" }}
          >
            Demo Gratuita — Senza Impegno
          </div>
          <h1 className="text-[28px] leading-[1.15] sm:text-4xl md:text-5xl font-extrabold text-white sm:leading-tight mb-4 sm:mb-5 px-1">
            Dal preventivo al cantiere.
            Guarda come funziona.
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-white/70 leading-relaxed">
            Una demo di circa 30 minuti per seguire lavori, persone e costi nella stessa piattaforma. Partiamo dalle esigenze della tua impresa.
          </p>

          <a href="#richiesta-demo" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-full bg-white px-6 py-3 font-semibold text-[#111111] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-400 active:scale-[0.98]">Richiedi la demo</a>
          {/* Benefit bar */}
          <div className="mt-8 sm:mt-10 flex flex-col md:flex-row items-start sm:items-center md:items-center justify-center gap-4 sm:gap-6 md:gap-10 max-w-md sm:max-w-none mx-auto text-left">
            {[
              { icon: "M", text: "Demo personalizzata sulla tua impresa" },
              { icon: "S", text: marketingMessages.activation },
              { icon: "R", text: "Risposta entro 24 ore lavorative" },
            ].map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ background: "#F97415" }}
                >
                  {i === 0 ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  ) : i === 1 ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  )}
                </div>
                <span className="text-white/85 text-sm font-medium">{b.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form Section */}
      <section id="richiesta-demo" className="scroll-mt-24 py-12 sm:py-16 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div className="max-w-6xl mx-auto grid lg:grid-cols-[0.8fr_1.2fr] items-start gap-8 lg:gap-12">
          <aside className="lg:sticky lg:top-24">
            <p className="text-sm font-semibold text-orange-700">La demo, passo dopo passo</p>
            <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight">Un incontro sul lavoro della tua impresa.</h2>
            <ol className="mt-7 space-y-6">{demoSteps.map(step => <li key={step.step} className="flex gap-4"><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white border border-orange-100 text-sm font-bold text-orange-700">{step.step}</span><div><h3 className="font-semibold">{step.title}</h3><p className="mt-1 text-sm leading-relaxed text-gray-600">{step.desc}</p></div></li>)}</ol>
            <p className="mt-8 text-sm text-gray-600">{marketingMessages.companies} · {marketingMessages.activation}</p>
            <Link to="/funzionalita/gestione-commesse/" className="mt-4 inline-block font-semibold text-orange-700 underline underline-offset-4">Prima vuoi esplorare le commesse?</Link>
            <MarketingVisual theme="operations" className="mt-7 max-w-sm" />
          </aside>
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 sm:p-8 md:p-10">
            {submitted ? (
              <div className="text-center py-10">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                  style={{ background: "rgba(249,116,21,0.12)" }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="#F97415" strokeWidth="2.5" className="w-8 h-8">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-[#111111] mb-3">
                  Richiesta ricevuta.
                </h2>
                <p className="text-[#111111]/60 text-sm leading-relaxed mb-8">
                  Ti portiamo alla pagina dove scegli giorno e ora della demo.
                  Se non succede, <Link to="/demo/grazie" className="underline">aprila da qui</Link>.
                </p>

                <div className="flex flex-col sm:flex-row gap-3 justify-center items-stretch sm:items-center">
                  <Link
                    to="/"
                    className="inline-flex items-center justify-center px-6 py-3 rounded-full text-white text-sm font-bold transition-all hover:opacity-90"
                    style={{ background: "#F97415" }}
                  >
                    Torna alla Home
                  </Link>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="inline-flex items-center justify-center px-6 py-3 rounded-full text-eic-orange text-sm font-bold border-2 border-eic-orange/30 hover:bg-eic-orange/5 transition-all"
                  >
                    Invia un'altra richiesta
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-[#111111] mb-1">
                  {renderContext ? `Compila il modulo per ${renderContext.label}` : "Richiedi la tua demo"}
                </h2>
                <p className="text-[#111111]/50 text-sm mb-7">
                  {renderContext ? renderContext.formIntro : "I campi con * sono obbligatori. Dopo l’invio puoi scegliere giorno e ora."}
                </p>

                {renderContext && (
                  <div className="mb-7 rounded-2xl border border-eic-orange/20 bg-eic-orange/5 px-4 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-eic-orange">
                      Richiesta contestualizzata
                    </p>
                    <p className="mt-1 text-base font-bold text-[#111111]">{renderContext.label}</p>
                    <p className="mt-1 text-sm text-[#111111]/60">
                      Dedicheremo la presentazione a questo strumento e al modo in cui vuoi utilizzarlo.
                    </p>
                  </div>
                )}

                <form aria-busy={submitting} onSubmit={handleSubmit} noValidate className="space-y-5">
                  {/* Nome + Cognome */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="demo-nome" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Nome <span className="text-eic-orange">*</span>
                      </label>
                      <input
                        type="text"
                        id="demo-nome"
                        name="nome" required
                        value={formData.nome}
                        onChange={handleChange}
                        className={inputClass("nome")}
                        placeholder="Mario"
                        autoComplete="given-name"
                        aria-invalid={!!errors.nome}
                        aria-describedby={errors.nome ? "demo-nome-error" : undefined}
                      />
                      {errors.nome && <p id="demo-nome-error" className="text-red-500 text-xs mt-1">{errors.nome}</p>}
                    </div>
                    <div>
                      <label htmlFor="demo-cognome" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Cognome <span className="text-eic-orange">*</span>
                      </label>
                      <input
                        type="text"
                        id="demo-cognome"
                        name="cognome" required
                        value={formData.cognome}
                        onChange={handleChange}
                        className={inputClass("cognome")}
                        placeholder="Rossi"
                        autoComplete="family-name"
                        aria-invalid={!!errors.cognome}
                        aria-describedby={errors.cognome ? "demo-cognome-error" : undefined}
                      />
                      {errors.cognome && <p id="demo-cognome-error" className="text-red-500 text-xs mt-1">{errors.cognome}</p>}
                    </div>
                  </div>

                  {/* Azienda */}
                  <div>
                    <label htmlFor="demo-azienda" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                      Nome Azienda <span className="text-eic-orange">*</span>
                    </label>
                    <input
                      type="text"
                      id="demo-azienda"
                        name="azienda" required
                      value={formData.azienda}
                      onChange={handleChange}
                      className={inputClass("azienda")}
                      placeholder="Rossi Costruzioni S.r.l."
                      autoComplete="organization"
                      aria-invalid={!!errors.azienda}
                        aria-describedby={errors.azienda ? "demo-azienda-error" : undefined}
                    />
                    {errors.azienda && <p id="demo-azienda-error" className="text-red-500 text-xs mt-1">{errors.azienda}</p>}
                  </div>

                  {/* Telefono + Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="demo-telefono" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Telefono <span className="text-eic-orange">*</span>
                      </label>
                      <input
                        type="tel"
                        id="demo-telefono"
                        name="telefono" required
                        value={formData.telefono}
                        onChange={handleChange}
                        className={inputClass("telefono")}
                        placeholder="+39 333 000 0000"
                        autoComplete="tel"
                        inputMode="tel"
                        aria-invalid={!!errors.telefono}
                        aria-describedby={errors.telefono ? "demo-telefono-error" : undefined}
                      />
                      {errors.telefono && <p id="demo-telefono-error" className="text-red-500 text-xs mt-1">{errors.telefono}</p>}
                    </div>
                    <div>
                      <label htmlFor="demo-email" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Email <span className="text-eic-orange">*</span>
                      </label>
                      <input
                        type="email"
                        id="demo-email"
                        name="email" required
                        value={formData.email}
                        onChange={handleChange}
                        className={inputClass("email")}
                        placeholder="mario@rossicostruzioni.it"
                        autoComplete="email"
                        inputMode="email"
                        aria-invalid={!!errors.email}
                        aria-describedby={errors.email ? "demo-email-error" : undefined}
                      />
                      {errors.email && <p id="demo-email-error" className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  {/* Fatturato */}
                  <div>
                    <label htmlFor="demo-fatturato" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                      Fatturato Annuo <span className="text-eic-orange">*</span>
                    </label>
                    <select
                      id="demo-fatturato"
                        name="fatturato" required
                      value={formData.fatturato}
                      onChange={handleChange}
                      className={`${inputClass("fatturato")} bg-white`}
                      aria-invalid={!!errors.fatturato}
                        aria-describedby={errors.fatturato ? "demo-fatturato-error" : undefined}
                    >
                      <option value="">Seleziona una fascia...</option>
                      <option value="non-indicato">Preferisco parlarne durante la demo</option>
                      <option value="fino-300k">Fino a 300K</option>
                      <option value="300k-1m">300K – 1M</option>
                      <option value="1m-3m">1M – 3M</option>
                      <option value="oltre-3m">Oltre 3M</option>
                    </select>
                    {errors.fatturato && <p id="demo-fatturato-error" className="text-red-500 text-xs mt-1">{errors.fatturato}</p>}
                  </div>

                  {/* Messaggio */}
                  <div>
                    <label htmlFor="demo-messaggio" className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                      Messaggio <span className="text-[#111111]/30 font-normal">(opzionale)</span>
                    </label>
                    <textarea
                      id="demo-messaggio"
                        name="messaggio"
                      value={formData.messaggio}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-[#111111] text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-eic-orange/30 focus:border-eic-orange transition-all resize-none"
                      placeholder={renderContext?.messagePlaceholder || "Cosa vorresti vedere nella demo?"}
                    />
                  </div>

                  {/* Consensi GDPR */}
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-[#111111]/40">
                      Consensi privacy <span className="text-eic-orange">(art. 13 GDPR)</span>
                    </p>

                    {/* Privacy obbligatorio */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="privacyConsent" required
                        checked={formData.privacyConsent}
                        onChange={handleChange}
                        aria-invalid={!!errors.privacyConsent}
                        aria-describedby={errors.privacyConsent ? "demo-privacy-error" : undefined}
                        className={`mt-0.5 w-4 h-4 rounded border-2 cursor-pointer accent-eic-orange flex-shrink-0 ${
                          errors.privacyConsent ? "border-red-400" : "border-gray-300"
                        }`}
                      />
                      <span className="text-xs text-[#111111]/75 leading-relaxed">
                        <strong className="text-eic-orange">*</strong> Ho letto e accetto la{" "}
                        <Link to="/privacy-policy/" target="_blank" rel="noopener" className="text-eic-orange hover:text-eic-orange-deep underline font-semibold">
                          Privacy Policy
                        </Link>{" "}
                        e acconsento al trattamento dei miei dati personali per finalità connesse alla gestione della richiesta di demo (art. 6.1.b GDPR — misura precontrattuale).{" "}
                        <span className="text-red-500 font-semibold">Obbligatorio</span>
                      </span>
                    </label>
                    {errors.privacyConsent && (
                      <p id="demo-privacy-error" className="text-red-500 text-xs ml-7 -mt-1">{errors.privacyConsent}</p>
                    )}

                    {/* Marketing opzionale */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="marketingConsent"
                        checked={formData.marketingConsent}
                        onChange={handleChange}
                        className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 cursor-pointer accent-eic-orange flex-shrink-0"
                      />
                      <span className="text-xs text-[#111111]/75 leading-relaxed">
                        Acconsento a ricevere comunicazioni commerciali e promozionali via email e telefono, anche tramite assistente automatico, su prodotti, novità ed eventi di Edilizia in Cloud (art. 6.1.a GDPR).{" "}
                        <span className="text-[#111111]/50">Facoltativo — revocabile in qualsiasi momento.</span>
                      </span>
                    </label>

                  </div>

                  {/* Errore submit */}
                  {submitError && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                    >
                      {submitError}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={submitting}
                    aria-busy={submitting}
                    className="w-full py-4 rounded-xl text-white font-bold text-base tracking-wide transition-all hover:opacity-90 hover:scale-[1.01] shadow-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                    style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.3)" }}
                  >
                    {submitting ? "Invio in corso..." : (renderContext?.submitLabel || "Richiedi la Demo Gratuita →")}
                  </button>

                  <p className="text-center text-sm text-[#111111]/60 pt-1">
                    Preferisci parlare subito con una persona?{" "}
                    <a
                      href="tel:+393501780908"
                      className="font-bold text-eic-orange hover:text-eic-orange-deep whitespace-nowrap"
                    >
                      Chiama 350 178 0908
                    </a>
                  </p>

                  <p className="text-center text-[#111111]/45 text-xs pt-1 leading-relaxed">
                    Titolare del trattamento: <strong>Domus Group S.r.l.</strong> — Via Aurelio Saffi 29, 20123 Milano.{" "}
                    Per esercitare i tuoi diritti (accesso, rettifica, cancellazione) scrivi a{" "}
                    <a href="mailto:privacy@ediliziaincloud.com" className="text-eic-orange hover:text-eic-orange-deep underline">privacy@ediliziaincloud.com</a>.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Cosa vedi nei 30 minuti */}
      <section className="py-12 sm:py-16 px-5 sm:px-6" style={{ background: "#fafafa" }}>
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <span
              className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Agenda della demo
            </span>
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-3">
              Cosa vedi davvero nei 30 minuti
            </h2>
            <p className="text-[#111111]/55 text-sm md:text-base max-w-2xl mx-auto">
              Niente slide preconfezionate. Apriamo il software dal vivo sulla tua tipologia di impresa.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {demoAgenda.map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-all">
                <div className="text-[10px] font-bold uppercase tracking-widest text-eic-orange mb-2">{s.time}</div>
                <h3 className="font-bold text-[#111111] text-base mb-1.5">{s.title}</h3>
                <p className="text-[#111111]/60 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Demo */}
      <section className="py-12 sm:py-16 px-5 sm:px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-3">
              Domande frequenti sulla demo
            </h2>
            <p className="text-[#111111]/55 text-sm">Risposte rapide alle domande più ricorrenti.</p>
          </div>
          <div className="space-y-3">
            {DEMO_FAQS.map((f, i) => (
              <details key={i} className="group bg-[#fafafa] rounded-xl border border-gray-100 overflow-hidden">
                <summary className="cursor-pointer px-5 py-4 font-bold text-[#111111] text-sm md:text-base list-none flex items-center justify-between gap-4">
                  <span>{f.q}</span>
                  <span className="text-eic-orange text-xl flex-shrink-0 group-open:rotate-45 transition-transform">+</span>
                </summary>
                <div className="px-5 pb-5 text-[#111111]/65 text-sm leading-relaxed">
                  {f.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Bar */}
      <section
        style={{ background: "linear-gradient(90deg, #111111 0%, #111111 100%)" }}
        className="py-6 px-6"
      >
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-4 md:gap-10 text-white/80 text-sm font-medium text-center">
          <span>{marketingMessages.companies}</span>
          <span className="hidden md:block text-white/30">|</span>
          <span>Demo sul tuo flusso di lavoro</span>
          <span className="hidden md:block text-white/30">|</span>
          <span>{marketingMessages.activation}</span>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
