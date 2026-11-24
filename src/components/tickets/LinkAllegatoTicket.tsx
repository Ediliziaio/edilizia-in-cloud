import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { allegatoTicket, TICKET_ATTACHMENTS_BUCKET } from "@/lib/tickets/allegato";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function LinkAllegatoTicket({ ticketId, riferimento, inChat, className }: {
  ticketId: string;
  riferimento: string;
  inChat?: boolean;
  className?: string;
}) {
  const t = useT();
  const { user, effectiveCompany } = useAuth();
  const { toast } = useToast();
  const { path, nome, immagine } = allegatoTicket(riferimento, ticketId);
  const { data: anteprima } = useQuery({
    queryKey: ["anteprima-allegato-ticket", effectiveCompany?.id, user?.id, path],
    enabled: immagine && !!path && !!user?.id,
    staleTime: 240_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(TICKET_ATTACHMENTS_BUCKET).createSignedUrl(path!, 300);
      if (error) throw error;
      return data.signedUrl;
    },
    retry: false,
  });

  const scarica = useMutation({
    mutationFn: async () => {
      if (!path) throw new Error(t("Percorso dell’allegato non disponibile."));
      const { data, error } = await supabase.storage.from(TICKET_ATTACHMENTS_BUCKET).download(path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    },
    onError: () => toast({
      title: t("Allegato non disponibile"),
      description: t("Verifica di avere ancora accesso al ticket e riprova."),
      variant: "destructive",
    }),
  });

  return (
    <button type="button" aria-label={t("Scarica {nome}", { nome: String(nome ?? "") })} title={path ? nome : t("Percorso dell’allegato non disponibile")}
      disabled={!path || scarica.isPending} onClick={() => scarica.mutate()}
      className={cn("flex max-w-full items-center gap-2 rounded-md text-left disabled:opacity-60", className)}>
      {anteprima
        ? <img src={anteprima} alt="" loading="lazy" className={inChat ? "max-h-[180px] max-w-[240px] rounded-md object-cover" : "h-8 w-8 shrink-0 rounded object-cover"} />
        : <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />}
      {(!inChat || !anteprima) && <span className="flex-1 truncate text-xs">{nome}</span>}
      {scarica.isPending ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Download className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}
