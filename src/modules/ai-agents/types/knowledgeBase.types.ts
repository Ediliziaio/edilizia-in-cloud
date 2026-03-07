export type KBDocType = "url" | "file" | "text";

export interface KBDocument {
  id: string;
  agent_id: string | null;
  company_id: string;
  elevenlabs_doc_id: string | null;
  name: string;
  type: KBDocType;
  source_url: string | null;
  created_by: string;
  created_at: string;
}
