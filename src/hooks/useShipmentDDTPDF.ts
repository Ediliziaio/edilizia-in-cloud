/**
 * useShipmentDDTPDF — fetcha un documento_fiscale tipo='ddt' + dati correlati
 * (mittente, vettore subappaltatore se presente) e genera il PDF tramite
 * @react-pdf/renderer.
 *
 * Pattern:
 *   const { generate, isGenerating } = useShipmentDDTPDF();
 *   await generate(documentoId);  // scarica DDT-{numero}.pdf
 *
 * Tutti i dati sono già nel record documenti_fiscali (cliente_snapshot,
 * ddt_vettore JSONB, righe JSONB, ecc.). Manca solo arricchire con:
 *   - mittente: companies (logo, indirizzo, PEC)
 *   - se vettore.tipo === 'subappaltatore' e c'è un subappaltatore_id,
 *     enriching da suppliers/subcontractors.
 */
import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
// PERF: import SOLO i type (tree-shakable, niente runtime). Il modulo
// pesante @react-pdf/renderer + ShipmentDDTPDF component viene caricato
// dinamicamente al primo click su "Scarica/Salva PDF" — vedi loadPdfModule().
import type {
  DDTRiga,
  DDTVettore,
  DDTCompanyMittente,
  DDTDestinatario,
  DDTIndirizzoConsegna,
  DDTFirmaDigitale,
} from "@/components/ddt/ShipmentDDTPDF";

// Cache del modulo PDF: caricato una sola volta al primo click
let pdfModulePromise: Promise<{
  pdf: typeof import("@react-pdf/renderer").pdf;
  ShipmentDDTPDF: typeof import("@/components/ddt/ShipmentDDTPDF").ShipmentDDTPDF;
}> | null = null;

function loadPdfModule() {
  if (!pdfModulePromise) {
    pdfModulePromise = Promise.all([
      import("@react-pdf/renderer"),
      import("@/components/ddt/ShipmentDDTPDF"),
    ]).then(([pdfMod, tplMod]) => ({
      pdf: pdfMod.pdf,
      ShipmentDDTPDF: tplMod.ShipmentDDTPDF,
    }));
  }
  return pdfModulePromise;
}

// ─── Shape dei dati documenti_fiscali (subset rilevante per DDT) ──────
interface DdtRecord {
  id: string;
  numero: string;
  serie: string | null;
  data_emissione: string;
  data_consegna: string | null;
  cliente_snapshot: Record<string, unknown>;
  righe: unknown[];
  ddt_causale_trasporto: string | null;
  ddt_aspetto_beni: string | null;
  ddt_numero_colli: number | null;
  ddt_peso: string | null;
  ddt_mezzo_trasporto: string | null;
  ddt_porto: "Franco" | "Assegnato" | null;
  ddt_data_ora_consegna: string | null;
  ddt_indirizzo_consegna: Record<string, unknown> | null;
  ddt_vettore: Record<string, unknown> | null;
  note_documento: string | null;
}

interface CompanyRecord {
  id: string;
  name: string;
  vat_number: string | null;
  fiscal_code: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  province: string | null;
  phone: string | null;
  email: string | null;
  pec: string | null;
  logo_url: string | null;
}

interface RawRiga {
  codice?: string | null;
  sku?: string | null;
  descrizione?: string | null;
  description?: string | null;
  unita_misura?: string | null;
  unit_of_measure?: string | null;
  quantita?: number | null;
  quantity?: number | null;
  lotto?: string | null;
  lotto_codice?: string | null;
  seriali?: string[] | null;
  serial_numbers?: string[] | null;
}

function normalizeRighe(raw: unknown[]): DDTRiga[] {
  return (raw ?? []).map((r) => {
    const row = r as RawRiga;
    return {
      codice: row.codice ?? row.sku ?? null,
      descrizione: row.descrizione ?? row.description ?? "—",
      unita_misura: row.unita_misura ?? row.unit_of_measure ?? "pz",
      quantita: Number(row.quantita ?? row.quantity ?? 0),
      lotto: row.lotto ?? row.lotto_codice ?? null,
      seriali: row.seriali ?? row.serial_numbers ?? null,
    };
  });
}

function asString(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return null;
}
function asNumber(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) return Number(v);
  return null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 30s allow browser to start the download; revoke immediato (setTimeout 0)
  // può fallire su connessioni lente o file grossi su Safari/Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

interface BuildResult {
  blob: Blob;
  numero: string;
  companyId: string;
  documentoId: string;
}

export function useShipmentDDTPDF() {
  const { effectiveCompany } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  // Ref-based guards: setState non è sincrono, due click ravvicinati
  // possono entrambi vedere isGenerating=false e lanciare due build PDF.
  // Il ref si aggiorna immediato e previene la race.
  const generatingRef = useRef(false);
  const uploadingRef = useRef(false);

  // Estraibile: build del PDF blob — usato sia da generate che da uploadAndAttach.
  const buildBlob = useCallback(
    async (documentoId: string): Promise<BuildResult> => {
      if (!effectiveCompany?.id) throw new Error("Nessuna azienda attiva");
      const { data: ddt, error: ddtErr } = await supabase
        .from("documenti_fiscali")
        .select(
          "id, numero, serie, data_emissione, data_consegna, cliente_snapshot, righe, ddt_causale_trasporto, ddt_aspetto_beni, ddt_numero_colli, ddt_peso, ddt_mezzo_trasporto, ddt_porto, ddt_data_ora_consegna, ddt_indirizzo_consegna, ddt_vettore, note_documento, tipo, company_id",
        )
        .eq("id", documentoId)
        .eq("company_id", effectiveCompany.id)
        .eq("tipo", "ddt")
        .maybeSingle();
      if (ddtErr) throw ddtErr;
      if (!ddt) throw new Error("DDT non trovato");
      const ddtRec = ddt as unknown as DdtRecord & { company_id: string };

      const { data: comp, error: compErr } = await supabase
        .from("companies")
        .select(
          "id, name, vat_number, fiscal_code, address, city, postal_code, province, phone, email, pec, logo_url",
        )
        .eq("id", effectiveCompany.id)
        .maybeSingle();
      if (compErr) throw compErr;
      const company = (comp ?? { id: effectiveCompany.id, name: effectiveCompany.name ?? "—" }) as unknown as CompanyRecord;

      const mittente: DDTCompanyMittente = {
        name: company.name ?? "—",
        vat_number: company.vat_number,
        fiscal_code: company.fiscal_code,
        address: company.address,
        city: company.city,
        postal_code: company.postal_code,
        province: company.province,
        phone: company.phone,
        email: company.email,
        pec: company.pec,
        logo_url: company.logo_url,
      };

      const cs = (ddtRec.cliente_snapshot ?? {}) as Record<string, unknown>;
      const destinatario: DDTDestinatario = {
        ragione_sociale: asString(cs.ragione_sociale) ?? asString(cs.business_name) ?? asString(cs.name),
        nome: asString(cs.nome) ?? asString(cs.first_name),
        cognome: asString(cs.cognome) ?? asString(cs.last_name),
        vat_number: asString(cs.vat_number) ?? asString(cs.piva),
        fiscal_code: asString(cs.fiscal_code) ?? asString(cs.cf) ?? asString(cs.codice_fiscale),
        address: asString(cs.address) ?? asString(cs.indirizzo),
        city: asString(cs.city) ?? asString(cs.citta),
        postal_code: asString(cs.postal_code) ?? asString(cs.cap),
        province: asString(cs.province) ?? asString(cs.provincia),
        codice_destinatario_sdi: asString(cs.codice_destinatario_sdi) ?? asString(cs.sdi_code),
        pec: asString(cs.pec),
      };

      const ic = ddtRec.ddt_indirizzo_consegna ?? null;
      const indirizzo_consegna: DDTIndirizzoConsegna | null = ic
        ? {
            address: asString((ic as Record<string, unknown>).address) ?? asString((ic as Record<string, unknown>).indirizzo) ?? asString((ic as Record<string, unknown>).via),
            city: asString((ic as Record<string, unknown>).city) ?? asString((ic as Record<string, unknown>).citta) ?? asString((ic as Record<string, unknown>).comune),
            postal_code: asString((ic as Record<string, unknown>).postal_code) ?? asString((ic as Record<string, unknown>).cap),
            province: asString((ic as Record<string, unknown>).province) ?? asString((ic as Record<string, unknown>).provincia),
            riferimento: asString((ic as Record<string, unknown>).riferimento) ?? asString((ic as Record<string, unknown>).descrizione),
          }
        : null;

      const dv = (ddtRec.ddt_vettore ?? {}) as Record<string, unknown>;
      const tipo = (asString(dv.tipo) ?? "azienda") as DDTVettore["tipo"];
      let subRecord: { ragione_sociale?: string | null; piva?: string | null; indirizzo?: string | null; telefono?: string | null } | null = null;
      const subId = asString(dv.subappaltatore_id) ?? asString(dv.supplier_id);
      if (tipo === "subappaltatore" && subId) {
        const { data: sub } = await supabase
          .from("subappaltatori")
          .select("ragione_sociale, piva, indirizzo, telefono")
          .eq("id", subId)
          .maybeSingle();
        if (sub) subRecord = sub as { ragione_sociale?: string | null; piva?: string | null; indirizzo?: string | null; telefono?: string | null };
      }
      const vettore: DDTVettore = {
        tipo,
        ragione_sociale:
          asString(dv.ragione_sociale) ?? asString(dv.denominazione) ?? subRecord?.ragione_sociale ?? null,
        vat_number: asString(dv.vat_number) ?? asString(dv.partita_iva) ?? subRecord?.piva ?? null,
        address: asString(dv.address) ?? subRecord?.indirizzo ?? null,
        city: asString(dv.city),
        conducente_nome: asString(dv.conducente_nome) ?? asString(dv.driver_name),
        conducente_telefono:
          asString(dv.conducente_telefono) ?? asString(dv.driver_phone) ?? subRecord?.telefono ?? null,
        targa_mezzo: asString(dv.targa_mezzo) ?? asString(dv.plate),
        patente: asString(dv.patente),
      };

      const fdRaw = (dv.firma_digitale ?? cs.firma_digitale) as Record<string, unknown> | undefined;
      const firma_digitale: DDTFirmaDigitale | null = fdRaw?.firmato
        ? {
            firmato: true,
            data: asString(fdRaw.data) ?? asString(fdRaw.signed_at),
            firmatario_nome: asString(fdRaw.firmatario_nome) ?? asString(fdRaw.signer_name),
            metodo: asString(fdRaw.metodo) ?? asString(fdRaw.method),
          }
        : null;

      const { pdf, ShipmentDDTPDF } = await loadPdfModule();
      const blob = await pdf(
        ShipmentDDTPDF({
          numero: ddtRec.numero,
          serie: ddtRec.serie,
          data_emissione: ddtRec.data_emissione,
          data_trasporto: ddtRec.ddt_data_ora_consegna ?? ddtRec.data_consegna,
          mittente,
          destinatario,
          indirizzo_consegna,
          causale_trasporto: ddtRec.ddt_causale_trasporto,
          aspetto_beni: ddtRec.ddt_aspetto_beni,
          numero_colli: asNumber(ddtRec.ddt_numero_colli),
          peso: ddtRec.ddt_peso,
          porto: ddtRec.ddt_porto,
          mezzo_trasporto: ddtRec.ddt_mezzo_trasporto,
          vettore,
          righe: normalizeRighe(ddtRec.righe ?? []),
          note: ddtRec.note_documento,
          firma_digitale,
        }),
      ).toBlob();

      return { blob, numero: ddtRec.numero, companyId: ddtRec.company_id, documentoId: ddtRec.id };
    },
    [effectiveCompany?.id, effectiveCompany?.name],
  );

  const uploadAndAttach = useCallback(
    async (documentoId: string): Promise<string | null> => {
      if (!effectiveCompany?.id) {
        toast.error("Nessuna azienda attiva");
        return null;
      }
      if (uploadingRef.current) return null;
      uploadingRef.current = true;
      setIsUploading(true);
      try {
        const { blob, numero, companyId, documentoId: docId } = await buildBlob(documentoId);
        const filePath = `${companyId}/${docId}/DDT-${numero}.pdf`;
        const { error: upErr } = await supabase.storage
          .from("documenti-fiscali")
          .upload(filePath, blob, { upsert: true, contentType: "application/pdf" });
        if (upErr) throw upErr;
        const { error: updErr } = await supabase
          .from("documenti_fiscali")
          .update({ pdf_url: filePath })
          .eq("id", docId);
        if (updErr) throw updErr;
        toast.success("PDF salvato", { description: `DDT-${numero}.pdf allegato al documento` });
        return filePath;
      } catch (e) {
        toast.error("Errore upload PDF", { description: (e as Error)?.message ?? "Riprova" });
        return null;
      } finally {
        uploadingRef.current = false;
        setIsUploading(false);
      }
    },
    [effectiveCompany?.id, buildBlob],
  );

  const generate = useCallback(
    async (documentoId: string) => {
      if (!effectiveCompany?.id) {
        toast.error("Nessuna azienda attiva");
        return;
      }
      if (generatingRef.current) return;
      generatingRef.current = true;
      setIsGenerating(true);
      try {
        const { blob, numero } = await buildBlob(documentoId);
        downloadBlob(blob, `DDT-${numero}.pdf`);
        toast.success("DDT generato", { description: `DDT-${numero}.pdf scaricato` });
      } catch (e) {
        toast.error("Errore generazione DDT", { description: (e as Error)?.message ?? "Riprova" });
      } finally {
        generatingRef.current = false;
        setIsGenerating(false);
      }
    },
    [effectiveCompany?.id, buildBlob],
  );

  return { generate, isGenerating, uploadAndAttach, isUploading };
}
