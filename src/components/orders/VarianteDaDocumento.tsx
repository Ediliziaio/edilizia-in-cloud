/**
 * «Leggi con l'AI» nei Lavori extra e varianti (15/11/2026, proposta 2 delle idee sull'AI).
 *
 * Il cliente manda un PDF, una foto o una mail: «aggiungere due punti luce, togliere il controsoffitto». Qui si
 * carica il file o si incolla il testo, l'AI lo legge (`generic-doc-ai-extract`, tipo `variante_commessa`) e si apre
 * la variante già scritta, come quella dal preventivo accettato: chiudendola resta come «Bozza», da mandare al cliente
 * solo dopo averla controllata. Le regole su cosa si prende
 * stanno in `lib/orders/varianteDaDocumento`.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeFunctionError";
import { BUCKET_ORIGINALI_AI } from "@/lib/orders/documentImportAi";
import { emptyVariationDraft, type VariationDraft } from "@/lib/orders/variationDraft";
import { bozzaVarianteDaDocumento, leggiVarianteDaAi } from "@/lib/orders/varianteDaDocumento";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { VariationContext } from "./VariationEditor";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

const MAX_FILE = 18 * 1024 * 1024;
const MAX_TESTO = 30000;

function nomePulito(name: string): string {
  const ext = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase()}` : "";
  const base = name.replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${base || "documento"}${ext}`;
}

export function VarianteDaDocumento({ companyId, context, onBozza }: {
  companyId: string;
  context: VariationContext;
  onBozza: (bozza: VariationDraft) => void;
}) {
  const t = useT();
  const [aperto, setAperto] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [scritto, setScritto] = useState("");
  const [leggo, setLeggo] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const chiudi = () => { if (leggo) return; setAperto(false); setFile(null); setScritto(""); setErrore(null); };

  const leggi = async () => {
    const daLeggere = file ?? (scritto.trim() ? new File([scritto.trim().slice(0, MAX_TESTO)], "testo-incollato.txt", { type: "text/plain" }) : null);
    if (!daLeggere) return;
    setLeggo(true); setErrore(null);
    try {
      // Percorso dal contenuto: lo stesso documento riletto riusa il file (e la lettura in cache).
      const hash = await crypto.subtle.digest("SHA-256", await daLeggere.arrayBuffer());
      const sha = Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
      const path = `${companyId}/ai-varianti/${sha}-${nomePulito(daLeggere.name)}`;
      const { error: eUp } = await supabase.storage.from(BUCKET_ORIGINALI_AI).upload(path, daLeggere, { upsert: false, contentType: daLeggere.type || undefined });
      if (eUp && !/already exists|duplicate/i.test(eUp.message)) throw new Error(t("Caricamento: {errore}", { errore: eUp.message }));
      const { data, error } = await supabase.functions.invoke("generic-doc-ai-extract", {
        body: {
          storage_bucket: BUCKET_ORIGINALI_AI, storage_path: path, file_name: daLeggere.name,
          mime_type: daLeggere.type || "application/pdf", company_id: companyId, doc_type: "variante_commessa",
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, t("Lettura AI non riuscita")));
      if (data?.error) throw new Error(String(data.error));
      const letta = leggiVarianteDaAi(data?.extracted ?? data);
      if (!letta.titolo && !letta.descrizione && letta.voci.length === 0) {
        throw new Error(t("Nel documento non ho trovato lavori da aggiungere o togliere. Controlla il file o scrivi la variante a mano."));
      }
      const { bozza, avvisi } = bozzaVarianteDaDocumento(letta, {
        ...emptyVariationDraft(),
        documentCompanyName: context.companyName, documentCompanyDetails: context.companyDetails,
        documentCustomerName: context.customerName, documentCustomerDetails: context.customerAddress,
      });
      setLeggo(false); setAperto(false); setFile(null); setScritto(""); setErrore(null);
      onBozza(bozza);
      toast.success(t("Variante scritta dal documento: controllala"), avvisi.length
        ? { description: avvisi.join(" "), duration: 15000 }
        : { description: t("Chiudendo resta come bozza: al cliente parte solo quando la mandi tu.") });
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e));
      setLeggo(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAperto(true)} aria-label={t("Leggi una variante con l'AI")}>
        <Sparkles className="h-4 w-4" /><span className="ml-1.5 hidden sm:inline">{t("Leggi con l'AI")}</span>
      </Button>
      <Dialog open={aperto} onOpenChange={(o) => !o && chiudi()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("Variante da un documento")}</DialogTitle>
            <DialogDescription>{t("Carica il PDF o la foto della richiesta, oppure incolla il testo della mail. L'AI scrive la variante come bozza; tu la controlli prima di mandarla.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="space-y-1">
              <Label htmlFor="variante-ai-file">{t("PDF o foto")}</Label>
              <Input id="variante-ai-file" type="file" accept="application/pdf,image/*" disabled={leggo}
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > MAX_FILE) { setErrore(t("File troppo grande (massimo 18 MB).")); return; }
                  setFile(f); setErrore(null);
                }} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="variante-ai-testo">{t("Oppure il testo della richiesta")}</Label>
              <Textarea id="variante-ai-testo" rows={5} disabled={leggo || !!file} maxLength={MAX_TESTO} value={scritto}
                placeholder={t("Es. «Buongiorno, vorremmo aggiungere due punti luce in cucina e non fare più il controsoffitto in bagno.»")}
                onChange={(e) => setScritto(e.target.value)} />
              {file && <p className="text-xs text-muted-foreground">{t("Si legge il file {nome}.", { nome: file.name })}</p>}
            </div>
            {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={leggo} onClick={chiudi}>{t("Annulla")}</Button>
            <Button disabled={leggo || (!file && !scritto.trim())} onClick={() => void leggi()}>
              {leggo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
              {leggo ? t("Leggo…") : t("Leggi e scrivi la variante")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
