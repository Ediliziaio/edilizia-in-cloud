/**
 * StepPdf — Step 8 wizard: generazione PDF (3 pagine HTML).
 *
 * In Wave 4: chiama edge function sr-genera-pdf, salva HTML su Storage,
 * genera link condivisibile + QR firma cliente.
 *
 * Per ora mostra solo l'anteprima dei dati che entreranno nel PDF e un
 * placeholder per la generazione effettiva.
 */
import { FileText, Loader2, Sparkles, Check, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SrProgettoDetail } from "@/types/serramenti";
import { SrCard, SrCallout, SrKpi, formatEuro, formatNumero } from "@/lib/serramenti/wizardUI";
import { useGeneraPdf } from "@/lib/serramenti/queries";

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
  const numSerramenti = detail.serramenti.reduce((acc, s) => acc + (s.quantita ?? 1), 0);

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
      ok: !!p.intervento_sintesi,
      label: "Sintesi intervento",
      hint: !p.intervento_sintesi ? "Mancante — compila lo step Immobile" : undefined,
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

      {/* Genera PDF (placeholder Wave 4) */}
      <SrCard
        title="Genera preventivo PDF"
        description="Edge function sr-genera-pdf produrrà 3 pagine HTML (Proposta · Investimento · Tecnico) e le salverà su Storage."
        icon={<Sparkles className="h-4 w-4" />}
      >
        {!ready && (
          <SrCallout variant="warning" className="mb-3">
            ⚠️ Completa prima i {erroriCount} elementi mancanti nella checklist sopra.
          </SrCallout>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <div className="border border-emerald-100 rounded-md p-3 bg-white">
            <p className="text-[10px] uppercase font-bold text-emerald-700">Pagina 1</p>
            <p className="text-sm font-semibold mt-1">Proposta di intervento</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Anagrafica · Sintesi · Esigenze · Soluzione · Perché noi
            </p>
          </div>
          <div className="border border-emerald-100 rounded-md p-3 bg-white">
            <p className="text-[10px] uppercase font-bold text-emerald-700">Pagina 2</p>
            <p className="text-sm font-semibold mt-1">Investimento + Finanziamento</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              Forbice prezzo · Anticipo + 2 piani · Testimonianze · Cosa è incluso
            </p>
          </div>
          <div className="border border-emerald-100 rounded-md p-3 bg-white">
            <p className="text-[10px] uppercase font-bold text-emerald-700">Pagina 3</p>
            <p className="text-sm font-semibold mt-1">Allegato tecnico</p>
            <p className="text-[11px] text-muted-foreground mt-1">
              BOM serramenti · Accessori · Consulenza · Cronoprogramma · Prossimi passi
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => generaPdfMut.mutate()}
            disabled={!ready || generaPdfMut.isPending}
            className="flex-1 bg-emerald-700 hover:bg-emerald-800 gap-2"
            size="lg"
          >
            {generaPdfMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />}
            {p.pdf_html_url ? "Rigenera preventivo" : "Genera preventivo"}
          </Button>
          {p.pdf_html_url && (
            <Button asChild variant="outline" size="lg">
              <a href={p.pdf_html_url} target="_blank" rel="noopener noreferrer" className="gap-2">
                <ExternalLink className="h-4 w-4" /> Apri ultimo PDF
              </a>
            </Button>
          )}
        </div>

        {p.pdf_generated_at && (
          <p className="text-[11px] text-muted-foreground mt-2">
            Ultimo PDF generato: {new Date(p.pdf_generated_at).toLocaleString("it-IT")}
          </p>
        )}

        <SrCallout variant="info" className="mt-3">
          💡 Il PDF si apre nel browser. Stampa con <strong>Ctrl+P</strong> (Cmd+P su Mac) e scegli "Salva come PDF" per inviarlo al cliente o stamparlo.
        </SrCallout>
      </SrCard>
    </div>
  );
}
