/**
 * LegalLayout — Wrapper unificato per le pagine legali
 * Privacy Policy, Cookie Policy, T&C, Avviso Legale, Condizioni Utilizzo, DPA.
 *
 * Stile coerente: navbar/footer EIC, contenuto centrato max-w-4xl, prose-like.
 * Usa <LegalLayout title=... lastUpdate=... downloadHref=...>{children}</LegalLayout>.
 */
import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Download, FileText } from "lucide-react";
import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingFooter from "@/components/landing/LandingFooter";
import { useSEO } from "@/hooks/useSEO";

interface LegalDoc {
  href: string;
  label: string;
}

export const LEGAL_DOCS: LegalDoc[] = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/termini-e-condizioni", label: "Termini e Condizioni" },
  { href: "/avviso-legale", label: "Avviso Legale" },
  { href: "/condizioni-utilizzo", label: "Condizioni di Utilizzo" },
  { href: "/cookie-policy", label: "Cookie Policy" },
  { href: "/dpa", label: "DPA" },
];

interface LegalLayoutProps {
  title: string;
  /** SEO-only: short meta description */
  metaDescription: string;
  /** Display string, e.g. "27 aprile 2026" */
  lastUpdate: string;
  /** Optional: link to PDF version in /public/legal/ */
  downloadHref?: string;
  /** Optional canonical override (default: derived from current path) */
  canonical?: string;
  /** Current path for active link in legal nav */
  currentPath: string;
  children: ReactNode;
}

export default function LegalLayout({
  title,
  metaDescription,
  lastUpdate,
  downloadHref,
  canonical,
  currentPath,
  children,
}: LegalLayoutProps) {
  useSEO({
    title: `${title} — Edilizia in Cloud`,
    description: metaDescription,
    canonical: canonical || currentPath,
    noindex: false, // Legal pages should be indexable for transparency
  });

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <LandingNavbar />

      {/* Header */}
      <header className="pt-32 md:pt-36 pb-10 px-6 border-b border-gray-100 bg-gradient-to-b from-gray-50/40 to-white">
        <div className="max-w-4xl mx-auto">
          <p className="text-[11px] font-bold tracking-widest uppercase text-[#F97415] mb-3 inline-flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Documento legale
          </p>
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#111111] mb-3 leading-tight">
            {title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[#111111]/60">
            <span>
              Ultimo aggiornamento: <strong className="text-[#111111]">{lastUpdate}</strong>
            </span>
            {downloadHref && (
              <a
                href={downloadHref}
                download
                className="inline-flex items-center gap-1.5 text-[#F97415] hover:text-[#C94F06] font-semibold transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Scarica PDF
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Side-by-side: legal nav + content (mobile: stacked) */}
      <div className="max-w-7xl mx-auto px-6 py-12 md:py-14 grid lg:grid-cols-[220px_1fr] gap-10">
        {/* Legal sidebar */}
        <aside className="lg:sticky lg:top-24 self-start">
          <p className="text-[10px] font-black tracking-widest uppercase text-[#111111]/40 mb-3">
            Indice documenti
          </p>
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible scrollbar-hide -mx-1 px-1">
            {LEGAL_DOCS.map((doc) => {
              const active = currentPath === doc.href;
              return (
                <Link
                  key={doc.href}
                  to={doc.href}
                  className={`shrink-0 lg:w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? "bg-[#F97415]/10 text-[#F97415] border border-[#F97415]/30"
                      : "text-[#111111]/70 hover:bg-gray-50 hover:text-[#111111] border border-transparent"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  {doc.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main legal content */}
        <main className="legal-prose max-w-3xl">
          {children}
        </main>
      </div>

      <LandingFooter />
    </div>
  );
}
