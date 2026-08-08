/**
 * FirmaSal — pagina pubblica di firma del verbale SAL (/firma-sal/:token).
 *
 * Il PDF del verbale contiene da sempre questo link, ma la rotta NON esisteva:
 * il committente cliccava e trovava un 404, e sal_signature_tokens.signed_at
 * non veniva mai scritto. La pagina parla con due RPC SECURITY DEFINER
 * (sal_view_by_token / sal_sign_with_token) — niente edge function nuova, il
 * progetto è al tetto delle 500.
 *
 * Alla firma il verbale passa a stato 'firmato': è il segnale che matura la
 * rata collegata (installment_id) nella pagina commessa.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileBarChart2, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/formatters";

interface VoceSal {
  descrizione: string;
  importo_contrattuale: number;
  percentuale_avanzamento: number;
  importo_sal: number;
}

interface VistaSal {
  valid: boolean;
  reason?: string;
  gia_firmato?: boolean;
  firmato_da?: string | null;
  firmato_il?: string | null;
  numero_sal?: number;
  data_emissione?: string;
  importo_totale?: number;
  note?: string | null;
  azienda?: string | null;
  commessa?: string | null;
  rata?: string | null;
  voci?: VoceSal[];
}

const dataIt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("it-IT") : "—";

export default function FirmaSal() {
  const { token } = useParams<{ token: string }>();
  const [dati, setDati] = useState<VistaSal | null>(null);
  const [caricamento, setCaricamento] = useState(true);
  const [nome, setNome] = useState("");
  const [invio, setInvio] = useState(false);
  const [firmato, setFirmato] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const carica = useCallback(async () => {
    if (!token) return;
    setCaricamento(true);
    const { data, error } = await supabase.rpc("sal_view_by_token" as never, {
      p_token: token,
    } as never);
    setDati(error ? { valid: false, reason: "error" } : (data as unknown as VistaSal));
    setCaricamento(false);
  }, [token]);

  useEffect(() => { void carica(); }, [carica]);

  const firma = async () => {
    if (!token || nome.trim().length < 2) return;
    setInvio(true);
    setErrore(null);
    const { data, error } = await supabase.rpc("sal_sign_with_token" as never, {
      p_token: token,
      p_nome: nome.trim(),
    } as never);
    setInvio(false);
    const esito = data as unknown as { success?: boolean; reason?: string } | null;
    if (error || !esito?.success) {
      setErrore(
        esito?.reason === "token_non_firmabile"
          ? "Questo verbale non è più firmabile: il link è scaduto o è già stato firmato."
          : "Non siamo riusciti a registrare la firma. Riprova tra qualche istante.",
      );
      return;
    }
    setFirmato(true);
  };

  if (caricamento) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!dati?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-rose-500" />
          <h1 className="mb-1 text-lg font-semibold text-slate-900">
            {dati?.reason === "expired" ? "Link scaduto" : "Link non valido"}
          </h1>
          <p className="text-sm text-slate-500">
            {dati?.reason === "expired"
              ? "Questo link di firma è scaduto. Chiedi all'impresa di inviartene uno nuovo."
              : "Controlla di aver aperto il link completo ricevuto dall'impresa."}
          </p>
        </div>
      </div>
    );
  }

  const giaFirmato = firmato || dati.gia_firmato;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
              <FileBarChart2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Verbale SAL n. {dati.numero_sal}
              </h1>
              <p className="text-sm text-slate-500">
                {dati.azienda ?? "Impresa"} · commessa {dati.commessa ?? "—"} ·{" "}
                {dataIt(dati.data_emissione)}
              </p>
            </div>
          </div>

          {(dati.voci ?? []).length > 0 && (
            <div className="mb-4 overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Lavorazione</th>
                    <th className="px-3 py-2 text-right">Contratto</th>
                    <th className="px-3 py-2 text-right">Avanz.</th>
                    <th className="px-3 py-2 text-right">Importo SAL</th>
                  </tr>
                </thead>
                <tbody>
                  {(dati.voci ?? []).map((v, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 text-slate-700">{v.descrizione}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {formatCurrency(Number(v.importo_contrattuale))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                        {Number(v.percentuale_avanzamento)}%
                      </td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatCurrency(Number(v.importo_sal))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-sm text-slate-500">Totale avanzamento certificato</span>
            <span className="text-xl font-bold text-slate-900">
              {formatCurrency(Number(dati.importo_totale ?? 0))}
            </span>
          </div>
          {dati.rata && (
            <p className="text-xs text-slate-500">
              Questo verbale certifica la maturazione della rata «{dati.rata}».
            </p>
          )}
          {dati.note && <p className="mt-2 text-sm text-slate-600">{dati.note}</p>}
        </div>

        {giaFirmato ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" />
            <p className="font-semibold text-emerald-800">Verbale firmato</p>
            <p className="text-sm text-emerald-700">
              {firmato
                ? "La firma è stata registrata. L'impresa riceverà conferma."
                : `Firmato da ${dati.firmato_da ?? "—"} il ${dataIt(dati.firmato_il)}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border bg-white p-6 shadow-sm">
            <label htmlFor="firma-nome" className="text-sm font-medium text-slate-700">
              Il tuo nome e cognome (per la firma)
            </label>
            <Input
              id="firma-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Mario Rossi"
              className="max-w-sm"
            />
            <p className="text-xs text-slate-500">
              Firmando confermi l'avanzamento lavori sopra descritto. Nome, data e
              ora vengono registrati come prova della firma.
            </p>
            {errore && <p className="text-sm text-rose-600">{errore}</p>}
            <Button onClick={firma} disabled={invio || nome.trim().length < 2}>
              {invio ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Firma il verbale
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
