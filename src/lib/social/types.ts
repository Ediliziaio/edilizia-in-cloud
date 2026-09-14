export type SocialPostStatus = "draft" | "scheduled" | "processing" | "published" | "failed" | "review";

/** Un file del post. bucket+path = caricato nello Storage (URL firmato generato al giro). */
export interface SocialPostMedia {
  url?: string;
  bucket?: string;
  path?: string;
  type: "image" | "video";
}

/** Esito per piattaforma scritto dal publisher in social_posts.publish_result. */
export interface SocialPublishResultEntry {
  ok?: boolean;
  id?: string;
  error?: string;
  pending?: boolean;
  retryable?: boolean;
  reconnect?: boolean;
  page_id?: string;
  warnings?: string[];
}

export interface SocialConnectedAccount {
  platform_id: string;
  page_id: string;
  page_name: string;
  followers?: number;
  connected_at: string;
}

export interface SocialScheduledPost {
  id: string;
  platforms: string[];
  contentType: string;
  text: string;
  platformTexts?: Record<string, string>;
  image_url?: string;
  hashtags: string[];
  firstComment?: string;
  scheduled_at: string;
  status: SocialPostStatus;
  created_at: string;
  reviewNote?: string;
  mediaItemId?: string;
  /** pagina di destinazione per piattaforma (page_id); vuoto = unica pagina collegata */
  targetPageIds?: Record<string, string>;
  /** file del post (più di uno = carosello) */
  media?: SocialPostMedia[];
  publishResult?: Record<string, SocialPublishResultEntry>;
}

export interface SocialMediaItem {
  id: string;
  type: "image" | "video" | "story";
  format: "9:16" | "4:5" | "1:1" | "16:9";
  title: string;
  tags: string[];
  usedInPosts: number;
  usedInAds: number;
  created_at: string;
  gradient: string;
  category: "portfolio" | "promo" | "team" | "cantiere" | "prodotto";
  aiGenerated: boolean;
  fileSize: string;
  public_url?: string;
  thumbnail_url?: string;
  storage_path?: string;
}
