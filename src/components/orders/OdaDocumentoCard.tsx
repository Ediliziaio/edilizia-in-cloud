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

const BUCKET = "order-attachments";
const MAX_MB = 15;

interface Props {
  odaId: string;
  /** Come si chiama il documento per questa origine (conferma, scontrino…). */
  label: string;
  /** Path nel bucket, gia' salvato su purchase_orders.attachment_url. */
  attachmentUrl: string | null | undefined;
  /** Numero d'ordine sul sito o dello scontrino. */
  riferimento?: string | null;
  riferimentoLabel?: string;
  onChange: (attachmentUrl: string | null) => void;
}

export function OdaDocumentoCard({
  odaId,
  label,
  attachmentUrl,
  riferimento,
  riferimentoLabel,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const nomeFile = attachmentUrl ? attachmentUrl.split("/").pop() : null;

  const apri = async () => {
    if (!attachmentUrl) return;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(attachmentUrl, 3600);
    if (error || !data?.signedUrl) {
      toast.error("Documento non apribile", { description: error?.message });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const carica = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      toast.error(`Il file supera ${MAX_MB} MB`);
      return;
    }
    setBusy(true);
    try {
      const nome = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
      const path = `oda/${odaId}/${Date.now()}-${nome}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file);
      if (error) throw error;
      onChange(path);
      toast.success(`${label} caricato`);
    } catch (e) {
      toast.error("Caricamento non riuscito", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const rimuovi = async () => {
    if (!attachmentUrl) return;
    setBusy(true);
    try {
      // Prima si stacca il riferimento, poi si prova a cancellare il file: se
      // la cancellazione fallisce resta un file orfano, non una riga che punta
      // a un documento che non c'e' piu'.
      onChange(null);
      await supabase.storage.from(BUCKET).remove([attachmentUrl]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <QuoteCard title={label} icon={<FileText className="h-4 w-4" />}>
      <div className="space-y-2">
        {riferimento && riferimentoLabel && (
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">{riferimentoLabel}</span>
            <span className="font-medium text-slate-900 font-mono text-xs">{riferimento}</span>
          </div>
        )}
        {attachmentUrl ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={apri}
              className="flex-1 min-w-0 flex items-center gap-1.5 rounded-md bg-slate-50 hover:bg-slate-100 px-2.5 py-2 text-xs text-left transition-colors"
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate text-slate-700">{nomeFile}</span>
              <ExternalLink className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={rimuovi} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              Allega il documento: è la prova dell'ordine se poi c'è da discutere
              con il fornitore.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
              Carica {label.toLowerCase()}
            </Button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
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
