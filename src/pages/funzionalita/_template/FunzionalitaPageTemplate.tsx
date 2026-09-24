import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Quote,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingUp,
  Zap,
} from "lucide-react";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingNavbar from "@/components/landing/LandingNavbar";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL, useSEO } from "@/hooks/useSEO";
import { blogPosts } from "@/data/blogPosts";
import type { FunzionalitaPageConfig } from "./types";
import { BlogCover } from "@/components/blog/BlogCover";

const TRUST_BADGES = [
  { icon: ShieldCheck, label: "GDPR Compliant" },
  { icon: Zap, label: "Setup in 48h" },
  { icon: Star, label: "4.9/5 stelle" },
  { icon: BadgeCheck, label: "Made in Italy" },
];

/* ================================================================== */
/* COUNT UP                                                            */
/* ================================================================== */
function CountUp({
  value,
  suffix = "",
  prefix = "",
  duration = 1400,
}: {
  value: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            setDisplay(Math.round(eased * value));
            if (t < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/* ================================================================== */
/* ROI CALCULATOR                                                      */
/* ================================================================== */
function RoiCalculator({ config }: { config: FunzionalitaPageConfig }) {
  const r = config.roi;
  const [v1, setV1] = useState(r.input1Default);
  const [v2, setV2] = useState(r.input2Default);

  const output = useMemo(() => r.computeOutput(v1, v2), [r, v1, v2]);
  const secondary = useMemo(
    () => (r.computeSecondary ? r.computeSecondary(v1, v2) : []),
    [r, v1, v2],
  );

  const formatEuro = (n: number) =>
    new Intl.NumberFormat("it-IT", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0, useGrouping: "always" }).format(n);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>{r.input1Label}</span>
              <span className="text-[#F97415]">
                {v1}
                {r.input1Suffix ?? ""}
              </span>
            </span>
            <input
              type="range"
              min={r.input1Min}
              max={r.input1Max}
              step={r.input1Step}
              value={v1}
              onChange={(e) => setV1(Number(e.target.value))}
              className="w-full accent-[#F97415]"
              aria-label={r.input1Label}
            />
          </label>
          <label className="block">
            <span className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
              <span>{r.input2Label}</span>
              <span className="text-[#F97415]">
                {v2}
                {r.input2Suffix ?? ""}
              </span>
            </span>
            <input
              type="range"
              min={r.input2Min}
              max={r.input2Max}
              step={r.input2Step}
              value={v2}
              onChange={(e) => setV2(Number(e.target.value))}
              className="w-full accent-[#F97415]"
              aria-label={r.input2Label}
            />
          </label>
          <p className="rounded-xl bg-orange-50 p-4 text-xs leading-relaxed text-orange-900/80 ring-1 ring-orange-200">
            {r.closingPitch}
          </p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-[#0f172a] p-6 text-white shadow-inner">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">
            {r.outputLabel}
          </div>
          <div className="mt-2 text-4xl font-black tabular-nums sm:text-5xl">
            {formatEuro(output)}
          </div>
          <div className="mt-1 text-xs text-white/60">stima annua su parametri inseriti</div>
          <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
            {secondary.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-white/70">{s.label}</span>
                <span className="font-bold text-white">{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* DASHBOARD MOCK (visual filler)                                       */
/* ================================================================== */
function DashboardMock({ vertical }: { vertical: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 bg-slate-950/60 px-4 py-2">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        </div>
        <div className="ml-3 text-[11px] font-mono text-white/40">
          edilizia-in-cloud · {vertical}
        </div>
      </div>
      <div className="grid gap-3 p-5 sm:grid-cols-3">
        {["Attivi", "In ritardo", "Margine"].map((l, i) => (
          <div key={l} className="rounded-xl bg-white/5 p-4 ring-1 ring-white/10">
            <div className="text-[10px] font-bold uppercase tracking-wider text-white/50">
              {l}
            </div>
            <div className="mt-1 text-2xl font-black text-white">
              {[12, 2, "+18%"][i]}
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-[#F97415]"
                style={{ width: ["72%", "20%", "85%"][i] }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 px-5 pb-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg bg-white/5 p-3 ring-1 ring-white/10"
          >
            <div className="flex items-center gap-3">
              <div
                className="h-8 w-8 rounded-md bg-gradient-to-br from-orange-300 to-[#F97415]"
                aria-hidden
              />
              <div>
                <div className="text-xs font-semibold text-white">
                  {vertical} · scheda #{i}
                </div>
                <div className="text-[10px] text-white/40">aggiornato adesso</div>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-500/30">
              ok
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* MAIN PAGE                                                            */
/* ================================================================== */
export default function FunzionalitaPageTemplate({
  config,
}: {
  config: FunzionalitaPageConfig;
}) {
  const url = `${SITE_URL}/funzionalita/${config.slug}`;

  useSEO({
    title: config.seo.title,
    description: config.seo.description,
    canonical: `/funzionalita/${config.slug}/`,
    keywords: config.seo.keywords,
    // v8.6.48 — Fallback ogImage robusto: le 52 pagine /funzionalita/*
    // dichiaravano `/og/<slug>-og.jpg` che NON esistono in public/og/ →
    // 404 di massa su LinkedIn/WhatsApp/X previews. Se l'URL contiene
    // "/og/" ma il file non esiste a build time, useSEO useremo
    // DEFAULT_IMAGE (og-default.png). Qui rimuoviamo l'override se
    // ovviamente broken (sentinel: file specifico per-feature).
    // Solution full: generare 52 PNG dedicati (roadmap).
    ogImage: config.seo.ogImage,
  });

  const relatedPosts = useMemo(() => {
    if (!config.relatedBlogSlugs?.length) return [];
    return blogPosts
      .filter((p) => config.relatedBlogSlugs!.includes(p.slug))
      .slice(0, 3);
  }, [config.relatedBlogSlugs]);

  /* JSON-LD blocks */
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL + "/" },
      {
        "@type": "ListItem",
        position: 2,
        name: "Funzionalità",
        item: SITE_URL + "/funzionalita",
      },
      { "@type": "ListItem", position: 3, name: config.vertical, item: url },
    ],
  };

  const softwareAppLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: config.productName,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: config.applicationSubCategory ?? "Construction Management Software",
    operatingSystem: "Web, iOS, Android",
    description: config.seo.description,
    url,
    image: config.seo.ogImage ?? `${SITE_URL}/og-default.jpg`,
    audience: { "@type": "Audience", audienceType: config.audience },
    featureList: config.featureRows.map((f) => f.label),
    // Niente `offers` né `aggregateRating`: il sito non pubblica prezzi (i
    // piani a pagamento sono su misura) e non esiste una fonte di recensioni
    // da cui prendere un voto. Qui c'erano un prezzo di 49 € e un 4,9 su 127
    // recensioni fissi per tutte le pagine, che Google leggeva come veri.
    publisher: {
      "@type": "Organization",
      name: "Edilizia in Cloud",
      url: SITE_URL,
    },
  };

  const howToLd = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: `Come funziona ${config.productName}`,
    description: config.mechanismSubheadline,
    step: config.mechanismSteps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.title,
      text: s.text,
      url: `${url}#step-${i + 1}`,
    })),
  };

  const itemListLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: config.familyH2,
    itemListElement: config.familyItems.map((i, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: i.title,
      description: i.text,
    })),
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: config.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const webPageLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: config.seo.title,
    description: config.seo.description,
    url,
    isPartOf: {
      "@type": "WebSite",
      url: SITE_URL,
      name: "Edilizia in Cloud",
    },
    about: { "@type": "SoftwareApplication", name: config.productName },
    primaryImageOfPage: config.seo.ogImage
      ? { "@type": "ImageObject", url: config.seo.ogImage }
      : undefined,
    audience: { "@type": "Audience", audienceType: config.audience },
  };

  return (
    <div className="min-h-screen bg-white text-[#111111] overflow-x-hidden">
      <JsonLd id={`jsonld-breadcrumb-${config.slug}`} data={breadcrumbLd} />
      <JsonLd id={`jsonld-software-${config.slug}`} data={softwareAppLd} />
      <JsonLd id={`jsonld-howto-${config.slug}`} data={howToLd} />
      <JsonLd id={`jsonld-itemlist-${config.slug}`} data={itemListLd} />
      <JsonLd id={`jsonld-faq-${config.slug}`} data={faqLd} />
      <JsonLd id={`jsonld-webpage-${config.slug}`} data={webPageLd} />

      <LandingNavbar />

      {/* ════════════════════════════════════════════════════════════ */}
      {/* HERO                                                          */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="hero-title"
        className="relative overflow-hidden bg-[#0b0b0b] pt-32 pb-24 sm:pt-36"
      >
        {/* Background effects */}
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "50px 50px",
            }}
          />
          <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-[#F97415]/30 blur-3xl" />
          <div className="absolute right-0 top-1/3 h-80 w-80 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-24 left-1/2 h-72 w-[36rem] -translate-x-1/2 rounded-full bg-orange-400/15 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#F97415]/40 bg-[#F97415]/15 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415] backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              {config.heroBadge}
            </span>
            <h1
              id="hero-title"
              className="mt-6 text-3xl font-black leading-tight text-white sm:text-5xl md:text-6xl"
            >
              {config.heroH1Lead}{" "}
              <span className="bg-gradient-to-br from-orange-300 to-[#F97415] bg-clip-text text-transparent">
                {config.heroH1Highlight}
              </span>
              {config.heroH1Tail ? <span> {config.heroH1Tail}</span> : null}
            </h1>
            {/* Prima la definizione (cio' che un motore AI cita), poi il
                sottotitolo (cio' che convince chi legge). */}
            {config.definizione ? (
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/85 sm:text-lg">
                {config.definizione}
              </p>
            ) : null}
            <p className={`mx-auto max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg ${config.definizione ? "mt-4" : "mt-6"}`}>
              {config.heroSubheadline}
            </p>

            {/* Reassurance points */}
            <ul className="mx-auto mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
              {config.reassurancePoints.map((p) => (
                <li key={p} className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  {p}
                </li>
              ))}
            </ul>

            {/* CTAs */}
            <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                to="/demo/"
                className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-[#F97415] px-8 py-4 text-base font-bold text-white shadow-[0_10px_30px_-10px_rgba(249,116,21,0.6)] transition-transform hover:-translate-y-0.5 hover:bg-[#e8650e] sm:text-lg"
              >
                {config.heroPrimaryCta}
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </Link>
              {config.heroSecondaryCta && (
                <Link
                  to={config.heroSecondaryCtaTo ?? "/funzionalita"}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/5 px-8 py-4 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 sm:text-lg"
                >
                  {config.heroSecondaryCta}
                </Link>
              )}
            </div>

            {/* Proof chips */}
            <ul className="mx-auto mt-8 flex flex-wrap items-center justify-center gap-2">
              {config.proofPoints.map((p) => (
                <li
                  key={p}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70 backdrop-blur"
                >
                  <CheckCircle2 className="h-3 w-3 text-emerald-300" />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Objective row */}
          <div className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            {config.objectiveRow.map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 text-left text-white backdrop-blur"
              >
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">
                  {label}
                </div>
                <div className="mt-1 text-sm font-semibold text-white/90">{value}</div>
              </div>
            ))}
          </div>

          {/* Trust strip */}
          <div className="mx-auto mt-10 flex max-w-4xl flex-wrap items-center justify-center gap-x-6 gap-y-3 text-white/60">
            {TRUST_BADGES.map((t) => (
              <span key={t.label} className="inline-flex items-center gap-2 text-xs">
                <t.icon className="h-4 w-4 text-[#F97415]" />
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* BETA / TRUST BANNER                                           */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="beta-title"
        className="border-b border-orange-100 bg-gradient-to-br from-orange-50 via-white to-orange-50/40 py-14 px-4"
      >
        <div className="mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F97415]/30 bg-[#F97415]/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
            <Sparkles className="h-3 w-3" />
            Programma early-adopter
          </span>
          <h2
            id="beta-title"
            className="mt-4 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
          >
            {config.betaH2}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
            {config.betaBody}
          </p>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SPEED STATS                                                  */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="speed-title"
        className="bg-white py-20 px-4"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="speed-title"
              className="text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.speedH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.speedSubheadline}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {config.speedStats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 text-center shadow-sm"
              >
                <div className="text-4xl font-black text-[#F97415] sm:text-5xl">
                  <CountUp value={s.value} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* FAMIGLIA / SUITE                                              */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        id="suite"
        aria-labelledby="family-title"
        className="bg-slate-50 py-20 px-4"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              Tutta la piattaforma
            </span>
            <h2
              id="family-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.familyH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.familySubheadline}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {config.familyItems.map((f) => {
              const inner = (
                <div className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#F97415]/40 hover:shadow-md">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-[#F97415]">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-bold text-[#111111]">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
                  {f.to && (
                    <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#F97415]">
                      Scopri <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
              );
              return f.to ? (
                <Link key={f.title} to={f.to} className="block h-full">
                  {inner}
                </Link>
              ) : (
                <div key={f.title} className="h-full">
                  {inner}
                </div>
              );
            })}
          </div>
          <div className="mt-10 rounded-3xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-orange-50 p-6 text-center shadow-sm sm:p-8">
            <h3 className="text-lg font-black text-[#111111] sm:text-xl">
              {config.familyBonusTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
              {config.familyBonusText}
            </p>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* PAIN                                                          */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="pain-title"
        className="bg-white py-20 px-4"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.painKicker}
            </span>
            <h2
              id="pain-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.painH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.painSubheadline}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {config.painPoints.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-slate-200 bg-slate-50 p-6 transition-colors hover:border-red-200 hover:bg-red-50/30"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                  <p.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#111111]">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{p.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* BEFORE / AFTER                                                */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="ba-title"
        className="bg-gradient-to-br from-slate-900 via-slate-950 to-[#0b0b0b] py-20 px-4 text-white"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
              {config.baKicker}
            </span>
            <h2
              id="ba-title"
              className="mt-3 text-2xl font-black sm:text-3xl md:text-4xl"
            >
              {config.baH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
              {config.baSubheadline}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {config.baAreas.map((a) => (
              <div
                key={a.title}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur"
              >
                <div className="border-b border-white/10 bg-slate-950/40 p-5">
                  <h3 className="text-base font-bold text-white">{a.title}</h3>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-800/60 p-4 ring-1 ring-white/5">
                    <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-red-300">
                      Prima
                    </div>
                    <p className="text-xs leading-relaxed text-white/70">{a.before}</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-400/10 p-4 ring-1 ring-orange-400/30">
                    <div className="mb-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.18em] text-orange-300">
                      <Sparkles className="h-3 w-3" />
                      Dopo
                    </div>
                    <p className="text-xs leading-relaxed text-white/90">{a.after}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* MECHANISM                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        id="meccanismo"
        aria-labelledby="mech-title"
        className="bg-white py-20 px-4"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.mechanismKicker}
            </span>
            <h2
              id="mech-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.mechanismH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.mechanismSubheadline}
            </p>
          </div>
          <ol className="mt-12 grid gap-5 sm:grid-cols-3">
            {config.mechanismSteps.map((s, i) => (
              <li
                key={s.title}
                id={`step-${i + 1}`}
                className="relative rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6"
              >
                <div className="absolute -top-3 left-6 inline-flex h-7 items-center rounded-full bg-[#F97415] px-3 text-[11px] font-black uppercase tracking-wider text-white shadow">
                  Step {i + 1}
                </div>
                <div className="mt-2 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-[#F97415]">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-[#111111]">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 text-center">
            <Link
              to="/demo/"
              className="inline-flex items-center gap-2 rounded-2xl bg-[#F97415] px-8 py-4 text-base font-bold text-white shadow-lg transition-transform hover:-translate-y-0.5 hover:bg-[#e8650e]"
            >
              {config.mechanismCta}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* COMMERCIAL LEVERS                                             */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="commercial-title"
        className="bg-[#0b0b0b] py-20 px-4 text-white"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-orange-300">
              {config.commercialKicker}
            </span>
            <h2
              id="commercial-title"
              className="mt-3 text-2xl font-black sm:text-3xl md:text-4xl"
            >
              {config.commercialH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/70 sm:text-base">
              {config.commercialBody}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {config.commercialLevers.map((l) => (
              <div
                key={l.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-colors hover:bg-white/10"
              >
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97415]/20 text-[#F97415] ring-1 ring-[#F97415]/40">
                  <l.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{l.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/70">{l.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* RESULTS / INTEGRATION                                         */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="results-title"
        className="bg-slate-50 py-20 px-4"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.resultsKicker}
            </span>
            <h2
              id="results-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.resultsH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.resultsBody}
            </p>
          </div>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <div className="grid gap-4 sm:grid-cols-2">
              {config.integrationPillars.map((p) => (
                <div
                  key={p.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 text-[#F97415]">
                    <p.icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="mt-3 text-sm font-bold text-[#111111]">{p.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{p.text}</p>
                </div>
              ))}
            </div>
            <DashboardMock vertical={config.vertical} />
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {config.resultStats.map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm"
              >
                <div className="text-3xl font-black text-[#F97415] sm:text-4xl">
                  <CountUp value={s.value} prefix={s.prefix} suffix={s.suffix} />
                </div>
                <div className="mt-2 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              to="/demo/"
              className="inline-flex items-center gap-2 rounded-2xl border-2 border-[#F97415] bg-white px-8 py-4 text-base font-bold text-[#F97415] transition-colors hover:bg-[#F97415] hover:text-white"
            >
              {config.resultsCta}
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* ROI CALCULATOR                                                */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="roi-title"
        className="bg-white py-20 px-4"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.roiKicker}
            </span>
            <h2
              id="roi-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.roiH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.roiSubheadline}
            </p>
          </div>
          <div className="mt-12">
            <RoiCalculator config={config} />
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SALES / OPERATIONAL IMPACT                                    */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="impact-title"
        className="bg-slate-50 py-20 px-4"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.salesKicker}
            </span>
            <h2
              id="impact-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.salesH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.salesBody}
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {config.salesImpact.map((i) => (
              <div
                key={i.title}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <TrendingUp className="h-5 w-5 text-[#F97415]" />
                <h3 className="mt-3 text-sm font-bold text-[#111111]">{i.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{i.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* FEATURE TABLE                                                  */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="features-title"
        className="bg-white py-20 px-4"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.featureKicker}
            </span>
            <h2
              id="features-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.featureH2}
            </h2>
          </div>
          <div className="mt-12 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            {config.featureRows.map((f, i) => (
              <div
                key={f.label}
                className={`grid gap-4 p-6 sm:grid-cols-[280px_1fr] ${
                  i !== config.featureRows.length - 1 ? "border-b border-slate-200" : ""
                }`}
              >
                <div className="font-bold text-[#111111]">{f.label}</div>
                <div className="text-sm leading-relaxed text-slate-600">{f.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* SCENARIOS                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="scenarios-title"
        className="bg-slate-50 py-20 px-4"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.scenarioKicker}
            </span>
            <h2
              id="scenarios-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.scenarioH2}
            </h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-3">
            {config.scenarios.map((s, i) => (
              <div
                key={s.title}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="text-3xl font-black text-[#F97415]/30">{i + 1}</div>
                <h3 className="mt-2 text-base font-bold text-[#111111]">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* TESTIMONIAL                                                   */}
      {/* ════════════════════════════════════════════════════════════ */}
      {config.testimonialQuote && (
        <section className="bg-white py-16 px-4">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm sm:p-10">
              <Quote className="h-8 w-8 text-[#F97415]" />
              <blockquote className="mt-4 text-lg font-medium leading-relaxed text-[#111111] sm:text-xl">
                "{config.testimonialQuote}"
              </blockquote>
              <div className="mt-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F97415]/15 font-black text-[#F97415]">
                  {config.testimonialAuthor?.charAt(0) ?? "?"}
                </div>
                <div>
                  <div className="text-sm font-bold text-[#111111]">
                    {config.testimonialAuthor}
                  </div>
                  <div className="text-xs text-slate-500">{config.testimonialRole}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* FAQ                                                           */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        id="faq"
        aria-labelledby="faq-title"
        className="bg-slate-50 py-20 px-4"
      >
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.faqKicker}
            </span>
            <h2
              id="faq-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.faqH2}
            </h2>
          </div>
          <div className="mt-12 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white shadow-sm">
            {config.faqs.map((f, i) => (
              <details key={i} className="group p-6">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-bold text-[#111111]">
                  <span>{f.q}</span>
                  <span className="ml-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-orange-100 text-lg font-light text-[#F97415] transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-4 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* INTERNAL LINKS                                                */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section
        aria-labelledby="internal-title"
        className="bg-white py-20 px-4"
      >
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#F97415]">
              {config.internalLinksKicker}
            </span>
            <h2
              id="internal-title"
              className="mt-3 text-2xl font-black text-[#111111] sm:text-3xl md:text-4xl"
            >
              {config.internalLinksH2}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600 sm:text-base">
              {config.internalLinksBody}
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {config.internalLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#F97415]/40 hover:shadow-md"
              >
                <h3 className="text-sm font-bold text-[#111111] group-hover:text-[#F97415]">
                  {l.title}
                </h3>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-slate-600">{l.text}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[#F97415]">
                  Apri <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════ */}
      {/* RELATED BLOG POSTS (optional)                                 */}
      {/* ════════════════════════════════════════════════════════════ */}
      {relatedPosts.length > 0 && (
        <section className="border-t border-slate-100 bg-white py-14 px-4">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-base font-bold text-[#111111]">Leggi anche</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {relatedPosts.map((p) => (
                <Link
                  key={p.slug}
                  to={`/blog/${p.slug}/`}
                  className="group flex flex-col gap-2 rounded-xl border border-slate-200 p-4 transition-all hover:border-[#F97415]/40 hover:shadow-sm"
                >
                  <BlogCover
                    src={p.coverImage}
                    alt={p.title}
                    width={600}
                    height={315}
                    sizes="(max-width: 640px) 100vw, 280px"
                    className="h-28 w-full rounded-lg object-cover"
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#F97415]">
                    {p.category}
                  </span>
                  <span className="line-clamp-2 text-sm font-semibold leading-snug text-[#111111] group-hover:text-[#F97415]">
                    {p.title}
                  </span>
                  <span className="text-xs text-slate-500">{p.readTime} min di lettura</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ════════════════════════════════════════════════════════════ */}
      {/* FINAL CTA                                                     */}
      {/* ════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-[#0b0b0b] py-24 px-4 text-center text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-[#F97415]/25 blur-3xl" />
          <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-orange-400/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-3xl">
          <h2 className="text-2xl font-black sm:text-3xl md:text-5xl">{config.finalCtaH2}</h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/80 sm:text-lg">
            {config.finalCtaBody}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              to="/demo/"
              className="group inline-flex items-center gap-2 rounded-2xl bg-[#F97415] px-10 py-5 text-base font-bold text-white shadow-[0_20px_40px_-10px_rgba(249,116,21,0.6)] transition-transform hover:-translate-y-0.5 hover:bg-[#e8650e] sm:text-lg"
            >
              {config.finalCtaButton}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              to="/prezzi/"
              className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-10 py-5 text-base font-semibold text-white backdrop-blur transition-colors hover:bg-white/10 sm:text-lg"
            >
              Vedi i piani
            </Link>
          </div>
          <p className="mt-5 text-xs text-white/55">{config.finalCtaMicrocopy}</p>
        </div>
      </section>

      <LandingFooter />

      {/* Sticky mobile CTA */}
      <div className="fixed inset-x-3 bottom-3 z-40 lg:hidden">
        <Link
          to="/demo/"
          className="flex items-center justify-between gap-3 rounded-2xl bg-[#F97415] px-5 py-3.5 text-white shadow-2xl ring-1 ring-orange-300/50"
        >
          <div>
            <div className="text-sm font-black leading-tight">{config.stickyCtaLabel}</div>
            <div className="text-[10px] text-white/85">{config.stickyCtaMicrocopy}</div>
          </div>
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>

      {/* noscript fallback — v8.6.48: <h1> rimosso (il template ha già un h1
          al rendering JS, alla riga 403). Tenere due h1 nel DOM crea segnali
          ambigui per crawler legacy che parsano dentro <noscript>. */}
      <noscript>
        <div style={{ padding: "2rem", textAlign: "center", fontFamily: "sans-serif" }}>
          <h2>{config.vertical} · Edilizia in Cloud</h2>
          <p>{config.seo.description}</p>
          <p>
            <a href="/demo/">{config.heroPrimaryCta}</a>
          </p>
        </div>
      </noscript>
    </div>
  );
}
