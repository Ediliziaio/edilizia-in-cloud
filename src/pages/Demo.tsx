import { useState } from "react";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

const DEMO_FAQS = [
  {
    q: "Quanto dura la demo?",
    a: "30 minuti. Ti chiamiamo entro 24 ore lavorative dalla richiesta per fissare la data. La demo è 1-on-1, su Google Meet o Zoom, con un consulente che conosce davvero il cantiere.",
  },
  {
    q: "Devo preparare qualcosa prima?",
    a: "No. Bastano 5 minuti per dirci come lavori oggi (Excel, Primus, Edilnet, carta) e quanti cantieri segui. Adattiamo la demo alla tua impresa: niente slide pre-confezionate.",
  },
  {
    q: "La demo è davvero gratuita?",
    a: "Sì. Zero costi, zero impegno. Decidi tu se procedere dopo. Se vuoi provare l'ambiente in autonomia, ti diamo un account di prova senza dover inserire la carta di credito.",
  },
  {
    q: "Cosa vediamo nei 30 minuti?",
    a: "1) Un cantiere reale con costi, ricavi e margine in tempo reale. 2) La fatturazione SDI con un click. 3) L'app cantiere su smartphone con timbratura GPS. 4) Il cruscotto AI con KPI e alert. 5) Domande tue specifiche sulla tua impresa.",
  },
  {
    q: "Posso portare un collega o il commercialista?",
    a: "Certo. Puoi invitare fino a 4 persone alla demo (titolare, responsabile cantiere, amministrativa, commercialista). Più persone vedono il software, più velocemente decidi.",
  },
  {
    q: "Cosa succede se decido di partire?",
    a: "Setup completo in 48 ore lavorative garantite. Ti configuriamo cantieri, anagrafiche, fatture, listini sui tuoi dati. Affiancamento di 30 giorni con Customer Success dedicato in italiano.",
  },
];


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
  const [submitted, setSubmitted] = useState(false);

  useSEO({
    title: "Demo Gratuita Gestionale Edilizia — Prova Edilizia in Cloud con AI",
    description: "Prenota una demo personalizzata di 30 minuti. Vedi come il gestionale edilizia con AI trasforma la tua impresa. Nessun impegno. Setup in 48h. Assistenza italiana dedicata.",
    canonical: "/demo",
    keywords: "demo gestionale edilizia, prova gratuita software edilizia, demo edilizia in cloud, software gestionale edilizia gratis, trial gestionale cantieri, richiedi demo software impresa edile",
  });

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!formData.nome.trim()) newErrors.nome = "Campo obbligatorio";
    if (!formData.cognome.trim()) newErrors.cognome = "Campo obbligatorio";
    if (!formData.azienda.trim()) newErrors.azienda = "Campo obbligatorio";
    if (!formData.telefono.trim()) newErrors.telefono = "Campo obbligatorio";
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      setSubmitted(true);
    }
  };

  const inputClass = (field: keyof FormErrors) =>
    `w-full px-4 py-3 rounded-lg border text-[#111111] text-base sm:text-sm focus:outline-none focus:ring-2 transition-all ${
      errors[field]
        ? "border-red-400 focus:ring-red-200"
        : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
    }`;

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <HubSeoSchema
        pageName="Demo Gratuita"
        pagePath="/demo"
        pageDescription="Richiedi una demo personalizzata di 30 minuti con un esperto edilizia. Setup gratuito, zero impegno."
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
            "Demo live 1-on-1 di 30 minuti con consulente specializzato in edilizia. Vediamo insieme cantieri, fatturazione SDI, app mobile e cruscotto AI sulla tua tipologia di impresa.",
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
            Prenota la tua Demo Gratuita
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-white/70 leading-relaxed">
            Vedi come funziona in 30 minuti. Nessun impegno, cancella quando vuoi.
          </p>

          {/* Benefit bar */}
          <div className="mt-8 sm:mt-10 flex flex-col md:flex-row items-start sm:items-center md:items-center justify-center gap-4 sm:gap-6 md:gap-10 max-w-md sm:max-w-none mx-auto text-left">
            {[
              { icon: "M", text: "Demo personalizzata sulla tua impresa" },
              { icon: "S", text: "Setup completo incluso nel prezzo" },
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
      <section className="py-12 sm:py-16 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div className="max-w-2xl mx-auto">
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
                  Perfetto! Ti contatteremo entro 24 ore lavorative.
                </h2>
                <p className="text-[#111111]/60 text-sm leading-relaxed mb-8">
                  Uno del nostro team ti contatterà presto per fissare la data della demo.
                  Controlla la tua email per conferma.
                </p>
                <Link
                  to="/"
                  className="inline-block px-6 py-3 rounded-full text-white text-sm font-bold transition-all hover:opacity-90"
                  style={{ background: "#F97415" }}
                >
                  Torna alla Home
                </Link>
              </div>
            ) : (
              <>
                <h2 className="text-xl font-bold text-[#111111] mb-1">Compila il modulo</h2>
                <p className="text-[#111111]/50 text-sm mb-7">
                  Ci vuole meno di 2 minuti. Ti ricontattiamo noi.
                </p>

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  {/* Nome + Cognome */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Nome <span className="text-[#F97415]">*</span>
                      </label>
                      <input
                        type="text"
                        name="nome"
                        value={formData.nome}
                        onChange={handleChange}
                        className={inputClass("nome")}
                        placeholder="Mario"
                      />
                      {errors.nome && <p className="text-red-500 text-xs mt-1">{errors.nome}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Cognome <span className="text-[#F97415]">*</span>
                      </label>
                      <input
                        type="text"
                        name="cognome"
                        value={formData.cognome}
                        onChange={handleChange}
                        className={inputClass("cognome")}
                        placeholder="Rossi"
                      />
                      {errors.cognome && <p className="text-red-500 text-xs mt-1">{errors.cognome}</p>}
                    </div>
                  </div>

                  {/* Azienda */}
                  <div>
                    <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                      Nome Azienda <span className="text-[#F97415]">*</span>
                    </label>
                    <input
                      type="text"
                      name="azienda"
                      value={formData.azienda}
                      onChange={handleChange}
                      className={inputClass("azienda")}
                      placeholder="Rossi Costruzioni S.r.l."
                    />
                    {errors.azienda && <p className="text-red-500 text-xs mt-1">{errors.azienda}</p>}
                  </div>

                  {/* Telefono + Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Telefono <span className="text-[#F97415]">*</span>
                      </label>
                      <input
                        type="tel"
                        name="telefono"
                        value={formData.telefono}
                        onChange={handleChange}
                        className={inputClass("telefono")}
                        placeholder="+39 333 000 0000"
                      />
                      {errors.telefono && <p className="text-red-500 text-xs mt-1">{errors.telefono}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                        Email <span className="text-[#F97415]">*</span>
                      </label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        className={inputClass("email")}
                        placeholder="mario@rossicostruzioni.it"
                      />
                      {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
                    </div>
                  </div>

                  {/* Fatturato */}
                  <div>
                    <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                      Fatturato Annuo <span className="text-[#F97415]">*</span>
                    </label>
                    <select
                      name="fatturato"
                      value={formData.fatturato}
                      onChange={handleChange}
                      className={`${inputClass("fatturato")} bg-white`}
                    >
                      <option value="">Seleziona una fascia...</option>
                      <option value="fino-300k">Fino a 300K</option>
                      <option value="300k-1m">300K – 1M</option>
                      <option value="1m-3m">1M – 3M</option>
                      <option value="oltre-3m">Oltre 3M</option>
                    </select>
                    {errors.fatturato && <p className="text-red-500 text-xs mt-1">{errors.fatturato}</p>}
                  </div>

                  {/* Messaggio */}
                  <div>
                    <label className="block text-xs font-semibold text-[#111111]/70 mb-1.5 uppercase tracking-wide">
                      Messaggio <span className="text-[#111111]/30 font-normal">(opzionale)</span>
                    </label>
                    <textarea
                      name="messaggio"
                      value={formData.messaggio}
                      onChange={handleChange}
                      rows={3}
                      className="w-full px-4 py-3 rounded-lg border border-gray-200 text-[#111111] text-sm focus:outline-none focus:ring-2 focus:ring-[#F97415]/30 focus:border-[#F97415] transition-all resize-none"
                      placeholder="Cosa vorresti vedere nella demo?"
                    />
                  </div>

                  {/* Consensi GDPR */}
                  <div className="pt-2 border-t border-gray-100 space-y-3">
                    <p className="text-[10px] font-bold tracking-widest uppercase text-[#111111]/40">
                      Consensi privacy <span className="text-[#F97415]">(art. 13 GDPR)</span>
                    </p>

                    {/* Privacy obbligatorio */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="privacyConsent"
                        checked={formData.privacyConsent}
                        onChange={handleChange}
                        className={`mt-0.5 w-4 h-4 rounded border-2 cursor-pointer accent-[#F97415] flex-shrink-0 ${
                          errors.privacyConsent ? "border-red-400" : "border-gray-300"
                        }`}
                      />
                      <span className="text-xs text-[#111111]/75 leading-relaxed">
                        <strong className="text-[#F97415]">*</strong> Ho letto e accetto la{" "}
                        <Link to="/privacy-policy" target="_blank" rel="noopener" className="text-[#F97415] hover:text-[#C94F06] underline font-semibold">
                          Privacy Policy
                        </Link>{" "}
                        e acconsento al trattamento dei miei dati personali per finalità connesse alla gestione della richiesta di demo (art. 6.1.b GDPR — misura precontrattuale).{" "}
                        <span className="text-red-500 font-semibold">Obbligatorio</span>
                      </span>
                    </label>
                    {errors.privacyConsent && (
                      <p className="text-red-500 text-xs ml-7 -mt-1">{errors.privacyConsent}</p>
                    )}

                    {/* Marketing opzionale */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        name="marketingConsent"
                        checked={formData.marketingConsent}
                        onChange={handleChange}
                        className="mt-0.5 w-4 h-4 rounded border-2 border-gray-300 cursor-pointer accent-[#F97415] flex-shrink-0"
                      />
                      <span className="text-xs text-[#111111]/75 leading-relaxed">
                        Acconsento a ricevere comunicazioni commerciali e promozionali via email/telefono su prodotti, novità ed eventi di Edilizia in Cloud (art. 6.1.a GDPR).{" "}
                        <span className="text-[#111111]/50">Facoltativo — revocabile in qualsiasi momento.</span>
                      </span>
                    </label>

                  </div>

                  {/* Submit */}
                  <button
                    type="submit"
                    className="w-full py-4 rounded-xl text-white font-bold text-base tracking-wide transition-all hover:opacity-90 hover:scale-[1.01] shadow-lg"
                    style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.3)" }}
                  >
                    Richiedi la Demo Gratuita →
                  </button>

                  <p className="text-center text-[#111111]/45 text-xs pt-1 leading-relaxed">
                    Titolare del trattamento: <strong>Domus Group S.r.l.</strong> — Via Aurelio Saffi 29, 20123 Milano.{" "}
                    Per esercitare i tuoi diritti (accesso, rettifica, cancellazione) scrivi a{" "}
                    <a href="mailto:privacy@ediliziaincloud.com" className="text-[#F97415] hover:text-[#C94F06] underline">privacy@ediliziaincloud.com</a>.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Cosa succede dopo */}
      <section className="py-12 sm:py-16 px-5 sm:px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-3">
            Cosa succede dopo?
          </h2>
          <p className="text-[#111111]/50 text-sm mb-12">
            Tre passi semplici, nessuna sorpresa.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Ricevi una chiamata entro 24h",
                desc: "Uno del nostro team ti contatta per fissare la data e capire le tue esigenze specifiche.",
              },
              {
                step: "02",
                title: "Demo live di 30 minuti",
                desc: "Vediamo insieme come funziona sulla tua tipologia di impresa, con dati e scenari reali.",
              },
              {
                step: "03",
                title: "Decidi senza fretta",
                desc: "Nessuna pressione, nessun vincolo. Hai tutto il tempo per valutare se fa al caso tuo.",
              },
            ].map((s) => (
              <div key={s.step} className="text-left md:text-center">
                <div
                  className="text-4xl font-black mb-4 leading-none"
                  style={{ color: "#F97415", opacity: 0.25 }}
                >
                  {s.step}
                </div>
                <h3 className="text-base font-bold text-[#111111] mb-2">{s.title}</h3>
                <p className="text-[#111111]/55 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
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
            {[
              { time: "0–5 min", title: "Capiamo come lavori oggi", desc: "Ci racconti: quanti cantieri segui, che software usi, dove perdi tempo. Personalizziamo la demo sulla tua realtà." },
              { time: "5–15 min", title: "Cantieri & margini in tempo reale", desc: "Apriamo un cantiere campione: budget, costi, ricavi, margine live. SAL, fasi, foto, giornale lavori. App mobile con timbratura GPS." },
              { time: "15–22 min", title: "Fatturazione SDI & cassa", desc: "Emetti una fattura elettronica con un click. Vedi il flusso di cassa, lo scadenzario, il forecast a 90 giorni." },
              { time: "22–28 min", title: "AI & cruscotto direzionale", desc: "Dashboard live con KPI aziendali, alert su cantieri in perdita, suggerimenti AI per ottimizzare margini e tempi." },
              { time: "28–30 min", title: "Domande tue + numeri reali", desc: "Tempi di implementazione sul tuo caso, costo esatto, condizioni contrattuali. Nessun obbligo: decidi con calma." },
            ].map((s, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-all">
                <div className="text-[10px] font-bold uppercase tracking-widest text-[#F97415] mb-2">{s.time}</div>
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
                  <span className="text-[#F97415] text-xl flex-shrink-0 group-open:rotate-45 transition-transform">+</span>
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
          <span>150+ imprese edili italiane ci hanno scelto</span>
          <span className="hidden md:block text-white/30">|</span>
          <span>4.9/5 soddisfazione media</span>
          <span className="hidden md:block text-white/30">|</span>
          <span>Setup in 48 ore</span>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
