import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { FileText, Loader2, Mic } from "lucide-react";
import { ProgressiveFluxLoader } from "@/components/ui/progressive-flux-loader";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { STATO_DOCUMENTO } from "@/hooks/useDocumentiDDT";
import {
  destinazioneDocumento,
  documentiDb,
  leggiPersistente,
  scartaDocumentoPersistente,
  type DocumentoPersistente,
  type PossibileDuplicatoDDT,
  type RiepilogoInvioWhatsApp,
} from "@/lib/ddt/documentiPersistenti";
import {
  bollaDaFile,
  conLettura,
  type BollaLetta,
} from "@/lib/ddt/importBolle";
import { leggiDDTdaAI } from "@/lib/ddt/letturaAI";
import {
  contaPagine,
  leggiPerDividere,
  type PdfDaDividere,
} from "@/lib/ddt/dividiPdf";
import { preparaDocumento } from "@/lib/ddt/preparaDocumento";
import { BolleInBloccoDialog } from "./BolleInBloccoDialog";
import { AvvisoPossibileDuplicatoDDT } from "./AvvisoPossibileDuplicatoDDT";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";
import { messaggioErrore } from "@/lib/messaggioErrore";

export function RevisioneDocumento({
  documento,
  onClose,
  incorporata = false,
  onRegistrata,
}: {
  documento: DocumentoPersistente;
  onClose: () => void;
  incorporata?: boolean;
  onRegistrata?: (id: string) => void;
}) {
  const t = useT();
  const [divisioneAperta, setDivisioneAperta] = useState(false);
  const caricamento = useQuery<{
    bolla: BollaLetta;
    dividere: boolean;
    multipagina: boolean;
    originale: File;
    pdf?: PdfDaDividere;
  }>({
    queryKey: [
      "ddt-documento-revisione-v2",
      documento.company_id,
      documento.id,
      documento.updated_at,
      incorporata,
    ],
    queryFn: async () => {
      const aggiornato = await leggiPersistente(documento.id);
      const f = aggiornato.files[0];
      if (!f) throw new Error("Per questa bolla non risulta un originale.");
      const [{ data, error }, esitoDoppio] = await Promise.all([
        supabase.storage.from(f.bucket ?? "ddt-documenti").download(f.path),
        aggiornato.status === "review" ? documentiDb.rpc("ddt_ingresso_duplicati", {
          p_company: documento.company_id, p_documenti: [documento.id],
        }) : { data: null, error: null },
      ]);
      if (error || !data) throw new Error("Originale non disponibile: riprova");
      const originale = new File([data], f.name, { type: f.mime });
      const file = (
        await preparaDocumento(originale).catch(() => ({ lettura: originale }))
      ).lettura;
      const partenza = bollaDaFile(file, crypto.randomUUID(), {
        orderId: documento.order_id,
        destinazione: destinazioneDocumento(documento),
      });
      const letta = conLettura(
        partenza,
        leggiDDTdaAI(aggiornato.result ?? {}),
        aggiornato.result ?? {},
        [],
      );
      const pagine = f.mime === "application/pdf" ? await contaPagine(originale) : 1;
      const multipagina = (pagine ?? 1) > 1;
      const dividere = !incorporata && multipagina;
      return {
        // «Compila a mano» (lettura fallita, o solo foto mai letta): la finestra
        // con l'originale si apre da sola, con le righe vuote.
        bolla: {
          ...letta,
          ...(esitoDoppio.data?.[0] ? { possibileDuplicato: esitoDoppio.data[0] as PossibileDuplicatoDDT } : {}),
          documentoJobId: documento.id,
          ...(aggiornato.status === "error" || aggiornato.status === "da_leggere"
            ? { compilaAMano: true }
            : {}),
        },
        dividere,
        multipagina,
        originale,
        pdf: dividere ? await leggiPerDividere(originale) : undefined,
      };
    },
    staleTime: Infinity,
  });
  if (caricamento.isError)
    return (
      <div role="alert" className="rounded-xl border p-4">
        <p>{caricamento.error.message}</p>
        <Button variant="outline" onClick={() => void caricamento.refetch()}>
          {t("Riprova")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {incorporata ? t("Torna al documento") : t("Chiudi")}
        </Button>
      </div>
    );
  if (!caricamento.data)
    return (
      <p role="status" className="flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("Caricamento originale…")}
      </p>
    );
  return (
    <>
    {incorporata && caricamento.data.multipagina && (
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setDivisioneAperta(true)}>{t("Dividi PDF in più bolle")}</Button>
      </div>
    )}
    {divisioneAperta && <RevisioneDocumento documento={documento} onClose={() => setDivisioneAperta(false)} />}
    <BolleInBloccoDialog
      key={documento.id}
      open
      incorporata={incorporata}
      onRegistrata={onRegistrata}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      iniziali={
        caricamento.data.dividere ? undefined : [caricamento.data.bolla]
      }
      pdfIniziale={caricamento.data.pdf}
      fileIniziale={
        caricamento.data.dividere ? caricamento.data.originale : undefined
      }
      documentoOrigineId={caricamento.data.dividere ? documento.id : undefined}
      orderId={documento.order_id}
      destinazione={destinazioneDocumento(documento)}
      warehouseId={documento.warehouse_id ?? null}
    />
    </>
  );
}

export function StatoDocumentoInIngresso({ stato, piccolo = false }: { stato: DocumentoPersistente["status"]; piccolo?: boolean }) {
  const t = useT();
  const inLettura = stato === "queued" || stato === "processing";
  const daVerificare = ["review", "error", "da_leggere"].includes(stato);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${piccolo ? "px-1.5 py-0 text-[11px] font-medium" : "px-2 py-0.5 text-xs font-semibold"} ${
      daVerificare ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
        : "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300"
    }`}>
      {inLettura && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
      {daVerificare ? t("Da verificare") : t(STATO_DOCUMENTO[stato])}
    </span>
  );
}

export function VocaleDocumento({ companyId, messageId }: { companyId: string; messageId: string }) {
  const t = useT();
  const { user } = useAuth();
  const [aperto, setAperto] = useState(false);
  const { data, isFetching, isError } = useQuery({
    queryKey: ["ddt-vocale-whatsapp", companyId, messageId, user?.id],
    enabled: aperto && !!user?.id,
    queryFn: async () => {
      const { data: messaggio, error } = await supabase.from("whatsapp_messages")
        .select("media_storage_path, ai_extracted_data")
        .eq("id", messageId).eq("company_id", companyId)
        .eq("direction", "inbound").eq("message_type", "audio").maybeSingle();
      if (error || !messaggio) throw new Error("Vocale non disponibile");
      const path = messaggio.media_storage_path;
      const link = path?.startsWith(companyId + "/")
        ? await supabase.storage.from("whatsapp-media").createSignedUrl(path, 300)
        : null;
      const estratto = messaggio.ai_extracted_data;
      const testo = estratto && typeof estratto === "object" && !Array.isArray(estratto)
        ? estratto.trascrizione_italiana ?? estratto.trascrizione_originale : null;
      return { url: link?.data?.signedUrl, trascrizione: typeof testo === "string" ? testo : null };
    },
  });
  return (
    <details className="mt-1 text-xs text-muted-foreground" onToggle={e => setAperto(e.currentTarget.open)}>
      <summary className="cursor-pointer text-primary">
        <Mic className="mr-1 inline h-3 w-3" aria-hidden="true" />
        {t("Destinazione indicata a voce")}
      </summary>
      {aperto && (
        <div className="mt-2 space-y-1.5">
          {data?.url && <audio controls preload="none" src={data.url} className="h-8 w-full" aria-label={t("Vocale WhatsApp originale")} />}
          {data?.trascrizione && <p className="whitespace-pre-wrap">{data.trascrizione}</p>}
          {isFetching && !data && <p>{t("Caricamento del vocale…")}</p>}
          {(isError || (data && !data.url && !data.trascrizione)) && <p>{t("Vocale non disponibile su questa utenza.")}</p>}
        </div>
      )}
    </details>
  );
}

/** Le letture non ancora registrate condividono l’elenco con i DDT, senza duplicare i registrati. */
/**
 * Il nome da mostrare per una bolla in ingresso. Le foto arrivate da WhatsApp o dal telefono
 * hanno per nome un codice tecnico («69407923-c37d-4ac7-…»): al posto suo si dice da dove
 * è arrivata e quando.
 */
export function nomeDocumentoInIngresso(j: Pick<DocumentoPersistente, "files" | "source" | "created_at">): string {
  const nome = j.files[0]?.name?.trim();
  if (nome && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(nome)) return nome;
  const fonte = j.source === "whatsapp" ? "da WhatsApp" : j.source === "campo" ? "dal cantiere" : "caricata";
  const data = new Date(j.created_at).toLocaleDateString(intlCampo(), { day: "2-digit", month: "2-digit" });
  return `Bolla ${fonte} del ${data}`;
}

export function RigaDocumentoInIngresso({
  documento: j,
  apri,
  riprova,
  riprovando,
  colonnaSelezione = false,
  duplicato,
}: {
  colonnaSelezione?: boolean;
  documento: DocumentoPersistente;
  apri: (j: DocumentoPersistente) => void;
  riprova: (j: DocumentoPersistente) => Promise<void>;
  riprovando: string | null;
  duplicato?: PossibileDuplicatoDDT;
}) {
  const t = useT();
  const inLettura = ["queued", "processing"].includes(j.status);
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [scartando, setScartando] = useState(false);
  // Una bolla doppia o sbagliata si toglie dall'elenco (12/11/2026): prima restava lì per sempre.
  const scarta = async () => {
    if (!(await confirm({
      title: t("Scartare questa bolla?"),
      description: t("{nome} non è registrato come DDT: sparisce dall'elenco insieme al file caricato.", { nome: j.files[0]?.name ?? t("Il documento") }),
      confirmLabel: t("Scarta"), cancelLabel: t("Tienila"), variant: "destructive",
    }))) return;
    setScartando(true);
    try {
      await scartaDocumentoPersistente(j.id);
      toast.success(t("Bolla scartata"));
      void queryClient.invalidateQueries({ queryKey: ["ddt-documenti"] });
    } catch (e) {
      toast.error(t("Bolla non scartata"), { description: messaggioErrore(e) });
    } finally { setScartando(false); }
  };
  const bottoneScarta = (
    <Button variant="ghost" size="sm" className="text-destructive" disabled={scartando} onClick={() => void scarta()}>
      {scartando ? t("Scarto…") : t("Scarta")}
    </Button>
  );
  // Solo la foto (impostazione «Bolle dal telefono»): l'ufficio sceglie se spendere l'AI.
  const daLeggere = j.status === "da_leggere";
  const nome = j.files[0]?.name;
  const nomeTecnico = !nome || /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}(?:\.[a-z\d]+)?$/i.test(nome);
  return (
    <tr
      className="cursor-pointer border-b bg-rose-50/20 hover:bg-muted/40"
      data-documento-id={j.id}
      onClick={event => {
        if (event.target instanceof Element && !event.target.closest("a,button,input,summary,audio")) apri(j);
      }}
    >
      {colonnaSelezione && <td title={t("Il documento deve essere registrato prima della gestione del DDT")}>—</td>}
      <td className="p-3">
        {/* Una riga sola, alta come quella dei DDT registrati (25/11/2026): nome, da dove arriva e,
            se serve, l'etichetta «Possibile duplicato» che apre il confronto. Prima erano tre righe. */}
        <div className="flex min-w-0 max-w-80 items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Link
            to={`/azienda/ordini?tab=ddt&ddt_documento=${j.id}`}
            className="min-w-0 truncate text-xs font-medium text-primary hover:underline"
            title={j.files.map((f) => f.name).join(", ")}
          >
            {nomeTecnico ? t("DDT in ingresso") : nome}
          </Link>
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
            ·{" "}{j.source === "campo"
              ? t("App cantiere")
              : j.source === "whatsapp"
                ? "WhatsApp"
                : t("Caricamento ufficio")}
          </span>
          {duplicato && <AvvisoPossibileDuplicatoDDT compatto duplicato={duplicato} />}
        </div>
        {j.whatsapp_voice_message_id && (
          <div className="min-w-0 max-w-64">
            <VocaleDocumento companyId={j.company_id} messageId={j.whatsapp_voice_message_id} />
          </div>
        )}
      </td>
      <td className="p-3">
        <StatoDocumentoInIngresso piccolo stato={j.status} />
      </td>
      <td className="p-3 text-xs text-muted-foreground">
        {new Date(j.created_at).toLocaleDateString(intlCampo())}
      </td>
      <td className="p-3 text-xs text-muted-foreground">{t("Da riconoscere")}</td>
      <td className="p-3 text-muted-foreground">—</td>
      <td className="p-3 text-xs">
        {destinazioneDocumento(j) === "magazzino" && !j.order_id ? (
          <span className="text-muted-foreground">{t("In magazzino")}</span>
        ) : j.order_id ? (
          <Link
            to={`/azienda/ordini/${j.order_id}`}
            className="text-primary hover:underline"
          >
            {t("Commessa assegnata")}
          </Link>
        ) : (
          <span className="text-muted-foreground">{t("Da associare")}</span>
        )}
      </td>
      <td className="p-3 text-muted-foreground">—</td>
      <td className="p-3 text-xs text-muted-foreground">{t("Da confermare")}</td>
      <td className="p-3 text-center text-xs">{j.files.length}</td>
      <td className="p-3 text-right text-xs text-muted-foreground">
        {t("Da confermare")}
      </td>
      <td className="p-3">
        {inLettura ? (
          <ProgressiveFluxLoader className="min-w-28" label={t("Analisi in corso…")} ariaLabel={t("Avanzamento analisi DDT")} />
        ) : daLeggere ? (
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={riprovando === j.id}
              onClick={() => void riprova(j)}
            >
              {riprovando === j.id ? t("Avvio…") : t("Leggi con l'AI")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => apri(j)}>
              {t("Compila a mano")}
            </Button>
            {bottoneScarta}
          </div>
        ) : (
          <div className="flex gap-2">
            {j.status === "error" && (
              <Button
                variant="outline"
                size="sm"
                disabled={riprovando === j.id}
                onClick={() => void riprova(j)}
              >
                {riprovando === j.id ? t("Rilettura…") : t("Rileggi")}
              </Button>
            )}
            <Button
              variant={j.status === "error" ? "outline" : "default"}
              size="sm"
              onClick={() => apri(j)}
            >
              {j.status === "error" ? t("Compila a mano") : t("Controlla e registra")}
            </Button>
            {bottoneScarta}
          </div>
        )}
      </td>
    </tr>
  );
}

const dataInvio = { format: (d: Date) => new Intl.DateTimeFormat(intlCampo(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(d) };

export function RiepilogoInviiWhatsApp({ invii, selezionato, onApri }: {
  invii: RiepilogoInvioWhatsApp[];
  selezionato?: string;
  onApri: (id: string | null) => void;
}) {
  const t = useT();
  if (!invii.length && !selezionato) return null;
  return (
    <section aria-label={t("Invii WhatsApp")} className="rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{selezionato ? t("Invio WhatsApp") : t("Invii WhatsApp recenti")}</h3>
        {selezionato && <Button size="sm" variant="ghost" onClick={() => onApri(null)}>{t("Tutti i documenti")}</Button>}
      </div>
      <ul className="divide-y border-t">
        {invii.map(invio => (
          <li key={invio.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{dataInvio.format(new Date(invio.created_at))} · {invio.ricevuti} {invio.ricevuti === 1 ? t("file ricevuto") : t("file ricevuti")}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[
                  invio.in_lettura > 0 && `${invio.in_lettura} da leggere`,
                  invio.da_controllare > 0 && `${invio.da_controllare} da controllare`,
                  invio.registrate > 0 && `${invio.registrate} ${invio.registrate === 1 ? "registrata" : "registrate"}`,
                  invio.duplicati_identici > 0 && `${invio.duplicati_identici} già in archivio`,
                  invio.da_riprovare > 0 && `${invio.da_riprovare} ${invio.da_riprovare === 1 ? "lettura" : "letture"} da riprovare`,
                ].filter(Boolean).join(" · ")}
                {invio.da_rimandare > 0 && <span className="ml-2 font-medium text-amber-800 dark:text-amber-300">{t("{da_rimandare} da rimandare", { da_rimandare: String(invio.da_rimandare ?? "") })}</span>}
              </p>
            </div>
            {selezionato !== invio.id && invio.in_lettura + invio.da_controllare + invio.da_riprovare > 0 && (
              <Button size="sm" variant="outline" onClick={() => onApri(invio.id)}>{t("Apri invio")}</Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
