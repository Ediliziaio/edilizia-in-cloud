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

export interface RenderFamilyItem {
  icon: LucideIcon;
  title: string;
  text: string;
  available: boolean;
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

/**
 * Render page configuration — drives the shared template.
 * Each vertical (Bagni, Tetti, Pavimenti, Ristrutturazioni, Stanza, Piscine)
 * provides its own config so the page reads as if it were custom-built.
 */
export interface RenderPageConfig {
  // Routing & SEO
  slug: string; // e.g. "render-bagni"
  vertical: string; // e.g. "Bagni"
  productName: string; // e.g. "Render Bagni AI"
  audience: string; // e.g. "Bagnisti, idraulici, showroom bagno"
  audienceShort: string; // e.g. "bagnisti"

  seo: {
    title: string;
    description: string;
    keywords: string;
    ogImage?: string;
  };

  // Hero
  heroBadge: string; // small badge above H1
  heroH1: string;
  heroSubheadline: string;
  heroPrimaryCta?: string;
  heroSecondaryCta?: string;
  heroFooterDisclaimer?: string;

  // Side info row (3 boxes under hero)
  objectiveRow: [string, string][]; // [label, value][] (3 items)

  // Beta / scarcity copy
  betaH2: string;
  betaBody: string;

  // Speed stats section
  speedH2: string;
  speedSubheadline: string;
  speedStats: SpeedStat[]; // 3 items

  // Video demo section
  videoH2: string;
  videoSubheadline: string;
  videoDisclaimer?: string;
  videoSrc?: string;
  videoPoster?: string;

  // Famiglia render — 5 cards
  familyH2: string;
  familySubheadline: string;
  familyItems: RenderFamilyItem[];
  familyBonusTitle: string;
  familyBonusText: string;

  // Pain section
  painKicker: string;
  painH2: string;
  painSubheadline: string;
  painPoints: IconItem[]; // 3 items

  // Before / after areas
  baKicker: string;
  baH2: string;
  baSubheadline: string;
  baAreas: BeforeAfterArea[]; // 4 items

  // Mechanism
  mechanismKicker: string;
  mechanismH2: string;
  mechanismSubheadline: string;
  mechanismSteps: IconItem[]; // 3 items
  mechanismCta: string;

  // Commercial levers
  commercialKicker: string;
  commercialH2: string;
  commercialBody: string;
  commercialLevers: IconItem[]; // 4 items

  // Risultati con Edilizia in Cloud
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
  roiPreventiviLabel: string;
  roiTicketLabel: string;

  // Sales impact
  salesKicker: string;
  salesH2: string;
  salesBody: string;
  salesImpact: SimpleCard[]; // 4 items

  // What you deliver (feature table)
  featureKicker: string;
  featureH2: string;
  featureRows: FeatureRow[]; // 5 items

  // Use scenarios
  scenarioKicker: string;
  scenarioH2: string;
  scenarios: SimpleCard[]; // 3 items

  // FAQ
  faqKicker: string;
  faqH2: string;
  faqs: QA[]; // 5 items

  // Internal links
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

  // Reassurance points (hero subline + proofPoints chips)
  reassurancePoints: string[]; // 3 items
  proofPoints: string[]; // 3 items

  // Schema.org category info
  applicationSubCategory?: string;
}
