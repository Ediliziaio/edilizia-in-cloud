/**
 * StepPdf — Step 8 wizard: generazione PDF (3 pagine HTML).
 *
 * In Wave 4: chiama edge function sr-genera-pdf, salva HTML su Storage,
 * genera link condivisibile + QR firma cliente.
 *
 * Per ora mostra solo l'anteprima dei dati che entreranno nel PDF e un
 * placeholder per la generazione effettiva.
 */
import { FileText, Loader2, Sparkles, Check, AlertCircle, ExternalLink, Link2, Copy, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SrProgettoDetail } from "@/types/serramenti";
import { SrCard, SrCallout, SrKpi, formatEuro, formatNumero } from "@/lib/serramenti/wizardUI";
import { useGeneraPdf, useConvertiInOrdine, useTemplatePdf } from "@/lib/serramenti/queries";
import { ClipboardList } from "lucide-react";
import { useSerramentoPDF } from "@/hooks/useSerramentoPDF";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  progettoId: string;
  detail: SrProgettoDetail;
}

interface ChecklistItem {
  ok: boolean;
  label: string;
  hint?: string;
}

export function StepPdf({ progettoId, detail }: Props) {
  const p = detail.progetto;
  const generaPdfMut = useGeneraPdf(progettoId);
  const convertiMut = useConvertiInOrdine(progettoId);
  const numSerramenti = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);

  // PDF nativo A4 client-side (@react-pdf/renderer, code-split via dynamic import)
  const { downloadPDF, previewPDF, isGenerating: isGeneratingPdf } = useSerramentoPDF();
  const { data: template } = useTemplatePdf();
  const companyId = useEffectiveCompanyId();
  const { data: company } = useQuery({
    queryKey: ["sr-step-pdf-company", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name, ragione_sociale, indirizzo, telefono, email, partita_iva, logo_url")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const handleDownloadNative = () => {
    void downloadPDF({ detail, template: template ?? null, company: company ?? null });
  };
  const handlePreviewNative = () => {
    void previewPDF({ detail, template: template ?? null, company: company ?? null });
  };

  const checks: ChecklistItem[] = [
    {
      ok: !!(p.cliente_nome || p.cliente_cognome),
      label: "Anagrafica cliente",
      hint: !p.cliente_nome ? "Manca il nome" : undefined,
    },
    {
      ok: !!(p.cantiere_indirizzo || p.cliente_indirizzo),
      label: "Indirizzo cantiere",
      hint: !p.cantiere_indirizzo && !p.cliente_indirizzo ? "Aggiungi almeno un indirizzo" : undefined,
    },
    {
      // La sintesi viene auto-generata dal BOM se vuota → questo check non blocca
      // più la generazione del PDF. Resta come "promemoria utile" se vuoto.
      ok: !!p.intervento_sintesi || numSerramenti > 0,
      label: "Sintesi intervento",
      hint: !p.intervento_sintesi
        ? "Verrà auto-generata dal BOM. Puoi personalizzarla nello step Immobile."
        : undefined,
    },
    {
      ok: Array.isArray(p.esigenze) && p.esigenze.filter((e) => e.titolo).length >= 1,
      label: "Almeno 1 esigenza",
      hint: "Più ne metti meglio è (max 3 entrano nel PDF)",
    },
    {
      ok: numSerramenti > 0,
      label: `${numSerramenti} serramenti in BOM`,
      hint: numSerramenti === 0 ? "Mancanti — vai allo Step Serramenti" : undefined,
    },
    {
      ok: Number(p.totale_max ?? 0) > 0,
      label: "Forbice prezzo calcolata",
      hint: !p.totale_max ? "Vai allo Step Economia e clicca 'Applica calcoli'" : undefined,
    },
    {
      ok: !!p.consulenza_at,
      label: "Appuntamento di consulenza",
      hint: !p.consulenza_at ? "Imposta data e ora nello Step Consulenza" : undefined,
    },
  ];

  const ready = checks.every((c) => c.ok);
  const erroriCount = checks.filter((c) => !c.ok).length;

  return (
    <div className="space-y-3">
      {/* Anteprima dati PDF */}
      <SrCard
        title="Anteprima dati preventivo"
        description="Riepilogo di cosa entrerà nel PDF cliente."
        icon={<FileText className="h-4 w-4" />}
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <SrKpi label="Codice" value={p.code} />
          <SrKpi label="Serramenti" value={numSerramenti} />
          <SrKpi label="Accessori" value={detail.accessori.reduce((a, x) => a + (x.quantita ?? 1), 0)} />
          <SrKpi
            label="Forbice IVA inclusa"
            value={p.totale_min && p.totale_max
              ? `${formatEuro(p.totale_min)} – ${formatEuro(p.totale_max)}`
              : "—"}
            variant="primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="border-l-4 border-emerald-200 pl-3 py-1">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Pagina 1 — Proposta</p>
            <p className="text-sm">
              {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
              {p.cantiere_citta && ` · ${p.cantiere_citta}`}
              {numSerramenti > 0 && ` · ${numSerramenti} serramenti`}
            </p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              {p.intervento_sintesi || "(intervento_sintesi mancante)"}
            </p>
          </div>
          <div className="border-l-4 border-emerald-200 pl-3 py-1">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Pagina 2 — Investimento</p>
            <p className="text-sm font-bold text-emerald-700">
              {p.totale_min && p.totale_max
                ? `${formatEuro(p.totale_min)} – ${formatEuro(p.totale_max)}`
                : "(da calcolare)"}
            </p>
            {p.risparmio_calcolato && p.risparmio_eur_anno && (
              <p className="text-xs text-emerald-700 mt-1">
                ⚡ Risparmio: {formatEuro(p.risparmio_eur_anno)}/anno
              </p>
            )}
            {p.detrazione_aliquota && (
              <p className="text-xs text-emerald-700">
                🏛 Detrazione {formatNumero(p.detrazione_aliquota)}%: {formatEuro(p.detrazione_eur_totale)}
              </p>
            )}
          </div>
        </div>
      </SrCard>

      {/* Checklist completezza */}
      <SrCard
        title="Checklist completezza"
        description="Tutti gli elementi richiesti per generare un PDF presentabile."
        icon={<Check className="h-4 w-4" />}
        variant={ready ? "highlight" : "default"}
      >
        <div className="space-y-1">
          {checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {c.ok ? (
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <span className={c.ok ? "text-foreground" : "text-amber-700 font-medium"}>{c.label}</span>
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
        description="PDF nativo A4 stampabile e allegabile via email. Layout impaginato professionalmente con anagrafica, investimento, modalità pagamento, tecnico e render."
        icon={<Download className="h-4 w-4" />}
      >
        {!ready && (
          <SrCallout variant="warning" className="mb-3">
            ⚠️ Completa prima i {erroriCount} elementi mancanti nella checklist sopra.
          </SrCallout>
        )}

        <div className="flex flex-col sm:flex-row gap-2 mb-3">
          <Button
            onClick={handleDownloadNative}
            disabled={!ready || isGeneratingPdf}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 gap-2"
            size="lg"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Scarica PDF (A4)
          </Button>
          <Button
            onClick={handlePreviewNative}
            disabled={!ready || isGeneratingPdf}
            variant="outline"
            size="lg"
            className="gap-2"
          >
            <Eye className="h-4 w-4" /> Anteprima PDF
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          ⚡ Generato direttamente nel browser, niente attesa server. File pronto da{" "}
          <strong>allegare via email</strong> o <strong>stampare</strong>.
        </p>
      </SrCard>

      {/* Pagina pubblica HTML + firma digitale cliente.
          NON è alternativa al PDF: è il LINK che il cliente apre dal cellulare
          per firmare digitalmente. Funzioni distinte:
          - "Scarica PDF (A4)" sopra → file PDF da inviare via email
          - Questo qui sotto       → URL pubblico per firma digitale + QR */}
      <SrCard
        title="Pagina pubblica per firma cliente"
        description="Genera un link che il cliente apre dal cellulare per visualizzare il preventivo e firmare digitalmente. È separato dal PDF: questo serve solo per la firma."
        icon={<Link2 className="h-4 w-4" />}
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => generaPdfMut.mutate()}
            disabled={!ready || generaPdfMut.isPending}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 gap-2"
          >
            {generaPdfMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Link2 className="h-4 w-4" />}
            {p.pdf_html_url ? "Aggiorna link firma" : "Genera link firma"}
          </Button>
          {p.pdf_html_url && (
            <Button asChild variant="outline" className="gap-2">
              <a href={p.pdf_html_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" /> Apri pagina pubblica
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
          <div className="mt-3 p-3 rounded-md bg-emerald-50 border border-emerald-200">
            <p className="text-[11px] font-semibold text-emerald-900 mb-1 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Link condivisibile col cliente
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="text-xs bg-white px-2 py-1 rounded border border-emerald-200 flex-1 min-w-0 truncate font-mono">
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
            <p className="text-[10px] text-emerald-800 mt-1.5">
              Il cliente può aprire il preventivo senza login e firmare digitalmente. Il QR code è già nel PDF.
            </p>
          </div>
        )}

        <SrCallout variant="info" className="mt-3">
          💡 Per il <strong>PDF da inviare via email</strong> usa la sezione qui sopra
          "Scarica PDF (A4)". Questa pagina pubblica serve solo per la firma digitale
          del cliente dal cellulare.
        </SrCallout>
      </SrCard>

      {/* Conversione in commessa */}
      <SrCard
        title="Cliente accettato? Crea la commessa"
        description="Quando il cliente firma o conferma, converti la stima in commessa per gestire produzione, posa e fatturazione."
        icon={<ClipboardList className="h-4 w-4" />}
        variant={p.ordine_id ? "muted" : "highlight"}
      >
        {p.ordine_id ? (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5 text-emerald-700">
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
              La nuova commessa erediterà cliente, importo e anticipo. La stima resterà collegata per riferimento.
            </p>
            <Button
              onClick={() => convertiMut.mutate()}
              disabled={convertiMut.isPending || !ready}
              className="w-full bg-emerald-700 hover:bg-emerald-800 gap-2"
            >
              {convertiMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
              Crea commessa da questa stima
            </Button>
            {!ready && (
              <p className="text-[11px] text-amber-700">
                ⚠️ Completa prima la checklist sopra per creare la commessa.
              </p>
            )}
          </div>
        )}
      </SrCard>
    </div>
  );
}
