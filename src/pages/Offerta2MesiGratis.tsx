import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck, CalendarCheck, CalendarDays, Clock, CreditCard, Database, HardHat,
  Smartphone, Sparkles, Timer, Users,
} from "lucide-react";
import { useSEO } from "@/hooks/useSEO";
import { JsonLd } from "@/components/seo/JsonLd";
import { HubSeoSchema } from "@/components/seo/HubSeoSchema";
import LandingNavbar from "@/components/landing/LandingNavbar";
import PlatformMockup from "@/components/landing/PlatformMockup";
import { CalendarioInPagina, type PrenotazioneFatta } from "@/components/marketing/CalendarioInPagina";
import { trackPixel } from "@/lib/meta/fbcTracker";
import { DOMANDE_OFFERTA, POSTI_PROMO, SETTORI } from "@/data/offerta2MesiGratis";

/**
 * /offerta-2-mesi-gratis — la pagina di vendita della promo «31 giorni gratis»
 * (19/09/2026, richiesta di Florin; il 23/09 l'ha portata da due mesi a uno, il
 * 24/09 a «31 giorni», come le email e gli annunci. L'indirizzo resta quello: i
 * link già in giro devono continuare a valere).
 *
 * La promo vale solo per 8 aziende: l'avvio lo seguiamo noi, uno per uno. La
 * prima versione vendeva l'annuale del manuale della rete vendita («Vendita
 * Ibrida»: 12 mesi al prezzo di 10, prezzo bloccato); Florin l'ha fatta
 * togliere la sera stessa, e con lei le due garanzie che parlavano
 * dell'annuale. Restano le tre garanzie «da pagina» del manuale (G1, G2, G3).
 *
 * Il resto riusa la home: le sue sezioni (numeri, problemi, soluzione, moduli,
 * testimonianze) e le sue immagini. Ogni pulsante porta al calendario in fondo,
 * dove la demo si fissa senza aspettare la telefonata.
 */

const StatsSection = lazy(() => import("@/components/landing/StatsSection"));
const PainPointsSection = lazy(() => import("@/components/landing/PainPointsSection"));
const SolutionSection = lazy(() => import("@/components/landing/SolutionSection"));
const ModulesSection = lazy(() => import("@/components/landing/ModulesSection"));
const TestimonialsSection = lazy(() => import("@/components/landing/TestimonialsSection"));
const LandingFooter = lazy(() => import("@/components/landing/LandingFooter"));

const ARANCIO = "#F97415";
const ARANCIO_CTA = "#C94F06";
const NERO = "#111111";

function vaiAllaPrenotazione(e?: { preventDefault: () => void }) {
  e?.preventDefault();
  document.querySelector("#prenota")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function PulsantePrenota({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <a
      href="#prenota"
      onClick={vaiAllaPrenotazione}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-7 py-4 text-base font-bold text-white shadow-lg transition-all duration-200 hover:scale-[1.03] hover:opacity-95 md:text-lg ${className}`}
      style={{ background: ARANCIO_CTA, boxShadow: "0 12px 30px -10px rgba(201,79,6,0.55)" }}
    >
      <CalendarCheck className="h-5 w-5" />
      {children}
    </a>
  );
}

function Fallback() {
  return <div className="h-64" aria-hidden />;
}

// ── 1. Hero ────────────────────────────────────────────────────────────────────

function HeroOfferta() {
  return (
    <section className="relative overflow-hidden pb-14 pt-28 md:pb-20 md:pt-36">
      <picture>
        <source media="(max-width: 640px)" srcSet="/hero/cantiere-480.webp 480w, /hero/cantiere-768.webp 768w" sizes="100vw" />
        <img
          src="/hero/cantiere-1024.webp"
          srcSet="/hero/cantiere-768.webp 768w, /hero/cantiere-1024.webp 1024w, /hero/cantiere-1440.webp 1440w, /hero/cantiere-1920.webp 1920w"
          sizes="100vw"
          alt="Cantiere edile italiano gestito con Edilizia in Cloud"
          {...{ fetchpriority: "high" }}
          loading="eager"
          decoding="async"
          width={1920}
          height={1080}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-center"
        />
      </picture>
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(135deg, rgba(17,17,17,0.93) 0%, rgba(15,29,53,0.89) 50%, rgba(17,17,17,0.86) 100%)" }}
      />
      <div className="absolute left-1/4 top-1/4 h-48 w-48 rounded-full bg-[#F97415]/[0.12] blur-[120px] md:h-96 md:w-96" />
      <div className="absolute bottom-1/4 right-1/4 h-40 w-40 rounded-full bg-[#F97415]/[0.08] blur-[100px] md:h-80 md:w-80" />

      <div className="relative z-10 mx-auto max-w-5xl px-5 text-center sm:px-6">
        {/* Per chi è, in cima. Su telefono solo i primi tre settori, su due righe
            bilanciate: per questo lì gli angoli non sono a pillola. */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-2xl border border-[#F97415]/40 bg-[#F97415]/10 px-4 py-2 text-[10px] font-semibold uppercase leading-relaxed tracking-wider text-[#F97415] md:rounded-full md:px-5 md:text-xs md:tracking-widest">
          <HardHat className="h-3.5 w-3.5 shrink-0" />
          <span className="text-balance">
            Per{" "}
            {SETTORI.map((settore, i) => (
              <span key={settore} className={i >= 3 ? "hidden md:inline" : undefined}>
                {i > 0 && " · "}
                {settore}
              </span>
            ))}
          </span>
        </span>

        {/* Prima la promessa, poi l'offerta: così l'ha chiesta Florin (19/09). */}
        <h1 className="mx-auto max-w-5xl font-extrabold leading-[1.05] tracking-tight">
          <span className="block text-balance text-[clamp(2.1rem,5vw,4.6rem)] text-white">
            Aumenta i tuoi margini e i tuoi guadagni di{" "}
            <span className="whitespace-nowrap text-[#F97415]">+50.000 €</span>.
          </span>
          {/* Da tablet in su ogni frase resta intera: si va a capo tra una e l'altra. */}
          <span className="mt-3 block text-balance text-[clamp(1.35rem,2.9vw,2.6rem)] leading-tight text-white/90 md:mt-4">
            <span className="md:whitespace-nowrap">Liberati dalla gestione.</span>{" "}
            <span className="md:whitespace-nowrap">Delega con efficienza.</span>{" "}
            <span className="md:whitespace-nowrap">Controlla i margini in tempo reale.</span>
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-3xl text-balance text-lg font-semibold leading-snug text-white/85 md:text-2xl">
          Dì addio a software sparsi, fogli Excel e carte da rincorrere: cantieri, preventivi, fatture e
          squadra in un posto solo.
        </p>

        <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-[#F97415]/45 bg-[#F97415]/10 px-5 py-4 backdrop-blur-sm md:px-8 md:py-5">
          <p className="flex items-center justify-center gap-2 text-[11px] font-bold uppercase tracking-widest text-[#F97415] md:text-xs">
            <Sparkles className="h-3.5 w-3.5" />
            La promo
          </p>
          <p className="mt-1.5 text-balance text-xl font-extrabold leading-snug text-white md:text-3xl">
            31 giorni gratis, <span className="text-[#F97415]">solo per {POSTI_PROMO} aziende.</span>
          </p>
          <p className="mt-2 text-balance text-sm leading-relaxed text-white/70 md:text-base">
            L&apos;avvio lo seguiamo noi, uno per uno: quando i posti sono presi, la promo si chiude.
          </p>
        </div>

        <div id="pulsanti-hero" className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <PulsantePrenota className="w-full sm:w-auto">Prenota la demo gratuita</PulsantePrenota>
          <a
            href="#come-funziona"
            onClick={(e) => { e.preventDefault(); document.querySelector("#come-funziona")?.scrollIntoView({ behavior: "smooth" }); }}
            className="w-full rounded-full border border-white/25 px-7 py-4 font-semibold text-white transition-all hover:border-white/45 hover:bg-white/5 sm:w-auto"
          >
            Guarda cosa fa
          </a>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {[
            { Icon: Timer, label: "Operativo in 30 giorni" },
            { Icon: Database, label: "I tuoi dati escono quando vuoi" },
            { Icon: Clock, label: "Il margine in due minuti" },
          ].map(({ Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-3 py-1.5 text-[11px] font-medium text-white/75 md:text-xs"
            >
              <Icon className="h-3.5 w-3.5 text-[#F97415]" />
              {label}
            </span>
          ))}
        </div>

        <PlatformMockup />
      </div>
      {/* Sotto c'è la fascia scura dei numeri: sfuma verso quella, non verso il bianco. */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[#111111] to-transparent md:h-24" />
    </section>
  );
}

// ── 2. Le due domande ────────────────────────────────────────────────────────────

function DueDomande() {
  return (
    <section className="bg-white px-5 pb-4 pt-20 sm:px-6 md:pt-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">Prima di tutto, due domande</p>
        <h2 className="mt-4 text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-5xl">
          L&apos;ultimo cantiere che hai chiuso: quanto ci hai guadagnato davvero?
        </h2>
        <p className="mt-5 text-2xl font-bold text-[#111111]/70 md:text-3xl">
          E quanto tempo ti è servito per saperlo?
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#111111]/65">
          Se la risposta è «lo scopro a fine anno dal commercialista», non sei il solo. Ed è lì che si
          perdono i soldi: nei cantieri che sembrano andare bene e intanto si mangiano il margine
          degli altri.
        </p>
      </div>
    </section>
  );
}

// ── 3. Silvio, con l'immagine della home ───────────────────────────────────────────

function SilvioInCantiere() {
  return (
    <section className="bg-[#f7f9fc] px-5 py-20 sm:px-6 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="relative">
          <img
            src="/images/ai-edilizia/squadra-cantiere-ai.jpg"
            srcSet="/images/ai-edilizia/squadra-cantiere-ai-540.jpg 540w, /images/ai-edilizia/squadra-cantiere-ai.jpg 1080w"
            sizes="(max-width: 1024px) 100vw, 50vw"
            alt="Squadra in cantiere che usa Edilizia in Cloud dal telefono"
            loading="lazy"
            decoding="async"
            className="w-full rounded-3xl object-cover shadow-2xl"
          />
          <div className="absolute -bottom-6 left-6 flex items-center gap-3 rounded-2xl bg-white p-3 pr-5 shadow-xl sm:left-10">
            <img src="/silvio-avatar-orange.png" alt="Silvio, l'assistente AI" loading="lazy" className="h-12 w-12 rounded-full" />
            <div className="text-left">
              <p className="text-sm font-bold text-[#111111]">Silvio</p>
              <p className="text-xs text-[#111111]/60">l&apos;assistente AI della tua impresa</p>
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">Dall&apos;ufficio al cantiere</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-4xl">
            Tutto dal telefono, anche con le mani sporche di malta.
          </h2>
          <ul className="mt-7 space-y-4">
            {[
              { Icon: Smartphone, testo: "La squadra timbra, fotografa e compila il giornale dei lavori dal cantiere." },
              { Icon: BadgeCheck, testo: "Preventivi con i tuoi listini e firma elettronica del cliente, senza stampare niente." },
              { Icon: CreditCard, testo: "Fatture elettroniche a SDI collegate alla commessa: sai subito cosa hai incassato e cosa no." },
              { Icon: Sparkles, testo: "Silvio ti prepara il preventivo, ti ricorda le scadenze e ti avvisa quando un cantiere va sotto." },
            ].map(({ Icon, testo }) => (
              <li key={testo} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F97415]/10">
                  <Icon className="h-5 w-5 text-[#F97415]" />
                </span>
                <span className="text-base leading-relaxed text-[#111111]/75">{testo}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <PulsantePrenota>Vedilo sulla tua impresa</PulsantePrenota>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── 4. Quanto paghi già oggi ─────────────────────────────────────────────────────────

// Stime dal manuale della rete vendita (Appendice C, «la tabella del costo sostituito»).
const STRUMENTI_SOSTITUITI: Array<{ voce: string; stima: string }> = [
  { voce: "Fatturazione elettronica e SDI", stima: "25–50 €" },
  { voce: "Firma digitale / OTP", stima: "15–30 €" },
  { voce: "Presenze e GPS operai (10 persone)", stima: "30–60 €" },
  { voce: "CRM o gestione contatti", stima: "25–60 €" },
  { voce: "Archiviazione documentale e cloud", stima: "10–20 €" },
  { voce: "Adempimenti sicurezza D.Lgs 81", stima: "30–60 €" },
  { voce: "Software preventivi / computo", stima: "40–80 €" },
];

function CostoSostituito() {
  return (
    <section className="bg-white px-5 py-20 sm:px-6 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">Il conto che nessuno fa</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-5xl">
            Quanto paghi già oggi, senza accorgertene.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[#111111]/65">
            Un abbonamento per le fatture, uno per le firme, uno per le presenze, il CRM, il cloud, la
            sicurezza, i preventivi. Presi uno alla volta sembrano pochi euro. Messi in fila, no.
          </p>
          <div className="mt-8 rounded-2xl border-2 border-[#F97415]/25 bg-[#F97415]/[0.05] p-6">
            <p className="text-lg font-bold leading-snug text-[#111111]">
              Il Professionista è 247 € al mese e li sostituisce tutti.
            </p>
            <p className="mt-2 text-base leading-relaxed text-[#111111]/70">
              Più una cosa che oggi non hai da nessuna parte: il margine di ogni commessa, mentre è aperta.
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-xl">
          <div className="flex items-center justify-between bg-[#111111] px-6 py-4 text-sm font-semibold text-white">
            <span>Cosa paghi oggi</span>
            <span className="text-white/60">al mese</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {STRUMENTI_SOSTITUITI.map((r) => (
              <li key={r.voce} className="flex items-center justify-between gap-4 px-6 py-3.5 text-sm">
                <span className="text-[#111111]/80">{r.voce}</span>
                <span className="shrink-0 font-semibold tabular-nums text-[#111111]">{r.stima}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-4 bg-[#F97415]/10 px-6 py-4">
            <span className="font-bold text-[#111111]">Totale strumenti già in casa</span>
            <span className="shrink-0 text-lg font-extrabold tabular-nums text-[#C94F06]">175–360 €</span>
          </div>
          <p className="px-6 py-3 text-xs text-[#111111]/50">
            Stime medie di mercato. In demo facciamo il conto con i tuoi abbonamenti veri.
          </p>
        </div>
      </div>
    </section>
  );
}

// ── 5. La promo ──────────────────────────────────────────────────────────────────────

function Promo() {
  const punti = [
    {
      valore: "31 giorni",
      etichetta: "gratis",
      testo: "I primi 31 giorni di Edilizia in Cloud non li paghi.",
    },
    {
      valore: String(POSTI_PROMO),
      etichetta: "aziende, non una di più",
      testo: "L'avvio lo seguiamo noi, uno per uno: carichiamo cantieri, anagrafiche e listini e formiamo la squadra.",
    },
    {
      valore: "30 giorni",
      etichetta: "per essere operativo",
      testo: "Garantito: se per causa nostra non ci sei, il canone non parte.",
    },
  ];
  return (
    <section id="offerta" className="relative overflow-hidden px-5 py-20 sm:px-6 md:py-28" style={{ background: NERO }}>
      <div className="absolute left-1/2 top-0 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-[#F97415]/[0.12] blur-[120px]" />
      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">La promo</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-balance text-white md:text-5xl">
            31 giorni gratis. Solo per {POSTI_PROMO} aziende.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/70">
            Non è uno sconto per tutti: i posti sono {POSTI_PROMO} perché l&apos;avvio lo facciamo noi, azienda
            per azienda. Quando sono presi, la promo si chiude.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {punti.map(({ valore, etichetta, testo }) => (
            <div key={valore} className="rounded-3xl border border-white/10 bg-white/[0.04] p-7 text-center">
              <p className="text-5xl font-extrabold tabular-nums text-[#F97415]">{valore}</p>
              <p className="mt-2 text-sm font-bold uppercase tracking-wider text-white">{etichetta}</p>
              <p className="mt-4 text-sm leading-relaxed text-white/65">{testo}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <PulsantePrenota>Prenota la demo gratuita</PulsantePrenota>
        </div>
      </div>
    </section>
  );
}

// ── 6. Le garanzie ───────────────────────────────────────────────────────────────────

// Le tre garanzie «da pagina» del manuale della rete vendita (G1, G2, G3).
const GARANZIE: Array<{ Icon: typeof Timer; titolo: string; testo: string; condizione?: string }> = [
  {
    Icon: Timer,
    titolo: "Operativo in 30 giorni, o il canone non parte",
    testo: "Entro trenta giorni dal via i tuoi cantieri aperti sono dentro con il margine visibile, le fatture partono a SDI e la squadra è formata. Se non è così per causa nostra, il canone resta fermo finché non lo è.",
    condizione: "Con i dati consegnati entro 7 giorni dalla chiamata di avvio e la partecipazione alle tre sessioni.",
  },
  {
    Icon: Database,
    titolo: "I tuoi dati escono quando vuoi",
    testo: "Tutto quello che metti dentro lo riporti fuori in un clic, in Excel e in PDF, senza chiedere il permesso a nessuno. Anche dopo la disdetta: hai novanta giorni per scaricare tutto.",
  },
  {
    Icon: Clock,
    titolo: "Il margine in due minuti",
    testo: "Al sessantesimo giorno leggi dal telefono il margine reale di qualsiasi cantiere aperto in meno di due minuti. Se non ci riesci, ti restituiamo l'avvio per intero.",
    condizione: "Con i dati del cantiere consegnati e la squadra formata.",
  },
];

function Garanzie() {
  return (
    <section className="bg-[#f7f9fc] px-5 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">Le garanzie</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-5xl">
            Il rischio lo prendiamo noi. Per iscritto.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[#111111]/65">
            Chi ha già provato un gestionale e l&apos;ha lasciato a metà sa perché servono.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {GARANZIE.map(({ Icon, titolo, testo, condizione }) => (
            <div key={titolo} className="flex flex-col rounded-3xl border border-gray-100 bg-white p-7 shadow-sm">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F97415]/10">
                <Icon className="h-6 w-6 text-[#F97415]" />
              </span>
              <h3 className="mt-5 text-lg font-extrabold leading-snug text-[#111111]">{titolo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#111111]/70">{testo}</p>
              {condizione && <p className="mt-3 text-xs leading-relaxed text-[#111111]/45">{condizione}</p>}
            </div>
          ))}
        </div>
        <div
          className="mt-6 flex flex-col items-center justify-between gap-5 rounded-3xl p-7 text-center text-white md:flex-row md:px-10 md:text-left"
          style={{ background: NERO }}
        >
          <div>
            <p className="text-lg font-extrabold leading-snug">Vuoi vederle sulla tua impresa?</p>
            <p className="mt-1 text-sm leading-relaxed text-white/65">
              In trenta minuti ti mostriamo come arrivi al margine di ogni cantiere.
            </p>
          </div>
          <PulsantePrenota className="w-full shrink-0 md:w-auto">Prenota la demo</PulsantePrenota>
        </div>
      </div>
    </section>
  );
}

// ── 7. Come si parte ─────────────────────────────────────────────────────────────────

function ComeSiParte() {
  const passi = [
    {
      n: "1",
      titolo: "Prenoti la demo",
      testo: "Trenta minuti sul tuo modo di lavorare: cantieri, preventivi, margini. Niente slide preconfezionate.",
      Icon: CalendarDays,
    },
    {
      n: "2",
      titolo: "Avvio Guidato",
      testo: "Cantieri, anagrafiche e listini li carichiamo noi. A te chiediamo i file e tre sessioni con la squadra.",
      Icon: Users,
    },
    {
      n: "3",
      titolo: "In 30 giorni sei operativo",
      testo: "Margine di ogni commessa visibile, fatture a SDI, squadra formata. Garantito, o il canone non parte.",
      Icon: BadgeCheck,
    },
  ];
  return (
    <section className="bg-white px-5 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">Come si parte</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-5xl">
            Tre passi. Il lavoro pesante lo facciamo noi.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {passi.map(({ n, titolo, testo, Icon }) => (
            <div key={n} className="relative rounded-3xl border border-gray-100 bg-[#f7f9fc] p-7">
              <span className="absolute right-6 top-5 text-6xl font-extrabold text-[#F97415]/15">{n}</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: ARANCIO }}>
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-xl font-extrabold text-[#111111]">{titolo}</h3>
              <p className="mt-2 text-base leading-relaxed text-[#111111]/70">{testo}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 8. Il calendario ────────────────────────────────────────────────────────────────

function Prenota({ onPrenotato }: { onPrenotato: (p: PrenotazioneFatta) => void }) {
  return (
    <section id="prenota" className="scroll-mt-20 bg-[#f7f9fc] px-5 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-[#F97415]">Prenota adesso</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-5xl">
            Scegli giorno e ora della tua demo.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[#111111]/65">
            Trenta minuti, senza impegno. Alla fine sai se Edilizia in Cloud fa per te, e se partire
            con i 31 giorni gratis.
          </p>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_280px] lg:items-start">
          <div className="rounded-3xl border border-gray-100 bg-white p-3 shadow-xl sm:p-5">
            <CalendarioInPagina slug="demo-edilizia-in-cloud" onPrenotato={onPrenotato} />
          </div>
          <ul className="space-y-4 lg:pt-6">
            {[
              { Icon: Clock, testo: "30 minuti in videochiamata" },
              { Icon: CreditCard, testo: "Nessuna carta di credito" },
              { Icon: CalendarCheck, testo: "Conferma immediata" },
              { Icon: Users, testo: "Porta chi vuoi: socio, amministrazione, capocantiere" },
            ].map(({ Icon, testo }) => (
              <li key={testo} className="flex items-center gap-3 text-sm font-medium text-[#111111]/75">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                  <Icon className="h-5 w-5 text-[#F97415]" />
                </span>
                {testo}
              </li>
            ))}
            <li className="pt-2 text-sm text-[#111111]/55">
              Preferisci essere richiamato?{" "}
              <Link to="/demo" className="font-semibold text-[#C94F06] hover:underline">Lascia i tuoi dati</Link>
              {" "}e ti chiamiamo noi.
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

// ── 9. Domande ───────────────────────────────────────────────────────────────────────

function Domande() {
  return (
    <section className="bg-white px-5 py-20 sm:px-6 md:py-28">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-center text-3xl font-extrabold leading-tight text-balance text-[#111111] md:text-4xl">
          Le domande che ci fanno tutti
        </h2>
        <div className="mt-10 divide-y divide-gray-100 rounded-3xl border border-gray-100">
          {DOMANDE_OFFERTA.map(({ q, a }) => (
            <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-[#111111]">
                {q}
                <span className="shrink-0 text-2xl font-light text-[#F97415] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-base leading-relaxed text-[#111111]/70">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 10. Chiusura ─────────────────────────────────────────────────────────────────────

function Chiusura() {
  return (
    <section className="relative overflow-hidden px-5 py-20 text-center sm:px-6 md:py-28" style={{ background: NERO }}>
      <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#F97415]/[0.14] blur-[120px]" />
      <div className="relative mx-auto max-w-3xl">
        <h2 className="text-3xl font-extrabold leading-tight text-balance text-white md:text-5xl">
          Il prossimo cantiere che chiudi, sai già quanto ci hai guadagnato.
        </h2>
        <p className="mt-5 text-lg text-white/70">
          31 giorni gratis, solo per {POSTI_PROMO} aziende. Operativo in 30 giorni, garantito.
        </p>
        <div className="mt-9">
          <PulsantePrenota>Prenota la demo gratuita</PulsantePrenota>
        </div>
      </div>
    </section>
  );
}

// ── Pagina ───────────────────────────────────────────────────────────────────────────

export default function Offerta2MesiGratis() {
  useSEO({
    title: "Offerta 31 giorni gratis — Gestionale Edilizia in Cloud",
    description:
      "Aziende edili, serramentisti e fotovoltaico: aumenta margini e guadagni di +50.000 € e dì addio a software sparsi ed Excel. 31 giorni gratis per 8 aziende.",
    canonical: "/offerta-2-mesi-gratis",
    keywords: "offerta gestionale edilizia, gestionale edilizia 31 giorni gratis, gestionale serramentisti, gestionale fotovoltaico, demo gestionale imprese edili",
  });

  // La barra «Prenota» in fondo (solo telefono) serve quando nessun altro
  // pulsante è a portata: non mentre si vedono quelli dell'hero, e non sopra il
  // calendario, dove coprirebbe gli orari. Senza IntersectionObserver resta
  // sempre visibile.
  const [inVista, setInVista] = useState(() => ({
    hero: typeof IntersectionObserver !== "undefined",
    calendario: false,
  }));
  useEffect(() => {
    const hero = document.getElementById("pulsanti-hero");
    const calendario = document.getElementById("prenota");
    if (!hero || !calendario || typeof IntersectionObserver === "undefined") return;
    const osservatore = new IntersectionObserver(
      (voci) =>
        setInVista((prima) => {
          const dopo = { ...prima };
          for (const voce of voci) {
            if (voce.target === hero) dopo.hero = voce.isIntersecting;
            if (voce.target === calendario) dopo.calendario = voce.isIntersecting;
          }
          return dopo;
        }),
      { threshold: 0.1 },
    );
    osservatore.observe(hero);
    osservatore.observe(calendario);
    return () => osservatore.disconnect();
  }, []);
  const barraVisibile = !inVista.hero && !inVista.calendario;

  // Su telefono la barra copre il pulsante WhatsApp del sito: lo si alza con la
  // stessa variabile che usa la barra della home, finché la barra c'è.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const telefono = window.matchMedia("(max-width: 767px)");
    const applica = () =>
      document.documentElement.style.setProperty(
        "--eic-chat-lift",
        telefono.matches && barraVisibile ? "76px" : "0px",
      );
    applica();
    telefono.addEventListener("change", applica);
    return () => {
      telefono.removeEventListener("change", applica);
      document.documentElement.style.setProperty("--eic-chat-lift", "0px");
    };
  }, [barraVisibile]);

  // Una prenotazione confermata nel calendario è la conversione di questa pagina.
  const prenotato = useCallback((p: PrenotazioneFatta) => {
    trackPixel("Lead", { content_name: "offerta_2_mesi_gratis", content_category: "prenotazione_demo" });
    const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
    try {
      gtag?.("event", "prenotazione_demo", { pagina: "offerta-2-mesi-gratis", giorno: p.date, ora: p.time });
    } catch {
      /* il tracciamento non deve mai rompere la pagina */
    }
  }, []);

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-[#111111]">
      <HubSeoSchema
        pageName="Offerta 31 giorni gratis"
        pagePath="/offerta-2-mesi-gratis"
        pageDescription="Edilizia in Cloud per aziende edili, serramentisti e fotovoltaico: 31 giorni gratis, solo per 8 aziende. Operativo in 30 giorni, garantito."
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Offerta 31 giorni gratis", url: "/offerta-2-mesi-gratis" },
        ]}
      />
      <JsonLd
        id="jsonld-faq-offerta"
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: DOMANDE_OFFERTA.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />

      <LandingNavbar />
      <main>
        <HeroOfferta />
        <Suspense fallback={<Fallback />}>
          <StatsSection />
        </Suspense>
        <DueDomande />
        <Suspense fallback={<Fallback />}>
          <PainPointsSection />
          <SolutionSection />
        </Suspense>
        <SilvioInCantiere />
        <CostoSostituito />
        <Promo />
        <Garanzie />
        <Suspense fallback={<Fallback />}>
          <ModulesSection />
        </Suspense>
        <ComeSiParte />
        <Suspense fallback={<Fallback />}>
          <TestimonialsSection />
        </Suspense>
        <Prenota onPrenotato={prenotato} />
        <Domande />
        <Chiusura />
      </main>
      <Suspense fallback={<Fallback />}>
        <LandingFooter />
      </Suspense>

      {/* Su telefono il pulsante resta a portata di pollice, tra l'hero e il calendario. */}
      <div
        aria-hidden={!barraVisibile}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform duration-300 md:hidden ${barraVisibile ? "" : "translate-y-full"}`}
      >
        <a
          href="#prenota"
          onClick={vaiAllaPrenotazione}
          tabIndex={barraVisibile ? undefined : -1}
          className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-base font-bold text-white"
          style={{ background: ARANCIO_CTA }}
        >
          <CalendarCheck className="h-5 w-5" />
          Prenota la demo · 31 giorni gratis
        </a>
      </div>
      <div className="h-20 md:hidden" aria-hidden />
    </div>
  );
}
