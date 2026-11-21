import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LinkAllegatoTicket } from "./LinkAllegatoTicket";
import { completaAllegato, preparaAllegato, type AllegatoDaCaricare } from "@/lib/tickets/caricaAllegato";
import { Upload, Loader2, RefreshCw, AlertCircle } from "lucide-react";

interface TicketAttachmentsProps {
  ticketId: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function TicketAttachments(props: TicketAttachmentsProps) {
  return <AllegatiPerTicket key={props.ticketId} {...props} />;
}

function AllegatiPerTicket({ ticketId }: TicketAttachmentsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [mancanti, setMancanti] = useState<AllegatoDaCaricare[]>([]);
  const daCompletare = useRef<AllegatoDaCaricare[]>([]);
  const inCorso = useRef(false);
  useEffect(() => {
    const primaDiUscire = (event: BeforeUnloadEvent) => {
      if (daCompletare.current.length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", primaDiUscire);
    return () => {
      window.removeEventListener("beforeunload", primaDiUscire);
      if (daCompletare.current.length > 0) {
        toast({ title: "Allegati ancora da completare", description: "I file già collegati restano nel ticket. Per quelli mancanti torna a selezionare i file." });
      }
    };
  }, []);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files);
    aggiungi(files);
  };

  const { data: attachments = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.ticketAttachments.byTicket(ticketId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_messages")
        .select("id, attachment_url, created_at")
        .eq("ticket_id", ticketId)
        .not("attachment_url", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).filter((m) => m.attachment_url);
    },
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: async (fileDaInviare: AllegatoDaCaricare[]) => {
      if (!user?.id) throw new Error("Sessione non valida. Ricarica la pagina e riprova.");
      const falliti: AllegatoDaCaricare[] = [];
      for (const allegato of fileDaInviare) {
        try {
          await completaAllegato(allegato, ticketId, user.id);
        } catch {
          falliti.push(allegato);
        }
      }
      return falliti;
    },
    onSuccess: (falliti, inviati) => {
      daCompletare.current = falliti;
      setMancanti(falliti);
      if (falliti.length > 0) {
        toast({ title: `${falliti.length} allegati da completare`, description: "Riprova mancanti per completare i file in elenco." });
      } else {
        toast({ title: inviati.length === 1 ? "Allegato caricato" : "Allegati caricati" });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.ticketAttachments.byTicket(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.adminTicketMessages.byTicket(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.customerTickets.messages(ticketId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.companyTickets.all });
    },
    onError: (err: Error) => {
      toast({ title: "Caricamento non completato", description: err.message, variant: "destructive" });
    },
    onSettled: () => { inCorso.current = false; },
  });

  const invia = (files: AllegatoDaCaricare[]) => {
    if (inCorso.current || files.length === 0) return;
    inCorso.current = true;
    daCompletare.current = files;
    setMancanti(files);
    uploadMutation.mutate(files);
  };
  const aggiungi = (files: File[]) => {
    if (inCorso.current || daCompletare.current.length > 0) return;
    const validi = files.filter((file) => {
      const errore = file.size > MAX_FILE_SIZE ? "Supera il limite di 10 MB" :
        !ALLOWED_TYPES.includes(file.type) ? "Tipo file non supportato" : null;
      if (errore) toast({ title: errore, description: file.name, variant: "destructive" });
      return !errore;
    });
    invia(validi.map((file) => preparaAllegato(ticketId, file)));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    aggiungi(files);
    e.target.value = "";
  };

  return (
    <Card
      className="relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-primary/10 border-2 border-dashed border-primary rounded-lg backdrop-blur-sm">
          <Upload className="h-8 w-8 text-primary mb-2" />
          <p className="text-sm font-medium text-primary">Rilascia per caricare</p>
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Allegati</CardTitle>
          <Button
            aria-label="Carica allegati"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={uploadMutation.isPending || mancanti.length > 0}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </CardHeader>
      <CardContent>
        {mancanti.length > 0 && !uploadMutation.isPending && (
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
            <p className="font-medium">Allegati da completare</p>
            <ul className="my-2 space-y-1">{mancanti.map((a) => <li key={a.id} className="break-all">{a.file.name}</li>)}</ul>
            <Button variant="outline" size="sm" onClick={() => invia(mancanti)}>Riprova mancanti</Button>
            <Button variant="ghost" size="sm" onClick={() => { daCompletare.current = []; setMancanti([]); }}>Rimuovi dalla coda</Button>
          </div>
        )}
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Caricamento...</p>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-center">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <p className="text-xs text-red-700">Impossibile caricare gli allegati.</p>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => refetch()}>
              <RefreshCw className="mr-1.5 h-3 w-3" />
              Riprova
            </Button>
          </div>
        ) : attachments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">Nessun allegato</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {attachments.map((a) => (
              <LinkAllegatoTicket key={a.id} ticketId={ticketId} riferimento={a.attachment_url!}
                className="w-full p-2 transition-colors hover:bg-muted/50" />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
