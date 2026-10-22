/**
 * Verifica pubblica di un documento firmato: si scrive il codice di verifica
 * del certificato e, se si vuole, si sceglie il PDF ricevuto. L'impronta del
 * file si calcola qui nel browser (il file non viene caricato da nessuna parte)
 * e si confronta con quella registrata alla firma.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, Shield, XCircle } from "lucide-react";

interface Esito {
  trovato: boolean;
  codice?: string;
  azienda?: string | null;
  documento?: string;
  firmatario?: string | null;
  firmato_il?: string | null;
  livello_firma?: "avanzata" | "semplice";
  impronta_documento?: string | null;
  impronta_pdf_firmato?: string | null;
  prove_conservate?: boolean;
}

async function impronta(file: File): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VerificaFirma() {
  const [params] = useSearchParams();
  const [codice, setCodice] = useState(params.get("codice") ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [esito, setEsito] = useState<Esito | null>(null);
  const [confronto, setConfronto] = useState<"uguale" | "diverso" | null>(null);
  const [errore, setErrore] = useState("");
  const [inCorso, setInCorso] = useState(false);

  const verifica = async () => {
    setInCorso(true);
    setErrore("");
    setEsito(null);
    setConfronto(null);
    try {
      const { data, error } = await supabase.functions.invoke("fea-verifica-codice", { body: { codice } });
      if (error) {
        let corpo: { error?: string; trovato?: boolean } = {};
        try { corpo = await (error as { context?: { json: () => Promise<typeof corpo> } }).context?.json() ?? {}; } catch { /* vuoto */ }
        if (corpo.trovato === false) { setEsito({ trovato: false }); return; }
        throw new Error(corpo.error ?? "Verifica non riuscita. Riprova.");
      }
      const e = data as Esito;
      setEsito(e);
      if (e.trovato && file) {
        const h = await impronta(file);
        setConfronto(h === e.impronta_pdf_firmato || h === e.impronta_documento ? "uguale" : "diverso");
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Verifica non riuscita. Riprova.");
    } finally {
      setInCorso(false);
    }
  };

  const data = (iso?: string | null) => iso
    ? new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="flex items-center gap-3 bg-gradient-to-r from-slate-800 to-slate-700 p-6">
          <Shield className="h-7 w-7 text-orange-400" />
          <div>
            <h1 className="text-lg font-bold leading-tight text-white">Verifica un documento firmato</h1>
            <p className="text-xs text-slate-400">Edilizia in Cloud</p>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div className="space-y-1">
            <Label htmlFor="codice">Codice di verifica</Label>
            <Input id="codice" value={codice} onChange={(e) => setCodice(e.target.value.toUpperCase())} placeholder="XXXX-XXXX-XXXX" />
            <p className="text-xs text-slate-500">È stampato sul certificato, nell'ultima pagina del documento firmato.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="file">Il PDF che hai ricevuto <span className="font-normal text-slate-400">(facoltativo)</span></Label>
            <Input id="file" type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-slate-500">Il file resta sul tuo dispositivo: si controlla solo che sia identico a quello firmato.</p>
          </div>
          <Button className="w-full bg-orange-500 font-semibold text-white hover:bg-orange-600" disabled={inCorso || codice.replace(/[^0-9A-Fa-f]/g, "").length !== 12} onClick={() => void verifica()}>
            {inCorso ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Verifica
          </Button>
          {errore && <p className="text-sm text-red-600">{errore}</p>}

          {esito && !esito.trovato && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />Nessun documento firmato con questo codice. Controlla di averlo scritto bene.
            </div>
          )}
          {esito?.trovato && (
            <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />Documento firmato trovato</p>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <dt className="text-green-700">Documento</dt><dd>{esito.documento}</dd>
                <dt className="text-green-700">Azienda</dt><dd>{esito.azienda ?? "—"}</dd>
                <dt className="text-green-700">Firmato da</dt><dd>{esito.firmatario ?? "—"}</dd>
                <dt className="text-green-700">Il</dt><dd>{data(esito.firmato_il)}</dd>
                <dt className="text-green-700">Tipo di firma</dt>
                <dd>{esito.livello_firma === "avanzata" ? "Firma elettronica avanzata (firmatario identificato con documento)" : "Firma elettronica semplice (codice via email/SMS)"}</dd>
              </dl>
              {confronto === "uguale" && <p className="font-medium">Il file che hai scelto è identico a quello firmato.</p>}
              {confronto === "diverso" && (
                <p className="font-medium text-red-700">Il file che hai scelto NON è identico a quello firmato: potrebbe essere stato modificato.</p>
              )}
              <p className="break-all text-xs text-green-800">Impronta del PDF firmato: {esito.impronta_pdf_firmato ?? "—"}</p>
            </div>
          )}
          <Link to="/firma-elettronica-avanzata" className="block text-center text-xs text-slate-500 underline">Come funziona la firma elettronica avanzata</Link>
        </div>
      </div>
    </div>
  );
}
