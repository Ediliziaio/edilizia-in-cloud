import { Link } from "react-router-dom";
import { ArrowRight, Clock } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { blogPosts } from "@/data/blogPosts";
import { FLO_AVATAR } from "@/data/blogAuthor";

// Pagina autore (E-E-A-T, 2026-09-07): ogni articolo del blog firma
// "Florin Andriciuc" ma fino a oggi la firma non portava da nessuna parte e
// lo schema Person non aveva profili collegati. Qui: chi scrive, perché ne
// sa, i profili (sameAs) e l'elenco completo delle guide.

const AUTORE = {
  nome: "Florin Andriciuc",
  ruolo: "Fondatore di Edilizia in Cloud · Imprenditore edile · CEO di AEDIX",
  url: "https://www.ediliziaincloud.com/autore/florin-andriciuc/",
  sameAs: [
    "https://www.linkedin.com/in/florinandriciuc/",
    "https://www.linkedin.com/company/edilizia-in-cloud",
  ],
};

const formatData = (iso: string) =>
  new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export default function AutoreFlorin() {
  useSEO({
    title: "Florin Andriciuc, fondatore di Edilizia in Cloud",
    description:
      "Chi scrive le guide di Edilizia in Cloud: Florin Andriciuc, imprenditore edile e CEO di AEDIX. Tutti gli articoli, dal margine di commessa alla fatturazione.",
    canonical: "/autore/florin-andriciuc",
    keywords: "Florin Andriciuc, Edilizia in Cloud, AEDIX, gestionale edilizia, guide imprese edili",
  });

  const articoli = blogPosts
    .filter((p) => p.author.name === AUTORE.nome)
    .sort((a, b) => (b.updatedAt ?? b.publishedAt).localeCompare(a.updatedAt ?? a.publishedAt));

  const categorie = [...new Set(articoli.map((p) => p.category))];

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <JsonLd
        id="jsonld-autore-florin"
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          url: AUTORE.url,
          name: "Florin Andriciuc, fondatore di Edilizia in Cloud",
          inLanguage: "it",
          mainEntity: {
            "@type": "Person",
            "@id": "https://www.ediliziaincloud.com/#author-flo",
            name: AUTORE.nome,
            jobTitle: "Fondatore",
            description:
              "Imprenditore edile, fondatore di Edilizia in Cloud e CEO di AEDIX. Scrive guide pratiche per titolari di imprese edili italiane su margini di commessa, preventivi, cantiere, fatturazione e normativa.",
            url: AUTORE.url,
            sameAs: AUTORE.sameAs,
            worksFor: { "@id": "https://www.ediliziaincloud.com/#organization" },
            knowsAbout: [
              "gestione cantieri",
              "margini di commessa",
              "preventivi edilizia",
              "fatturazione elettronica edilizia",
              "software gestionale edilizia",
            ],
          },
          breadcrumb: {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Home", item: "https://www.ediliziaincloud.com/" },
              { "@type": "ListItem", position: 2, name: "Blog", item: "https://www.ediliziaincloud.com/blog/" },
              { "@type": "ListItem", position: 3, name: AUTORE.nome, item: AUTORE.url },
            ],
          },
        }}
      />

      <LandingNavbar />

      <section className="pt-32 pb-14 bg-gradient-to-b from-[#FFF7F0] to-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6">
          <nav aria-label="Breadcrumb" className="mb-6 text-sm text-gray-500">
            <Link to="/" className="hover:text-[#F97415]">Home</Link>
            <span className="mx-2">›</span>
            <Link to="/blog/" className="hover:text-[#F97415]">Blog</Link>
            <span className="mx-2">›</span>
            <span className="text-[#111111]">{AUTORE.nome}</span>
          </nav>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <img
              src={FLO_AVATAR}
              alt={AUTORE.nome}
              width={112}
              height={112}
              className="w-28 h-28 rounded-2xl object-cover border border-gray-200 shadow-sm"
            />
            <div>
              <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-2">{AUTORE.nome}</h1>
              <p className="text-[#F97415] font-semibold mb-4">{AUTORE.ruolo}</p>
              <a
                href={AUTORE.sameAs[0]}
                rel="me noopener"
                target="_blank"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#111111] border border-gray-300 rounded-full px-4 py-2 hover:border-[#F97415] hover:text-[#F97415] transition-colors"
              >
                Profilo LinkedIn <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-6 space-y-4 text-[#111111]/75 leading-relaxed">
          <h2 className="text-2xl font-bold text-[#111111]">Chi scrive queste guide</h2>
          <p>
            Edilizia in Cloud è nato dentro un'impresa edile vera, non in un ufficio di software. Florin Andriciuc lo ha
            costruito partendo dai problemi che vedeva ogni settimana: il margine del cantiere che si scopre a fine anno,
            il preventivo rifatto tre volte, le presenze su un foglio, la fattura che non torna con il DDT.
          </p>
          <p>
            Oggi guida AEDIX, il gruppo che oltre a Edilizia in Cloud segue le imprese edili sui numeri, sulla vendita e
            sul marketing. Le guide firmate qui sotto nascono da quel lavoro: casi reali di titolari, capocantiere e
            amministrative, tradotti in procedure che si possono applicare domani mattina.
          </p>
          <p>
            Ogni articolo dichiara la data di pubblicazione e di aggiornamento; le cifre e le norme citate sono verificate
            sulle fonti ufficiali al momento della stesura e, dove il prezzo di un prodotto non è pubblico, lo trovi scritto
            «su preventivo», non inventato.
          </p>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-2xl font-bold mb-2">Tutte le guide di {AUTORE.nome}</h2>
          <p className="text-sm text-gray-500 mb-8">
            {articoli.length} articoli in {categorie.length} categorie, dal più recente.
          </p>
          <ul className="divide-y divide-gray-100">
            {articoli.map((p) => (
              <li key={p.slug} className="py-4">
                <Link to={`/blog/${p.slug}/`} className="group block">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 mb-1">
                    <span className="font-semibold text-[#F97415]">{p.category}</span>
                    <span>{formatData(p.updatedAt ?? p.publishedAt)}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {p.readTime} min</span>
                  </div>
                  <h3 className="font-bold text-[#111111] group-hover:text-[#F97415] transition-colors">{p.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed mt-1">{p.excerpt}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
