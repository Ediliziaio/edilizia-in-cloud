import { useEffect, useState, useRef } from "react";
import { prioritaCaricamento } from "@/lib/immagini/prioritaCaricamento";
import { useParams, Link } from "react-router-dom";
import { Clock, ArrowLeft, ArrowRight, Tag, ChevronRight } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { blogPosts, BlogPost as BlogPostType } from "@/data/blogPosts";
import { useSEO, SITE_URL } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { linkifyNormative } from "@/lib/blog/normativeLinks";
import { linkifyInternal } from "@/lib/blog/internalLinks";
import { BlogCover } from "@/components/blog/BlogCover";

// Strumenti collegati: ogni articolo manda ai tre moduli della sua categoria.
// L'auto-link (linkifyInternal) scatta solo su 13 frasi esatte e una volta per
// pagina: su 90 articoli produceva 9 link verso le pagine prodotto. Questo
// blocco è deterministico e finisce anche nel prerender servito ai bot.
const STRUMENTI_PER_CATEGORIA: Record<string, Array<{ href: string; label: string; desc: string }>> = {
  "Gestione Cantieri": [
    { href: "/funzionalita/gestione-cantieri/", label: "Gestione cantieri", desc: "Avanzamento lavori, SAL e varianti per ogni commessa." },
    { href: "/funzionalita/giornale-lavori/", label: "Giornale dei lavori", desc: "Compilato dal telefono, con foto e firma." },
    { href: "/funzionalita/app-cantiere-mobile/", label: "App cantiere", desc: "Funziona anche senza rete, sincronizza dopo." },
  ],
  Finanza: [
    { href: "/funzionalita/margini-cantiere/", label: "Margini per commessa", desc: "Preventivo contro consuntivo, in tempo reale." },
    { href: "/funzionalita/tesoreria/", label: "Tesoreria", desc: "La cassa dei prossimi 90 giorni, cantiere per cantiere." },
    { href: "/funzionalita/fatturazione-elettronica/", label: "Fatturazione elettronica", desc: "SDI, reverse charge e note di credito senza errori." },
  ],
  "HR & Personale": [
    { href: "/funzionalita/timbrature-gps/", label: "Timbrature GPS", desc: "Presenze per cantiere, senza fogli da ricopiare." },
    { href: "/funzionalita/hr-personale/", label: "HR e Cassa Edile", desc: "CCNL, ferie, permessi e MUT pronti." },
    { href: "/funzionalita/cedolini-paga/", label: "Cedolini paga", desc: "Ore, straordinari e trasferte già in busta." },
  ],
  Marketing: [
    { href: "/funzionalita/crm-edilizia/", label: "CRM per imprese edili", desc: "Ogni richiesta seguita fino al preventivo." },
    { href: "/funzionalita/whatsapp-marketing/", label: "WhatsApp marketing", desc: "Promemoria e follow-up dove il cliente risponde." },
    { href: "/funzionalita/lead-form-facebook/", label: "Lead da Facebook e Instagram", desc: "Le richieste entrano da sole nel CRM." },
  ],
  Commerciale: [
    { href: "/funzionalita/preventivi-edilizia/", label: "Preventivi e computi", desc: "Voci da prezzario, margine visibile, PDF in 5 minuti." },
    { href: "/funzionalita/pipeline-vendite/", label: "Pipeline vendite", desc: "Sai sempre quali preventivi stanno per chiudersi." },
    { href: "/funzionalita/firma-elettronica/", label: "Firma elettronica", desc: "Il cliente firma dal telefono, il lavoro parte." },
  ],
  Digitalizzazione: [
    { href: "/funzionalita/agenti-ai/", label: "Silvio, l'assistente AI", desc: "Legge i numeri dell'azienda e ti dice dove guardare." },
    { href: "/funzionalita/cruscotto-aziendale/", label: "Cruscotto aziendale", desc: "Cantieri, cassa e margini in una schermata." },
    { href: "/funzionalita/automazioni/", label: "Automazioni", desc: "Solleciti, promemoria e passaggi di stato da soli." },
  ],
  Normativa: [
    { href: "/funzionalita/gestione-subappalti/", label: "Subappalti e DURC", desc: "Scadenze DURC, POS e polizze controllate in automatico." },
    { href: "/funzionalita/sicurezza-cantiere/", label: "Sicurezza cantiere", desc: "Documenti obbligatori sempre a portata di mano." },
    { href: "/funzionalita/ritenute-garanzia/", label: "Ritenute di garanzia", desc: "Trattenute e svincoli tracciati per ogni appalto." },
  ],
};

/**
 * Domini del nostro stesso gruppo: i link verso questi NON prendono nofollow.
 * Mettere in nofollow una proprieta' nostra significa spendere un link e non
 * passarne il valore. Aggiungere qui i brand nuovi, senza "www.".
 */
const OWN_BRAND_HOSTS = [
  "numerinedilizia.com",
  "aedix.it",
  "edilizia.io",
  "guidaedile.it",
  "guidaserramenti.it",
  "imprenditoredile.it",
  "clientiedili.com",
  "marketingedile.com",
  "venditaedile.it",
  "florinandriciuc.com",
];

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
      to={`/blog/${post.slug}/`}
      className="group flex gap-4 bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors border border-gray-200"
    >
      <BlogCover
        src={post.coverImage}
        alt={post.title}
        sizes="80px"
        width={80}
        height={64}
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

  // og:image / JSON-LD richiedono URL assoluti (i crawler social scartano i path relativi).
  const coverImageAbs = post
    ? (post.coverImage.startsWith("http") ? post.coverImage : `${SITE_URL}${post.coverImage}`)
    : undefined;

  // Always call hooks — conditional rendering happens after
  useSEO(
    post
      ? {
          title: post.title,
          description: post.excerpt,
          canonical: `/blog/${post.slug}/`,
          ogImage: coverImageAbs,
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
            to="/blog/"
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
    .filter((c) => c.type === "section" || c.type === "list" || c.type === "table" || c.type === "callout")
    .map((c) => c.heading!)
    .filter(Boolean);

  const relatedPosts = blogPosts
    .filter((p) => p.slug !== post.slug && p.category === post.category)
    .slice(0, 2);

  const jsonLdData = {
    "@context": "https://schema.org",
    "@type": "Article",
    "@id": `https://www.ediliziaincloud.com/blog/${post.slug}`,
    headline: post.title,
    description: post.excerpt,
    image: {
      "@type": "ImageObject",
      url: coverImageAbs,
      width: 1200,
      height: 630,
    },
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    keywords: post.tags.join(", "),
    articleSection: post.category,
    inLanguage: "it",
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://www.ediliziaincloud.com/blog/${post.slug}` },
    isPartOf: { "@id": "https://www.ediliziaincloud.com/blog" },
    author: {
      "@type": "Person",
      "@id": "https://www.ediliziaincloud.com/#author-flo",
      name: post.author.name,
      jobTitle: post.author.role,
      url: "https://www.ediliziaincloud.com/autore/florin-andriciuc/",
      sameAs: ["https://www.linkedin.com/in/florinandriciuc/", "https://www.linkedin.com/company/edilizia-in-cloud"],
      worksFor: { "@id": "https://www.ediliziaincloud.com/#organization" },
    },
    publisher: { "@id": "https://www.ediliziaincloud.com/#organization" },
    timeRequired: `PT${post.readTime}M`,
    wordCount: post.readTime * 200,
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: ["h1", "h2", ".article-intro"],
    },
  };

  // Generate HowTo schema for how-to style posts
  const isHowTo = /^(come-|sal-|durc-|giornale-|cassa-|computo-|appalti-|bim-|subappalto-|acquisire-|sito-web-|digitalizzazione-|gestione-operai-|sicurezza-|ccnl-|attestazione-|superbonus-|gestione-liquidita-|pnrr-|come-scegliere-|gestione-subappal)/.test(post.slug);
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
          image: { "@type": "ImageObject", url: coverImageAbs, width: 1200, height: 630 },
          estimatedCost: { "@type": "MonetaryAmount", currency: "EUR", value: "0" },
          totalTime: `PT${post.readTime}M`,
          step: howToSteps,
        }
      : null;

  // FAQPage: solo per i post che dichiarano FAQ redazionali (post.faqs).
  const faqData =
    post.faqs && post.faqs.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faqs.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }
      : null;

  // Dedup dei link (normativi + interni) a livello di articolo:
  // prima occorrenza = link, poi testo semplice.
  const seenNorms = new Set<string>();
  const seenInternal = new Set<string>();
  const internalCtx = { seen: seenInternal, currentPath: `/blog/${post.slug}/` };
  const linkify = (text: string | undefined) =>
    linkifyInternal(text, internalCtx, (part) => linkifyNormative(part, seenNorms));

  // Link markdown [testo](url) nei body: esterni = nofollow + nuova tab
  // (siti dei competitor citati nei confronti), interni = <Link>. Il resto
  // del testo passa dall'auto-link interno/normativo come sempre.
  const renderRichText = (text: string) => {
    const parts = text.split(/(\[[^\]]+\]\((?:https?:\/\/|\/)[^\s)]+\))/g);
    return parts.map((part, i) => {
      const m = part.match(/^\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)$/);
      if (!m) return <span key={i}>{linkify(part)}</span>;
      const [, label, url] = m;
      if (url.startsWith("http")) {
        // I nostri stessi brand NON vanno in nofollow: sarebbe buttare via il
        // segnale verso proprieta' nostre. E niente noreferrer, così il sito di
        // destinazione vede da dove arriva il traffico nei suoi analytics.
        // Per tutto il resto (competitor citati nei confronti) resta nofollow.
        const isOwnBrand = OWN_BRAND_HOSTS.some((h) => {
          try {
            const host = new URL(url).hostname.replace(/^www\./, "");
            return host === h || host.endsWith(`.${h}`);
          } catch {
            return false;
          }
        });
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel={isOwnBrand ? "noopener" : "nofollow noopener noreferrer"}
            className="font-medium text-[#F97415] underline underline-offset-2 hover:text-[#d95f0e]"
          >
            {label}
          </a>
        );
      }
      return (
        <Link key={i} to={url} className="font-medium text-[#F97415] underline underline-offset-2 hover:text-[#d95f0e]">
          {label}
        </Link>
      );
    });
  };

  // "\n\n" nei body = paragrafi separati: mai più muri di testo.
  const renderBody = (body: string, cls: string) =>
    body
      .split(/\n\n+/)
      .filter((p) => p.trim().length > 0)
      .map((p, i) => (
        <p key={i} className={cls}>
          {renderRichText(p)}
        </p>
      ));

  return (
    <div className="min-h-screen bg-white">
      <ProgressBar />
      <LandingNavbar />
      <JsonLd data={jsonLdData} />
      {howToData && <JsonLd id={`jsonld-howto-${post.slug}`} data={howToData} />}
      {faqData && <JsonLd id={`jsonld-faq-${post.slug}`} data={faqData} />}
      <JsonLd id="jsonld-breadcrumb-post" data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.ediliziaincloud.com/" },
          { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.ediliziaincloud.com/blog" },
          { "@type": "ListItem", "position": 3, "name": post.title, "item": `https://www.ediliziaincloud.com/blog/${post.slug}` }
        ]
      }} />

      {/* Hero with cover image */}
      <div className="relative w-full" style={{ maxHeight: 480, overflow: "hidden" }}>
        <BlogCover
          src={post.coverImage}
          alt={post.title}
          {...prioritaCaricamento("high")}
          loading="eager"
          sizes="100vw"
          className="w-full object-cover"
          style={{ maxHeight: 480, minHeight: 320, width: "100%", objectFit: "cover" }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a]/90 via-[#0a0a0a]/40 to-transparent" />
        {/* Hero content */}
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-5xl mx-auto px-6 pb-10 w-full">
            <Link
              to="/blog/"
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
                <img width={32} height={32} loading="lazy" src={post.author.avatar} alt={post.author.name} className="w-8 h-8 rounded-full object-cover border border-white/30" />
              )}
              <span className="font-medium text-white/80">{post.author.name}</span>
              <span>·</span>
              <span>{post.author.role}</span>
              <span>·</span>
              <span>{formatDate(post.publishedAt)}</span>
              {/* E-E-A-T: la data di aggiornamento era solo nello schema JSON-LD,
                  invisibile a lettori e AI che citano il testo della pagina. */}
              {post.updatedAt && post.updatedAt !== post.publishedAt && (
                <>
                  <span>·</span>
                  <span className="text-white/80">Aggiornato il {formatDate(post.updatedAt)}</span>
                </>
              )}
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
                    <div
                      key={i}
                      className="mb-10 border-l-4 border-[#F97415] pl-6"
                    >
                      {renderBody(section.body ?? "", "text-xl text-gray-700 leading-relaxed font-light mb-4 last:mb-0")}
                    </div>
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
                      {section.body &&
                        renderBody(section.body, "text-gray-600 leading-relaxed text-[1.05rem] mb-4 last:mb-0")}
                    </div>
                  );
                }

                case "image":
                  return (
                    <figure key={i} className="my-10">
                      <img
                        src={section.src}
                        alt={section.alt ?? ""}
                        loading="lazy"
                        decoding="async"
                        width={1200}
                        height={675}
                        className="w-full h-auto rounded-xl border border-gray-200 shadow-sm bg-gray-50"
                      />
                      {section.caption && (
                        <figcaption className="mt-3 text-sm text-gray-500 text-center italic">
                          {section.caption}
                        </figcaption>
                      )}
                    </figure>
                  );

                case "callout": {
                  const tone =
                    section.variant === "warning"
                      ? { box: "border-amber-300 bg-amber-50", title: "text-amber-900", body: "text-amber-800" }
                      : section.variant === "success"
                        ? { box: "border-emerald-300 bg-emerald-50", title: "text-emerald-900", body: "text-emerald-800" }
                        : { box: "border-[#F97415]/30 bg-[#F97415]/5", title: "text-[#111111]", body: "text-gray-700" };
                  return (
                    <aside key={i} className={`my-10 rounded-xl border-l-4 p-5 ${tone.box}`}>
                      {section.heading && (
                        <p className={`mb-2 text-sm font-black uppercase tracking-wide ${tone.title}`}>
                          {section.heading}
                        </p>
                      )}
                      {section.body && renderBody(section.body, `${tone.body} leading-relaxed mb-3 last:mb-0`)}
                      {section.items && (
                        <ul className="mt-2 space-y-1.5">
                          {section.items.map((item, j) => (
                            <li key={j} className={`flex items-start gap-2 ${tone.body}`}>
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
                              <span>{renderRichText(item)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </aside>
                  );
                }

                case "table": {
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
                      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
                        <table className="w-full text-sm">
                          {section.headers && (
                            <thead>
                              <tr className="bg-[#111111] text-white">
                                {section.headers.map((h, j) => (
                                  <th
                                    key={j}
                                    className={`px-4 py-3 font-semibold ${j === 0 ? "text-left" : "text-center"} ${j > 0 && section.headers![j]?.includes("Edilizia in Cloud") ? "text-[#F97415]" : ""}`}
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                          )}
                          <tbody>
                            {section.rows?.map((row, r) => (
                              <tr key={r} className={r % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                                {row.map((cell, c) => (
                                  <td
                                    key={c}
                                    className={`px-4 py-3 align-top ${c === 0 ? "font-medium text-[#111111] text-left" : "text-gray-600 text-center"}`}
                                  >
                                    {renderRichText(cell)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
                                {linkify(item)}
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
                        to="/demo/"
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

            {/* FAQ redazionali (AEO: risposte estraibili + FAQPage schema) */}
            {post.faqs && post.faqs.length > 0 && (
              <div className="mb-10">
                <h2
                  id="domande-frequenti"
                  className="text-2xl font-bold text-[#111111] mt-10 mb-6 scroll-mt-28"
                >
                  Domande frequenti
                </h2>
                <div className="space-y-6">
                  {post.faqs.map((f, i) => (
                    <div key={i}>
                      <h3 className="text-lg font-semibold text-[#111111] mb-2">{f.q}</h3>
                      <p className="text-gray-600 leading-relaxed text-[1.05rem]">
                        {linkify(f.a)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                <img width={56} height={56} loading="lazy"
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
                <p className="font-bold text-[#111111]">
                  <Link to="/autore/florin-andriciuc/" className="hover:text-[#F97415] transition-colors">{post.author.name}</Link>
                </p>
                <p className="text-sm text-gray-500 mb-2">
                  {post.author.role}
                  {" · "}
                  <a href="https://www.linkedin.com/in/florinandriciuc/" rel="me noopener" target="_blank" className="hover:text-[#F97415]">LinkedIn</a>
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                  Esperto di gestione aziendale per imprese edili italiane. Fondatore di Edilizia in Cloud, la piattaforma gestionale dedicata al settore delle costruzioni.
                </p>
              </div>
            </div>

            {/* Strumenti collegati */}
            {STRUMENTI_PER_CATEGORIA[post.category] && (
              <section className="mt-12 pt-8 border-t border-gray-200" aria-labelledby="strumenti-collegati">
                <h2 id="strumenti-collegati" className="text-xl font-bold text-[#111111] mb-4">
                  Strumenti collegati in Edilizia in Cloud
                </h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  {STRUMENTI_PER_CATEGORIA[post.category].map((s) => (
                    <Link
                      key={s.href}
                      to={s.href}
                      className="block rounded-2xl border border-gray-200 p-4 hover:border-[#F97415]/50 transition-colors"
                    >
                      <span className="block font-semibold text-[#111111] text-sm mb-1">{s.label}</span>
                      <span className="block text-xs text-gray-500 leading-relaxed">{s.desc}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}
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
                31 giorni di prova gratuita. Cancella quando vuoi. Onboarding 1:1 incluso.
              </p>
              <Link
                to="/demo/"
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
                    to={`/blog/${rp.slug}/`}
                    className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 flex flex-col"
                  >
                    <div className="relative overflow-hidden">
                      <BlogCover
                        src={rp.coverImage}
                        alt={rp.title}
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
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
