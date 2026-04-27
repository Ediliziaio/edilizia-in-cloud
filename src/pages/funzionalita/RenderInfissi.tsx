import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Image as ImageIcon,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2,
  AppWindow,
  XCircle,
  Zap,
} from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, useSEO } from "@/hooks/useSEO";

const heroImage =
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1800&q=82";

const proofPoints = [
  "Creato per serramentisti, showroom e reti vendita",
  "Prima/dopo sulla foto reale del cliente",
  "PDF e WhatsApp pronti per il follow-up commerciale",
];

const painPoints = [
  {
    icon: Clock,
    title: "Il cliente non compra il profilo: compra certezza",
    text: "Tu parli di profili, vetrocamera, posa, cassonetti e finiture. Lui sta pensando: \"come staranno davvero sulla mia casa?\". Se non riesce a vederlo, rimanda.",
  },
  {
    icon: XCircle,
    title: "Se il valore non si vede, vince lo sconto",
    text: "Quando due preventivi sembrano uguali, il cliente sceglie quello che costa meno. Anche se il tuo prodotto, la tua posa e la tua garanzia valgono molto di più.",
  },
  {
    icon: MessageCircle,
    title: "Il momento caldo dura poco",
    text: "Durante il sopralluogo il cliente è coinvolto. Dopo qualche giorno ha già visto altri preventivi, altre foto e altre promesse. Devi rimanere nella sua testa subito.",
  },
];

const mechanismSteps = [
  {
    icon: Camera,
    title: "Scatti o carichi la foto dell'immobile",
    text: "Facciata, balcone, portafinestra o vano reale: parti dalla casa del cliente, non da un'immagine generica di catalogo.",
  },
  {
    icon: AppWindow,
    title: "Scegli serramento, finitura e oscurante",
    text: "Imposti profilo, colore, vetro, maniglia, cassonetto, tapparella, persiana o scuro. Le scelte tecniche diventano una proposta visibile.",
  },
  {
    icon: FileText,
    title: "Mostri un prima/dopo che aiuta a decidere",
    text: "Consegni un render prima/dopo, lo alleghi al preventivo, lo invii su WhatsApp e lo tieni collegato al contatto o all'opportunità.",
  },
];

const commercialLevers = [
  {
    icon: Target,
    title: "Rendi visibile il valore",
    text: "Il cliente non valuta solo il costo della finestra. Valuta l'effetto finale sulla sua casa, sulla luce e sulla facciata.",
  },
  {
    icon: ShieldCheck,
    title: "Riduci il rischio percepito",
    text: "Colore, proporzioni e stile non restano nella fantasia. Il cliente vede una direzione concreta prima di firmare.",
  },
  {
    icon: Zap,
    title: "Acceleri il follow-up",
    text: "Non richiami dicendo solo \"ha visto il preventivo?\". Richiami partendo da un'immagine chiara e memorabile.",
  },
  {
    icon: BadgeCheck,
    title: "Ti posizioni sopra il concorrente",
    text: "Non sembri il venditore che manda un prezzo. Sembri il consulente che guida il cliente verso una scelta più sicura.",
  },
];

const featureRows = [
  {
    label: "Prima/dopo sulla foto reale",
    value: "Il cliente vede la propria facciata, le proprie aperture, i propri davanzali e il contesto reale dell'intervento.",
  },
  {
    label: "Scelte tecniche tracciate",
    value: "Profilo, colore, vetro, maniglia, cassonetto, tapparella, persiana o oscurante restano leggibili e collegati al render.",
  },
  {
    label: "PDF prima/dopo professionale",
    value: "Un documento ordinato da inviare al cliente, allegare al preventivo e usare in fase di follow-up, con disclaimer dimostrativo.",
  },
  {
    label: "CRM collegato",
    value: "Ogni render può restare associato a contatto e opportunità, così non perdi la storia commerciale della trattativa.",
  },
  {
    label: "Gallery filtrabile",
    value: "Recuperi velocemente i render per data, autore, cliente, opportunità e categoria, anche quando il volume cresce.",
  },
];

const objections = [
  {
    q: "Non rischio di promettere un risultato identico al render?",
    a: "No. Il render è uno strumento dimostrativo e commerciale, non una promessa tecnica assoluta. Serve a mostrare direzione estetica, proporzioni e impatto visivo, con disclaimer chiaro nel PDF.",
  },
  {
    q: "Serve anche se vendo serramenti premium?",
    a: "Sì, soprattutto lì. Più il prezzo sale, più il cliente vuole sentirsi sicuro. Il render aiuta a giustificare valore, scelta estetica e differenza rispetto al preventivo più economico.",
  },
  {
    q: "Funziona anche per tapparelle, persiane e oscuranti?",
    a: "Sì. Il modulo è pensato per il mondo aperture: infissi, vetri, profili, cassonetti, tapparelle, persiane, scuri, maniglie e finiture visibili.",
  },
  {
    q: "Non bastano cataloghi, campioni e showroom?",
    a: "Cataloghi e campioni parlano del prodotto. Il render parla della casa del cliente. È una differenza enorme: il cliente non deve immaginare, deve riconoscere il risultato.",
  },
];

const scenarioCards = [
  {
    title: "Sopralluogo a casa del cliente",
    text: "Scatti la foto, raccogli preferenze e obiezioni, poi trasformi il preventivo in una proposta visiva che resta impressa.",
  },
  {
    title: "Preventivo fermo da qualche giorno",
    text: "Invii il prima/dopo su WhatsApp e riapri la conversazione con un motivo forte: \"Le faccio vedere come cambierebbe casa sua\".",
  },
  {
    title: "Showroom e scelta finiture",
    text: "Fai confrontare due alternative senza lasciarle astratte: bianco o antracite, persiana o tapparella, look moderno o più classico.",
  },
];

const speedStats = [
  {
    value: "60 sec",
    label: "per ottenere un primo render AI da usare in trattativa",
  },
  {
    value: "1 foto",
    label: "del cliente per mostrare l'impatto reale sulla sua casa",
  },
  {
    value: "+ valore",
    label: "per smettere di competere solo sul prezzo più basso",
  },
];

const beforeAfterAreas = [
  {
    title: "Facciata e prospetto",
    before: "Il cliente vede una facciata vecchia, con infissi datati e poca percezione del risultato finale.",
    after: "Vede la stessa facciata con nuovi serramenti, colore coerente e impatto estetico immediato.",
  },
  {
    title: "Vano finestra e portafinestra",
    before: "Il preventivo descrive profilo, vetro e maniglia, ma il cliente non riesce a immaginare proporzioni e stile.",
    after: "Il render mostra il nuovo serramento nel vano reale, con cornici, vetro e ferramenta più leggibili.",
  },
  {
    title: "Oscuranti e persiane",
    before: "Tapparelle, scuri e persiane restano parole tecniche o campioni separati dalla casa.",
    after: "Il cliente vede oscuranti, colore e finitura applicati al suo contesto, senza doverli immaginare.",
  },
  {
    title: "Cassonetti e dettagli",
    before: "Gli accessori sembrano voci secondarie del preventivo, spesso difficili da valorizzare.",
    after: "Cassonetti, finiture e dettagli diventano parte visibile della proposta e aiutano l'upsell.",
  },
];

const salesImpact = [
  {
    title: "Preventivi meno freddi",
    text: "Il follow-up non parte da una cifra, ma da un'immagine: \"Le mando come cambierebbe casa sua\".",
  },
  {
    title: "Meno confronto al ribasso",
    text: "Quando il cliente vede il risultato, è più facile parlare di qualità, posa, garanzia e differenza reale.",
  },
  {
    title: "Più decisione in showroom",
    text: "Finiture, colori e oscuranti diventano confrontabili in modo immediato, senza lasciare tutto all'immaginazione.",
  },
  {
    title: "Più autorevolezza commerciale",
    text: "Il cliente percepisce un metodo: analisi, configurazione, render, PDF, preventivo e follow-up ordinato.",
  },
];

export default function RenderInfissi() {
  useSEO({
    title: "Render Infissi AI per Serramentisti | Vendi Serramenti con Prima/Dopo Realistici",
    description:
      "Render Infissi AI per serramentisti: mostra al cliente nuovi serramenti, colori, vetri, cassonetti e oscuranti sulla foto reale della sua casa. Differenziati dal prezzo e rendi il preventivo più facile da scegliere.",
    canonical: "/funzionalita/render-infissi",
    keywords:
      "render infissi, render serramenti, render finestre AI, software serramentisti, prima dopo infissi, configuratore infissi, vendita serramenti, render tapparelle persiane",
  });

  const pageUrl = `${SITE_URL}/funzionalita/render-infissi`;

  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <JsonLd
        id="jsonld-breadcrumb-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
            { "@type": "ListItem", position: 2, name: "Funzionalita", item: `${SITE_URL}/funzionalita` },
            { "@type": "ListItem", position: 3, name: "Render Infissi", item: pageUrl },
          ],
        }}
      />
      <JsonLd
        id="jsonld-software-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Render Infissi AI",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: pageUrl,
          description:
            "Modulo AI per serramentisti che genera render prima/dopo di nuovi infissi sulla foto reale del cliente.",
          provider: {
            "@type": "Organization",
            name: "Edilizia in Cloud",
            url: SITE_URL,
          },
          audience: {
            "@type": "Audience",
            audienceType: "Serramentisti, installatori di infissi, showroom serramenti",
          },
        }}
      />
      <JsonLd
        id="jsonld-faq-render-infissi"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: objections.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />

      <LandingNavbar />

      <main>
        <section
          className="relative overflow-hidden bg-[#0b1220] px-6 pb-14 pt-28 text-white sm:pt-32 lg:pb-16"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(11,18,32,0.95) 0%, rgba(11,18,32,0.82) 48%, rgba(11,18,32,0.36) 100%), url(${heroImage})`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          }}
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.04fr_0.96fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-lg border border-orange-400/35 bg-orange-500/15 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.18em] text-orange-200">
                <Sparkles className="h-4 w-4" />
                Render AI per serramentisti
              </div>
              <h1 className="max-w-4xl text-4xl font-black leading-[1.02] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Fai scegliere i tuoi infissi prima del prezzo: mostra al cliente come cambierà la sua casa.
              </h1>
              <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-slate-200 sm:text-xl">
                Render Infissi AI trasforma la foto reale del cliente in un prima/dopo credibile:
                nuovi serramenti, colori, vetri, cassonetti e oscuranti applicati alla stessa facciata.
                Così il tuo preventivo non è più solo una cifra da confrontare, ma una scelta che il
                cliente riesce finalmente a vedere.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-950/30 transition hover:bg-[#D95E0B]"
                >
                  Prova GRATIS il Render AI
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href="#meccanismo"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-7 py-4 text-base font-bold text-white transition hover:bg-white/15"
                >
                  Guarda il meccanismo
                </a>
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                {proofPoints.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="ml-auto max-w-md rounded-lg border border-white/15 bg-white/12 p-4 shadow-2xl backdrop-blur">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-white p-3 text-[#0f172a]">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Prima</p>
                    <div className="mt-3 h-36 rounded-lg bg-[url('https://images.unsplash.com/photo-1560185127-6ed189bf02f4?auto=format&fit=crop&w=600&q=75')] bg-cover bg-center" />
                    <p className="mt-3 text-xs font-semibold text-slate-600">Prima: il cliente immagina e resta nel dubbio.</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-[#0f172a]">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Dopo</p>
                    <div className="mt-3 h-36 rounded-lg bg-[url('https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=75')] bg-cover bg-center" />
                    <p className="mt-3 text-xs font-semibold text-slate-600">Dopo: vede la trasformazione sulla sua casa.</p>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-[#0f172a] p-4 text-white">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm font-bold">Render collegato a opportunità CRM</span>
                    <span className="rounded-lg bg-emerald-400/15 px-2 py-1 text-xs font-black text-emerald-200">
                      Pronto
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-300">
                    Prima/dopo, scelte tecniche e link condivisibile per un follow-up che non parte dal prezzo.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-slate-200 bg-white px-6 py-7">
          <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-3">
            {[
              ["Obiettivo", "Far dire al cliente: adesso riesco a immaginarlo"],
              ["Momento chiave", "Sopralluogo, showroom e follow-up del preventivo"],
              ["Risultato", "Meno trattativa sul prezzo, più percezione del valore"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <p className="mt-2 text-base font-extrabold text-[#0f172a]">{value}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#fff7ed] px-6 py-16">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Risposta immediata
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                In 60 secondi trasformi una foto in un argomento di vendita.
              </h2>
              <p className="mt-5 text-lg leading-8 text-slate-700">
                Non devi aspettare giorni per far vedere un'idea. Carichi la foto, scegli le finiture
                e ottieni un prima/dopo da usare subito: in showroom, dopo il sopralluogo o nel follow-up
                del preventivo.
              </p>
              <Link
                to="/demo"
                className="mt-7 inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-7 py-4 text-base font-extrabold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#D95E0B]"
              >
                Prova GRATIS il Render AI
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {speedStats.map((item) => (
                <div key={item.value} className="rounded-lg border border-orange-200 bg-white p-5 shadow-sm">
                  <p className="text-4xl font-black tracking-tight text-[#D95E0B]">{item.value}</p>
                  <p className="mt-3 text-sm font-semibold leading-6 text-slate-700">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Il problema vero</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Il cliente non sta scegliendo solo una finestra. Sta decidendo se fidarsi di te.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Il serramentista bravo spiega bene. Il serramentista che chiude meglio fa vedere.
                Quando il cliente riconosce la propria casa migliorata, smette di ragionare solo
                su marca, scheda tecnica e sconto.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {painPoints.map((item) => (
                <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <item.icon className="h-7 w-7 text-[#F97415]" />
                  <h3 className="mt-5 text-xl font-black text-[#0f172a]">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                Prima e dopo, dove conta davvero
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non mostri un'immagine generica. Mostri le aree che fanno decidere il cliente.
              </h2>
              <p className="mt-4 text-lg leading-8 text-slate-600">
                Il render deve aiutare il cliente a capire cosa cambia nella sua casa: facciata,
                vano finestra, oscuranti, cassonetti e dettagli che normalmente restano nascosti dentro
                una voce di preventivo.
              </p>
            </div>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {beforeAfterAreas.map((area) => (
                <div key={area.title} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="grid min-h-[210px] md:grid-cols-2">
                    <div className="bg-slate-900 p-5 text-white">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Prima</p>
                      <h3 className="mt-4 text-xl font-black">{area.title}</h3>
                      <p className="mt-4 text-sm leading-7 text-slate-300">{area.before}</p>
                    </div>
                    <div className="bg-orange-50 p-5 text-[#0f172a]">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#D95E0B]">Dopo</p>
                      <h3 className="mt-4 text-xl font-black">Nuovo impatto visivo</h3>
                      <p className="mt-4 text-sm leading-7 text-slate-700">{area.after}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="meccanismo" className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Il meccanismo</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  Una dimostrazione visiva che entra nella trattativa al momento giusto.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">
                  Non devi vendere "intelligenza artificiale". Devi vendere sicurezza: questa è la sua
                  casa, con i serramenti che gli stai proponendo.
                </p>
                <Link
                  to="/demo"
                  className="mt-8 inline-flex items-center justify-center gap-2 rounded-lg bg-[#0f172a] px-6 py-4 text-sm font-extrabold text-white transition hover:bg-[#1e293b]"
                >
                  Prova GRATIS il Render AI
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="grid gap-4">
                {mechanismSteps.map((step, index) => (
                  <div key={step.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D95E0B]">
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                          Step {index + 1}
                        </p>
                        <h3 className="mt-1 text-lg font-black text-[#0f172a]">{step.title}</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-600">{step.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#0f172a] px-6 py-20 text-white">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-orange-300">
                  Perché funziona commercialmente
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Se il cliente non vede la differenza, ti chiederà lo sconto.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-300">
                  La maggior parte dei concorrenti consegna preventivi pieni di voci tecniche. Tu puoi
                  consegnare una prova visiva: stessa casa, nuovi infissi, impatto immediato.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {commercialLevers.map((item) => (
                  <div key={item.title} className="rounded-lg border border-white/10 bg-white/5 p-5">
                    <item.icon className="h-6 w-6 text-orange-300" />
                    <h3 className="mt-4 text-lg font-black">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">
                  Più vendite, meno preventivi dimenticati
                </p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  Il render non serve a fare scena. Serve a far avanzare la decisione.
                </h2>
                <p className="mt-5 text-lg leading-8 text-slate-600">
                  Ogni cliente che rimanda ha bisogno di una ragione concreta per tornare sul preventivo.
                  Il prima/dopo crea quella ragione: visuale, semplice, immediata.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {salesImpact.map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                    <h3 className="mt-4 text-lg font-black text-[#0f172a]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Cosa consegni</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Non una bella immagine. Uno strumento commerciale per vendere meglio.
              </h2>
            </div>

            <div className="mt-10 overflow-hidden rounded-lg border border-slate-200">
              {featureRows.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid gap-3 px-5 py-5 md:grid-cols-[0.36fr_0.64fr] ${
                    index % 2 === 0 ? "bg-slate-50" : "bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="h-5 w-5 text-[#F97415]" />
                    <p className="font-black text-[#0f172a]">{row.label}</p>
                  </div>
                  <p className="text-sm leading-7 text-slate-600">{row.value}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f8fafc] px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Uso sul campo</p>
                <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                  Tre momenti in cui il render può spostare davvero la trattativa.
                </h2>
              </div>
              <div className="grid gap-4">
                {scenarioCards.map((item) => (
                  <div key={item.title} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-lg font-black text-[#0f172a]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-6 py-20">
          <div className="mx-auto max-w-5xl">
            <div className="text-center">
              <p className="text-sm font-black uppercase tracking-[0.2em] text-[#D95E0B]">Obiezioni frequenti</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Le domande che un serramentista serio si fa prima di usarlo.
              </h2>
            </div>
            <div className="mt-10 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
              {objections.map((item) => (
                <details key={item.q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-base font-black text-[#0f172a]">
                    {item.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-[#D95E0B] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#0b1220] px-6 py-20 text-center text-white">
          <div className="mx-auto max-w-3xl">
            <Wand2 className="mx-auto h-10 w-10 text-orange-300" />
            <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
              Se il tuo concorrente manda solo un preventivo, tu manda una visione.
            </h2>
            <p className="mt-5 text-lg leading-8 text-slate-300">
              Il cliente deve pensare: "Questa è casa mia con i nuovi infissi". Quando succede,
              il preventivo diventa più concreto, più memorabile e più difficile da confrontare
              soltanto sul prezzo.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                to="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#F97415] px-8 py-4 text-base font-extrabold text-white transition hover:bg-[#D95E0B]"
              >
                Prova GRATIS il Render AI
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link
                to="/per/serramentisti"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/10 px-8 py-4 text-base font-bold text-white transition hover:bg-white/15"
              >
                Vedi software per serramentisti
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
