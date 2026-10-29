/**
 * useRendicontoAppaltoPDF — stampa il rendiconto da mandare al committente.
 *
 *   const { stampa, isGenerating } = useRendicontoAppaltoPDF();
 *   await stampa(salId);   // scarica Rendiconto-{numero}.pdf
 *
 * Legge il documento, le sue righe congelate, i cantieri a cui appartengono,
 * il contratto e le due anagrafiche; raggruppa per cantiere e genera il PDF.
 *
 * Le righe NON si rileggono dalle tariffe: si leggono dal rendiconto, dove sono
 * state congelate. È il senso del congelamento — la carta che il committente ha
 * in mano deve restare quella anche se domani il listino cambia.
 *
 * `@react-pdf/renderer` e il template arrivano con un import dinamico al primo
 * click, come in useShipmentDDTPDF: sono il pezzo pesante del bundle.
 *
 * Fase 5 del Modulo Appaltatori (28/10/2026).
 */
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { logger } from "@/utils/logger";
import { raggruppaPerCantiere, type RigaDaStampare } from "@/lib/appalto/fattura";
import { STATI_SAL } from "@/lib/appalto/rendiconto";

let pdfModulePromise: Promise<{
  pdf: typeof import("@react-pdf/renderer").pdf;
  RendicontoAppaltoPDF: typeof import("@/components/orders/RendicontoAppaltoPDF").RendicontoAppaltoPDF;
}> | null = null;

function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/orders/RendicontoAppaltoPDF"),
    ]).then(([pdfMod, tplMod]) => ({
      pdf: pdfMod.pdf,
      RendicontoAppaltoPDF: tplMod.RendicontoAppaltoPDF,
    }));
  }
  return pdfModulePromise;
}

interface SalRecord {
  id: string;
  numero: number;
  stato: string;
  periodo_dal: string;
  periodo_al: string;
  totale: number;
  ritenuta_pct: number;
  ritenuta: number;
  netto: number;
  note: string | null;
  company_id: string;
  committente_id: string;
  contratto_id: string;
}

const nomeDi = (p: { business_name?: string | null; first_name?: string | null; last_name?: string | null }) =>
  p.business_name?.trim() || [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Committente";

export function useRendicontoAppaltoPDF() {
  const { effectiveCompany } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  // setState non è sincrono: due click ravvicinati vedrebbero entrambi false.
  const inCorso = useRef(false);

  const stampa = useCallback(
    async (salId: string): Promise<void> => {
      if (!effectiveCompany?.id) {
        toast.error("Nessuna azienda attiva");
        return;
      }
      if (inCorso.current) return;
      inCorso.current = true;
      setIsGenerating(true);
      try {
        const { data: salRaw, error: salErr } = await (supabase as any)
          .from("appalto_sal")
          .select(
            "id, numero, stato, periodo_dal, periodo_al, totale, ritenuta_pct, ritenuta, netto, note, company_id, committente_id, contratto_id",
          )
          .eq("id", salId)
          .eq("company_id", effectiveCompany.id)
          .maybeSingle();
        if (salErr) throw salErr;
        if (!salRaw) throw new Error("Rendiconto non trovato");
        const sal = salRaw as SalRecord;

        const { data: righeRaw, error: righeErr } = await (supabase as any)
          .from("appalto_rendiconto_righe")
          .select(
            "id, order_id, data, descrizione, unita_misura, prezzo_unitario, quantita, maggiorazione_pct, importo, extra_contratto, note",
          )
          .eq("sal_id", salId)
          .order("data", { ascending: true });
        if (righeErr) throw righeErr;
        const righe = (righeRaw ?? []) as RigaDaStampare[];
        if (righe.length === 0) {
          throw new Error("Questo rendiconto non ha righe: non c'è niente da stampare");
        }

        const orderIds = [...new Set(righe.map((r) => r.order_id))];
        const [cantieriRes, committenteRes, contrattoRes, aziendaRes] = await Promise.all([
          supabase.from("orders").select("id, order_code, description").in("id", orderIds),
          supabase
            .from("profiles")
            .select("business_name, first_name, last_name, vat_number, fiscal_code, address, city, postal_code, province")
            .eq("id", sal.committente_id)
            .maybeSingle(),
          (supabase as any)
            .from("appalto_contratti")
            .select("nome, riferimento_committente")
            .eq("id", sal.contratto_id)
            .maybeSingle(),
          supabase
            .from("companies")
            .select("name, vat_number, fiscal_code, address, city, postal_code, province, phone, email, pec, logo_url")
            .eq("id", effectiveCompany.id)
            .maybeSingle(),
        ]);

        const cantieri = raggruppaPerCantiere(righe, (cantieriRes.data ?? []) as Array<{
          id: string;
          order_code: string | null;
          description: string | null;
        }>);

        const comm = (committenteRes.data ?? {}) as Record<string, string | null>;
        const contratto = (contrattoRes.data ?? {}) as { nome?: string | null; riferimento_committente?: string | null };
        const azienda = (aziendaRes.data ?? { name: effectiveCompany.name ?? "—" }) as Record<string, string | null>;

        const { pdf, RendicontoAppaltoPDF } = await loadPdfModule();
        const blob = await pdf(
          RendicontoAppaltoPDF({
            numero: sal.numero,
            periodoDal: sal.periodo_dal,
            periodoAl: sal.periodo_al,
            statoEtichetta: STATI_SAL[sal.stato]?.etichetta ?? sal.stato,
            azienda: {
              name: azienda.name ?? "—",
              vat_number: azienda.vat_number,
              fiscal_code: azienda.fiscal_code,
              address: azienda.address,
              city: azienda.city,
              postal_code: azienda.postal_code,
              province: azienda.province,
              phone: azienda.phone,
              email: azienda.email,
              pec: azienda.pec,
              logo_url: azienda.logo_url,
            },
            committente: {
              ragione_sociale: nomeDi(comm),
              vat_number: comm.vat_number,
              fiscal_code: comm.fiscal_code,
              address: comm.address,
              city: comm.city,
              postal_code: comm.postal_code,
              province: comm.province,
            },
            contrattoNome: contratto.nome ?? null,
            riferimentoCommittente: contratto.riferimento_committente ?? null,
            cantieri,
            totale: Number(sal.totale),
            ritenutaPct: Number(sal.ritenuta_pct),
            ritenuta: Number(sal.ritenuta),
            netto: Number(sal.netto),
            note: sal.note,
          }),
        ).toBlob();

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Rendiconto-${sal.numero}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        logger.error("useRendicontoAppaltoPDF", e);
        toast.error("Rendiconto non stampato", {
          description: e instanceof Error ? e.message : "Riprova",
        });
      } finally {
        inCorso.current = false;
        setIsGenerating(false);
      }
    },
    [effectiveCompany?.id, effectiveCompany?.name],
  );

  return { stampa, isGenerating };
}
