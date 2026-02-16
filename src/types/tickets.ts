export type TicketStatus = "aperto" | "in_lavorazione" | "risolto";

export interface TicketMessage {
  id: string;
  message: string;
  sender_id: string;
  created_at: string;
  sender?: {
    first_name: string;
    last_name: string;
  } | null;
}

export interface TicketListItem {
  id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  } | null;
  order?: {
    description: string;
  } | null;
}

export interface TicketDetail {
  id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  customer_id: string;
  order_id: string | null;
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
  order?: {
    id: string;
    description: string;
  } | null;
}

export interface CustomerTicketListItem {
  id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  updated_at: string;
  order_id: string | null;
  order?: {
    description: string;
  } | null;
}

export interface CustomerTicketDetail {
  id: string;
  subject: string;
  status: TicketStatus;
  created_at: string;
  order_id: string | null;
  order?: {
    id: string;
    description: string;
  } | null;
}
