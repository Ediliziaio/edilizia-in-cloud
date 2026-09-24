import type { SocialPostMedia, SocialPublishResultEntry } from "./types";

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

/** «Facebook», «Facebook e Instagram», «LinkedIn, YouTube e TikTok». */
function elenco(nomi: string[]): string {
  if (nomi.length <= 1) return nomi.join("");
  return `${nomi.slice(0, -1).join(", ")} e ${nomi[nomi.length - 1]}`;
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

  const connectedSelectedPlatforms = input.selectedPlatforms.filter((platformId) => connected.has(platformId));
  const demoSelectedPlatforms = input.selectedPlatforms.filter((platformId) => !connected.has(platformId));
  // I limiti valgono per chi riceverà il post: una piattaforma che non può
  // pubblicare non deve bloccare le altre. Senza nessuna pronta (bozza), per tutte.
  const selectedRules = (connectedSelectedPlatforms.length > 0 ? connectedSelectedPlatforms : input.selectedPlatforms)
    .map((platformId) => rulesMap.get(platformId))
    .filter((rule): rule is SocialPlatformRule => Boolean(rule));
  const hasText = input.selectedPlatforms.some((platformId) => textForPlatform(input, platformId).length > 0);

  if (input.selectedPlatforms.length === 0) {
    errors.push("Seleziona almeno una piattaforma.");
  }
  if (!hasText) {
    errors.push("Scrivi il testo del post.");
  }
  if (livePublishingEnabled && input.selectedPlatforms.length > 0 && connectedSelectedPlatforms.length === 0) {
    errors.push("Nessuna delle piattaforme scelte può pubblicare adesso: salva il post come bozza.");
  }
  if (!livePublishingEnabled) {
    warnings.push("La pubblicazione da qui non è ancora attiva: salva il post come bozza.");
  }
  if (demoSelectedPlatforms.length > 0 && connectedSelectedPlatforms.length > 0) {
    const nome = (id: string) => rulesMap.get(id)?.name ?? id;
    const bloccate = demoSelectedPlatforms.map(nome);
    warnings.push(
      `${elenco(bloccate)} ${bloccate.length === 1 ? "non può" : "non possono"} pubblicare adesso: ` +
        `il post uscirà solo su ${elenco(connectedSelectedPlatforms.map(nome))}.`,
    );
  }

  for (const rule of selectedRules) {
    const text = textForPlatform(input, rule.id);
    if (!rule.contentTypes.includes(input.contentType)) {
      errors.push(`${rule.name} non supporta il formato selezionato.`);
    }
    if (text.length > rule.maxChars) {
      errors.push(`${rule.name}: il testo supera i ${rule.maxChars.toLocaleString("it-IT")} caratteri.`);
    }
    if (input.hashtags.length > rule.hashtagsMax) {
      errors.push(`${rule.name} permette al massimo ${rule.hashtagsMax} hashtag.`);
    }
    if ((rule.videoOnly || input.contentType === "video" || input.contentType === "reel") && !input.mediaUrl) {
      errors.push(`${rule.name} richiede un file video prima della pubblicazione.`);
    }
    if (!input.publishNow && rule.schedulingSupport === "draft_only" && connected.has(rule.id)) {
      warnings.push(`${rule.name} non si programma da qui: salva il post come bozza e pubblicalo a mano.`);
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

// ─── Meta: pagina di destinazione, file, carosello ───────────────────────────
// Stesse regole del publisher (supabase/functions/_shared/socialPublishLogic.ts),
// controllate nel composer prima di salvare: meglio un errore qui che un post
// 'failed' all'ora programmata.

export interface SocialMetaTargetsInput {
  selectedPlatforms: string[];
  contentType: string;
  accounts: Array<{ platform_id: string; page_id: string; page_name?: string }>;
  targetPageIds: Record<string, string>;
  media: SocialPostMedia[];
}

/** Pagine/account collegati per una piattaforma Meta, senza doppioni. */
export function metaAccountsFor<T extends { platform_id: string; page_id: string }>(accounts: T[], platform: string): T[] {
  const seen = new Set<string>();
  return accounts.filter((account) => {
    if (account.platform_id !== platform || !account.page_id || seen.has(account.page_id)) return false;
    seen.add(account.page_id);
    return true;
  });
}

export function validateMetaPublishTargets(input: SocialMetaTargetsInput): string[] {
  const errors: string[] = [];
  const hasFb = input.selectedPlatforms.includes("facebook");
  const hasIg = input.selectedPlatforms.includes("instagram");

  for (const platform of ["facebook", "instagram"]) {
    if (!input.selectedPlatforms.includes(platform)) continue;
    const options = metaAccountsFor(input.accounts, platform);
    const chosen = input.targetPageIds[platform];
    if (chosen && options.length > 0 && !options.some((option) => option.page_id === chosen)) {
      errors.push(platform === "instagram"
        ? "L'account Instagram scelto non è più collegato: scegline un altro."
        : "La pagina Facebook scelta non è più collegata: scegline un'altra.");
    } else if (!chosen && options.length > 1) {
      errors.push(platform === "instagram"
        ? "Scegli su quale account Instagram pubblicare."
        : "Scegli su quale pagina Facebook pubblicare.");
    }
  }

  if (!hasFb && !hasIg) return errors;

  const count = input.media.length;
  const videos = input.media.filter((item) => item.type === "video").length;
  if (input.contentType === "carosello") {
    if (count < 2) errors.push("Il carosello richiede almeno 2 file.");
    if (count > 10) errors.push("Il carosello accetta al massimo 10 file.");
    if (hasFb && videos > 0) errors.push("Su Facebook il carosello accetta solo immagini.");
  }
  if (input.contentType === "reel" && videos === 0) {
    errors.push("Il Reel richiede un video (MP4 o MOV).");
  }
  if (input.contentType === "story") {
    if (count > 1) errors.push("La storia accetta un solo file.");
    if (hasFb) errors.push("Le storie Facebook non si pubblicano ancora da qui: togli Facebook o scegli un altro formato.");
  }
  if (hasIg && count === 0) {
    errors.push("Instagram richiede almeno un'immagine o un video.");
  }
  return Array.from(new Set(errors));
}

const PUBLISH_RESULT_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  _error: "Pubblicazione",
};

export interface SocialPublishIssue {
  tone: "error" | "warning" | "info";
  text: string;
}

/** Righe leggibili dall'esito del publisher (errori, avvisi, elaborazione in corso). */
export function describePublishResult(
  result: Record<string, SocialPublishResultEntry> | null | undefined,
): SocialPublishIssue[] {
  const issues: SocialPublishIssue[] = [];
  for (const [key, entry] of Object.entries(result ?? {})) {
    if (!entry || typeof entry !== "object") continue;
    const label = PUBLISH_RESULT_LABELS[key] ?? key;
    if (entry.pending) {
      issues.push({ tone: "info", text: `${label}: in elaborazione, esce appena Meta ha finito.` });
    } else if (entry.ok === false && entry.error) {
      issues.push({ tone: "error", text: `${label}: ${entry.error}` });
    }
    for (const warning of entry.warnings ?? []) {
      issues.push({ tone: "warning", text: `${label}: ${warning}` });
    }
  }
  return issues;
}
