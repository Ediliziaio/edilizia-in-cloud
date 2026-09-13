/**
 * StepPdf — Step 8 wizard: generazione PDF e pagina firma cliente.
 *
 * In Wave 4: chiama edge function sr-genera-pdf, salva HTML su Storage,
 * genera link condivisibile per la firma cliente.
 *
 * Per ora mostra solo l'anteprima dei dati che entreranno nel PDF e un
 * placeholder per la generazione effettiva.
 */
import { FileText, Loader2, Check, AlertCircle, ExternalLink, Link2, Copy, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SrProgettoDetail } from "@/types/serramenti";
import { SrCard, SrCallout, SrKpi } from "@/lib/serramenti/wizardUI";
import { formatEuro, formatEuroRangeOrSingle, formatNumero } from "@/lib/serramenti/format";
import { useGeneraPdf, useConvertiInOrdine, useTemplatePdf } from "@/lib/serramenti/queries";
import { ClipboardList } from "lucide-react";
import { useSerramentoPDF } from "@/hooks/useSerramentoPDF";
import { generateInterventoSintesi } from "@/lib/serramenti/sintesiIntervento";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();
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
  const companyId = useEffectiveCompanyId();
  const { data: company } = useQuery({
    queryKey: ["sr-step-pdf-company", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, logo_url, brand_logo_dark_url")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const indirizzo = [
        data.legal_address,
        [data.legal_postal_code, data.legal_city].filter(Boolean).join(" "),
        data.legal_province,
      ].filter(Boolean).join(", ");
      return {
        name: data.name,
        ragione_sociale: data.business_name ?? data.name,
        indirizzo: indirizzo || null,
        telefono: data.phone,
        email: data.email,
        partita_iva: data.vat_number,
        logo_url: data.logo_url,
        brand_logo_dark_url: (data as { brand_logo_dark_url?: string | null }).brand_logo_dark_url ?? null,
      };
    },
  });
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
    },
    {
      ok: !!(p.cantiere_indirizzo || p.cliente_indirizzo),
      label: "Indirizzo cantiere",
      hint: !p.cantiere_indirizzo && !p.cliente_indirizzo ? "Aggiungi almeno un indirizzo" : undefined,
    },
    {
      // La sintesi viene SEMPRE auto-generata da BOM + tipo intervento.
      // Il check verifica che ci sia almeno qualcosa nel BOM, altrimenti
      // la sintesi sarebbe vuota.
      ok: !!sintesiCalcolata,
      label: "Sintesi intervento",
      hint: !sintesiCalcolata
        ? "Aggiungi almeno un serramento o accessorio: la sintesi si genera da li."
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
      ok: Number(p.totale_max ?? p.totale_min ?? 0) > 0,
      label: "Totale preventivo calcolato",
      hint: !Number(p.totale_max ?? p.totale_min ?? 0) ? "Vai allo Step Economia e clicca 'Applica calcoli'" : undefined,
    },
    {
      ok: !!p.consulenza_at,
      label: "Appuntamento di consulenza",
      hint: !p.consulenza_at ? "Imposta data e ora nello Step Consulenza" : undefined,
    },
  ];

  const ready = checks.every((c) => c.ok);
  const erroriCount = checks.filter((c) => !c.ok).length;
  const paginaFirmaUrl = p.public_url ?? p.pdf_html_url;

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
            label="Totale IVA inclusa"
            value={formatEuroRangeOrSingle(p.totale_min, p.totale_max, 2)}
            variant="primary"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div className="border-l-4 border-orange-200 pl-3 py-1">
            <p className="text-[10px] uppercase font-semibold text-muted-foreground mb-1">Pagina 1 — Proposta</p>
            <p className="text-sm">
              {[p.cliente_nome, p.cliente_cognome].filter(Boolean).join(" ") || "—"}
              {p.cantiere_citta && ` · ${p.cantiere_citta}`}
              {numSerramenti > 0 && ` · ${numSerramenti} serramenti`}
            </p>
            <p className="text-xs text-muted-foreground mt-1 italic">
              {sintesiCalcolata || "Aggiungi serramenti o accessori per generare la sintesi"}
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
                <Check className="h-4 w-4 text-orange-600 shrink-0 mt-0.5" />
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
        description="PDF A4 pronto da stampare o allegare via email. Include anagrafica, totale preventivo, modalità di pagamento, allegato tecnico e render."
        icon={<Download className="h-4 w-4" />}
      >
        {!ready && (
          <SrCallout variant="warning" className="mb-3">
            ⚠️ Completa prima i {erroriCount} elementi mancanti nella checklist sopra.
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
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => generaPdfMut.mutate()}
            disabled={!ready || generaPdfMut.isPending}
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
    </div>
  );
}
