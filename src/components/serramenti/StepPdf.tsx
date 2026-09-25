/**
 * StepPdf — Step 8 wizard: PDF del preventivo e link per la firma del cliente.
 *
 * Il PDF si genera nel browser (SerramentoPDF). «Genera link firma» chiama
 * sr-genera-pdf, che salva la versione HTML e il link da mandare al cliente.
 *
 * Sul telefono niente schede di spiegazione: il riepilogo, cosa manca, e in
 * basso la barra con il PDF (da mandare o guardare) e «Invia per firma», che
 * rigenera la pagina e ne manda il link col foglio di condivisione.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileText, Loader2, Check, AlertCircle, AlertTriangle, ArrowRight, ExternalLink, Link2, Copy, Download, Eye, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SrProgettoDetail, SrWizardStep } from "@/types/serramenti";
import { SrCard, SrCallout, SrKpi } from "@/lib/serramenti/wizardUI";
import { formatEuro, formatEuroRangeOrSingle, formatNumero } from "@/lib/serramenti/format";
import { SR_QK, useGeneraPdf, useConvertiInOrdine, useTemplatePdf, useAziendaPerPdf } from "@/lib/serramenti/queries";
import { generaPdf } from "@/lib/serramenti/api";
import { ClipboardList } from "lucide-react";
import { renderSerramentoBlob, useSerramentoPDF } from "@/hooks/useSerramentoPDF";
import { generateInterventoSintesi } from "@/lib/serramenti/sintesiIntervento";
import { BarraInvioMobile } from "@/components/moduli/BarraInvioMobile";
import { condividiLink } from "@/lib/mobile/condividiFile";

import { useIsMobile } from "@/hooks/use-mobile";
interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
  /** Telefono: la barra in basso del passo (indietro · PDF · invia per firma) la disegna lo step. */
  onIndietro?: () => void;
  /** Telefono: le voci di «Da completare» portano al passo in cui si completano. */
  onVaiAlPasso?: (passo: SrWizardStep) => void;
}

interface ChecklistItem {
  ok: boolean;
  label: string;
  hint?: string;
  /** Consigliato, non obbligatorio: se manca, PDF, link firma e commessa si fanno lo stesso. */
  facoltativo?: boolean;
  /** Telefono: come si chiama nella riga «Da completare» e in che passo si completa. */
  breve?: string;
  passo?: SrWizardStep;
}

export function StepPdf({ progettoId, detail, onIndietro, onVaiAlPasso }: Props) {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const [invioInCorso, setInvioInCorso] = useState(false);
  const p = detail.progetto;
  const generaPdfMut = useGeneraPdf(progettoId);
  const convertiMut = useConvertiInOrdine(progettoId);
  const numSerramenti = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);
  // Sintesi intervento: ora generata SEMPRE dinamicamente dal BOM + tipo
  // intervento. Il campo persistito `p.intervento_sintesi` rimane come
  // fallback/snapshot, ma l'utente non lo edita piu' a mano.
  const sintesiCalcolata = p.intervento_sintesi?.trim()
    || generateInterventoSintesi(detail.serramenti, detail.accessori, p.tipo_intervento);

  // PDF nativo A4 client-side (@react-pdf/renderer, code-split via dynamic import)
  const { downloadPDF, previewPDF, isGenerating: isGeneratingPdf } = useSerramentoPDF();
  const { data: template } = useTemplatePdf();
  // L'anagrafica dell'azienda del preventivo, anche per un super admin entrato in un'altra.
  const { data: company } = useAziendaPerPdf(detail.progetto.company_id);
  const handleDownloadNative = () => {
    void downloadPDF({ detail, template: template ?? null, company: company ?? null, useFreshTemplate: true });
  };
  const handlePreviewNative = () => {
    void previewPDF({ detail, template: template ?? null, company: company ?? null, useFreshTemplate: true });
  };

  const checks: ChecklistItem[] = [
    {
      ok: !!(p.cliente_nome || p.cliente_cognome),
      label: "Anagrafica cliente",
      hint: !p.cliente_nome ? "Manca il nome" : undefined,
      breve: "cliente", passo: "cliente",
    },
    {
      ok: !!(p.cantiere_indirizzo || p.cliente_indirizzo),
      label: "Indirizzo cantiere",
      hint: !p.cantiere_indirizzo && !p.cliente_indirizzo ? "Aggiungi almeno un indirizzo" : undefined,
      breve: "indirizzo", passo: "immobile",
    },
    {
      // La sintesi viene SEMPRE auto-generata da BOM + tipo intervento.
      // Il check verifica che ci sia almeno qualcosa nel BOM, altrimenti
      // la sintesi sarebbe vuota.
      ok: !!sintesiCalcolata,
      label: "Sintesi intervento",
      hint: !sintesiCalcolata
        ? "Aggiungi almeno un serramento o complemento: la sintesi si genera da lì."
        : undefined,
      breve: "serramenti", passo: "bom",
    },
    {
      ok: Array.isArray(p.esigenze) && p.esigenze.filter((e) => e.titolo).length >= 1,
      label: "Almeno 1 esigenza",
      hint: "Più ne metti meglio è (max 3 entrano nel PDF)",
      breve: "esigenze", passo: "immobile",
    },
    {
      ok: numSerramenti > 0,
      label: `${numSerramenti} serramenti in BOM`,
      hint: numSerramenti === 0 ? "Mancanti — vai allo Step Serramenti" : undefined,
      breve: "serramenti", passo: "bom",
    },
    {
      ok: Number(p.totale_max ?? p.totale_min ?? 0) > 0,
      label: "Totale preventivo calcolato",
      hint: !Number(p.totale_max ?? p.totale_min ?? 0) ? "Vai allo Step Economia e clicca 'Applica calcoli'" : undefined,
      breve: "totale", passo: "economia",
    },
    {
      ok: !!p.consulenza_at,
      label: "Appuntamento di consulenza",
      // Il titolare (15/09): la data non è obbligatoria. Senza, il PDF non la scrive.
      facoltativo: true,
      hint: !p.consulenza_at ? "facoltativo: senza data il PDF non la scrive" : undefined,
    },
  ];

  const ready = checks.every((c) => c.ok || c.facoltativo);
  const erroriCount = checks.filter((c) => !c.ok && !c.facoltativo).length;
  const paginaFirmaUrl = p.public_url ?? p.pdf_html_url;
  // Telefono: al posto della checklist, una riga con quello che manca davvero.
  const mancano = checks
    .filter((c) => !c.ok && !c.facoltativo && c.breve)
    .filter((c, i, tutte) => tutte.findIndex((x) => x.breve === c.breve) === i);
  const titoloInvio = `Preventivo ${p.code ?? ""}`.trim();

  // «Invia per firma» dal telefono: rigenera la pagina (il cliente vede il
  // preventivo di adesso) e ne manda il link col foglio di condivisione.
  const inviaPerFirma = async () => {
    if (!ready) {
      toast.error(`Completa prima: ${mancano.map((c) => c.breve).join(", ")}`);
      return;
    }
    if (p.modello_snapshot) {
      toast.error("Per questo modello usa il PDF: la pagina di firma non è ancora collegata.");
      return;
    }
    setInvioInCorso(true);
    try {
      const esito = await generaPdf(progettoId);
      void qc.invalidateQueries({ queryKey: SR_QK.progetto(progettoId) });
      void qc.invalidateQueries({ queryKey: ["sr-progetti"] });
      const link = esito.public_url;
      if (!link) {
        toast.success("Pagina generata", {
          description: "Il link pubblico non c'è ancora.",
          action: { label: "Apri", onClick: () => window.open(esito.html_url, "_blank") },
          duration: 10000,
        });
        return;
      }
      const condivisione = await condividiLink(link, titoloInvio);
      if (condivisione === "non-supportato") {
        await navigator.clipboard.writeText(link);
        toast.success("Link di firma copiato");
      } else if (condivisione === "serve-un-tocco") {
        toast.success("Link di firma pronto", {
          action: { label: "Manda", onClick: () => { void condividiLink(link, titoloInvio); } },
          duration: 10000,
        });
      }
    } catch (e) {
      toast.error("Invio non riuscito", { description: e instanceof Error ? e.message : "Riprova." });
    } finally {
      setInvioInCorso(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Telefono: il link di firma già generato, in una riga. */}
      {isMobile && p.public_url && (
        <div className="flex items-center gap-2 rounded-xl bg-orange-50 px-3 py-2 text-orange-900">
          <Link2 className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
            Link di firma{p.pdf_generated_at && ` del ${new Date(p.pdf_generated_at).toLocaleDateString("it-IT")}`}
          </span>
          <Button asChild variant="ghost" size="sm" className="tap-compact -my-1 h-8 gap-1.5 px-2 text-xs">
            <a href={p.public_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" /> Apri
            </a>
          </Button>
        </div>
      )}

      {/* Anteprima dati PDF */}
      <SrCard
        title="Anteprima dati preventivo"
        description="Riepilogo di cosa entrerà nel PDF cliente."
        icon={<FileText className="h-4 w-4" />}
      >
        {/* Telefono: codice e totale sono già nella testata e qui sotto. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4 max-md:hidden">
          <SrKpi label="Codice" value={p.code} />
          <SrKpi label="Serramenti" value={numSerramenti} />
          <SrKpi label="Complementi" value={detail.accessori.reduce((a, x) => a + (x.quantita ?? 1), 0)} />
          <SrKpi
            label="Totale IVA inclusa"
            value={formatEuroRangeOrSingle(p.totale_min, p.totale_max, 2)}
            variant="primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 max-md:mb-0">
          <div className="border-l-4 border-orange-200 pl-3 py-1">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Pagina 1 — Proposta</p>
            <p className="text-sm">
              {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
              {p.cantiere_citta && ` · ${p.cantiere_citta}`}
              {numSerramenti > 0 && ` · ${numSerramenti} serramenti`}
            </p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              {sintesiCalcolata || "Aggiungi serramenti o complementi per generare la sintesi"}
            </p>
          </div>
          <div className="border-l-4 border-orange-200 pl-3 py-1">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Pagina economica</p>
            <p className="text-sm font-bold text-orange-600">
              {formatEuroRangeOrSingle(p.totale_min, p.totale_max, 2)}
            </p>
            {p.risparmio_calcolato && p.risparmio_eur_anno && (
              <p className="text-xs text-orange-600 mt-1">
                ⚡ Risparmio: {formatEuro(p.risparmio_eur_anno)}/anno
              </p>
            )}
            {Number(p.detrazione_aliquota) > 0 && (
              <p className="text-xs text-orange-600">
                🏛 Detrazione {formatNumero(p.detrazione_aliquota)}%: {formatEuro(p.detrazione_eur_totale)}
              </p>
            )}
          </div>
        </div>
      </SrCard>

      {isMobile && mancano.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          <p>
            Da completare:{" "}
            {mancano.map((c, i) => (
              <span key={c.breve}>
                {i > 0 && ", "}
                {onVaiAlPasso && c.passo ? (
                  <button
                    type="button"
                    className="tap-compact font-medium underline underline-offset-2"
                    onClick={() => onVaiAlPasso(c.passo!)}
                  >
                    {c.breve}
                  </button>
                ) : c.breve}
              </span>
            ))}
          </p>
        </div>
      )}

      {/* Checklist completezza */}
      <SrCard
        title="Checklist completezza"
        description="Tutti gli elementi richiesti per generare un PDF presentabile."
        icon={<Check className="h-4 w-4" />}
        variant={ready ? "highlight" : "default"}
        className="max-md:hidden"
      >
        <div className="space-y-1">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {c.ok ? (
                <Check className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${c.facoltativo ? "text-slate-400" : "text-amber-500"}`} />
              )}
              <div className="flex-1">
                <span className={c.ok ? "text-foreground" : c.facoltativo ? "text-muted-foreground" : "text-amber-700 font-medium"}>{c.label}</span>
                {c.hint && (
                  <span className="text-muted-foreground ml-1">— {c.hint}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SrCard>

      {/* Genera PDF nativo A4 (RACCOMANDATO) */}
      <SrCard
        title="Scarica PDF da inviare al cliente"
        description="PDF A4 pronto da stampare o allegare via email. Include anagrafica, totale preventivo, modalità di pagamento, allegato tecnico e render."
        icon={<Download className="h-4 w-4" />}
        className="max-md:hidden"
      >
        {!ready && (
          <SrCallout variant="warning" className="mb-3">
            ⚠️ Completa prima {erroriCount === 1 ? "l'elemento mancante" : `i ${erroriCount} elementi mancanti`} nella checklist sopra.
          </SrCallout>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          {/* Niente scarico su telefono: resta l'anteprima, che con flex-1
              prende tutta la riga invece di lasciarla mezza vuota. */}
          {!isMobile && (
            <Button
              onClick={handleDownloadNative}
              disabled={!ready || isGeneratingPdf}
              className="flex-1 bg-orange-500 hover:bg-orange-600 gap-2"
              size="lg"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Scarica PDF (A4)
            </Button>
          )}
          <Button
            onClick={handlePreviewNative}
            disabled={!ready || isGeneratingPdf}
            variant="outline"
            size="lg"
            className="flex-1 gap-2 sm:flex-none"
          >
            <Eye className="h-4 w-4" /> Anteprima PDF
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          ⚡ Generato direttamente nel browser, senza attese server. File pronto da{" "}
          <strong>allegare via email</strong> o <strong>stampare</strong>.
        </p>
      </SrCard>

      {/* Pagina pubblica HTML + firma digitale cliente.
          NON è alternativa al PDF: è il LINK che il cliente apre dal cellulare
          per firmare digitalmente. Funzioni distinte:
          - "Scarica PDF (A4)" sopra → file PDF da inviare via email
          - Questo qui sotto       → URL pubblico per firma digitale */}
      <SrCard
        title="Link pubblico per firma cliente"
        description="Genera un link che il cliente può aprire dal telefono per leggere il preventivo e firmarlo digitalmente. È separato dal PDF: serve solo per la firma."
        icon={<Link2 className="h-4 w-4" />}
        className="max-md:hidden"
      >
        {p.modello_snapshot && <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Questo modello è collegato al PDF A4. Il collegamento alla pagina di firma è ancora da completare: usa il PDF scaricabile, senza generare una pagina con un modello diverso.</p>}
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => generaPdfMut.mutate()}
            disabled={!ready || generaPdfMut.isPending || !!p.modello_snapshot}
            className="flex-1 bg-orange-500 hover:bg-orange-600 gap-2"
          >
            {generaPdfMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Link2 className="h-4 w-4" />}
            {paginaFirmaUrl ? "Aggiorna link firma" : "Genera link firma"}
          </Button>
          {paginaFirmaUrl && (
            <Button asChild variant="outline" className="gap-2">
              <a href={paginaFirmaUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Apri pagina firma
              </a>
            </Button>
          )}
        </div>

        {p.pdf_generated_at && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Ultimo link generato: {new Date(p.pdf_generated_at).toLocaleString("it-IT")}
          </p>
        )}

        {p.public_url && (
          <div className="mt-3 p-3 rounded-md bg-orange-50 border border-orange-200">
            <p className="text-[11px] font-semibold text-orange-900 mb-1 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Link da condividere con il cliente
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-white px-2 py-1 rounded border border-orange-200 flex-1 min-w-0 truncate font-mono">
                {p.public_url}
              </code>
              <Button
                size="sm" variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(p.public_url!);
                  toast.success("Link copiato");
                }}
                className="gap-1 h-8"
              >
                <Copy className="h-3.5 w-3.5" /> Copia
              </Button>
              <Button asChild size="sm" variant="outline" className="gap-1 h-8">
                <a href={p.public_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Apri
                </a>
              </Button>
            </div>
            <p className="text-[10px] text-orange-600 mt-1.5">
              Il cliente può aprire il preventivo senza login e firmarlo digitalmente dal link condiviso.
            </p>
          </div>
        )}

        <SrCallout variant="info" className="mt-3">
          💡 Per il <strong>PDF da inviare via email</strong> usa “Scarica PDF (A4)”.
          Questo link pubblico serve invece per la firma digitale del cliente.
        </SrCallout>
      </SrCard>

      {/* Conversione in commessa */}
      <SrCard
        title="Cliente accettato? Crea la commessa"
        description="Quando il cliente firma o conferma, converti il preventivo in commessa per gestire produzione, posa e fatturazione."
        icon={<ClipboardList className="h-4 w-4" />}
        variant={p.ordine_id ? "muted" : "highlight"}
        className="max-md:hidden"
      >
        {p.ordine_id ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5 text-orange-600">
                <Check className="h-4 w-4" /> Già convertita in commessa
              </p>
              <p className="text-[11px] text-muted-foreground">Stato progetto: <strong>{p.stato}</strong></p>
            </div>
            <Button asChild variant="outline" size="sm">
              <a href={`/azienda/ordini/${p.ordine_id}`} className="gap-1">
                <ExternalLink className="h-3.5 w-3.5" /> Apri commessa
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              La nuova commessa erediterà cliente, importo e anticipo. Il preventivo resterà collegato per riferimento.
            </p>
            <Button
              onClick={() => convertiMut.mutate()}
              disabled={convertiMut.isPending || !ready}
              className="w-full bg-orange-500 hover:bg-orange-600 gap-2"
            >
              {convertiMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Crea commessa da questo preventivo
            </Button>
            {!ready && (
              <p className="text-[11px] text-amber-700">
                ⚠️ Completa prima la checklist sopra per creare la commessa.
              </p>
            )}
          </div>
        )}
      </SrCard>

      {/* Telefono: la commessa in una riga, come negli altri preventivatori. */}
      {isMobile && (p.ordine_id ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-emerald-900">Commessa già aperta</p>
          <Button asChild variant="outline" size="sm" className="tap-compact h-8 shrink-0 gap-1 text-xs">
            <a href={`/azienda/ordini/${p.ordine_id}`}>
              Apri <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      ) : ready && (
        <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/60 px-3 py-2">
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-orange-900">Il cliente ha accettato?</p>
          <Button
            size="sm"
            className="tap-compact h-8 shrink-0 gap-1.5 bg-orange-500 text-xs text-white hover:bg-orange-600"
            disabled={convertiMut.isPending}
            onClick={() => convertiMut.mutate()}
          >
            {convertiMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Crea commessa
          </Button>
        </div>
      ))}

      {isMobile && onIndietro && (
        <BarraInvioMobile
          onIndietro={onIndietro}
          titolo={titoloInvio}
          generaPdf={() => renderSerramentoBlob({ detail, template: template ?? null, company: company ?? null, useFreshTemplate: true })}
          pdfBloccato={ready ? null : `Completa prima: ${mancano.map((c) => c.breve).join(", ")}`}
        >
          <Button
            className={`h-11 flex-1 gap-1.5 bg-orange-500 hover:bg-orange-600 ${ready && !p.modello_snapshot ? "" : "opacity-60"}`}
            disabled={invioInCorso}
            onClick={() => { void inviaPerFirma(); }}
          >
            {invioInCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Invia per firma
          </Button>
        </BarraInvioMobile>
      )}
    </div>
  );
}
