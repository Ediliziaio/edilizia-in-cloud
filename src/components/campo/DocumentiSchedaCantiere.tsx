import { useState } from "react";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { UniformSelect } from "@/components/ui/uniform-select";
import { ATTACHMENTS_BUCKET, scaricaAllegato } from "@/components/orders/filePreviewUtils";
import { supabase } from "@/integrations/supabase/client";
import { apriDocumentoDopoAttesa } from "@/lib/campo/apriDocumento";
import type { DocumentoSchedaCantiere } from "@/lib/campo/schedaCantiere";
import { TIPI_DOCUMENTO_CANTIERE } from "@/lib/commesse/documentiCantiere";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { createPdfPreviewUrl, revokePdfPreviewUrl } from "@/lib/pdfPreviewSource";

const TIPI_ANTEPRIMA = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
} as const;

function mimeAnteprima(doc: DocumentoSchedaCantiere) {
  const tipo = doc.mime?.toLowerCase().split(";")[0];
  const riconosciuto = Object.values(TIPI_ANTEPRIMA).find(mime => mime === tipo);
  if (riconosciuto) return riconosciuto;
  const estensione = doc.nome.split(".").pop()?.toLowerCase() as keyof typeof TIPI_ANTEPRIMA | undefined;
  return estensione && Object.hasOwn(TIPI_ANTEPRIMA, estensione) ? TIPI_ANTEPRIMA[estensione] : null;
}

const nomeCategoria = (doc: DocumentoSchedaCantiere) =>
  TIPI_DOCUMENTO_CANTIERE[doc.categoria] || "Altro documento di cantiere";

export function DocumentiSchedaCantiere({ documenti }: { documenti: DocumentoSchedaCantiere[] }) {
  const t = useT();
  const [ricerca, setRicerca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [attivo, setAttivo] = useState<string | null>(null);
  const categorie = [...new Map(documenti.map(doc => [doc.categoria, nomeCategoria(doc)]))];
  const testo = ricerca.trim().toLocaleLowerCase("it");
  const visibili = documenti.filter(doc =>
    (!categoria || doc.categoria === categoria)
    && (!testo || `${doc.nome} ${nomeCategoria(doc)}`.toLocaleLowerCase("it").includes(testo)),
  );

  async function apri(doc: DocumentoSchedaCantiere, mime: string | null) {
    if (attivo) return;
    setAttivo(doc.id);
    try {
      if (!mime) {
        await scaricaAllegato(doc.percorso, doc.nome);
        return;
      }
      const esito = await apriDocumentoDopoAttesa(async () => {
        const { data, error } = await supabase.storage.from(ATTACHMENTS_BUCKET).download(doc.percorso);
        if (error || !data) return null;
        // Il tipo dell’anteprima è ristretto a PDF e formati immagine passivi.
        const url = createPdfPreviewUrl(new Blob([data], { type: mime }));
        window.setTimeout(() => revokePdfPreviewUrl(url), 60_000);
        return url;
      }, doc.nome);
      if (!esito) toast.error(t("Documento non disponibile. Riprova."));
    } catch {
      toast.error(t("Documento non disponibile. Riprova."));
    } finally {
      setAttivo(null);
    }
  }

  if (!documenti.length) return <div className="rounded-xl border bg-card p-3 text-sm text-muted-foreground">
    <p className="font-medium text-foreground">{t("Nessun documento per questo cantiere")}</p>
    <p className="mt-1 text-xs">{t("Qui trovi disegni, piani di sicurezza e schede tecniche che l’ufficio mette a disposizione della squadra.")}</p>
  </div>;

  return <div className="space-y-2">
    <div className="grid gap-2 sm:grid-cols-[1fr_14rem]">
      <Input className="h-11 text-base" type="search" aria-label={t("Cerca documenti")} placeholder={t("Cerca documenti")} value={ricerca}
        onChange={event => setRicerca(event.target.value)} />
      {categorie.length > 1 && <UniformSelect className="min-h-11 w-full bg-card" aria-label={t("Categoria documento")} value={categoria}
        onChange={event => setCategoria(event.target.value)}>
        <option value="">{t("Tutte le categorie")}</option>
        {categorie.map(([id, nome]) => <option key={id} value={id}>{t(nome)}</option>)}
      </UniformSelect>}
    </div>
    {visibili.length === 0 ? <p className="py-3 text-sm text-muted-foreground">{t("Nessun documento corrisponde alla ricerca.")}</p> :
      <ul className="divide-y rounded-xl border bg-card" aria-label={t("Documenti operativi")}>
        {visibili.map(doc => {
          const mime = mimeAnteprima(doc);
          const scheda = <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium [overflow-wrap:anywhere]">{doc.nome}</span>
            <span className="block text-xs text-muted-foreground">{t(nomeCategoria(doc))}{doc.revisione && ` · ${t("Rev. {n}", { n: doc.revisione })}`}</span>
          </span>;
          return <li key={doc.id} className="flex items-center gap-1.5 px-2 py-2.5 sm:gap-2.5 sm:px-3">
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {mime ? <button type="button" className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md pr-2 text-left hover:bg-muted"
              aria-label={t("Apri {nome}", { nome: doc.nome })} disabled={!!attivo} onClick={() => void apri(doc, mime)}>
              {scheda}<ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button> : scheda}
            <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label={t("Scarica {nome}", { nome: doc.nome })}
              disabled={!!attivo} onClick={() => void apri(doc, null)}>
              {attivo === doc.id ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
            </Button>
          </li>;
        })}
      </ul>}
  </div>;
}
