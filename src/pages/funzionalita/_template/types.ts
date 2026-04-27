import type { LucideIcon } from "lucide-react";

export interface IconItem {
  icon: LucideIcon;
  title: string;
  text: string;
}

export interface QA {
  q: string;
  a: string;
}

export interface SimpleCard {
  title: string;
  text: string;
}

export interface BeforeAfterArea {
  title: string;
  before: string;
  after: string;
}

export interface SpeedStat {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

export interface SuiteItem {
  icon: LucideIcon;
  title: string;
  text: string;
  to?: string;
}

export interface ResultStat {
  value: number;
  prefix?: string;
  suffix?: string;
  label: string;
}

export interface InternalLink {
  to: string;
  title: string;
  text: string;
}

export interface FeatureRow {
  label: string;
  value: string;
}

export interface ROIConfig {
  /** Slider 1: numeric input (e.g. cantieri attivi, fatture al mese) */
  input1Label: string;
  input1Default: number;
  input1Min: number;
  input1Max: number;
  input1Step: number;
  input1Suffix?: string;
  /** Slider 2: secondary numeric input (e.g. ore perse, ticket medio) */
  input2Label: string;
  input2Default: number;
  input2Min: number;
  input2Max: number;
  input2Step: number;
  input2Suffix?: string;
  /** Hourly cost or other multiplier (used by formula). Optional. */
  hourlyCostDefault?: number;
  /** Free-form formula label (UI hint, e.g. "Risparmio annuo stimato"). */
  outputLabel: string;
  /** Formula for the headline ROI number, given the two inputs.
   *  Returns euro value. */
  computeOutput: (input1: number, input2: number) => number;
  /** Optional secondary outputs */
  computeSecondary?: (input1: number, input2: number) => Array<{ label: string; value: string }>;
  /** Closing pitch text under the calculator */
  closingPitch: string;
}

/**
 * Funzionalità page configuration — drives the shared template
 * for non-render product modules (cantieri, fatturazione, preventivi,
 * margini, HR, subappalti, ecc.).
 */
export interface FunzionalitaPageConfig {
  // Routing & SEO
  slug: string; // e.g. "gestione-cantieri"
  vertical: string; // e.g. "Gestione Cantieri"
  productName: string; // e.g. "Modulo Gestione Cantieri"
  audience: string; // long form audience label
  audienceShort: string; // short form

  seo: {
    title: string;
    description: string;
    keywords: string;
    ogImage?: string;
  };

  // Hero
  heroBadge: string;
  heroH1Lead: string; // text before highlight
  heroH1Highlight: string; // highlighted (orange) text
  heroH1Tail?: string; // optional tail text after highlight
  heroSubheadline: string;
  heroPrimaryCta: string;
  heroSecondaryCta?: string;
  heroSecondaryCtaTo?: string;

  reassurancePoints: string[]; // 3 items (under hero)
  proofPoints: string[]; // 3 items (chips)

  // 3 boxes under hero summarizing the page
  objectiveRow: [string, string][];

  // Trust banner / beta / setup time strip
  betaH2: string;
  betaBody: string;

  // Speed / efficiency stats
  speedH2: string;
  speedSubheadline: string;
  speedStats: SpeedStat[]; // 3 items

  // Suite cross-sell — "tutta la piattaforma"
  familyH2: string;
  familySubheadline: string;
  familyItems: SuiteItem[]; // 5 items
  familyBonusTitle: string;
  familyBonusText: string;

  // Pain
  painKicker: string;
  painH2: string;
  painSubheadline: string;
  painPoints: IconItem[]; // 4 items

  // Before / After (transformation cards)
  baKicker: string;
  baH2: string;
  baSubheadline: string;
  baAreas: BeforeAfterArea[]; // 4 items

  // Mechanism — 3 step how-it-works
  mechanismKicker: string;
  mechanismH2: string;
  mechanismSubheadline: string;
  mechanismSteps: IconItem[]; // 3 items
  mechanismCta: string;

  // Commercial levers / value drivers
  commercialKicker: string;
  commercialH2: string;
  commercialBody: string;
  commercialLevers: IconItem[]; // 4 items

  // Integration pillars + result stats
  resultsKicker: string;
  resultsH2: string;
  resultsBody: string;
  integrationPillars: IconItem[]; // 4 items
  resultStats: ResultStat[]; // 3 items
  resultsCta: string;

  // ROI calculator
  roiKicker: string;
  roiH2: string;
  roiSubheadline: string;
  roi: ROIConfig;

  // Sales / operational impact
  salesKicker: string;
  salesH2: string;
  salesBody: string;
  salesImpact: SimpleCard[]; // 4 items

  // Feature table (what you deliver)
  featureKicker: string;
  featureH2: string;
  featureRows: FeatureRow[]; // 5-7 items

  // Use scenarios
  scenarioKicker: string;
  scenarioH2: string;
  scenarios: SimpleCard[]; // 3 items

  // Testimonial (optional)
  testimonialQuote?: string;
  testimonialAuthor?: string;
  testimonialRole?: string;

  // FAQ
  faqKicker: string;
  faqH2: string;
  faqs: QA[]; // 5-6 items

  // Internal links navigation
  internalLinksKicker: string;
  internalLinksH2: string;
  internalLinksBody: string;
  internalLinks: InternalLink[]; // 9 items

  // Final CTA
  finalCtaH2: string;
  finalCtaBody: string;
  finalCtaButton: string;
  finalCtaMicrocopy: string;

  // Sticky mobile CTA
  stickyCtaLabel: string;
  stickyCtaMicrocopy: string;

  // Schema
  applicationSubCategory?: string;

  // Related blog posts
  relatedBlogSlugs?: string[];
}
