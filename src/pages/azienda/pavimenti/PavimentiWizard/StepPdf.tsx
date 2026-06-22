/**
 * StepPdf — step "PDF" del wizard Pavimenti (Task 22).
 *
 * Sostituisce il placeholder. Mostra:
 *  - anteprima sintetica dei dati che entrano nel PDF (cliente, totale, capitoli)
 *  - checklist di completezza (presenza dati per un PDF presentabile)
 *  - bottoni "Anteprima PDF" / "Scarica PDF" → chiamano `usePavimentiPDF`
 *
 * ⚠️ ANTI-FAIL-SILENZIOSO (bug noto verticali): i bottoni si disabilitano SOLO
 * se il computo è vuoto, e in quel caso mostriamo un avviso CHIARO ("Aggiungi
 * almeno una voce…"). Qualunque errore di generazione passa per il try/catch +
 * toast dell'hook: niente "non succede nulla". `isGenerating` blocca i doppi click.
 *
 * Niente setState-in-effect né `Date.now()`/`Math.random()` in render: i totali
 * derivano da `useMemo`, la company da react-query.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Download, Eye, Loader2, Check, AlertCircle, AlertTriangle,
  ClipboardList, Settings2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calcTotaliComputo } from "@/lib/pavimenti/calcoli";
import {
  usePavTemplatePdf,
  useEffectiveCompanyId,
} from "@/hooks/usePavimentiProgetto";
import {
  usePavimentiPDF,
  type PavPdfCompany,
} from "@/hooks/usePavimentiPDF";
import type { PavProgetto, PavComputoVoce, PavProgettoMedia } from "@/types/pavimenti";

interface Props {
  progetto: PavProgetto;
  computo: PavComputoVoce[];
  media: PavProgettoMedia[];
}

interface ChecklistItem {
  ok: boolean;
  label: string;
  hint?: string;
}

const TEMPLATE_SETTINGS_HREF =
  "/azienda/impostazioni/template-preventivi?tab=moduli-vendita&modulo=pavimenti";

export default function StepPdf({ progetto, computo, media }: Props) {
  const companyId = useEffectiveCompanyId();
  const { data: template } = usePavTemplatePdf();
  const { downloadPDF, previewPDF, isGenerating } = usePavimentiPDF();

  // Come mostrare il computo nel PDF — scelta PER QUESTO PREVENTIVO (non template).
  const [computoLivello, setComputoLivello] = useState<"dettagliato" | "sintetico" | "corpo">("dettagliato");
  const [mostraPrezzi, setMostraPrezzi] = useState(true);
  const [mostraQta, setMostraQta] = useState(true);
  const [mostraSubtotali, setMostraSubtotali] = useState(true);
  const soloDettaglio = computoLivello === "dettagliato"; // i toggle colonne hanno senso solo qui

  // Company per intestazione/contatti del PDF (best-effort; l'hook ha comunque
  // un fallback che la rilegge se non la passiamo).
  const { data: company } = useQuery<PavPdfCompany | null>({
    queryKey: ["pav-step-pdf-company", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("name, business_name, legal_address, legal_city, legal_postal_code, legal_province, phone, email, vat_number, website, logo_url")
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
        // `website` può non esistere su companies: cast difensivo.
        website: (data as Record<string, unknown>).website as string | null ?? null,
        logo_url: data.logo_url,
      };
    },
  });

  const totali = useMemo(
    () =>
      calcTotaliComputo(
        computo.map((v) => ({
          capitolo_nome: v.capitolo_nome,
          quantita: v.quantita,
          prezzo_unitario: v.prezzo_unitario,
          sconto_pct: v.sconto_pct,
          costo_materiali: v.costo_materiali,
          costo_manodopera: v.costo_manodopera,
        })),
        { sconto_pct: Number(progetto.sconto_pct) || 0, iva_pct: Number(progetto.iva_pct ?? 10) },
      ),
    [computo, progetto.sconto_pct, progetto.iva_pct],
  );

  const numCapitoli = totali.perCapitolo.length;
  const computoVuoto = computo.length === 0;

  // ─── Checklist (non bloccante, eccetto computo vuoto) ──────────────────────
  const checks: ChecklistItem[] = [
    {
      ok: !!(progetto.cliente_nome || progetto.cliente_cognome),
      label: "Anagrafica cliente",
      hint: !(progetto.cliente_nome || progetto.cliente_cognome) ? "Aggiungi nome/cognome nello step Cliente" : undefined,
    },
    {
      ok: !!(progetto.cantiere_indirizzo || progetto.cantiere_citta),
      label: "Indirizzo cantiere",
      hint: !(progetto.cantiere_indirizzo || progetto.cantiere_citta) ? "Aggiungilo nello step Immobile" : undefined,
    },
    {
      ok: !computoVuoto,
      label: `${computo.length} voci nel computo (${numCapitoli} capitoli)`,
      hint: computoVuoto ? "Obbligatorio — aggiungi voci nello step Computo" : undefined,
    },
    {
      ok: totali.totale > 0,
      label: "Totale preventivo calcolato",
      hint: totali.totale <= 0 ? "Verifica quantità e prezzi nel computo" : undefined,
    },
    {
      ok: Boolean((template?.chi_siamo ?? "").trim()) || (template?.usp ?? []).some((u) => (u.titolo ?? "").trim()),
      label: "Presentazione impresa (chi siamo / USP)",
      hint: "Configurala nel template per un PDF più convincente",
    },
    {
      ok: media.length > 0,
      label: "Foto o render del progetto",
      hint: media.length === 0 ? "Opzionale: aggiungi foto nello step Foto" : undefined,
    },
  ];
  const erroriCount = checks.filter((c) => !c.ok).length;

  const payload = {
    progetto, computo, media, template: template ?? null, company: company ?? null,
    pdfOptions: {
      livello: computoLivello,
      mostraPrezzi: soloDettaglio ? mostraPrezzi : true,
      mostraQta: soloDettaglio ? mostraQta : true,
      mostraSubtotali: soloDettaglio ? mostraSubtotali : true,
    },
  };
  const handleDownload = () => { void downloadPDF(payload); };
  const handlePreview = () => { void previewPDF(payload); };

  return (
    <div className="space-y-3">
      {/* Anteprima dati */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-slate-900">Anteprima del preventivo</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi label="Codice" value={progetto.code ?? "—"} />
            <Kpi label="Capitoli" value={String(numCapitoli)} />
            <Kpi label="Voci" value={String(computo.length)} />
            <Kpi label="Totale IVA inclusa" value={formatCurrency(totali.totale)} highlight />
          </div>
          <div className="rounded-lg border-l-4 border-orange-200 bg-orange-50/40 px-3 py-2">
            <p className="text-sm">
              {[progetto.cliente_nome, progetto.cliente_cognome].filter(Boolean).join(" ") || "Cliente da definire"}
              {progetto.cantiere_citta && ` · ${progetto.cantiere_citta}`}
              {numCapitoli > 0 && ` · ${numCapitoli} capitoli di lavorazioni`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Come mostrare il computo nel PDF — scelta PER QUESTO PREVENTIVO (non template) */}
      {!computoVuoto && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-orange-600" />
              <h2 className="text-sm font-semibold text-slate-900">Come mostrare il computo nel PDF</h2>
            </div>
            <p className="-mt-1 text-[11px] text-muted-foreground">
              Vale solo per questo preventivo — non modifica il template.
            </p>
            {/* Livello di dettaglio */}
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "dettagliato", label: "Dettagliato", hint: "Ogni voce" },
                { v: "sintetico", label: "Sintetico", hint: "Solo capitoli" },
                { v: "corpo", label: "A corpo", hint: "Solo totale" },
              ] as const).map((opt) => {
                const active = computoLivello === opt.v;
                return (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setComputoLivello(opt.v)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-center transition-all",
                      active
                        ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                        : "border-input hover:border-orange-300 hover:bg-orange-50/50",
                    )}
                  >
                    <span className="block text-xs font-semibold">{opt.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            {/* Toggle colonne — solo in modalità "dettagliato" */}
            {soloDettaglio && (
              <div className="space-y-2 border-t pt-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-xs">Mostra prezzi unitari</span>
                  <Switch checked={mostraPrezzi} onCheckedChange={setMostraPrezzi} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-xs">Mostra quantità e U.M.</span>
                  <Switch checked={mostraQta} onCheckedChange={setMostraQta} />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="text-xs">Mostra subtotali per capitolo</span>
                  <Switch checked={mostraSubtotali} onCheckedChange={setMostraSubtotali} />
                </label>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Checklist */}
      <Card className={cn(computoVuoto ? "border-amber-200" : "")}>
        <CardContent className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-slate-900">Checklist completezza</h2>
          </div>
          <div className="space-y-1">
            {checks.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                {c.ok ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                )}
                <div className="flex-1">
                  <span className={c.ok ? "text-foreground" : "font-medium text-amber-700"}>{c.label}</span>
                  {c.hint && <span className="ml-1 text-muted-foreground">— {c.hint}</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Generazione PDF */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-orange-600" />
            <h2 className="text-sm font-semibold text-slate-900">Scarica il preventivo</h2>
          </div>
          <p className="text-[11px] text-muted-foreground">
            PDF A4 brandizzato pronto da allegare via email o stampare: copertina, presentazione
            impresa, computo per capitoli, foto, cronoprogramma e condizioni.
          </p>

          {computoVuoto ? (
            // AVVISO CHIARO — mai disabilitazione silenziosa.
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="flex-1 text-[11px] text-amber-800">
                <p className="font-medium">Il computo è vuoto: non c'è ancora nulla da mettere nel preventivo.</p>
                <p className="text-amber-700/80">Torna allo step Computo e aggiungi almeno una voce per generare il PDF.</p>
              </div>
            </div>
          ) : (
            erroriCount > 0 && (
              <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                <p className="flex-1 text-[11px] text-blue-900">
                  Il PDF è generabile. Restano {erroriCount} elementi consigliati non compilati
                  (vedi checklist): puoi generarlo comunque, ma compilarli lo rende più convincente.
                </p>
              </div>
            )
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              onClick={handleDownload}
              disabled={computoVuoto || isGenerating}
              size="lg"
              className="flex-1 gap-2 bg-orange-500 hover:bg-orange-600"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Scarica PDF
            </Button>
            <Button
              onClick={handlePreview}
              disabled={computoVuoto || isGenerating}
              size="lg"
              variant="outline"
              className="gap-2"
            >
              {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              Anteprima PDF
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> Generato nel browser, senza attese server
            </span>
            <Link to={TEMPLATE_SETTINGS_HREF} className="inline-flex items-center gap-1 text-orange-700 underline-offset-2 hover:underline">
              <Settings2 className="h-3 w-3" /> Personalizza il template
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── KPI box ──────────────────────────────────────────────────────────────────
function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2", highlight ? "border-orange-200 bg-orange-50" : "bg-muted/30")}>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-sm font-bold", highlight ? "text-orange-700" : "text-slate-900")}>{value}</p>
    </div>
  );
}
