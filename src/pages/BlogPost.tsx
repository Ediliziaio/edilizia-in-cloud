import { useEffect, useState, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Clock, ArrowLeft, ArrowRight, Tag, ChevronRight } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import GaranzieSection from "@/components/landing/GaranzieSection";
import { blogPosts, BlogPost as BlogPostType } from "@/data/blogPosts";
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[àáâä]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                        */
/* ------------------------------------------------------------------ */

function ProgressBar() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const el = document.documentElement;
      const scrolled = el.scrollTop;
      const total = el.scrollHeight - el.clientHeight;
      setProgress(total > 0 ? (scrolled / total) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1 bg-gray-200/50">
      <div
        className="h-full bg-[#F97415] transition-all duration-100 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

interface TableOfContentsProps {
  headings: string[];
}

function TableOfContents({ headings }: TableOfContentsProps) {
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    headings.forEach((h) => {
      const el = document.getElementById(slugifyHeading(h));
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length === 0) return null;

  return (
    <nav className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
      <h3 className="text-xs font-bold text-[#111111] uppercase tracking-widest mb-4">
        Indice dell&apos;articolo
      </h3>
      <ul className="space-y-2">
        {headings.map((heading) => {
          const id = slugifyHeading(heading);
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(id)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={`flex items-start gap-2 text-sm transition-colors leading-snug ${
                  active === id
                    ? "text-[#F97415] font-semibold"
                    : "text-gray-500 hover:text-[#111111]"
                }`}
              >
                <ChevronRight
                  size={14}
                  className={`mt-0.5 flex-shrink-0 transition-transform ${
                    active === id ? "text-[#F97415] translate-x-0.5" : ""
                  }`}
                />
                <span>{heading}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

interface RelatedPostCardProps {
  post: BlogPostType;
}

function RelatedPostCard({ post }: RelatedPostCardProps) {
  const colorClass = categoryColors[post.category] ?? "bg-gray-100 text-gray-700";
  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex gap-4 bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors border border-gray-200"
    >
      <img
        src={post.coverImage}
        alt={post.title}
        className="w-20 h-16 object-cover rounded-lg flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span
          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1.5 ${colorClass}`}
        >
          {post.category}
        </span>
        <h4 className="text-sm font-semibold text-[#111111] group-hover:text-[#F97415] transition-colors line-clamp-2 leading-snug">
          {post.title}
        </h4>
        <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
          <Clock size={10} /> {post.readTime} min
        </p>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                        */
/* ------------------------------------------------------------------ */

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = blogPosts.find((p) => p.slug === slug);

  // Always call hooks — conditional rendering happens after
  useSEO(
    post
      ? {
          title: post.title,
          description: post.excerpt,
          canonical: `/blog/${post.slug}`,
          type: "article",
          publishedTime: post.publishedAt,
          modifiedTime: post.updatedAt ?? post.publishedAt,
          keywords: post.tags.join(", "),
          tags: post.tags,
          section: post.category,
        }
      : {
          title: "Articolo non trovato — Blog Edilizia in Cloud",
          description: "L'articolo che cerchi non è stato trovato.",
          canonical: "/blog",
        }
  );

  const articleRef = useRef<HTMLDivElement>(null);

  if (!post) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        <LandingNavbar />
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center py-32">
          <p className="text-6xl font-extrabold text-[#111111]/10 mb-4">404</p>
          <h1 className="text-2xl font-bold text-[#111111] mb-3">
            Articolo non trovato
          </h1>
          <p className="text-gray-500 mb-8">
            L&apos;articolo che stai cercando non esiste o è stato rimosso.
          </p>
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#F97415] text-white font-semibold hover:bg-[#e8650e] transition-colors"
          >
            <ArrowLeft size={16} /> Torna al Blog
          </Link>
        </div>
        <LandingFooter />
      </div>
    );
  }

  const colorClass = categoryColors[post.category] ?? "bg-gray-100 text-gray-700";

  const sectionHeadings = post.content
    .filter((c) => c.type === "section" || c.type === "list")
    .map((c) => c.heading!)
    .filter(Boolean);

  const relatedPosts = blogPosts
    .filter((p) => p.slug !== post.slug && p.category === post.category)
    .slice(0, 2);

  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `https://ediliziaincloud.com/blog/${post.slug}`,
    headline: post.title,
    description: post.excerpt,
    image: {
      "@type": "ImageObject",
      url: post.coverImage,
      width: 1200,
      height: 630,
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    keywords: post.tags.join(", "),
    articleSection: post.category,
    inLanguage: "it",
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://ediliziaincloud.com/blog/${post.slug}` },
    isPartOf: { "@id": "https://ediliziaincloud.com/blog" },
    author: {
      "@type": "Person",
      "@id": "https://ediliziaincloud.com/#author-flo",
      name: post.author.name,
      jobTitle: post.author.role,
      url: "https://ediliziaincloud.com/chi-siamo",
      sameAs: ["https://www.linkedin.com/company/edilizia-in-cloud"],
      worksFor: { "@id": "https://ediliziaincloud.com/#organization" },
    },
    publisher: { "@id": "https://ediliziaincloud.com/#organization" },
    timeRequired: `PT${post.readTime}M`,
    wordCount: post.readTime * 200,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "h2", ".article-intro"],
    },
  };

  // Generate HowTo schema for how-to style posts (slug starts with "come-" or "sal-")
  const isHowTo = /^(come-|sal-|durc-|giornale-)/.test(post.slug);
  const listBlocks = post.content.filter((c) => c.type === "list" && c.items && c.items.length > 0);
  const howToSteps = listBlocks.flatMap((block) =>
    (block.items ?? []).map((item, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: item.split(":")[0].replace(/^\d+\.\s*/, "").trim(),
      text: item,
    }))
  );
  const howToData =
    isHowTo && howToSteps.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "HowTo",
          name: post.title,
          description: post.excerpt,
          image: { "@type": "ImageObject", url: post.coverImage, width: 1200, height: 630 },
          estimatedCost: { "@type": "MonetaryAmount", currency: "EUR", value: "0" },
          totalTime: `PT${post.readTime}M`,
          step: howToSteps,
        }
      : null;

  return (
    <div className="min-h-screen bg-white">
      <ProgressBar />
      <LandingNavbar />
      <JsonLd data={jsonLdData} />
      {howToData && <JsonLd id={`jsonld-howto-${post.slug}`} data={howToData} />}
      <JsonLd id="jsonld-breadcrumb-post" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://ediliziaincloud.com/blog" },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": `https://ediliziaincloud.com/blog/${post.slug}` }
        ]
      }} />

      {/* Hero with cover image */}
      <div className="relative w-full" style={{ maxHeight: 480, overflow: "hidden" }}>
        <img
          src={post.coverImage}
          alt={post.title}
          width={1200}
          height={630}
          fetchPriority="high"
          loading="eager"
          decoding="async"
          className="w-full object-cover"
          style={{ maxHeight: 480, minHeight: 320, width: "100%", objectFit: "cover" }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/90 via-[#0a0a0a]/40 to-transparent" />
        {/* Hero content */}
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-5xl mx-auto px-6 pb-10 w-full">
            <Link
              to="/blog"
              className="inline-flex items-center gap-2 text-white/70 hover:text-white text-sm mb-4 transition-colors"
            >
              <ArrowLeft size={14} /> Blog
            </Link>
            <div className="flex items-center gap-3 mb-4">
              <span
                className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${colorClass}`}
              >
                {post.category}
              </span>
              <span className="text-white/60 text-sm flex items-center gap-1">
                <Clock size={13} /> {post.readTime} min di lettura
              </span>
            </div>
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white leading-tight max-w-3xl">
              {post.title}
            </h1>
            <div className="mt-4 flex items-center gap-3 text-sm text-white/60">
              {post.author.avatar && (
                <img src={post.author.avatar} alt={post.author.name} className="w-8 h-8 rounded-full object-cover border border-white/30" />
              )}
              <span className="font-medium text-white/80">{post.author.name}</span>
              <span>·</span>
              <span>{post.author.role}</span>
              <span>·</span>
              <span>{formatDate(post.publishedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Article body + sidebar */}
      <div className="max-w-6xl mx-auto px-6 py-14">
        <div className="flex gap-12 items-start">
          {/* Main article content */}
          <article
            ref={articleRef}
            className="flex-1 min-w-0 max-w-3xl"
          >
            {post.content.map((section, i) => {
              switch (section.type) {
                case "intro":
                  return (
                    <p
                      key={i}
                      className="text-xl text-gray-700 leading-relaxed mb-10 font-light border-l-4 border-[#F97415] pl-6"
                    >
                      {section.body}
                    </p>
                  );

                case "section": {
                  const id = section.heading ? slugifyHeading(section.heading) : undefined;
                  return (
                    <div key={i} className="mb-10">
                      {section.heading && (
                        <h2
                          id={id}
                          className="text-2xl font-bold text-[#111111] mt-10 mb-4 scroll-mt-28"
                        >
                          {section.heading}
                        </h2>
                      )}
                      {section.body && (
                        <p className="text-gray-600 leading-relaxed text-[1.05rem]">
                          {section.body}
                        </p>
                      )}
                    </div>
                  );
                }

                case "quote":
                  return (
                    <blockquote
                      key={i}
                      className="my-10 pl-6 border-l-4 border-[#F97415] bg-gray-50 rounded-r-xl py-5 pr-6"
                    >
                      <p className="text-gray-700 italic text-lg leading-relaxed mb-3">
                        &ldquo;{section.quote}&rdquo;
                      </p>
                      {section.author && (
                        <footer className="text-sm font-semibold text-[#111111]">
                          — {section.author}
                        </footer>
                      )}
                    </blockquote>
                  );

                case "list": {
                  const id = section.heading ? slugifyHeading(section.heading) : undefined;
                  return (
                    <div key={i} className="mb-10">
                      {section.heading && (
                        <h2
                          id={id}
                          className="text-2xl font-bold text-[#111111] mt-10 mb-4 scroll-mt-28"
                        >
                          {section.heading}
                        </h2>
                      )}
                      {section.items && (
                        <ul className="space-y-3">
                          {section.items.map((item, j) => (
                            <li key={j} className="flex items-start gap-3">
                              <span className="text-[#F97415] font-bold text-lg mt-0.5 flex-shrink-0">
                                ✓
                              </span>
                              <span className="text-gray-600 leading-relaxed">
                                {item}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                }

                case "cta":
                  return (
                    <div
                      key={i}
                      className="my-12 bg-gradient-to-br from-[#F97415] to-[#e8650e] rounded-2xl p-8 text-white text-center"
                    >
                      {section.heading && (
                        <h3 className="text-xl font-bold mb-3">{section.heading}</h3>
                      )}
                      {section.body && (
                        <p className="text-white/85 mb-6 leading-relaxed">{section.body}</p>
                      )}
                      <Link
                        to="/demo"
                        className="inline-flex items-center gap-2 px-7 py-3 bg-white text-[#F97415] font-bold rounded-full hover:bg-white/90 transition-colors shadow-lg"
                      >
                        Prova Edilizia in Cloud <ArrowRight size={16} />
                      </Link>
                    </div>
                  );

                default:
                  return null;
              }
            })}

            {/* Tags */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1 text-sm font-semibold text-gray-500">
                  <Tag size={14} /> Tag:
                </span>
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-[#F97415]/10 hover:text-[#F97415] transition-colors cursor-default"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Author card */}
            <div className="mt-10 bg-[#111111]/5 rounded-2xl p-6 flex items-start gap-5">
              {post.author.avatar ? (
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  className="w-14 h-14 rounded-full object-cover flex-shrink-0 border-2 border-[#F97415]/30"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-[#F97415]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[#F97415] font-bold text-xl">
                    {post.author.name.charAt(0)}
                  </span>
                </div>
              )}
              <div>
                <p className="font-bold text-[#111111]">{post.author.name}</p>
                <p className="text-sm text-gray-500 mb-2">{post.author.role}</p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Esperto di gestione aziendale per imprese edili italiane. Fondatore di Edilizia in Cloud, la piattaforma gestionale dedicata al settore delle costruzioni.
                </p>
              </div>
            </div>

            {/* Garanzie inline article */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <GaranzieSection variant="compact" />
            </div>
          </article>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-6 w-72 flex-shrink-0 sticky top-28">
            {/* Table of Contents */}
            <TableOfContents headings={sectionHeadings} />

            {/* CTA Card */}
            <div className="bg-[#111111] rounded-2xl p-6 text-white">
              <h3 className="font-bold text-base mb-2 leading-snug">
                Prova Edilizia in Cloud Gratis
              </h3>
              <p className="text-white/60 text-sm mb-5 leading-relaxed">
                31 giorni di prova gratuita. Nessuna carta di credito. Onboarding 1:1 incluso.
              </p>
              <Link
                to="/demo"
                className="block text-center px-5 py-2.5 rounded-full bg-[#F97415] text-white font-bold text-sm hover:bg-[#e8650e] transition-colors"
              >
                Richiedi Demo
              </Link>
            </div>

            {/* Related posts in sidebar */}
            {relatedPosts.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-[#111111] uppercase tracking-widest mb-4">
                  Articoli correlati
                </h3>
                <div className="flex flex-col gap-3">
                  {relatedPosts.map((rp) => (
                    <RelatedPostCard key={rp.id} post={rp} />
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>

        {/* Related posts grid (mobile + bottom) */}
        {relatedPosts.length > 0 && (
          <div className="mt-16 pt-12 border-t border-gray-200">
            <h2 className="text-2xl font-bold text-[#111111] mb-8">
              Articoli correlati
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              {relatedPosts.map((rp) => {
                const relColor = categoryColors[rp.category] ?? "bg-gray-100 text-gray-700";
                return (
                  <Link
                    key={rp.id}
                    to={`/blog/${rp.slug}`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 flex flex-col"
                  >
                    <div className="relative overflow-hidden">
                      <img
                        src={rp.coverImage}
                        alt={rp.title}
                        width={1200}
                        height={630}
                        loading="lazy"
                        decoding="async"
                        className="w-full aspect-video object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute top-3 left-3">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${relColor}`}
                        >
                          {rp.category}
                        </span>
                      </div>
                    </div>
                    <div className="p-5 flex flex-col flex-1">
                      <h3 className="text-base font-bold text-[#111111] mb-2 group-hover:text-[#F97415] transition-colors line-clamp-2 leading-snug">
                        {rp.title}
                      </h3>
                      <p className="text-gray-500 text-sm leading-relaxed line-clamp-2 flex-1 mb-4">
                        {rp.excerpt}
                      </p>
                      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={11} /> {rp.readTime} min
                        </span>
                        <span className="flex items-center gap-1 text-[#F97415] font-semibold text-xs group-hover:gap-2 transition-all">
                          Leggi <ArrowRight size={12} />
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <LandingFooter />
    </div>
  );
}
