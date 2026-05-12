/**
 * useSerramentoPDF — download/preview PDF cliente del preventivo serramenti.
 *
 * Pattern mutuato da useOrdinePDF: dynamic imports per code-split del vendor
 * @react-pdf/renderer (~740 KB) → caricato solo al click "Scarica PDF".
 *
 * Pre-fetch dati arricchiti prima della generazione:
 *  - Consulente (profiles): nome, foto, ruolo, telefono, email
 *  - Family per ogni serramento del BOM: immagine_url + custom_field_values
 *  - Macrocategorie con mostra_pagina_dedicata_pdf=true
 *  - Macrocategoria field schema (per filtrare i campi show_in_pdf=true)
 *
 * Il pre-fetch garantisce che il componente PDF abbia tutti i dati pronti
 * (no race condition, no immagini mancanti per signed URL scaduti).
 */
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  SrProgettoDetail, SrTemplatePdfRow,
} from "@/types/serramenti";

// ─── Tipi pre-fetch arricchimento ──────────────────────────────────────────

export interface SerramentoPdfConsulente {
  nome: string;
  ruolo: string | null;
  telefono: string | null;
  email: string | null;
  foto_url: string | null;
}

export interface SerramentoPdfFamilyData {
  id: string;
  immagine_url: string | null;
  custom_field_values: Record<string, unknown>;
  macrocategoria_id: string | null;
}

export interface SerramentoPdfMacroField {
  field_key: string;
  field_label: string;
  field_type: string;
  field_unit: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field_options: any[] | null;
  show_in_pdf: boolean;
  sort_order: number;
}

export interface SerramentoPdfMacroPagina {
  macro_id: string;
  nome: string;
  descrizione_estesa: string;
  immagine_url: string | null;
}

export interface SerramentoPdfEnriched {
  detail: SrProgettoDetail;
  template?: SrTemplatePdfRow | null;
  company?: {
    name?: string | null;
    ragione_sociale?: string | null;
    indirizzo?: string | null;
    telefono?: string | null;
    email?: string | null;
    partita_iva?: string | null;
    logo_url?: string | null;
    website?: string | null;
  } | null;
  consulente: SerramentoPdfConsulente | null;
  familiesById: Record<string, SerramentoPdfFamilyData>;
  /** Schema campi (show_in_pdf=true) per macrocategoria_id. */
  fieldsByMacro: Record<string, SerramentoPdfMacroField[]>;
  /** Pagine dedicate da generare in coda al PDF, ordinate per occorrenza nel BOM. */
  macroPagineDedicate: SerramentoPdfMacroPagina[];
}

export interface SerramentoPdfPayload {
  detail: SrProgettoDetail;
  template?: SrTemplatePdfRow | null;
  company?: SerramentoPdfEnriched["company"];
}

// ─── Helper pre-fetch ──────────────────────────────────────────────────────

async function enrichForPdf(opts: SerramentoPdfPayload): Promise<SerramentoPdfEnriched> {
  const { detail, template, company } = opts;
  const prog = detail.progetto;

  // 1. Consulente (profiles). Strategia in cascata:
  //    a) Se prog.consulente_id è settato → usa quello
  //    b) Altrimenti (progetti vecchi/import) → usa l'utente loggato attuale
  //    Così il PDF mostra SEMPRE un consulente reale, mai il nome azienda.
  let consulente: SerramentoPdfConsulente | null = null;
  let consulenteId = prog.consulente_id ?? null;
  if (!consulenteId) {
    const { data: { user } } = await supabase.auth.getUser();
    consulenteId = user?.id ?? null;
  }
  if (consulenteId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("profiles")
      .select("first_name, last_name, email, phone, avatar_url")
      .eq("id", consulenteId)
      .maybeSingle();
    if (data) {
      consulente = {
        nome: [data.first_name, data.last_name].filter(Boolean).join(" ") || "Consulente tecnico",
        ruolo: "Consulente tecnico",
        telefono: data.phone ?? null,
        email: data.email ?? null,
        foto_url: data.avatar_url ?? null,
      };
    }
  }

  // 2. Family per ogni serramento (immagine + custom_field_values)
  const familyIds = Array.from(new Set(
    detail.serramenti.map((s) => s.family_id).filter((v): v is string => !!v),
  ));
  const familiesById: Record<string, SerramentoPdfFamilyData> = {};
  let categoriaToMacro: Record<string, string> = {};
  if (familyIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: famRows } = await (supabase as any)
      .from("article_families")
      .select("id, immagine_url, custom_field_values, categoria_id")
      .in("id", familyIds);
    ((famRows ?? []) as Array<{ id: string; immagine_url: string | null; custom_field_values: Record<string, unknown> | null; categoria_id: string | null }>)
      .forEach((f) => {
        familiesById[f.id] = {
          id: f.id,
          immagine_url: f.immagine_url,
          custom_field_values: f.custom_field_values ?? {},
          macrocategoria_id: null, // popolato sotto
        };
      });

    // 3. Categorie → macrocategorie
    const categoriaIds = Array.from(new Set(
      ((famRows ?? []) as Array<{ categoria_id: string | null }>)
        .map((f) => f.categoria_id).filter((v): v is string => !!v),
    ));
    if (categoriaIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: catRows } = await (supabase as any)
        .from("listino_categorie")
        .select("id, macrocategoria_id")
        .in("id", categoriaIds);
      ((catRows ?? []) as Array<{ id: string; macrocategoria_id: string | null }>).forEach((c) => {
        if (c.macrocategoria_id) categoriaToMacro[c.id] = c.macrocategoria_id;
      });
      // Backfill macrocategoria_id nei familiesById
      ((famRows ?? []) as Array<{ id: string; categoria_id: string | null }>).forEach((f) => {
        if (f.categoria_id && familiesById[f.id]) {
          familiesById[f.id].macrocategoria_id = categoriaToMacro[f.categoria_id] ?? null;
        }
      });
    }
  }

  // 4. Schema campi scheda tecnica per macrocategorie coinvolte
  const macroIdsCoinvolte = Array.from(new Set(
    Object.values(familiesById)
      .map((f) => f.macrocategoria_id)
      .filter((v): v is string => !!v),
  ));
  const fieldsByMacro: Record<string, SerramentoPdfMacroField[]> = {};
  if (macroIdsCoinvolte.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fieldRows } = await (supabase as any)
      .from("listino_macrocategoria_fields")
      .select("macrocategoria_id, field_key, field_label, field_type, field_unit, field_options, show_in_pdf, sort_order")
      .in("macrocategoria_id", macroIdsCoinvolte)
      .eq("show_in_pdf", true)
      .order("sort_order", { ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((fieldRows ?? []) as any[]).forEach((f) => {
      const arr = fieldsByMacro[f.macrocategoria_id] ?? [];
      arr.push(f);
      fieldsByMacro[f.macrocategoria_id] = arr;
    });
  }

  // 5. Pagine dedicate macrocategoria
  const macroIdsBomOrdine: string[] = [];
  const seen = new Set<string>();
  for (const s of detail.serramenti) {
    if (!s.family_id) continue;
    const macroId = familiesById[s.family_id]?.macrocategoria_id;
    if (macroId && !seen.has(macroId)) {
      seen.add(macroId);
      macroIdsBomOrdine.push(macroId);
    }
  }
  let macroPagineDedicate: SerramentoPdfMacroPagina[] = [];
  if (macroIdsBomOrdine.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: macroRows } = await (supabase as any)
      .from("listino_macrocategorie")
      .select("id, nome, descrizione, descrizione_estesa, immagine_url, mostra_pagina_dedicata_pdf")
      .in("id", macroIdsBomOrdine)
      .eq("mostra_pagina_dedicata_pdf", true);
    const macroMap = new Map<string, SerramentoPdfMacroPagina>();
    ((macroRows ?? []) as Array<{
      id: string; nome: string; descrizione: string | null;
      descrizione_estesa: string | null; immagine_url: string | null;
    }>).forEach((m) => {
      const desc = (m.descrizione_estesa ?? m.descrizione ?? "").trim();
      if (!desc) return;
      macroMap.set(m.id, {
        macro_id: m.id,
        nome: m.nome,
        descrizione_estesa: desc,
        immagine_url: m.immagine_url,
      });
    });
    macroPagineDedicate = macroIdsBomOrdine
      .filter((id) => macroMap.has(id))
      .map((id) => macroMap.get(id)!);
  }

  return {
    detail,
    template: template ?? null,
    company: company ?? null,
    consulente,
    familiesById,
    fieldsByMacro,
    macroPagineDedicate,
  };
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useSerramentoPDF() {
  const [isGenerating, setIsGenerating] = useState(false);

  const downloadPDF = async (opts: SerramentoPdfPayload): Promise<{ ok: boolean }> => {
    setIsGenerating(true);
    try {
      const enriched = await enrichForPdf(opts);
      const [{ pdf }, { SerramentoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
      ]);
      const element = React.createElement(SerramentoPDF, enriched);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const filename = `Preventivo-${opts.detail.progetto.code ?? "stima"}-${
        [opts.detail.progetto.cliente_nome, opts.detail.progetto.cliente_cognome].filter(Boolean).join("_") || "cliente"
      }.pdf`;
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF scaricato", { description: filename });
      return { ok: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Errore generazione PDF serramenti:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nella generazione del PDF", { description: msg });
      return { ok: false };
    } finally {
      setIsGenerating(false);
    }
  };

  const previewPDF = async (opts: SerramentoPdfPayload): Promise<void> => {
    setIsGenerating(true);
    try {
      const enriched = await enrichForPdf(opts);
      const [{ pdf }, { SerramentoPDF }, React] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/components/serramenti/SerramentoPDF"),
        import("react"),
      ]);
      const element = React.createElement(SerramentoPDF, enriched);
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        toast.success("PDF generato", {
          description: "Apertura bloccata dal browser.",
          action: { label: "Apri", onClick: () => window.open(url, "_blank") },
          duration: 10000,
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Errore preview PDF serramenti:", err);
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      toast.error("Errore nella generazione del PDF", { description: msg });
    } finally {
      setIsGenerating(false);
    }
  };

  return { downloadPDF, previewPDF, isGenerating };
}
