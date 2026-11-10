/**
 * «Invia alla direzione lavori» su una pagina firmata. Parte solo dal clic e dopo
 * la conferma che mostra l'indirizzo; il permesso lo controlla anche la funzione edge.
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { GIORNI_VALIDITA_LINK_DL, RUOLI_INVIO_GIORNALE, emailDlValida, type RuoloInvioGiornale } from "../../../supabase/functions/_shared/linkGiornaleDl";

interface Props {
  giornaleId: string;
  orderId: string;
  dlNotifiedAt?: string | null;
  onInviato: (iso: string) => void;
}

export function InviaDirezioneLavori({ giornaleId, orderId, dlNotifiedAt, onInviato }: Props) {
  const [aperto, setAperto] = useState(false);
  /** null = non toccato: vale l'indirizzo della commessa. */
  const [scritto, setScritto] = useState<string | null>(null);
  const [ruolo, setRuolo] = useState<RuoloInvioGiornale>("direzione_lavori");
  const perLaDirezione = ruolo === "direzione_lavori";

  const { data: indirizzoCommessa = "", isLoading } = useQuery({
    queryKey: ["giornale-dl-email", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("dl_notification_email").eq("id", orderId).maybeSingle();
      if (error) throw error;
      return data?.dl_notification_email?.trim() ?? "";
    },
    enabled: aperto && !!orderId,
  });
  // L'indirizzo della commessa è quello della direzione lavori: per gli altri si scrive.
  const email = (scritto ?? (perLaDirezione ? indirizzoCommessa : "")).trim();

  const invia = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("giornale-invia-dl", {
        body: { giornale_id: giornaleId, email, ruolo, conferma: true },
      });
      if (error) {
        const dettaglio = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(dettaglio?.error || "Invio non riuscito");
      }
      return data as { dl_notified_at: string };
    },
    onSuccess: (esito) => {
      toast.success(`Link inviato a ${email}`);
      if (perLaDirezione) onInviato(esito.dl_notified_at);
      setAperto(false);
      setScritto(null);
    },
    onError: (e: Error) => toast.error("Invio non riuscito", { description: e.message }),
  });

  return (
    <>
      <div className="space-y-1">
        <Button className="w-full" size="lg" variant="outline" onClick={() => setAperto(true)}>
          <Send className="mr-2 h-4 w-4" aria-hidden="true" />
          Condividi la pagina firmata
        </Button>
        {dlNotifiedAt && <p className="text-center text-xs text-muted-foreground">Ultimo invio il {format(new Date(dlNotifiedAt), "dd/MM/yyyy HH:mm")}</p>}
      </div>

      <AlertDialog open={aperto} onOpenChange={(o) => { if (!o && !invia.isPending) { setAperto(false); setScritto(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>A chi vuoi mandare questa pagina?</AlertDialogTitle>
            <AlertDialogDescription>
              {emailDlValida(email)
                ? <>Parte un'email a <strong>{email}</strong> con un link al documento firmato, che vale {GIORNI_VALIDITA_LINK_DL} giorni e si apre senza accesso.</>
                : "Scrivi l'indirizzo a cui spedire il link al documento firmato."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1">
            <Label htmlFor="giornale_ruolo">Destinatario</Label>
            <select id="giornale_ruolo" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={ruolo}
              onChange={(e) => { setRuolo(e.target.value as RuoloInvioGiornale); setScritto(null); }}>
              {RUOLI_INVIO_GIORNALE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="dl_email">Email del destinatario</Label>
            <Input id="dl_email" type="email" inputMode="email" autoComplete="off" placeholder={isLoading ? "Cerco l'indirizzo…" : "nome@studio.it"} value={scritto ?? indirizzoCommessa} onChange={(e) => setScritto(e.target.value)} />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={invia.isPending}>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); invia.mutate(); }} disabled={invia.isPending || !emailDlValida(email)}>
              {invia.isPending ? "Invio..." : "Invia"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
