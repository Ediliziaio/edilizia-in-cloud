export interface AIAgentPhoneNumber {
  id: string;
  company_id: string;
  agent_id: string;
  elevenlabs_phone_id: string | null;
  phone_number: string;
  provider: string;
  label: string | null;
  created_at: string;
}
