import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Clock, Search, ArrowRight } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts, categories, BlogPost } from "@/data/blogPosts";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";

const categoryColors: Record<string, string> = {
  "Gestione Cantieri": "bg-blue-100 text-blue-700",
  "Finanza": "bg-emerald-100 text-emerald-700",
  "HR & Personale": "bg-purple-100 text-purple-700",
  "Marketing": "bg-orange-100 text-orange-700",
  "Commerciale": "bg-rose-100 text-rose-700",
  "Digitalizzazione": "bg-slate-100 text-slate-700",
};

// Map categoria → slug per le pagine dedicate (SEO category pages)
const categoryToSlug: Record<string, string> = {
  "Gestione Cantieri": "gestione-cantieri",
  "Finanza": "finanza-edilizia",
  "HR & Personale": "hr-personale",
  "Marketing": "marketing-edilizia",
  "Commerciale": "commerciale-edilizia",
  "Digitalizzazione": "digitalizzazione-edilizia",
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface PostCardProps {
  post: BlogPost;
  featured?: boolean;
}

function PostCard({ post, featured = false }: PostCardProps) {
  const colorClass = categoryColors[post.category] ?? "bg-gray-100 text-gray-700";

  if (featured) {
    return (
      <Link
        to={`/blog/${post.slug}`}
        className="group col-span-full grid md:grid-cols-2 bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100"
      >
        <div className="relative overflow-hidden">
          <img
            src={post.coverImage}
            alt={post.title}
            width={1200}
            height={630}
            loading="eager"
            decoding="async"
            className="w-full h-72 md:h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        </div>
        <div className="p-8 md:p-10 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-4">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${colorClass}`}
            >
              {post.category}
            </span>
            <span className="text-xs text-gray-400 uppercase tracking-wider font-medium">
              In evidenza
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-[#111111] mb-4 group-hover:text-[#F97415] transition-colors leading-tight">
            {post.title}
          </h2>
          <p className="text-gray-500 leading-relaxed mb-6 line-clamp-3">
            {post.excerpt}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm text-gray-400">
              <span>{post.author.name}</span>
              <span>·</span>
              <span>{formatDate(post.publishedAt)}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock size={13} />
                {post.readTime} min
              </span>
            </div>
            <span className="flex items-center gap-1 text-[#F97415] font-semibold text-sm group-hover:gap-2 transition-all">
              Leggi <ArrowRight size={15} />
            </span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 flex flex-col"
    >
      <div className="relative overflow-hidden">
        <img
          src={post.coverImage}
          alt={post.title}
          width={1200}
          height={630}
          loading="lazy"
          decoding="async"
          className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-3 left-3">
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${colorClass}`}
          >
            {post.category}
          </span>
        </div>
      </div>
      <div className="p-6 flex flex-col flex-1">
        <h3 className="text-lg font-bold text-[#111111] mb-3 group-hover:text-[#F97415] transition-colors leading-snug line-clamp-2">
          {post.title}
        </h3>
        <p className="text-gray-500 text-sm leading-relaxed mb-4 line-clamp-2 flex-1">
          {post.excerpt}
        </p>
        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{formatDate(post.publishedAt)}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {post.readTime} min
            </span>
          </div>
          <span className="flex items-center gap-1 text-[#F97415] font-semibold text-xs group-hover:gap-2 transition-all">
            Leggi <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  );
}

export default function Blog() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeCategory, setActiveCategory] = useState<string>("Tutti");
  const [searchQuery, setSearchQuery] = useState<string>(
    () => searchParams.get("q") ?? ""
  );

  // Pagine di ricerca (?q=...) non devono essere indicizzate (thin/duplicate content)
  useSEO({
    title: "Blog Edilizia — Guide, Strategie e AI per Imprese Edili | Edilizia in Cloud",
    description: "Articoli pratici per imprenditori edili: come aumentare i margini, gestire cantieri con l'AI, digitalizzare l'impresa edile e far crescere il business costruzioni.",
    canonical: "/blog",
    keywords: "blog edilizia, guide impresa edile, strategia impresa costruzioni, digitalizzazione edilizia, AI edilizia articoli, gestione cantieri guide, margini edilizia, marketing impresa edile blog",
    noindex: searchQuery.trim().length > 0,
  });

  // Keep URL ?q= param in sync with the search box (shareable/bookmarkable URLs)
  useEffect(() => {
    const params: Record<string, string> = {};
    if (searchQuery.trim()) params.q = searchQuery.trim();
    setSearchParams(params, { replace: true });
  }, [searchQuery, setSearchParams]);

  const filteredPosts = useMemo(() => {
    let posts = [...blogPosts].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    if (activeCategory !== "Tutti") {
      posts = posts.filter((p) => p.category === activeCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.excerpt.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return posts;
  }, [activeCategory, searchQuery]);

  const [featured, ...rest] = filteredPosts;

  return (
    <div className="min-h-screen bg-gray-50">
      <JsonLd id="jsonld-breadcrumb-blog" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Blog Edilizia", "item": "https://ediliziaincloud.com/blog" }
        ]
      }} />
      <JsonLd id="jsonld-blog-collection" data={{
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": "https://ediliziaincloud.com/blog",
        "name": "Blog Edilizia in Cloud",
        "description": "Guide e strategie per imprenditori edili: gestione cantieri, AI, margini, digitalizzazione",
        "url": "https://ediliziaincloud.com/blog",
        "inLanguage": "it",
        "publisher": {
          "@type": "Organization",
          "@id": "https://ediliziaincloud.com/#organization",
          "name": "Edilizia in Cloud"
        }
      }} />
      <JsonLd id="jsonld-blog-itemlist" data={{
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": "Articoli recenti — Blog Edilizia in Cloud",
        "url": "https://ediliziaincloud.com/blog",
        "numberOfItems": blogPosts.length,
        "itemListElement": blogPosts.slice(0, 8).map((post, i) => ({
          "@type": "ListItem",
          "position": i + 1,
          "url": `https://ediliziaincloud.com/blog/${post.slug}`,
          "name": post.title,
          "item": {
            "@type": "Article",
            "name": post.title,
            "description": post.excerpt,
            "url": `https://ediliziaincloud.com/blog/${post.slug}`,
            "image": post.coverImage,
            "datePublished": post.publishedAt,
          }
        }))
      }} />
      <LandingNavbar />

      {/* Hero */}
      <section className="bg-[#111111] pt-36 pb-20">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-[#F97415] font-semibold text-sm uppercase tracking-widest mb-4">
            Edilizia in Cloud Blog
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white mb-6 leading-tight">
            Insights per{" "}
            <span className="text-[#F97415]">Imprenditori Edili</span>
          </h1>
          <p className="text-white/60 text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Guide pratiche, strategie testate e analisi di settore per far crescere
            la tua impresa edile nell'era digitale.
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Cerca articoli, temi, tag…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-5 py-4 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#F97415]/60 focus:bg-white/15 transition-all"
            />
          </div>
        </div>
      </section>

      {/* Category Filters */}
      <section className="sticky top-16 z-30 bg-white/90 backdrop-blur-md border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
            {["Tutti", ...categories].map((cat) => {
              const catSlug = categoryToSlug[cat];
              // "Tutti" stays on /blog; categories navigate to their dedicated SEO page
              if (cat === "Tutti") {
                return (
                  <button
                    key="Tutti"
                    onClick={() => { setActiveCategory("Tutti"); setSearchQuery(""); }}
                    className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 flex-shrink-0 ${
                      activeCategory === "Tutti" && !searchQuery
                        ? "bg-[#F97415] text-white shadow-md shadow-[#F97415]/30"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    Tutti
                  </button>
                );
              }
              return (
                <Link
                  key={cat}
                  to={catSlug ? `/blog/categoria/${catSlug}` : "/blog"}
                  className="whitespace-nowrap px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-600 hover:bg-[#F97415] hover:text-white transition-all duration-200 flex-shrink-0"
                >
                  {cat}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Posts Grid */}
      <main className="max-w-6xl mx-auto px-6 py-14">
        {filteredPosts.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-gray-400 text-lg">
              Nessun articolo trovato per "{searchQuery}".
            </p>
            <button
              onClick={() => {
                setSearchQuery("");
                setActiveCategory("Tutti");
              }}
              className="mt-4 text-[#F97415] font-medium hover:underline"
            >
              Mostra tutti gli articoli
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Featured post full-width */}
            {featured && <PostCard post={featured} featured />}
            {/* Rest of posts */}
            {rest.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </main>

      {/* Newsletter CTA banner */}
      <section className="bg-[#111111] py-16">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">
            Vuoi ricevere i nuovi articoli?
          </h2>
          <p className="text-white/60 mb-8">
            Iscriviti alla newsletter di Edilizia in Cloud e ricevi ogni settimana
            guide pratiche per far crescere la tua impresa.
          </p>
          <Link
            to="/demo"
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
