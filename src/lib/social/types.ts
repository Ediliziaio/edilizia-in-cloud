export type SocialPostStatus = "draft" | "scheduled" | "published" | "failed" | "review";

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
