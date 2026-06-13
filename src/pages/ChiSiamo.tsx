import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import { Link } from "react-router-dom";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useScrollAnimation } from "@/hooks/useScrollAnimation";
import {
  ArrowRight,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
  HardHat,
  MapPin,
  Code2,
  Users,
  Wrench,
  HeartHandshake,
  Eye,
  Hammer,
  Truck,
  Sun,
  CloudRain,
  Clock,
} from "lucide-react";

/* ─────────────────────────────────────────────
   DATA
───────────────────────────────────────────── */

const principi = [
  {
    icon: HardHat,
    title: "Costruito da chi il cantiere lo vive davvero",
    desc: "Non siamo un'azienda di software che ha letto un libro sul settore edile. Siamo nati dentro un'impresa edile, dalla scrivania di chi ogni mattina deve sapere quanti operai sono in cantiere, se il DURC è in ordine, quanto manca da incassare. Ogni funzione che vedi è stata pensata per risolvere un problema vissuto in prima persona — non immaginato in una stanza con vista.",
  },
  {
    icon: Eye,
    title: "Trasparenza come default",
    desc: "Prezzi pubblici sul sito. Nessun commerciale che ti chiama tre volte al giorno. Nessun contratto pluriennale obbligatorio. Cancelli quando vuoi. I nostri Termini di servizio e il DPA sono leggibili sul sito prima di firmare.",
  },
  {
    icon: HeartHandshake,
    title: "Ti rispondiamo davvero",
    desc: "Quando chiami, risponde una persona del nostro team — non un IVR, non un chatbot. Quando scrivi, ti risponde chi conosce il tuo caso. Niente ticket dispersi tra reparti. Siamo un team piccolo per scelta: ognuno conosce ogni cliente.",
  },
  {
    icon: ShieldCheck,
    title: "I tuoi dati restano tuoi",
    desc: "Server europei, GDPR, cifratura AES-256 a riposo, TLS 1.3 in transito. Backup giornalieri. DPA pubblico firmabile. Se decidi di andartene, ti consegniamo tutti i tuoi dati in formato standard entro 7 giorni. Senza domande, senza penali.",
  },
];

const cosaFacciamo = [
  {
    icon: Hammer,
    title: "Costruiamo software",
    desc: "Edilizia in Cloud è una piattaforma cloud per imprese edili italiane: cantieri, fatturazione SDI, preventivi, HR e Cassa Edile, marketing, AI per render e quote builder.",
  },
  {
    icon: Wrench,
    title: "Configuriamo per te",
    desc: "Onboarding gratuito in 48 ore: importiamo i tuoi dati dal vecchio gestionale, configuriamo cantieri/listini/team, formazione 1-on-1.",
  },
  {
    icon: Users,
    title: "Affianchiamo nel tempo",
    desc: "Customer Success dedicato, sessioni di analisi mensili sui tuoi numeri, aggiornamenti continui guidati dai feedback reali dei clienti.",
  },
];

const cosaNonFacciamo = [
  "Non vendiamo i tuoi dati. A nessuno. Mai.",
  "Non facciamo training di modelli AI sui tuoi documenti privati.",
  "Non ti blocchiamo con contratti pluriennali o lock-in tecnologici.",
  "Non promettiamo numeri che non possiamo dimostrare.",
  "Non chiamiamo a casa tua tutti i giorni se non rispondi al primo contatto.",
];

const numeri = [
  { value: "2021", label: "Anno di fondazione", sub: "Domus Group S.r.l., Milano" },
  { value: "150+", label: "Imprese edili a bordo", sub: "in crescita ogni mese" },
  { value: "4.9/5", label: "Valutazione media", sub: "dai clienti che ci usano" },
  { value: "100%", label: "Sviluppato in Italia", sub: "per il cantiere italiano" },
];

const cantiereLife = [
  {
    icon: Sun,
    title: "Le 6:30 del mattino",
    desc: "Quando il software l'abbiamo pensato, eravamo già in cantiere. La timbratura GPS, l'app offline, la foto geolocalizzata: non sono feature da brochure. Sono cose che servivano a noi, ogni giorno.",
  },
  {
    icon: CloudRain,
    title: "La pioggia che ferma il getto",
    desc: "Sappiamo cosa significa rimandare un getto di calcestruzzo, riprogrammare una squadra, comunicare il ritardo al cliente, aggiornare il SAL. Per questo il calendario lavori e il giornale di cantiere parlano la lingua del cantiere — non quella dei consulenti.",
  },
  {
    icon: Truck,
    title: "Il fornitore che chiama per essere pagato",
    desc: "Lo scadenzario, il previsionale di cassa, le ritenute di garanzia: li abbiamo costruiti dopo aver vissuto in prima persona la telefonata del fornitore alle 18:00 di venerdì. Non da uno schema in PowerPoint.",
  },
  {
    icon: Clock,
    title: "Il consuntivo a fine commessa",
    desc: "Sapere se un cantiere ha guadagnato o perso — davvero, non sulla carta — è la cosa che separa un'impresa che resiste da una che chiude. Margini cantiere live, preventivo vs consuntivo: è la nostra ossessione perché è stata la nostra paura.",
  },
];

const timeline = [
  {
    year: "L'origine",
    title: "Un'impresa edile con un problema",
    desc: "Il software nasce dentro una vera impresa edile italiana. Fatturava bene, ma a fine anno i conti non tornavano. Cantieri apparentemente redditizi che chiudevano in perdita. Cassa che andava e veniva senza logica.",
  },
  {
    year: "La ricerca",
    title: "Niente sul mercato funzionava",
    desc: "ERP costosi pensati per multinazionali. Excel infiniti. Software generici pensati anche per ristoranti e parrucchieri. Niente di costruito davvero per il cantiere italiano.",
  },
  {
    year: "2021",
    title: "Domus Group S.r.l.",
    desc: "Costituita la società che svilupperà la piattaforma. Sede Milano. Prima missione: risolvere il problema dentro casa, prima ancora di pensare al mercato.",
  },
  {
    year: "Sviluppo iniziale",
    title: "Test su impresa reale, non su slide",
    desc: "Mesi di sviluppo direttamente sul cantiere: margini, cassa, integrazione SDI, Cassa Edile. Si tiene quello che serve a chi è in cantiere alle 6:30. Si butta tutto il resto.",
  },
  {
    year: "Apertura al mercato",
    title: "Le prime imprese",
    desc: "Colleghi imprenditori chiedono di provarlo. Si parte con un gruppo ristretto. Ogni feedback diventa una feature. Il prodotto cresce guidato da chi il cantiere lo conosce, non dal marketing.",
  },
  {
    year: "2024",
    title: "AI nativa e fatturazione completa",
    desc: "Quote Builder AI, render AI per infissi/bagni/tetti, agenti AI per il customer support. Fatturazione elettronica nativa, conservazione decennale a norma CAD/AgID.",
  },
  {
    year: "Oggi",
    title: "Crescita guidata dal passaparola",
    desc: "Nuove imprese si uniscono ogni mese, principalmente per consiglio di chi ci usa già. Il team rimane piccolo per scelta: meno persone, più qualità, contatto diretto con ogni cliente.",
  },
];

const faqs = [
  {
    q: "Chi c'è dietro Edilizia in Cloud?",
    a: "Edilizia in Cloud è sviluppato e operato da Domus Group S.r.l., con sede a Milano (P.IVA IT13132010961). Il software è nato dentro un'impresa edile italiana come strumento operativo interno, ed è stato aperto al mercato dopo essere stato validato in produzione sul campo. Il team combina chi il cantiere lo conosce davvero (operatività, fiscale, contabilità di commessa) con sviluppatori italiani specializzati in cloud e AI.",
  },
  {
    q: "Cosa significa 'costruito da chi vive il cantiere'?",
    a: "Significa che ogni decisione di prodotto passa attraverso chi il cantiere lo ha vissuto sulla pelle: scadenze del DURC, ritardi del fornitore, riprogrammazione di una squadra perché piove, F24 da pagare il 16. Non lavoriamo su requisiti astratti scritti da consulenti: lavoriamo su problemi reali raccolti ogni settimana dai clienti e dal nostro stesso uso operativo.",
  },
  {
    q: "Il software è italiano?",
    a: "Sì, sviluppato interamente in Italia da un team italiano. È pensato specificamente per il mercato italiano: fatturazione elettronica SDI, CCNL Edilizia, Cassa Edile, prezzari regionali (DEI), normativa fiscale e sicurezza italiane. Non è un software estero adattato al volo.",
  },
  {
    q: "Quante persone siete?",
    a: "Siamo un team piccolo per scelta. Preferiamo essere in pochi e conoscere ogni cliente per nome, piuttosto che essere tanti e diventare un call center anonimo. Quando chiami, risponde una persona del team — non un primo livello che gira il ticket.",
  },
  {
    q: "Come gestite la sicurezza e la privacy dei dati?",
    a: "Server in UE, conformi GDPR. Cifratura AES-256 a riposo e TLS 1.3 in transito. Backup giornalieri con retention 90 giorni. DPA (Data Processing Agreement) firmato all'attivazione. Non condividiamo dati con terze parti per scopi commerciali e non li usiamo per addestrare modelli AI.",
  },
  {
    q: "Avete un programma per partner e consulenti?",
    a: "Sì. Il programma Diventa Partner è aperto a commercialisti, agenzie marketing, commerciali del settore e aziende edili che vogliono proporre Edilizia in Cloud ai loro clienti/colleghi. 4 tier (15–30% ricorrente), pagamento via fattura elettronica + bonifico 30gg.",
  },
];

/* ─────────────────────────────────────────────
   COMPONENT
───────────────────────────────────────────── */

export default function ChiSiamo() {
  useSEO({
    title: "Chi Siamo — Edilizia in Cloud | Software edile nato in cantiere",
    description: "Edilizia in Cloud è il gestionale cloud con AI per imprese edili italiane, sviluppato da Domus Group S.r.l. (Milano). Nato dentro un'impresa edile reale e validato sul campo prima di arrivare sul mercato.",
    canonical: "/chi-siamo",
    keywords: "chi siamo edilizia in cloud, domus group srl, gestionale edilizia italiano, software edilizia made in italy, software edilizia cantiere, gestionale costruito da imprenditori edili",
  });

  const heroAnim = useScrollAnimation();
  const principiAnim = useScrollAnimation();
  const cantiereAnim = useScrollAnimation();
  const timelineAnim = useScrollAnimation();
  const cosaAnim = useScrollAnimation();
  const ctaAnim = useScrollAnimation();

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <HubSeoSchema
        pageName="Chi Siamo"
        pagePath="/chi-siamo"
        pageDescription="Edilizia in Cloud: il gestionale cloud per imprese edili italiane, costruito da chi il cantiere lo vive ogni giorno. Sede Milano. GDPR compliant."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Chi Siamo", url: "/chi-siamo" },
        ]}
      />
      <JsonLd
        id="jsonld-aboutpage-chisiamo"
        data={{
          "@context": "https://schema.org",
          "@type": "AboutPage",
          "@id": "https://www.ediliziaincloud.com/chi-siamo#aboutpage",
          url: "https://www.ediliziaincloud.com/chi-siamo",
          name: "Chi Siamo — Edilizia in Cloud",
          description:
            "La storia di Edilizia in Cloud: gestionale cantieri costruito da chi il cantiere lo vive ogni giorno. Sede Milano, sviluppato da Domus Group S.r.l.",
          inLanguage: "it-IT",
          isPartOf: { "@id": "https://www.ediliziaincloud.com/#website" },
          about: { "@id": "https://www.ediliziaincloud.com/#organization" },
          mainEntity: { "@id": "https://www.ediliziaincloud.com/#organization" },
        }}
      />
      <JsonLd
        id="jsonld-organization-chisiamo"
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": "https://www.ediliziaincloud.com/#organization",
          name: "Edilizia in Cloud",
          legalName: "Domus Group S.r.l.",
          url: "https://www.ediliziaincloud.com",
          logo: {
            "@type": "ImageObject",
            url: "https://www.ediliziaincloud.com/icons/icon-512.png",
            width: 512,
            height: 512,
          },
          description:
            "Gestionale cloud con AI per imprese edili italiane: cantieri, fatturazione SDI, preventivi, HR e Cassa Edile. Sviluppato da Domus Group S.r.l., costruito da chi vive il cantiere ogni giorno.",
          foundingDate: "2021",
          vatID: "IT13132010961",
          taxID: "13132010961",
          address: {
            "@type": "PostalAddress",
            addressLocality: "Milano",
            addressRegion: "MI",
            addressCountry: "IT",
          },
          contactPoint: [
            {
              "@type": "ContactPoint",
              email: "info@ediliziaincloud.com",
              contactType: "customer service",
              availableLanguage: "Italian",
              areaServed: "IT",
            },
          ],
          sameAs: ["https://www.linkedin.com/company/edilizia-in-cloud"],
        }}
      />
      <JsonLd
        id="jsonld-faq-chisiamo"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }}
      />

      <LandingNavbar />

      {/* ── HERO ── */}
      <section
        className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 px-5 sm:px-6 overflow-hidden"
        style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #111111 100%)" }}
      >
        {/* Background image cantiere — self-hosted WebP (no Unsplash, brand-consistent con homepage) */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: "url('/hero/cantiere-1920.webp')" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,10,0.7) 0%, rgba(17,17,17,0.95) 100%)" }} />

        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at top, rgba(249,116,21,0.18) 0%, transparent 70%)",
            filter: "blur(40px)",
          }}
        />

        <div
          ref={heroAnim.ref}
          className="relative z-10 max-w-4xl mx-auto text-center transition-all duration-1000"
          style={{
            opacity: heroAnim.isVisible ? 1 : 0,
            transform: heroAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          <div
            className="inline-block px-4 py-1.5 rounded-full text-xs font-bold tracking-widest uppercase mb-7"
            style={{
              background: "rgba(249,116,21,0.18)",
              color: "#F97415",
              border: "1px solid rgba(249,116,21,0.35)",
            }}
          >
            Chi siamo
          </div>

          <h1 className="text-[28px] leading-[1.15] sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-white sm:leading-tight mb-5 sm:mb-6 px-1">
            Costruito da chi il <span style={{ color: "#F97415" }}>cantiere</span>
            <br className="hidden md:block" /> lo vive tutti i giorni.
          </h1>

          <p className="text-base sm:text-lg md:text-xl text-white/65 leading-relaxed max-w-2xl mx-auto mb-8 sm:mb-10">
            Niente storie da unicorno tech. Niente claim di marketing inventati. Solo un software nato
            dentro un'impresa edile reale, validato sul campo prima di essere offerto al mercato.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/70">
            <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#F97415]" /> Domus Group S.r.l.</span>
            <span className="flex items-center gap-2"><MapPin className="w-4 h-4 text-[#F97415]" /> Sede Milano</span>
            <span className="flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-[#F97415]" /> GDPR · Server UE</span>
            <span className="flex items-center gap-2"><Code2 className="w-4 h-4 text-[#F97415]" /> Made in Italy</span>
          </div>
        </div>
      </section>

      {/* ── STAT BAND — credibilità ── */}
      <section className="px-5 sm:px-6 bg-white">
        <div className="max-w-6xl mx-auto -mt-10 sm:-mt-14 relative z-20">
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden shadow-xl"
            style={{ background: "#e8ecf0", border: "1px solid #e8ecf0" }}
          >
            {numeri.map((n) => (
              <div key={n.label} className="bg-white px-4 py-6 sm:px-6 sm:py-8 text-center">
                <div className="text-3xl sm:text-4xl font-extrabold mb-1" style={{ color: "#F97415" }}>
                  {n.value}
                </div>
                <div className="font-bold text-[#111111] text-sm sm:text-base leading-tight">{n.label}</div>
                <div className="text-[#111111]/50 text-xs mt-1 leading-snug">{n.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ORIGINE — narrativa lunga ── */}
      <section className="py-16 sm:py-24 px-5 sm:px-6 bg-white">
        <div
          ref={cantiereAnim.ref}
          className="max-w-4xl mx-auto transition-all duration-1000"
          style={{
            opacity: cantiereAnim.isVisible ? 1 : 0,
            transform: cantiereAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          <div className="text-center mb-12">
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              L'origine
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-4 leading-tight">
              Non un software di software house.<br />
              <span style={{ color: "#F97415" }}>Uno strumento di lavoro nato in cantiere.</span>
            </h2>
          </div>

          <div className="space-y-5 text-[#111111]/75 leading-relaxed text-base md:text-lg max-w-3xl mx-auto">
            <p>
              La maggior parte dei gestionali edili sul mercato è scritta da ingegneri che il cantiere
              non l'hanno mai messo. Hanno progettato schermate guardando un manuale, intervistato due
              imprenditori per un'ora e hanno chiamato quello "ricerca utente". Il risultato lo conosci:
              menu infiniti, 500 funzioni di cui ne usi 3, configurazioni che richiedono settimane di
              consulenza pagata a parte.
            </p>
            <p>
              Edilizia in Cloud nasce dalla parte opposta. Da una scrivania accanto al cantiere — non
              di fronte a un poster del cantiere. <strong>Da chi alle 6:30 del mattino doveva sapere
              chi era timbrato, alle 11:00 doveva rispondere al fornitore arrabbiato, alle 17:00 doveva
              capire se la commessa stava guadagnando o perdendo.</strong>
            </p>
            <p>
              Lo abbiamo costruito perché ci serviva a noi. Lo abbiamo testato per mesi sulla nostra
              operatività vera, prima di mostrarlo a chiunque. Quello che vedi oggi — margini cantiere
              live, cassa previsionale, fatturazione SDI, Cassa Edile, F24, DURC, foto geolocalizzate
              — non è una checklist di feature: è la lista delle cose che servivano per arrivare a
              fine giornata senza sorprese.
            </p>
            <p>
              Quando colleghi imprenditori hanno visto come funzionava, hanno chiesto di poterlo usare.
              È a quel punto che è nata <strong>Domus Group S.r.l.</strong> e Edilizia in Cloud è
              diventato il prodotto che è oggi: <em>uno strumento di chi sta in cantiere, per chi sta
              in cantiere</em>.
            </p>
          </div>

          {/* Pull quote */}
          <div className="mt-12 max-w-2xl mx-auto">
            <blockquote
              className="rounded-2xl p-7 text-center"
              style={{
                background: "rgba(249,116,21,0.06)",
                borderLeft: "4px solid #F97415",
              }}
            >
              <p className="italic text-[#111111]/80 text-base md:text-lg leading-relaxed">
                Il fatturato è vanità. Il margine è sanità. La cassa è realtà. <br />
                <span className="text-sm not-italic font-semibold text-[#F97415]">
                  — È il principio attorno al quale è stato pensato ogni schermo del software.
                </span>
              </p>
            </blockquote>
          </div>
        </div>
      </section>

      {/* ── SCENE DI CANTIERE → FEATURE ── */}
      <section className="py-16 sm:py-24 px-5 sm:px-6" style={{ background: "#0a0a0a" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.18)", color: "#F97415", border: "1px solid rgba(249,116,21,0.35)" }}
            >
              Quattro scene di cantiere
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">
              Da dove arrivano le funzioni che usi
            </h2>
            <p className="text-white/60 max-w-2xl mx-auto">
              Ogni feature di Edilizia in Cloud è nata da un momento preciso del cantiere. Non da un focus group.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {cantiereLife.map((s, i) => (
              <div
                key={s.title}
                className="rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(249,116,21,0.15)" }}
                  >
                    <s.icon className="w-5 h-5" style={{ color: "#F97415" }} />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg mb-2">{s.title}</h3>
                    <p className="text-white/65 text-sm leading-relaxed">{s.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRINCIPI ── */}
      <section className="py-16 sm:py-24 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div ref={principiAnim.ref} className="max-w-6xl mx-auto">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: principiAnim.isVisible ? 1 : 0,
              transform: principiAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              I nostri principi
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-3">
              Quattro regole che guidano tutto quello che facciamo
            </h2>
            <p className="text-[#111111]/60 max-w-2xl mx-auto">
              Niente mission da copywriter. Sono le regole che applichiamo davvero, ogni giorno, in ogni decisione di prodotto.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {principi.map((p, i) => (
              <div
                key={p.title}
                className="bg-white rounded-2xl p-7 transition-all duration-700 hover:shadow-md"
                style={{
                  border: "1px solid #e8ecf0",
                  borderTop: "3px solid #F97415",
                  opacity: principiAnim.isVisible ? 1 : 0,
                  transform: principiAnim.isVisible ? "translateY(0)" : "translateY(24px)",
                  transitionDelay: `${i * 90}ms`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: "rgba(249,116,21,0.1)" }}
                >
                  <p.icon className="w-5 h-5" style={{ color: "#F97415" }} />
                </div>
                <h3 className="font-bold text-[#111111] text-lg mb-3">{p.title}</h3>
                <p className="text-[#111111]/65 text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COSA FACCIAMO / NON FACCIAMO ── */}
      <section className="py-16 sm:py-24 px-5 sm:px-6 bg-white">
        <div ref={cosaAnim.ref} className="max-w-6xl mx-auto">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: cosaAnim.isVisible ? 1 : 0,
              transform: cosaAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111] mb-3">
              Cosa facciamo. Cosa <span style={{ color: "#F97415" }}>non</span> facciamo.
            </h2>
            <p className="text-[#111111]/60 max-w-2xl mx-auto">Per sapere subito se siamo o no la scelta giusta per te.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Cosa facciamo */}
            <div
              className="rounded-3xl p-8 transition-all duration-700"
              style={{
                background: "linear-gradient(135deg, rgba(249,116,21,0.06) 0%, rgba(249,116,21,0.02) 100%)",
                border: "1px solid rgba(249,116,21,0.15)",
                opacity: cosaAnim.isVisible ? 1 : 0,
                transform: cosaAnim.isVisible ? "translateY(0)" : "translateY(28px)",
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(249,116,21,0.15)" }}
                >
                  <CheckCircle2 className="w-5 h-5" style={{ color: "#F97415" }} />
                </div>
                <h3 className="font-bold text-[#111111] text-lg">Cosa facciamo</h3>
              </div>
              <ul className="space-y-5">
                {cosaFacciamo.map((c) => (
                  <li key={c.title} className="flex items-start gap-3">
                    <span
                      className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "white", border: "1px solid rgba(249,116,21,0.15)" }}
                    >
                      <c.icon className="w-4 h-4" style={{ color: "#F97415" }} />
                    </span>
                    <div>
                      <div className="font-bold text-[#111111] text-sm">{c.title}</div>
                      <div className="text-[#111111]/65 text-xs leading-relaxed mt-0.5">{c.desc}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cosa NON facciamo */}
            <div
              className="rounded-3xl p-8 transition-all duration-700"
              style={{
                background: "#0f0f0f",
                opacity: cosaAnim.isVisible ? 1 : 0,
                transform: cosaAnim.isVisible ? "translateY(0)" : "translateY(28px)",
                transitionDelay: "120ms",
              }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.08)" }}
                >
                  <span className="text-white/70 text-xl leading-none">×</span>
                </div>
                <h3 className="font-bold text-white text-lg">Cosa NON facciamo</h3>
              </div>
              <ul className="space-y-3">
                {cosaNonFacciamo.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#F97415" }} />
                    <span className="text-white/75 text-sm leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── TIMELINE ── */}
      <section className="py-16 sm:py-24 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div ref={timelineAnim.ref} className="max-w-4xl mx-auto">
          <div
            className="text-center mb-14 transition-all duration-700"
            style={{
              opacity: timelineAnim.isVisible ? 1 : 0,
              transform: timelineAnim.isVisible ? "translateY(0)" : "translateY(24px)",
            }}
          >
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Come siamo arrivati qui
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111]">Il percorso, senza filtri</h2>
          </div>

          <div className="relative">
            <div
              className="absolute left-4 md:left-1/2 md:-translate-x-1/2 top-0 bottom-0 w-0.5"
              style={{ background: "linear-gradient(to bottom, #F97415, rgba(249,116,21,0.1))" }}
            />

            <div className="space-y-8">
              {timeline.map((t, i) => {
                const isLeft = i % 2 === 0;
                return (
                  <div
                    key={i}
                    className="relative transition-all duration-700"
                    style={{
                      opacity: timelineAnim.isVisible ? 1 : 0,
                      transform: timelineAnim.isVisible
                        ? "translateX(0)"
                        : `translateX(${isLeft ? "-16px" : "16px"})`,
                      transitionDelay: `${i * 80}ms`,
                    }}
                  >
                    {/* Mobile */}
                    <div className="md:hidden flex gap-4 pl-10 relative">
                      <div
                        className="absolute left-2 top-1.5 w-4 h-4 rounded-full flex-shrink-0 z-10"
                        style={{ background: "#F97415", boxShadow: "0 0 0 4px rgba(249,116,21,0.18)" }}
                      />
                      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 w-full">
                        <span
                          className="inline-block px-3 py-0.5 rounded-full text-xs font-bold mb-2"
                          style={{ background: "#F97415", color: "white" }}
                        >
                          {t.year}
                        </span>
                        <h3 className="font-bold text-[#111111] text-sm mb-1">{t.title}</h3>
                        <p className="text-[#111111]/60 text-xs leading-relaxed">{t.desc}</p>
                      </div>
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:flex md:items-center">
                      <div className={`w-1/2 ${isLeft ? "pr-10 text-right" : "order-3 pl-10"}`}>
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 inline-block text-left w-full">
                          <span
                            className="inline-block px-3 py-0.5 rounded-full text-xs font-bold mb-2"
                            style={{ background: "#F97415", color: "white" }}
                          >
                            {t.year}
                          </span>
                          <h3 className="font-bold text-[#111111] text-sm mb-1">{t.title}</h3>
                          <p className="text-[#111111]/60 text-xs leading-relaxed">{t.desc}</p>
                        </div>
                      </div>
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0 mx-auto z-10 order-2"
                        style={{ background: "#F97415", boxShadow: "0 0 0 5px rgba(249,116,21,0.18)" }}
                      />
                      <div className={`w-1/2 ${isLeft ? "order-3" : "pr-10"}`} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-14 sm:py-20 px-5 sm:px-6" style={{ background: "#f7f9fc" }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span
              className="inline-block px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase mb-4"
              style={{ background: "rgba(249,116,21,0.1)", color: "#F97415" }}
            >
              Domande frequenti
            </span>
            <h2 className="text-2xl md:text-4xl font-bold text-[#111111]">Risposte dirette</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((f) => (
              <details key={f.q} className="bg-white rounded-2xl group" style={{ border: "1px solid #e8ecf0" }}>
                <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer list-none">
                  <span className="font-semibold text-[#111111] text-sm md:text-base">{f.q}</span>
                  <ChevronDown className="w-5 h-5 text-[#F97415] flex-shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="px-5 pb-5 text-[#111111]/65 text-sm leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINALE ── */}
      <section className="relative py-16 sm:py-24 px-5 sm:px-6 text-center overflow-hidden" style={{ background: "#0a0a0a" }}>
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at bottom, rgba(249,116,21,0.18) 0%, transparent 70%)",
            filter: "blur(20px)",
          }}
        />
        <div
          className="absolute top-0 left-0 right-0 h-px pointer-events-none"
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(249,116,21,0.6) 40%, rgba(249,116,21,1) 50%, rgba(249,116,21,0.6) 60%, transparent 100%)",
          }}
        />

        <div
          ref={ctaAnim.ref}
          className="relative z-10 max-w-2xl mx-auto transition-all duration-1000"
          style={{
            opacity: ctaAnim.isVisible ? 1 : 0,
            transform: ctaAnim.isVisible ? "translateY(0)" : "translateY(32px)",
          }}
        >
          <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-5 leading-tight">
            Vedi il prodotto in azione
          </h2>
          <p className="text-white/60 mb-10 text-base leading-relaxed max-w-lg mx-auto">
            30 minuti, una persona del team, il software live sul tuo caso reale. Decidi tu, senza pressione.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              to="/demo/"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-white font-bold text-base hover:scale-105 transition-all shadow-lg"
              style={{ background: "#F97415", boxShadow: "0 8px 30px rgba(249,116,21,0.35)" }}
            >
              Prenota demo gratuita
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              to="/pianifica-migrazione/"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-full font-bold text-base text-white hover:bg-white/10 transition-all"
              style={{ border: "2px solid rgba(255,255,255,0.35)" }}
            >
              Pianifica la migrazione
            </Link>
          </div>

          {/* Link di approfondimento */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
            <span className="text-white/40">Oppure esplora:</span>
            <Link to="/funzionalita/" className="text-white/75 hover:text-[#F97415] transition-colors underline-offset-4 hover:underline">
              Funzionalità
            </Link>
            <Link to="/prezzi/" className="text-white/75 hover:text-[#F97415] transition-colors underline-offset-4 hover:underline">
              Prezzi
            </Link>
            <Link to="/diventa-partner/" className="text-white/75 hover:text-[#F97415] transition-colors underline-offset-4 hover:underline">
              Diventa Partner
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
