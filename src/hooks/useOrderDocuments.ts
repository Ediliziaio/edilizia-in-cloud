import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrderDocument {
  id: string;
  order_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  visible_to_customer: boolean;
}

export function useOrderDocuments(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["order_attachments", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_attachments")
        .select("id, order_id, file_name, file_url, file_type, file_size, visible_to_customer")
        .eq("order_id", orderId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OrderDocument[];
    },
    enabled: !!orderId,
  });
}
