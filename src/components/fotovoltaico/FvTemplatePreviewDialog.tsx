// ─────────────────────────────────────────────────────────────────────────────
// FvTemplatePreviewDialog — anteprima COMPLETA del preventivo Fotovoltaico
// dentro l'editor template (parità col modulo Serramenti). Renderizza lato client
// la stessa funzione del PDF (`renderFvPdfHtml`, già pura e condivisa con la edge
// function) usando dati cliente/impianto DEMO + il template live in editing.
// Le immagini (cover, foto team, recensioni) sono percorsi nel bucket privato:
// si firmano prima di comporre l'HTML, e nell'iframe il link firmato basta
// (niente base64 per l'anteprima).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  badgeGaranzieDalSito,
  fotoBlocchiDalSito,
  fotoDiSerieDalSito,
  fotoPagineDalSito,
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { useFileRiservato, useImmaginiModelloFirmate } from "@/hooks/useFileRiservati";
import { CAMPI_IMMAGINE_FOTOVOLTAICO } from "@/lib/storage/immaginiModelloPdf";
import { buildFvPreviewBase } from "@/lib/moduli-vendita/fvPreviewData";

/** Dati cliente/impianto di esempio: riempiono le pagine "dato-dipendenti"
 *  (investimento, scenario, flussi). Le pagine template-dipendenti (cover, chi
 *  siamo, recensioni, garanzie, condizioni) riflettono il template in editing. */
// Shared intervention-aware demonstration data.

export default function FvTemplatePreviewDialog({
  open,
  onOpenChange,
  form: formSalvato,
  companyName,
  logoUrl: logoSalvato,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Lo stato corrente del template in editing (FvTemplate). */
  form: Record<string, unknown>;
  companyName?: string | null;
  logoUrl?: string | null;
}) {
  // Immagini del modello: percorsi nel bucket privato, firmati solo mentre il
  // dialogo è aperto (vedi supabase/functions/_shared/immaginiModelloPdf.ts).
  const form = useImmaginiModelloFirmate(open ? formSalvato : null, CAMPI_IMMAGINE_FOTOVOLTAICO);
  const logoUrl = useFileRiservato(open ? logoSalvato : null) || null;
  const html = useMemo(() => {
    if (!open) return "";
    const base = buildFvPreviewBase(form as FvPdfTemplateData["template"]);
    const f = form ?? {};
    const str = (k: string) => {
      const v = f[k];
      return typeof v === "string" && v.trim() ? v : undefined;
    };
    const data: FvPdfTemplateData = {
      ...base,
      azienda: {
        ...base.azienda,
        name: str("ragione_sociale") || companyName || base.azienda.name,
        phone: str("contatto_telefono") || base.azienda.phone,
        email: str("contatto_email") || base.azienda.email,
        website: str("url_sito") || base.azienda.website,
      },
      // Tutti i campi configurabili (cover, chi siamo, recensioni, garanzie,
      // FAQ, condizioni, ordine pagine…) vivono nella form con gli stessi nomi.
      template: {
        ...(f as FvPdfTemplateData["template"]),
        logo_url: (str("logo_url") ?? logoUrl ?? null) as string | null,
      },
      // Le foto dei blocchi accesi, dal sito o già firmate: come le vedrà il cliente.
      blocchi_foto: typeof window !== "undefined" ? fotoBlocchiDalSito(window.location.origin, f as FvPdfTemplateData["template"]) : null,
      badge_garanzie: typeof window !== "undefined" ? badgeGaranzieDalSito(window.location.origin) : null,
      foto_pagine: typeof window !== "undefined" ? fotoPagineDalSito(window.location.origin, f as FvPdfTemplateData["template"]) : null,
    };
    try {
      return renderFvPdfHtml(data);
    } catch (e) {
      return `<div style="padding:40px;font-family:sans-serif;color:#b91c1c">Anteprima non disponibile: ${String(
        e,
      )}</div>`;
    }
  }, [open, form, companyName, logoUrl]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle className="text-base">Anteprima preventivo Fotovoltaico</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Dati cliente e impianto di esempio. Cover, Chi siamo, recensioni,
            garanzie, FAQ e condizioni riflettono il tuo template in tempo reale.
            Il PDF finale può variare leggermente.
          </p>
        </DialogHeader>
        <iframe
          srcDoc={html}
          title="Anteprima preventivo Fotovoltaico"
          className="w-full h-[80vh] border-0 bg-white"
        />
      </DialogContent>
    </Dialog>
  );
}
