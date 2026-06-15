import { useMemo } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Clock } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts } from "@/data/blogPosts";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";

// ── Slug → categoria mapping ─────────────────────────────────────────────────
type CategoryMeta = {
  category: string;   // valore esatto nel blogPost.category
  title: string;
  description: string;
  h1: string;
  tagline: string;
};

const CATEGORY_MAP: Record<string, CategoryMeta> = {
  "gestione-cantieri": {
    category: "Gestione Cantieri",
    title: "Gestione Cantieri Edili — Guide e Strategie Operative",
    description: "Guide pratiche per gestire cantieri edili con il digitale: avanzamento lavori, costi in tempo reale, comunicazione squadre e margini per commessa.",
    h1: "Gestione Cantieri",
    tagline: "Strategie operative per controllare ogni cantiere in tempo reale",
  },
  "finanza-edilizia": {
    category: "Finanza",
    title: "Finanza Impresa Edile — Margini, Liquidità e Costi",
    description: "Come migliorare i margini, prevedere la liquidità ed eliminare i costi nascosti nell'impresa edile. Analisi, strumenti e casi reali.",
    h1: "Finanza per Imprese Edili",
    tagline: "Controllo margini, liquidità e redditività per ogni commessa",
  },
  "hr-personale": {
    category: "HR & Personale",
    title: "HR e Personale Edilizia — Presenze, Squadre e Buste Paga",
    description: "Gestione del personale nei cantieri: presenze, timbrature, buste paga, contratti edili CCNL. Guide per HR manager e titolari di impresa edile.",
    h1: "HR e Personale in Edilizia",
    tagline: "Presenze, paghe e gestione squadre cantiere senza fogli Excel",
  },
  "marketing-edilizia": {
    category: "Marketing",
    title: "Marketing per Imprese Edili",
    description: "Strategie di marketing per imprese edili: acquisire nuovi clienti, usare il CRM, fare campagne WhatsApp e aumentare il fatturato.",
    h1: "Marketing per Imprese Edili",
    tagline: "Acquisisci più clienti e fidelizza quelli esistenti con il digitale",
  },
  "commerciale-edilizia": {
    category: "Commerciale",
    title: "Commerciale Edilizia — Preventivi, Offerte e CRM",
    description: "Come migliorare il processo commerciale in edilizia: preventivi precisi, gestione offerte, follow-up clienti e conversione dei preventivi in commesse.",
    h1: "Commerciale in Edilizia",
    tagline: "Preventivi precisi, più conversioni e pipeline commerciale sotto controllo",
  },
  "digitalizzazione-edilizia": {
    category: "Digitalizzazione",
    title: "Digitalizzazione Impresa Edile — Software, AI e Processi",
    description: "Come digitalizzare un'impresa edile: software gestionale, intelligenza artificiale, automazione dei processi e transizione digitale per il settore costruzioni.",
    h1: "Digitalizzazione dell'Impresa Edile",
    tagline: "Software, AI e processi digitali per il settore costruzioni",
  },
  "normativa-edilizia": {
    category: "Normativa",
    title: "Normativa Edilizia — DURC, Sicurezza, Appalti e Bonus",
    description: "Guide pratiche sulla normativa per imprese edili: DURC, CCNL, sicurezza D.Lgs 81, attestazione SOA, Codice Appalti, patente a crediti, Superbonus e PNRR.",
    h1: "Normativa per Imprese Edili",
    tagline: "DURC, sicurezza, appalti e bonus: la burocrazia spiegata semplice",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const categoryColors: Record<string, string> = {
  "Gestione Cantieri": "bg-blue-100 text-blue-700",
  "Finanza": "bg-emerald-100 text-emerald-700",
  "HR & Personale": "bg-purple-100 text-purple-700",
  "Marketing": "bg-orange-100 text-orange-700",
  "Commerciale": "bg-rose-100 text-rose-700",
  "Digitalizzazione": "bg-slate-100 text-slate-700",
  "Normativa": "bg-amber-100 text-amber-800",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" });
}

// ── Page component ────────────────────────────────────────────────────────────
export default function BlogCategory() {
  const { slug } = useParams<{ slug: string }>();
  const meta = slug ? CATEGORY_MAP[slug] : undefined;

  const posts = useMemo(
    () =>
      meta
        ? blogPosts
            .filter((p) => p.category === meta.category)
            .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
        : [],
    [meta]
  );

  useSEO({
    title: meta?.title ?? "Blog",
    description: meta?.description ?? "",
    canonical: slug ? `/blog/categoria/${slug}` : "/blog",
    keywords: meta ? `${meta.category.toLowerCase()} edilizia, guide ${meta.category.toLowerCase()}, articoli ${meta.category.toLowerCase()} impresa edile` : "",
  });

  // Redirect to blog if slug unknown (DOPO i hooks)
  if (!meta) return <Navigate to="/blog/" replace />;

  const colorClass = categoryColors[meta.category] ?? "bg-gray-100 text-gray-700";
  const [featured, ...rest] = posts;

  const baseUrl = "https://www.ediliziaincloud.com";
  const pageUrl = `${baseUrl}/blog/categoria/${slug}`;

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Structured Data */}
      <JsonLd id="jsonld-breadcrumb-blog-cat" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": `${baseUrl}/` },
          { "@type": "ListItem", "position": 2, "name": "Blog Edilizia", "item": `${baseUrl}/blog` },
          { "@type": "ListItem", "position": 3, "name": meta.h1, "item": pageUrl },
        ]
      }} />
      <JsonLd id="jsonld-blog-category-collection" data={{
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": pageUrl,
        "name": meta.h1,
        "description": meta.description,
        "url": pageUrl,
        "inLanguage": "it",
        "isPartOf": { "@id": `${baseUrl}/blog` },
        "publisher": { "@id": `${baseUrl}/#organization` },
        "mainEntity": {
          "@type": "ItemList",
          "name": `Articoli su ${meta.h1}`,
          "numberOfItems": posts.length,
          "itemListElement": posts.map((p, i) => ({
            "@type": "ListItem",
            "position": i + 1,
            "url": `${baseUrl}/blog/${p.slug}`,
            "name": p.title,
          })),
        },
      }} />

      <LandingNavbar />

      {/* Hero */}
      <section className="bg-[#111111] pt-36 pb-20">
        <div className="max-w-6xl mx-auto px-6">
          {/* Back link */}
          <Link
            to="/blog/"
            className="inline-flex items-center gap-2 text-white/50 hover:text-white text-sm mb-8 transition-colors"
          >
            <ArrowLeft size={14} /> Tutti gli articoli
          </Link>

          <div className="flex items-center gap-3 mb-4">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colorClass}`}>
              {meta.category}
            </span>
            <span className="text-white/40 text-sm">{posts.length} articoli</span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            {meta.h1}
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl leading-relaxed">
            {meta.tagline}
          </p>
        </div>
      </section>

      {/* Other categories nav */}
      <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            <Link
              to="/blog/"
              className="whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-all flex-shrink-0"
            >
              Tutti
            </Link>
            {Object.entries(CATEGORY_MAP).map(([catSlug, catMeta]) => (
              <Link
                key={catSlug}
                to={`/blog/categoria/${catSlug}`}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex-shrink-0 ${
                  catSlug === slug
                    ? "bg-[#F97415] text-white shadow-md shadow-[#F97415]/30"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {catMeta.category}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <main className="max-w-6xl mx-auto px-6 py-14">
        {posts.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">Nessun articolo in questa categoria.</p>
            <Link to="/blog/" className="mt-4 inline-block text-[#F97415] font-medium hover:underline">
              Vai al blog
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Featured post full-width */}
            {featured && (
              <Link
                to={`/blog/${featured.slug}/`}
                className="md:col-span-2 lg:col-span-3 group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col md:flex-row"
              >
                <div className="md:w-1/2 relative overflow-hidden">
                  <img
                    src={featured.coverImage}
                    alt={featured.title}
                    width={1200}
                    height={630}
                    loading="eager"
                    decoding="async"
                    className="w-full h-56 md:h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="md:w-1/2 p-8 flex flex-col justify-center">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${colorClass}`}>
                      {featured.category}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400 text-xs">
                      <Clock size={12} /> {featured.readTime} min
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-[#111111] mb-3 group-hover:text-[#F97415] transition-colors leading-snug">
                    {featured.title}
                  </h2>
                  <p className="text-gray-500 text-sm leading-relaxed mb-6 line-clamp-3">
                    {featured.excerpt}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">{formatDate(featured.publishedAt)}</span>
                    <span className="flex items-center gap-1 text-[#F97415] font-semibold text-xs group-hover:gap-2 transition-all">
                      Leggi <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </Link>
            )}

            {/* Remaining posts */}
            {rest.map((post) => (
              <Link
                key={post.id}
                to={`/blog/${post.slug}/`}
                className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-100 flex flex-col"
              >
                <div className="relative overflow-hidden">
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    width={1200}
                    height={630}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-6 flex flex-col flex-1">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${colorClass}`}>
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-gray-400 text-xs">
                      <Clock size={11} /> {post.readTime} min
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[#111111] mb-2 group-hover:text-[#F97415] transition-colors leading-snug line-clamp-2 flex-1">
                    {post.title}
                  </h2>
                  <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between mt-auto">
                    <span className="text-xs text-gray-400">{formatDate(post.publishedAt)}</span>
                    <span className="flex items-center gap-1 text-[#F97415] font-semibold text-xs group-hover:gap-2 transition-all">
                      Leggi <ArrowRight size={13} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* CTA */}
      <section className="bg-[#111111] py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Vuoi vedere come funziona in pratica?
          </h2>
          <p className="text-white/60 mb-8">
            Prenota una demo gratuita e ti mostriamo come Edilizia in Cloud
            risolve i problemi di {meta.category.toLowerCase()} nella tua impresa.
          </p>
          <Link
            to="/demo/"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#F97415] text-white font-bold hover:bg-[#e8650e] hover:scale-105 transition-all duration-200 shadow-lg shadow-[#F97415]/30"
          >
            Richiedi una Demo Gratuita <ArrowRight size={18} />
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
