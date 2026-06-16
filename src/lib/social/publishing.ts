export const SOCIAL_LIVE_PUBLISHING_ENABLED = true;

export type SocialSchedulingSupport = "native" | "draft_only" | "video_only";

export interface SocialPlatformRule {
  id: string;
  name: string;
  maxChars: number;
  hashtagsMax: number;
  contentTypes: string[];
  schedulingSupport: SocialSchedulingSupport;
  videoOnly: boolean;
  minScheduleDelayMinutes?: number;
  maxScheduleDays?: number;
}

export interface SocialDraftValidationInput {
  selectedPlatforms: string[];
  connectedPlatformIds: string[];
  contentType: string;
  fallbackText: string;
  textByPlatform: Record<string, string>;
  hashtags: string[];
  mediaUrl?: string | null;
  publishNow: boolean;
  scheduledAt?: Date | null;
  now?: Date;
  livePublishingEnabled?: boolean;
}

export interface SocialDraftValidationResult {
  errors: string[];
  warnings: string[];
  connectedSelectedPlatforms: string[];
  demoSelectedPlatforms: string[];
  canPublishLive: boolean;
  canSaveDraft: boolean;
}

export interface SocialBulkPost {
  row: number;
  platforms: string[];
  text: string;
  hashtags: string[];
  scheduled_at: string;
  image_url?: string;
  status: "ok" | "error";
  errorMsg?: string;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }

  result.push(current.trim());
  return result;
}

function ruleById(rules: SocialPlatformRule[]) {
  return new Map(rules.map((rule) => [rule.id, rule]));
}

function textForPlatform(input: SocialDraftValidationInput, platformId: string) {
  return (input.textByPlatform[platformId] ?? input.fallbackText).trim();
}

export function validateSocialDraft(
  input: SocialDraftValidationInput,
  rules: SocialPlatformRule[],
): SocialDraftValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const connected = new Set(input.connectedPlatformIds);
  const rulesMap = ruleById(rules);
  const now = input.now ?? new Date();
  const livePublishingEnabled = input.livePublishingEnabled ?? SOCIAL_LIVE_PUBLISHING_ENABLED;

  const selectedRules = input.selectedPlatforms
    .map((platformId) => rulesMap.get(platformId))
    .filter((rule): rule is SocialPlatformRule => Boolean(rule));

  const connectedSelectedPlatforms = input.selectedPlatforms.filter((platformId) => connected.has(platformId));
  const demoSelectedPlatforms = input.selectedPlatforms.filter((platformId) => !connected.has(platformId));
  const hasText = input.selectedPlatforms.some((platformId) => textForPlatform(input, platformId).length > 0);

  if (input.selectedPlatforms.length === 0) {
    errors.push("Seleziona almeno una piattaforma.");
  }
  if (!hasText) {
    errors.push("Scrivi il testo del post.");
  }
  if (livePublishingEnabled && input.selectedPlatforms.length > 0 && connectedSelectedPlatforms.length === 0) {
    errors.push("Collega almeno una piattaforma reale prima di pubblicare o programmare.");
  }
  if (!livePublishingEnabled) {
    warnings.push("Pubblicazione live non ancora attiva: salva una bozza locale o collega il backend publisher.");
  }
  if (demoSelectedPlatforms.length > 0) {
    warnings.push("Le piattaforme demo non verranno pubblicate finché non sono collegate.");
  }

  for (const rule of selectedRules) {
    const text = textForPlatform(input, rule.id);
    if (!rule.contentTypes.includes(input.contentType)) {
      errors.push(`${rule.name} non supporta il formato selezionato.`);
    }
    if (text.length > rule.maxChars) {
      errors.push(`${rule.name} supera il limite testo di ${rule.maxChars} caratteri.`);
    }
    if (input.hashtags.length > rule.hashtagsMax) {
      errors.push(`${rule.name} permette al massimo ${rule.hashtagsMax} hashtag.`);
    }
    if ((rule.videoOnly || input.contentType === "video" || input.contentType === "reel") && !input.mediaUrl) {
      errors.push(`${rule.name} richiede un file video prima della pubblicazione.`);
    }
    if (!input.publishNow && rule.schedulingSupport === "draft_only") {
      warnings.push(`${rule.name} non supporta scheduling nativo: salva come bozza e pubblica dal reminder.`);
    }
    if (!input.publishNow && input.scheduledAt) {
      const diffMinutes = (input.scheduledAt.getTime() - now.getTime()) / 60000;
      if (diffMinutes < 0) {
        errors.push("La data di pubblicazione deve essere futura.");
      }
      if (rule.minScheduleDelayMinutes != null && diffMinutes < rule.minScheduleDelayMinutes) {
        errors.push(`${rule.name} richiede almeno ${rule.minScheduleDelayMinutes} minuti di anticipo.`);
      }
      if (rule.maxScheduleDays != null && diffMinutes > rule.maxScheduleDays * 24 * 60) {
        errors.push(`${rule.name} permette programmazioni fino a ${rule.maxScheduleDays} giorni.`);
      }
    }
  }

  return {
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    connectedSelectedPlatforms,
    demoSelectedPlatforms,
    canPublishLive: livePublishingEnabled && connectedSelectedPlatforms.length > 0 && errors.length === 0,
    canSaveDraft: hasText && input.selectedPlatforms.length > 0,
  };
}

export function parseSocialBulkCsv(
  raw: string,
  rules: SocialPlatformRule[],
  now = new Date(),
): SocialBulkPost[] {
  const lines = raw.trim().split(/\r?\n/).filter((line) => line.trim());
  const fallbackDate = new Date(now.getTime() + 86_400_000).toISOString();
  if (lines.length < 2) return [];

  return lines.slice(1).map((line, idx) => {
    const cols = parseCsvLine(line);
    const [platformsRaw = "", text = "", hashtagsRaw = "", dateRaw = "", imageUrl = ""] = cols;
    const platforms = platformsRaw
      .split(";")
      .map((platform) => platform.trim().toLowerCase())
      .filter((platform) => rules.some((rule) => rule.id === platform || rule.name.toLowerCase() === platform))
      .map((platform) => {
        const found = rules.find((rule) => rule.name.toLowerCase() === platform || rule.id === platform);
        return found?.id ?? platform;
      });
    const hashtags = hashtagsRaw
      .split(/\s+/)
      .map((hashtag) => hashtag.replace(/^#+/, ""))
      .filter(Boolean)
      .map((hashtag) => `#${hashtag}`);
    const parsedDate = new Date(dateRaw.trim());
    const isValidDate = Boolean(dateRaw.trim()) && !Number.isNaN(parsedDate.getTime());
    const hasError = platforms.length === 0 || !text.trim() || !isValidDate;

    return {
      row: idx + 2,
      platforms: platforms.length > 0 ? platforms : ["instagram"],
      text: text.trim(),
      hashtags,
      scheduled_at: isValidDate ? parsedDate.toISOString() : fallbackDate,
      image_url: imageUrl.trim() || undefined,
      status: hasError ? "error" : "ok",
      errorMsg: !text.trim()
        ? "Testo mancante"
        : platforms.length === 0
          ? "Piattaforme non riconosciute"
          : !isValidDate
            ? "Data non valida (formato: YYYY-MM-DDTHH:MM)"
            : undefined,
    };
  });
}
