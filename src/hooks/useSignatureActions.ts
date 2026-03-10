import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export function useSignatureActions(quoteId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["quote", quoteId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.quotes?.all ?? ["quotes"] });
  };

  const sendForSignature = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("send-quote-signature", {
        body: { quote_id: quoteId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success("Offerta inviata al cliente per la firma");
      invalidate();
    },
    onError: (err: any) => {
      toast.error("Errore invio: " + (err.message || "errore sconosciuto"));
    },
  });

  return { sendForSignature };
}
