import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export interface SendSignatureParams {
  recipientEmail: string;
  recipientName: string;
  customMessage?: string;
  expiresDays: number;
}

export function useSignatureActions(quoteId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes.detail(quoteId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
  };

  const sendForSignature = useMutation({
    mutationFn: async (params: SendSignatureParams) => {
      const { data, error } = await supabase.functions.invoke("send-quote-signature", {
        body: {
          quote_id: quoteId,
          recipient_email: params.recipientEmail,
          recipient_name: params.recipientName,
          custom_message: params.customMessage || undefined,
          expires_days: params.expiresDays,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Offerta inviata al cliente per la firma");
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Errore invio: " + (err.message || "errore sconosciuto"));
    },
  });

  return { sendForSignature };
}
