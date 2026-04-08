import { Link } from "react-router-dom";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import StickyBottomBar from "@/components/landing/StickyBottomBar";
import { MapPin, ArrowRight, CheckCircle } from "lucide-react";

const CITIES = [
  { name: "Milano", slug: "milano", region: "Lombardia", desc: "Hub finanziario, massima concentrazione di imprese edili" },
  { name: "Roma", slug: "roma", region: "Lazio", desc: "Capitale, ampio mercato appalti pubblici e privati" },
  { name: "Napoli", slug: "napoli", region: "Campania", desc: "Prima città del Sud per volume di commesse edili" },
  { name: "Torino", slug: "torino", region: "Piemonte", desc: "Forte tradizione manifatturiera e cantieristica" },
  { name: "Bologna", slug: "bologna", region: "Emilia-Romagna", desc: "Eccellenza nella gestione cantieri e ristrutturazioni" },
  { name: "Firenze", slug: "firenze", region: "Toscana", desc: "Mercato restauro e recupero edilizio di pregio" },
  { name: "Bari", slug: "bari", region: "Puglia", desc: "Polo di riferimento per l'edilizia del Sud-Est" },
  { name: "Verona", slug: "verona", region: "Veneto", desc: "Distretto produttivo con alta densità di PMI edili" },
  { name: "Brescia", slug: "brescia", region: "Lombardia", desc: "Forte presenza di imprese edili e carpenterie" },
  { name: "Genova", slug: "genova", region: "Liguria", desc: "Mercato ristrutturazione e consolidamento strutturale" },
  { name: "Palermo", slug: "palermo", region: "Sicilia", desc: "Prima città della Sicilia per cantieri attivi" },
  { name: "Catania", slug: "catania", region: "Sicilia", desc: "Crescita costante del settore costruzioni civili" },
  { name: "Venezia", slug: "venezia", region: "Veneto", desc: "Specializzazione restauro e recupero conservativo" },
  { name: "Padova", slug: "padova", region: "Veneto", desc: "Distretto edile in espansione nel Veneto centrale" },
  { name: "Bergamo", slug: "bergamo", region: "Lombardia", desc: "Alta concentrazione di subappaltatori e artigiani" },
  { name: "Modena", slug: "modena", region: "Emilia-Romagna", desc: "PMI edili specializzate in costruzioni industriali" },
  { name: "Reggio Emilia", slug: "reggio-emilia", region: "Emilia-Romagna", desc: "Distretto cooperativo edile tra i più attivi d'Italia" },
  { name: "Parma", slug: "parma", region: "Emilia-Romagna", desc: "Forte sviluppo residenziale e commerciale" },
  { name: "Salerno", slug: "salerno", region: "Campania", desc: "Secondo polo campano per volumi di cantieri" },
  { name: "Trieste", slug: "trieste", region: "Friuli-Venezia Giulia", desc: "Mercato caratteristico tra cantieri portuali e civili" },
  { name: "Cagliari", slug: "cagliari", region: "Sardegna", desc: "Principale mercato edile della Sardegna" },
  { name: "Perugia", slug: "perugia", region: "Umbria", desc: "PMI edili attive su ristrutturazioni e nuove costruzioni" },
  { name: "Ancona", slug: "ancona", region: "Marche", desc: "Polo edilizio marchigiano in espansione" },
  { name: "Udine", slug: "udine", region: "Friuli-Venezia Giulia", desc: "Eccellenza costruttiva friulana con cantieri alpini e industriali" },
  { name: "Messina", slug: "messina", region: "Sicilia", desc: "Polo edilizio dello Stretto con interventi antisismici e infrastrutturali" },
  { name: "Livorno", slug: "livorno", region: "Toscana", desc: "Cantieri portuali, costieri e ristrutturazioni nella Toscana tirrenica" },
  { name: "Prato", slug: "prato", region: "Toscana", desc: "Distretto industriale tessile: capannoni, logistica e residenziale" },
  { name: "Vicenza", slug: "vicenza", region: "Veneto", desc: "Edilizia industriale e restauro palladiano nel cuore del Nord-Est" },
];

const baseUrl = "https://ediliziaincloud.com";

export default function CityHub() {
  useSEO({
    title: "Software Gestionale Edilizia per Città — Tutte le Province | Edilizia in Cloud",
    description: "Scopri Edilizia in Cloud nella tua città: software gestionale per imprese edili disponibile in tutta Italia. 27 città con supporto locale, dalla Lombardia alla Sicilia.",
    canonical: "/software-gestionale-edilizia",
    keywords: "software gestionale edilizia città, gestionale edilizia regioni, software impresa edile Italia, gestionale cantieri province italiane, software edilizia nord sud Italia",
  });

  const itemListElements = CITIES.map((city, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "name": `Software Gestionale Edilizia ${city.name}`,
    "url": `${baseUrl}/software-gestionale-edilizia-${city.slug}`,
    "description": city.desc,
  }));

  return (
    <div className="min-h-screen bg-white text-[#111111] pb-24 overflow-x-hidden">
      <JsonLd id="jsonld-breadcrumb-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Software Gestionale per Città", "item": `${baseUrl}/software-gestionale-edilizia` },
        ]
      }} />
      <JsonLd id="jsonld-itemlist-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Software Gestionale Edilizia — Copertura Geografica",
        "description": "Edilizia in Cloud disponibile in 22 città italiane con supporto e onboarding locale",
        "url": `${baseUrl}/software-gestionale-edilizia`,
        "numberOfItems": CITIES.length,
        "itemListElement": itemListElements,
      }} />
      <JsonLd id="jsonld-webpage-cityhub" data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Software Gestionale Edilizia per Città — Italia",
        "description": "Edilizia in Cloud nella tua città: gestionale per imprese edili con supporto locale in tutta Italia",
        "url": `${baseUrl}/software-gestionale-edilizia`,
        "breadcrumb": {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
            { "@type": "ListItem", "position": 2, "name": "Software per Città", "item": `${baseUrl}/software-gestionale-edilizia` },
          ]
        }
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="py-16 bg-gradient-to-b from-[#FFF7F0] to-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 bg-[#F97415]/10 text-[#F97415] px-4 py-2 rounded-full text-sm font-semibold mb-6">
            <MapPin className="h-4 w-4" />
            Copertura nazionale — 27 città
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[#111111] mb-6 leading-tight">
            Software Gestionale Edilizia<br />
            <span className="text-[#F97415]">nella tua città</span>
          </h1>
          <p className="text-xl text-[#111111]/60 mb-8 max-w-2xl mx-auto">
            Edilizia in Cloud è disponibile in tutta Italia con onboarding locale, supporto in italiano e configurazione personalizzata per il mercato edile della tua provincia.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 bg-[#F97415] text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-[#e8650f] transition-colors"
            >
              Richiedi Demo Gratuita
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              to="/prezzi"
              className="inline-flex items-center gap-2 border-2 border-gray-200 text-[#111111] px-8 py-4 rounded-xl font-bold text-lg hover:border-[#F97415] hover:text-[#F97415] transition-colors"
            >
              Vedi i Prezzi
            </Link>
          </div>
        </div>
      </section>

      {/* Perché locale */}
      <section className="py-12 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center text-[#111111] mb-8">Perché il supporto locale fa la differenza</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                title: "Mercato locale",
                desc: "Ogni provincia ha le sue specificità: prezzi dei materiali, normative regionali, Cassa Edile territoriale. Il nostro team conosce il mercato della tua città.",
              },
              {
                title: "Onboarding personalizzato",
                desc: "Configuriamo il software in base alla tipologia di lavori dominante nella tua area — ristrutturazioni, nuove costruzioni, appalti pubblici locali o subappalti.",
              },
              {
                title: "Supporto in italiano",
                desc: "Telefono, email, WhatsApp. Rispondiamo entro 2 ore in orario lavorativo. Nessun call center estero, nessun bot: persone reali che capiscono l'edilizia.",
              },
            ].map((item) => (
              <div key={item.title} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                <CheckCircle className="h-6 w-6 text-[#F97415] mb-3" />
                <h3 className="font-bold text-[#111111] mb-2">{item.title}</h3>
                <p className="text-sm text-[#111111]/60 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cities grid */}
      <section className="py-16 bg-gray-50 border-t border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center text-[#111111] mb-3">
            Scegli la tua città
          </h2>
          <p className="text-center text-[#111111]/50 mb-10">
            Pagine dedicate con statistiche locali, testimonianze e offerte specifiche per ogni mercato
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CITIES.map((city) => (
              <Link
                key={city.slug}
                to={`/software-gestionale-edilizia-${city.slug}`}
                className="group bg-white rounded-2xl p-5 border border-gray-200 hover:border-[#F97415] hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-[#111111] group-hover:text-[#F97415] transition-colors">
                      {city.name}
                    </h3>
                    <span className="text-xs text-[#111111]/40 font-medium">{city.region}</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-[#F97415] transition-colors mt-1 flex-shrink-0" />
                </div>
                <p className="text-sm text-[#111111]/60 leading-relaxed">{city.desc}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-white">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-[#111111] mb-4">
            Non trovi la tua città?
          </h2>
          <p className="text-lg text-[#111111]/60 mb-8">
            Edilizia in Cloud funziona in tutta Italia. Siamo presenti nelle 22 principali città ma serviamo imprese in ogni provincia. Contattaci e ti mostriamo come il software si adatta al tuo mercato locale.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 bg-[#F97415] text-white px-10 py-4 rounded-xl font-bold text-lg hover:bg-[#e8650f] transition-colors"
          >
            Parla con un Consulente
            <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>

      <LandingFooter />
      <StickyBottomBar />
    </div>
  );
}
