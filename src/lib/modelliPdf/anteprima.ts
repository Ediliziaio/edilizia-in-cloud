import type {
  AziendaDocumento,
  DocumentoOperativo,
  TipoDocumentoOperativo,
} from "@/lib/documentiOperativi/modello";
import type { ModelloPdf, TipoModelloPdf } from "./catalogo";
export function documentoEsempio(
  tipo: TipoDocumentoOperativo,
): DocumentoOperativo {
  return {
    tipo,
    numero: tipo === "richiesta" ? "RDO-ESEMPIO-001" : "DOC-ESEMPIO-001",
    data: "2026-11-06",
    destinatario: {
      nome:
        tipo === "trasporti" || tipo === "economia"
          ? "Cliente di esempio S.r.l."
          : "Fornitore di esempio S.r.l.",
      indirizzo: "Via dei Tigli 24, 20100 Milano MI",
      email: "acquisti@esempio.invalid",
      partitaIva: "00000000000",
    },
    commessa: "C-001 · Ristrutturazione appartamento",
    luogo: "Cantiere Via Roma 18, Milano",
    periodo: "Novembre 2026",
    pagamento: "Bonifico a 30 giorni",
    referente: "Responsabile di cantiere",
    consegna: "2026-11-20",
    note: "Documento di esempio per controllare l’impaginazione del modello.",
    noteConsegna: "Concordare la consegna con il referente di cantiere.",
    righe: [
      {
        descrizione: "Fornitura materiale per le lavorazioni",
        unita: "pz",
        quantita: 12,
        prezzo: 18.5,
        iva: 22,
        data: "2026-11-06",
        carico: "Magazzino principale",
        scarico: "Cantiere Via Roma",
        mezzo: "Autocarro",
        oreUomo: 4,
        oreMezzo: 2,
        ddt: "DDT-001",
      },
      {
        descrizione: "Lavorazione e assistenza in cantiere",
        unita: "ore",
        quantita: 8,
        prezzo: 32,
        iva: 22,
        gruppo: "Manodopera",
        data: "2026-11-07",
        carico: "Fornitore",
        scarico: "Cantiere Via Roma",
        mezzo: "Furgone",
        oreUomo: 8,
        oreMezzo: 1,
        ddt: "DDT-002",
      },
    ],
  };
}
export async function anteprimaModello(
  tipo: TipoModelloPdf,
  config: ModelloPdf,
  company: AziendaDocumento,
): Promise<Blob> {
  if (tipo !== "rapportino" && tipo !== "fine_lavori") {
    const { generaPdfOperativo } = await import("@/lib/documentiOperativi/pdf");
    return generaPdfOperativo(documentoEsempio(tipo), company, config);
  }
  const { renderRapportino } =
    await import("../../../supabase/functions/genera-pdf-rapportino/render");
  const { getBrandingForCompany } =
    await import("../../../supabase/functions/_shared/getBranding");
  const { supabase } = await import("@/integrations/supabase/client");
  const branding = await getBrandingForCompany(supabase, company.id);
  const { bytes } = await renderRapportino(
    {
      modelloPdf: config,
      report: {
        id: "00000000-0000-4000-8000-000000000001",
        data_lavoro: "2026-11-06",
        ore_lavorate: 8,
        lavoro_completato: tipo === "fine_lavori",
        descrizione_lavori:
          "Posa e controllo dei materiali. Preparazione delle superfici e verifica delle lavorazioni eseguite.",
        autore: { first_name: "Mario", last_name: "Rossi" },
        ordine: {
          order_code: "C-001",
          description: "Ristrutturazione appartamento",
          client_name: "Cliente di esempio",
          work_address: "Via Roma 18, Milano",
        },
        stato: "bozza",
        role_type: "employee",
        presenze: [{ nome: "Mario Rossi", ore: 8 }],
      },
      company: { ...company, name: company.business_name || company.name },
      branding: {
        logoUrl: company.logo_url ?? undefined,
        primaryColor: company.brand_primary_color || branding.primaryColor,
        hidePoweredBy: branding.hidePoweredBy,
        platformName: branding.platformName,
      },
      phases: [],
      punches: [],
      warnings: [],
      revision: "ANTEPRIMA",
      generatedAt: "2026-11-06T12:00:00Z",
    },
    async (ref, kind) => {
      if (kind !== "logo") return null;
      const response = await fetch(ref, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return null;
      return new Uint8Array(await response.arrayBuffer());
    },
  );
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
