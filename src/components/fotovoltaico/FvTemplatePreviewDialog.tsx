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
  renderFvPdfHtml,
  type FvPdfTemplateData,
} from "../../../supabase/functions/_shared/fvHtmlTemplate";
import { useFileRiservato, useImmaginiModelloFirmate } from "@/hooks/useFileRiservati";
import { CAMPI_IMMAGINE_FOTOVOLTAICO } from "@/lib/storage/immaginiModelloPdf";

/** Dati cliente/impianto di esempio: riempiono le pagine "dato-dipendenti"
 *  (investimento, scenario, flussi). Le pagine template-dipendenti (cover, chi
 *  siamo, recensioni, garanzie, condizioni) riflettono il template in editing. */
function demoBase(): FvPdfTemplateData {
  return {
    azienda: {
      name: "La tua azienda",
      tagline: "Fotovoltaico chiavi in mano",
      phone: "+39 02 000 000",
      email: "info@azienda.it",
      website: "https://azienda.it",
      vat_number: "IT00000000000",
    },
    cliente: {
      nome: "Mario",
      cognome: "Rossi",
      indirizzo: "Via Roma 1",
      comune: "Milano",
      cap: "20100",
      provincia: "MI",
      tipologia_immobile: "Villa singola",
    },
    progetto: {
      numero: "FV-ANTEPRIMA",
      titolo: "Mario Rossi",
      creato_il: "2026-01-01T10:00:00Z",
      valido_giorni: 30,
      venditore: "Consulente",
      potenza_kwp: 6,
      numero_pannelli: 12,
      has_accumulo: true,
      capacita_accumulo_kwh: 10,
      consumo_annuo_kwh: 4200,
      costo_kwh_attuale: 0.32,
      profilo_consumo: "misto",
      ore_sole_annue: 1450,
      superficie_tetto_disponibile_mq: 55,
    },
    costi: {
      prezzo_vendita_iva_inclusa: 18000,
      iva_perc: 10,
      detrazione_eur: 9000,
      detrazione_perc: 50,
      costo_netto_dopo_detrazione: 9000,
    },
    finanziamento: {
      finanziaria: "Finanziaria",
      durata_mesi: 84,
      rata_mensile: 230,
      tan_perc: 4,
      taeg_perc: 5,
      importo_finanziato: 18000,
    },
    scenario: {
      risparmio_mensile_eur: 150,
      risparmio_anno1_eur: 1800,
      risparmio_25_anni_eur: 46000,
      payback_anni: 8,
      npv_25_anni: 24000,
      cassa_anno_per_anno: [
        { anno: 0, cumulato: -18000 },
        { anno: 8, cumulato: 0 },
        { anno: 25, cumulato: 46000 },
      ],
    },
    flows: {
      produzione_kwh: 7400,
      autoconsumo_kwh: 4200,
      ceduto_rete_kwh: 3200,
      prelievo_rete_kwh: 900,
      autoconsumo_pct: 0.57,
      autosufficienza_pct: 0.78,
      consumo_da_rete_pct: 0.22,
      consumo_da_fv_pct: 0.78,
    },
    componenti: [
      {
        categoria: "pannello",
        descrizione: "Pannello 500 W",
        marca: "—",
        modello: "PV500",
        quantita: 12,
        potenza_w: 500,
        garanzia_anni: 25,
      },
      {
        categoria: "inverter",
        descrizione: "Inverter ibrido 6 kW",
        marca: "—",
        modello: "INV6",
        quantita: 1,
        garanzia_anni: 10,
      },
      {
        categoria: "accumulo",
        descrizione: "Batteria 10 kWh",
        marca: "—",
        modello: "BAT10",
        quantita: 1,
        capacita_kwh: 10,
        garanzia_anni: 10,
      },
    ],
  };
}

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
    const base = demoBase();
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
