/**
 * Verifica pubblica di un POS: la apre il codice QR stampato in copertina del PDF. Senza login dice se la copia che si ha in
 * mano è la revisione in vigore o è stata sostituita da una più recente, e, scegliendo il PDF ricevuto, se è identico a quello
 * emesso (l'impronta si calcola qui nel browser: il file non va da nessuna parte). Mostra solo ciò che è già stampato sul
 * documento: impresa, cantiere, revisione, date. Nessun nome di persona.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle, Archive, CheckCircle2, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confrontaImpronta, idVerificaValido, improntaSha256, leggiEsitoVerifica, type EsitoVerificaPos,
} from "@/lib/sicurezza/posVerifica";

type Rpc = (nome: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

const dataIt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric" }) : "—";

export default function VerificaPos() {
  const { id } = useParams<{ id: string }>();
  const valido = idVerificaValido(id);
  const [esito, setEsito] = useState<EsitoVerificaPos | null>(null);
  const [errore, setErrore] = useState("");
  const [confronto, setConfronto] = useState<"uguale" | "diverso" | "non_verificabile" | null>(null);
  const [calcolando, setCalcolando] = useState(false);

  useEffect(() => {
    if (!valido) return;
    let annullata = false;
    (async () => {
      const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc("pos_verifica_pubblica", { p_emissione: id });
      if (annullata) return;
      if (error) { setErrore("Non riesco a controllare in questo momento. Riprova fra poco."); return; }
      setEsito(leggiEsitoVerifica(data));
    })();
    return () => { annullata = true; };
  }, [id, valido]);

  const scegliFile = async (file: File | null | undefined) => {
    setConfronto(null);
    if (!file || !esito?.trovata) return;
    setCalcolando(true);
    try { setConfronto(confrontaImpronta(await improntaSha256(await file.arrayBuffer()), esito.pdf_sha256)); }
    catch { setErrore("Non riesco a leggere il file scelto."); }
    finally { setCalcolando(false); }
  };

  const cella = "text-slate-500";
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="flex items-center gap-3 bg-gradient-to-r from-slate-800 to-slate-700 p-6">
          <ShieldCheck className="h-7 w-7 text-orange-400" aria-hidden="true" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Verifica del Piano Operativo di Sicurezza</h1>
            <p className="text-xs text-slate-400">Edilizia in Cloud</p>
          </div>
        </div>
        <div className="space-y-5 p-6">
          {!valido && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Il codice di verifica non è valido. Inquadra di nuovo il QR stampato sul documento.
            </div>
          )}
          {valido && !esito && !errore && (
            <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Controllo in corso…</p>
          )}
          {errore && <p role="alert" className="text-sm text-red-600">{errore}</p>}

          {esito && !esito.trovata && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />Nessun POS emesso con questo codice. Controlla di aver inquadrato il QR della copertina del documento.
            </div>
          )}

          {esito?.trovata && (
            <>
              {esito.stato === "in_vigore" && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p><span className="font-semibold">Questa è la revisione in vigore.</span> Non risultano revisioni più recenti emesse.</p>
                </div>
              )}
              {esito.stato === "superata" && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p><span className="font-semibold">Questa copia non è più in vigore.</span> È stata sostituita dalla revisione {esito.revisione_in_vigore ?? "più recente"}{esito.in_vigore_dal ? `, emessa il ${dataIt(esito.in_vigore_dal)}` : ""}. Chiedi all’impresa la copia aggiornata.</p>
                </div>
              )}
              {esito.stato === "archiviata" && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">
                  <Archive className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <p><span className="font-semibold">Questo POS è stato archiviato.</span> Non è più un documento operativo: chiedi all’impresa se ne esiste uno nuovo.</p>
                </div>
              )}

              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <dt className={cella}>Impresa</dt><dd>{esito.impresa ?? "—"}</dd>
                <dt className={cella}>Cantiere</dt><dd>{esito.cantiere ?? "—"}</dd>
                <dt className={cella}>Revisione</dt><dd>{esito.revisione ?? "—"}</dd>
                <dt className={cella}>Emesso il</dt><dd>{dataIt(esito.emesso_il)}</dd>
              </dl>

              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="file-pos">Hai ricevuto il PDF? Controlla che sia quello emesso</Label>
                <Input id="file-pos" type="file" accept="application/pdf" onChange={(e) => void scegliFile(e.target.files?.[0])} />
                <p className="text-xs text-slate-500">Il file resta sul tuo dispositivo: si controlla solo l’impronta. Una copia stampata, firmata a mano e scansionata risulta diversa dall’originale emesso: è normale, il controllo vale per il PDF originale.</p>
                {calcolando && <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Calcolo l’impronta…</p>}
                {confronto === "uguale" && <p role="status" className="text-sm font-medium text-green-700">Il file che hai scelto è identico al PDF emesso.</p>}
                {confronto === "diverso" && <p role="status" className="text-sm font-medium text-red-700">Il file che hai scelto NON è identico al PDF emesso: potrebbe essere stato modificato o essere una copia diversa.</p>}
                {confronto === "non_verificabile" && <p role="status" className="text-sm text-slate-700">Per questa emissione non è registrata un’impronta del PDF: il confronto non è possibile.</p>}
                {esito.pdf_sha256 && <p className="break-all text-xs text-slate-500">Impronta del PDF emesso (SHA-256): {esito.pdf_sha256}</p>}
              </div>
            </>
          )}
          <p className="border-t pt-3 text-xs text-slate-500">L’esito riguarda il documento emesso dall’app e non sostituisce le firme.</p>
        </div>
      </div>
    </div>
  );
}
