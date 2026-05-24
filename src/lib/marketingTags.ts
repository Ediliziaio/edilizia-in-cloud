export const TAG_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#dc2626",
  "#9333ea",
  "#0891b2",
  "#ca8a04",
  "#475569",
] as const;

export const DEFAULT_TAG_COLOR = TAG_COLORS[0];

export function normalizeTagName(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeTagList(values: readonly (string | null | undefined)[] | null | undefined) {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values ?? []) {
    const tag = normalizeTagName(value);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }

  return normalized;
}

export function areTagListsEqual(
  first: readonly (string | null | undefined)[] | null | undefined,
  second: readonly (string | null | undefined)[] | null | undefined,
) {
  const left = normalizeTagList(first);
  const right = normalizeTagList(second);

  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function areTagListsExactlyEqual(
  first: readonly (string | null | undefined)[] | null | undefined,
  second: readonly (string | null | undefined)[] | null | undefined,
) {
  const left = (first ?? []).map((tag) => String(tag ?? ""));
  const right = (second ?? []).map((tag) => String(tag ?? ""));

  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function hasNormalizedTag(values: readonly (string | null | undefined)[] | null | undefined, tagName: string) {
  const normalized = normalizeTagName(tagName);
  return !!normalized && normalizeTagList(values).includes(normalized);
}

export function getAddedTags(
  nextTags: readonly (string | null | undefined)[] | null | undefined,
  previousTags: readonly (string | null | undefined)[] | null | undefined,
) {
  const previous = new Set(normalizeTagList(previousTags));
  return normalizeTagList(nextTags).filter((tag) => !previous.has(tag));
}

export function getRemovedTags(
  previousTags: readonly (string | null | undefined)[] | null | undefined,
  nextTags: readonly (string | null | undefined)[] | null | undefined,
) {
  const next = new Set(normalizeTagList(nextTags));
  return normalizeTagList(previousTags).filter((tag) => !next.has(tag));
}
