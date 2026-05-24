export type ChatMessagePreview = {
  id: string;
  channel_id: string;
  created_at: string;
};

export type ChatProfileOption = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};

type FileLike = {
  name: string;
  type?: string;
};

const SILVIO_UPLOAD_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
]);

const SILVIO_UPLOAD_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "pdf"]);

export function latestMessageByChannel<T extends ChatMessagePreview>(messages: T[]): Record<string, T> {
  return messages.reduce<Record<string, T>>((acc, message) => {
    const existing = acc[message.channel_id];
    if (!existing || Date.parse(message.created_at) > Date.parse(existing.created_at)) {
      acc[message.channel_id] = message;
    }
    return acc;
  }, {});
}

export function normalizeDmUserIds(userA: string, userB: string): string[] {
  return Array.from(new Set([userA, userB].filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function filterChatProfiles<T extends ChatProfileOption>(
  profiles: T[],
  currentUserId: string | null | undefined,
  query: string,
): T[] {
  const normalizedQuery = query.trim().toLowerCase();

  return profiles.filter((profile) => {
    if (profile.id === currentUserId) return false;
    if (!normalizedQuery) return true;

    const searchable = [
      profile.first_name,
      profile.last_name,
      `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim(),
      profile.email,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
}

export function isAllowedSilvioUpload(file: FileLike): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SILVIO_UPLOAD_MIME_TYPES.has(file.type ?? "") || SILVIO_UPLOAD_EXTENSIONS.has(extension);
}

export function toStoredAttachmentUrl(bucket: string, path: string): string {
  return `storage://${bucket}/${path.replace(/^\/+/, "")}`;
}

export function parseStoredAttachmentUrl(rawUrl: string | null | undefined): { bucket: string; path: string } | null {
  if (!rawUrl?.startsWith("storage://")) return null;

  const withoutScheme = rawUrl.slice("storage://".length);
  const slashIndex = withoutScheme.indexOf("/");
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) return null;

  return {
    bucket: withoutScheme.slice(0, slashIndex),
    path: withoutScheme.slice(slashIndex + 1),
  };
}
