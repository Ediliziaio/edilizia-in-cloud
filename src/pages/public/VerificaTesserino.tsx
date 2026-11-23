/**
 * Verifica del tesserino di cantiere, aperta inquadrando il QR (23/11/2026). Pagina pubblica: chi controlla
 * (coordinatore, direttore lavori, ispettore) non ha un account. Senza login, tracciamento o persistenza del
 * gestionale (vedi App.tsx). Il codice sta dopo «#». La risposta viene da `verifica_tesserino`, che espone solo
 * nome, foto, azienda, mansione, data di assunzione ed esito dei controlli.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckCircle2, HardHat, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  codiceTesserinoValido, NOME_CONTROLLO, SPIEGAZIONE_ESITO, testoControllo, TITOLO_ESITO, type VerificaTesserino as Verifica,
} from "@/lib/campo/tesserino";

async function verifica(codice: string, signal: AbortSignal): Promise<Verifica | null> {
  const base = import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, "");
  const chiave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const risposta = await fetch(`${base}/rest/v1/rpc/verifica_tesserino`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: chiave },
    body: JSON.stringify({ p_token: codice }),
    signal, cache: "no-store", referrerPolicy: "no-referrer",
  });
  if (!risposta.ok) throw new Error("Verifica non riuscita. Riprova.");
  return (await risposta.json()) as Verifica | null;
}

function osservaCodice(callback: () => void) {
  window.addEventListener("hashchange", callback);
  return () => window.removeEventListener("hashchange", callback);
}
const codiceCorrente = () => window.location.hash.slice(1);

const STILE = {
  valido: { fascia: "bg-emerald-600", Icona: CheckCircle2 },
  da_verificare: { fascia: "bg-amber-500", Icona: ShieldQuestion },
  non_valido: { fascia: "bg-red-600", Icona: ShieldAlert },
} as const;

export default function VerificaTesserino() {
  const codice = useSyncExternalStore(osservaCodice, codiceCorrente, () => "");
  return <Esito key={codice} codice={codice} />;
}

function Esito({ codice }: { codice: string }) {
  const [tentativo, setTentativo] = useState(0);
  const [dati, setDati] = useState<Verifica | null | undefined>(undefined);
  const [errore, setErrore] = useState(() => (codiceTesserinoValido(codice) ? "" : "Inquadra il QR del tesserino per verificarlo."));

  useEffect(() => {
    document.title = "Verifica tesserino · EdiliziaInCloud";
    if (!codiceTesserinoValido(codice)) return;
    const controller = new AbortController();
    void verifica(codice, controller.signal).then(setDati).catch(e => {
      if (!controller.signal.aborted) setErrore(e instanceof Error ? e.message : "Verifica non riuscita. Riprova.");
    });
    return () => controller.abort();
  }, [codice, tentativo]);

  const persona = dati ? [dati.nome, dati.cognome].filter(Boolean).join(" ") : "";
  const stile = dati ? STILE[dati.esito] : null;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <header className="bg-[#15365b] text-white">
        <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-6">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-orange-400 text-slate-950">
            <HardHat className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold">Verifica tesserino di cantiere</h1>
        </div>
      </header>

      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        {errore ? (
          <div role="alert" className="space-y-3 rounded-xl border bg-white p-4 text-sm">
            <p>{errore}</p>
            {codiceTesserinoValido(codice) && (
              <Button variant="outline" onClick={() => { setErrore(""); setDati(undefined); setTentativo(n => n + 1); }}>Riprova</Button>
            )}
          </div>
        ) : dati === undefined ? (
          <p role="status" className="text-sm text-slate-600">Verifica in corso…</p>
        ) : dati === null || !stile ? (
          <div role="alert" className="overflow-hidden rounded-2xl border bg-white">
            <div className="flex items-center gap-3 bg-red-600 px-4 py-4 text-white">
              <ShieldAlert className="size-8 shrink-0" aria-hidden="true" />
              <p className="text-xl font-bold">Tesserino non riconosciuto</p>
            </div>
            <p className="p-4 text-sm">
              Questo codice non corrisponde a nessun tesserino attivo: può essere falso, o l'impresa lo ha sostituito.
              Chiedi un documento d'identità e chiama l'impresa.
            </p>
          </div>
        ) : (
          <article className="overflow-hidden rounded-2xl border bg-white shadow-sm" aria-live="polite">
            <div className={`flex items-center gap-3 px-4 py-4 text-white ${stile.fascia}`}>
              <stile.Icona className="size-9 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-2xl font-bold leading-tight">{TITOLO_ESITO[dati.esito]}</p>
                <p className="text-sm text-white/95">{SPIEGAZIONE_ESITO[dati.esito]}</p>
              </div>
            </div>

            <div className="flex gap-4 p-4">
              {dati.foto ? (
                <img src={dati.foto} alt={`Foto di ${persona}`} className="size-24 shrink-0 rounded-xl border object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-slate-100 text-center text-xs text-slate-500">Nessuna foto</div>
              )}
              <dl className="min-w-0 space-y-1 text-sm">
                <div><dt className="sr-only">Nome</dt><dd className="text-lg font-semibold [overflow-wrap:anywhere]">{persona || "—"}</dd></div>
                {dati.mansione && <div><dt className="inline text-slate-500">Mansione: </dt><dd className="inline">{dati.mansione}</dd></div>}
                <div><dt className="inline text-slate-500">Impresa: </dt><dd className="inline">{dati.azienda}</dd></div>
                {dati.partita_iva && <div><dt className="inline text-slate-500">P. IVA: </dt><dd className="inline font-mono">{dati.partita_iva}</dd></div>}
                {dati.assunto_il && (
                  <div><dt className="inline text-slate-500">In forza dal: </dt>
                    <dd className="inline">{new Date(`${dati.assunto_il}T12:00:00`).toLocaleDateString("it-IT")}</dd></div>
                )}
              </dl>
            </div>

            {dati.esito !== "non_valido" && (
              <ul className="divide-y border-t">
                {dati.controlli.map(c => (
                  <li key={c.voce} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                    <span className="font-medium">{NOME_CONTROLLO[c.voce]}</span>
                    <span className={c.stato === "ok" ? "text-end text-emerald-700" : c.voce === "personali" && c.stato === "mancante" ? "text-end text-slate-500" : "text-end font-semibold text-red-700"}>
                      {testoControllo(c)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="border-t bg-slate-50 px-4 py-3 text-xs text-slate-600">
              Verificato il {new Date(dati.verificato_il).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })} sui dati
              dell'impresa in EdiliziaInCloud. Confronta la foto con la persona che hai davanti.
            </p>
          </article>
        )}
      </div>
    </main>
  );
}
