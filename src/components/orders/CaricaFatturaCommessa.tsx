/**
 * «Carica fattura» dalla commessa: la fattura del fornitore entra fra le
 * ricevute e diventa costo di questa commessa in un colpo solo.
 *
 * - XML / P7M dallo SDI → ricevi-sdi (come il caricamento in Fatture ricevute).
 * - PDF o foto → ai-fattura-ricevuta-ocr (lettura AI, costa crediti) con
 *   auto_create: nasce la fattura ricevuta col file allegato.
 * Poi commessa_collega_fattura_ricevuta la contabilizza (se non lo è) e porta il
 * costo sulla commessa. Le fatture sull'ordine d'acquisto restano dell'ordine.
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { refreshFinancialQueries } from "@/lib/orders/financialRefresh";
import { classificaDirezione, espandiXmlDaFiles } from "@/lib/fatturazione/bulkXmlImport";
import { bytesToBase64 } from "../../../supabase/functions/_shared/base64";
import { Button } from "@/components/ui/button";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type TipoFileFattura = "xml" | "documento" | "non_valido";

/** XML/P7M dallo SDI, oppure PDF/foto da far leggere all'AI. */
export function tipoFileFattura(file: { name: string; type: string }): TipoFileFattura {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".xml") || nome.endsWith(".p7m") || file.type === "text/xml" || file.type === "application/xml") return "xml";
  if (file.type === "application/pdf" || nome.endsWith(".pdf") || file.type.startsWith("image/")) return "documento";
  return "non_valido";
}

/** Il motivo vero dentro la risposta di una edge function (error.message dice solo «non-2xx»). */
async function motivoErrore(error: unknown): Promise<string> {
  let motivo = error instanceof Error ? error.message : String(error);
  try {
    const corpo = await (error as { context?: Response }).context?.json?.();
    if (corpo?.error) motivo = String(corpo.error);
  } catch { /* corpo non JSON: resta il messaggio generico */ }
  return motivo;
}

export async function collegaFatturaACommessa(fatturaId: string, orderId: string): Promise<string> {
  const { data, error } = await db.rpc("commessa_collega_fattura_ricevuta", { p_fattura_id: fatturaId, p_order_id: orderId });
  if (error) throw new Error(error.message);
  return (data as { esito?: string } | null)?.esito ?? "collegata";
}

async function importaXml(file: File, companyId: string, partitaIva: string | null): Promise<string> {
  const { xml, scartati } = await espandiXmlDaFiles([file]);
  if (xml.length === 0) throw new Error(scartati[0]?.motivo ?? "Il file non contiene una fattura elettronica.");
  if (xml.length > 1) throw new Error("Il file contiene più fatture: caricale da Fatture ricevute.");
  const f = xml[0];
  if (classificaDirezione(f.contenuto, partitaIva) !== "passiva") {
    throw new Error("Questa non risulta una fattura ricevuta da un fornitore: controlla le partite IVA nel file.");
  }
  const originale = f.originale ?? f.firmato;
  const body = originale
    ? { originale_base64: bytesToBase64(originale), xml_content: f.contenuto, company_id: companyId }
    : { xml_content: f.contenuto, company_id: companyId };
  const resp = await supabase.functions.invoke("ricevi-sdi", { body });
  if (resp.error) throw new Error(await motivoErrore(resp.error));
  const id = (resp.data as { id?: string } | null)?.id;
  if (!id) throw new Error((resp.data as { error?: string } | null)?.error ?? "Fattura non registrata.");
  return id;
}

async function importaDocumento(file: File, companyId: string, userId: string): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "pdf").toLowerCase().replace(/[^a-z0-9]/g, "") || "pdf";
  const path = `${userId}/fattura_commessa_${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("silvio-uploads").upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw new Error(`File non caricato: ${upErr.message}`);
  const resp = await supabase.functions.invoke("ai-fattura-ricevuta-ocr", {
    body: { storage_path: path, bucket: "silvio-uploads", auto_create: true, company_id: companyId, mime_type: file.type, file_name: file.name },
  });
  if (resp.error) throw new Error(await motivoErrore(resp.error));
  const id = (resp.data as { created_invoice_id?: string } | null)?.created_invoice_id;
  if (!id) throw new Error("L'AI non è riuscita a leggere numero e data della fattura: caricala da Fatture ricevute.");
  return id;
}

export function CaricaFatturaCommessaButton({ orderId }: { orderId: string }) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [inCorso, setInCorso] = useState(false);

  const carica = async (file: File) => {
    if (!companyId || !user?.id) return;
    const tipo = tipoFileFattura(file);
    if (tipo === "non_valido") { toast.error("Carica l'XML della fattura (anche .p7m), un PDF o una foto."); return; }
    setInCorso(true);
    try {
      let fatturaId: string;
      if (tipo === "xml") {
        const { data: azienda } = await supabase.from("companies").select("vat_number").eq("id", companyId).maybeSingle();
        fatturaId = await importaXml(file, companyId, azienda?.vat_number ?? null);
      } else {
        fatturaId = await importaDocumento(file, companyId, user.id);
      }
      await collegaFatturaACommessa(fatturaId, orderId);
      toast.success("Fattura caricata e messa fra i costi della commessa");
    } catch (e) {
      toast.error("Fattura non caricata", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setInCorso(false);
      refreshFinancialQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["margin"] });
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".xml,.p7m,application/pdf,image/*"
        className="hidden"
        aria-label="Fattura del fornitore da caricare"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void carica(f); }}
      />
      <Button size="sm" variant="outline" onClick={() => input.current?.click()} disabled={inCorso || !companyId}>
        {inCorso ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
        {inCorso ? "Carico…" : "Carica fattura"}
      </Button>
    </>
  );
}
