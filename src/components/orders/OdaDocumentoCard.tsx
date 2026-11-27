/**
 * Il documento che prova l'ordine, quando l'ordine non e' partito da qui.
 *
 * Chi compra su un e-commerce ha la conferma d'ordine, chi compra al banco ha
 * lo scontrino: sono l'equivalente dell'email che il gestionale manda da solo.
 * Senza un posto dove metterli finivano nella cartella Download di qualcuno,
 * e al primo contestazione con il fornitore non li trovava piu' nessuno.
 */
import { useRef, useState } from "react";
import { QuoteCard } from "@/components/marketing/preventivi/ui/builderUI";
import { Button } from "@/components/ui/button";
import { FileText, Upload, Loader2, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ACCEPT_DOCUMENTI_DDT, erroreDocumento } from "@/lib/ddt/preparaDocumento";
import { BUCKET_DOCUMENTO_ODA as BUCKET, caricaDocumentoOda, eliminaDocumentoOda, registraDocumentoOda } from "@/lib/orders/documentoOda";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

interface Props {
  odaId: string;
  /** La commessa dell'ordine: il documento si salva tra i suoi (24/11/2026). Senza, non si carica. */
  commessaId: string | null;
  /** Come si chiama il documento per questa origine (conferma, scontrino…). */
  label: string;
  /** Path nel bucket, gia' salvato su purchase_orders.attachment_url. */
  attachmentUrl: string | null | undefined;
  /** Numero d'ordine sul sito o dello scontrino. */
  riferimento?: string | null;
  riferimentoLabel?: string;
  onChange: (attachmentUrl: string | null) => void | Promise<void>;
}

export function OdaDocumentoCard({
  commessaId,
  label,
  attachmentUrl,
  riferimento,
  riferimentoLabel,
  onChange,
}: Props) {
  const t = useT();
  const nomeDoc = t(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const nomeFile = attachmentUrl ? attachmentUrl.split("/").pop() : null;

  const apri = async () => {
    if (!attachmentUrl || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(attachmentUrl, 3600);
      if (error || !data?.signedUrl)
        throw new Error(
          error?.message || t("Collegamento al documento non disponibile"),
        );
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(t("Documento non apribile"), {
        description: messaggioErrore(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const carica = async (file: File) => {
    if (busy) return;
    if (inputRef.current) inputRef.current.value = "";
    const problema = erroreDocumento(file);
    if (problema) {
      toast.error(t(problema));
      return;
    }
    if (!commessaId || !user?.id) return;
    setBusy(true);
    let caricato: string | null = null;
    try {
      caricato = await caricaDocumentoOda(commessaId, file);
      // Senza la riga tra i documenti della commessa lo storage non lo fa rileggere.
      const errRiga = await registraDocumentoOda({ commessaId, percorso: caricato, file, userId: user.id });
      if (errRiga) throw new Error(errRiga);
      await onChange(caricato);
      caricato = null;
      toast.success(t("{nome} caricato", { nome: nomeDoc }));
    } catch (e) {
      // Se il riferimento non è salvato, si toglie soltanto il nuovo upload.
      if (caricato) await eliminaDocumentoOda(caricato);
      toast.error(t("Caricamento non riuscito"), {
        description: messaggioErrore(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const rimuovi = async () => {
    if (!attachmentUrl) return;
    setBusy(true);
    try {
      // Prima si stacca il riferimento, poi si prova a cancellare il file: se
      // la cancellazione fallisce resta un file orfano, non una riga che punta
      // a un documento che non c'e' piu'.
      await onChange(null);
      const errore = await eliminaDocumentoOda(attachmentUrl);
      if (errore)
        toast.error(t("Riferimento rimosso; eliminazione del file non riuscita"), {
          description: errore,
        });
    } catch (e) {
      toast.error(t("Il documento non è stato rimosso"), {
        description: messaggioErrore(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <QuoteCard title={nomeDoc} icon={<FileText className="h-4 w-4" />}>
      <div className="space-y-2">
        {riferimento && riferimentoLabel && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{t(riferimentoLabel)}</span>
            <span className="font-medium text-slate-900 font-mono text-xs">
              {riferimento}
            </span>
          </div>
        )}
        {attachmentUrl ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={apri}
              disabled={busy}
              aria-label={t("Apri {nome}", { nome: nomeDoc.toLowerCase() })}
              className="flex-1 min-w-0 flex items-center gap-1.5 rounded-md bg-slate-50 hover:bg-slate-100 px-2.5 py-2 text-xs text-left transition-colors"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-slate-700">{nomeFile}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
            <Button
              aria-label={t("Rimuovi {nome}", { nome: nomeDoc.toLowerCase() })}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={rimuovi}
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ) : !commessaId ? (
          <p className="text-xs text-slate-500">
            Per allegare il documento collega prima l’ordine a una commessa: il file si
            conserva tra i documenti della commessa, visibile a chi vede i costi.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {t("Allega la conferma originale ricevuta dal fornitore, con prezzi e condizioni. Il file resta collegato a questo ordine. Il caricamento non aggiorna automaticamente i prezzi: verifica e riporta gli importi concordati nelle righe prima di confermare l’ordine.")}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1.5" />
              )}
              {t("Carica {nome}", { nome: nomeDoc.toLowerCase() })}
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_DOCUMENTI_DDT}
          aria-label={`File: ${label.toLowerCase()}`}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) carica(f);
          }}
        />
      </div>
    </QuoteCard>
  );
}
