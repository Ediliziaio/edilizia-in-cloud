import { useState, useEffect } from "react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";

function PromoBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] bg-[#F97415] text-white py-2 text-center overflow-hidden">
      <span
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
      <span className="relative flex items-center justify-center gap-2 text-xs md:text-sm font-bold tracking-wide">
        SE NON TI FA GUADAGNARE, IL PROGRAMMA E GRATIS PER SEMPRE
      </span>
    </div>
  );
}

interface FormData {
  nome: string;
  cognome: string;
  azienda: string;
  telefono: string;
  email: string;
  fatturato: string;
  messaggio: string;
}

interface FormErrors {
  nome?: string;
  cognome?: string;
  azienda?: string;
  telefono?: string;
  email?: string;
  fatturato?: string;
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
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);

  useSEO({
    title: "Richiedi una Demo Gratuita — Edilizia in Cloud",
    description: "Prenota una demo personalizzata di 30 minuti con il nostro team. Ti mostriamo come Edilizia in Cloud può trasformare la tua impresa edile. Nessun impegno.",
    canonical: "/demo",
    keywords: "demo software edilizia, prova gratuita gestionale edilizia, richiedi demo edilizia in cloud",
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
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
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
    `w-full px-4 py-3 rounded-lg border text-[#111111] text-sm focus:outline-none focus:ring-2 transition-all ${
      errors[field]
        ? "border-red-400 focus:ring-red-200"
        : "border-gray-200 focus:ring-[#F97415]/30 focus:border-[#F97415]"
    }`;

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-demo" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/home" },
          { "@type": "ListItem", "position": 2, "name": "Demo", "item": "https://ediliziaincloud.com/demo" }
        ]
      }} />
      <PromoBanner />
      <LandingNavbar />

      {/* Hero */}
      <section
        style={{ background: "linear-gradient(135deg, #111111 0%, #111111 100%)" }}
        className="pt-36 pb-20 px-6 text-center"
      >
        <div className="max-w-3xl mx-auto">
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-6"
            style={{ background: "rgba(249,116,21,0.18)", color: "#F97415" }}
          >
            Demo Gratuita — Senza Impegno
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight mb-5">
            Prenota la tua Demo Gratuita
          </h1>
          <p className="text-lg md:text-xl text-white/70 leading-relaxed">
            Vedi come funziona in 30 minuti. Nessun impegno, nessuna carta di credito.
          </p>

          {/* Benefit bar */}
          <div className="mt-10 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10">
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
      <section className="py-16 px-6" style={{ background: "#f7f9fc" }}>
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-8 md:p-10">
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
                  to="/home"
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

                  {/* Submit */}
                  <button
                    type="submit"
                    className="w-full py-4 rounded-xl text-white font-bold text-base tracking-wide transition-all hover:opacity-90 hover:scale-[1.01] shadow-lg"
                    style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.3)" }}
                  >
                    Richiedi la Demo Gratuita →
                  </button>

                  <p className="text-center text-[#111111]/40 text-xs pt-1">
                    I tuoi dati sono al sicuro. Nessuno spam, promesso.
                  </p>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Cosa succede dopo */}
      <section className="py-16 px-6 bg-white">
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

      {/* Social Proof Bar */}
      <section
        style={{ background: "linear-gradient(90deg, #111111 0%, #111111 100%)" }}
        className="py-6 px-6"
      >
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-center gap-4 md:gap-10 text-white/80 text-sm font-medium text-center">
          <span>150+ imprese gia ci hanno scelto</span>
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
