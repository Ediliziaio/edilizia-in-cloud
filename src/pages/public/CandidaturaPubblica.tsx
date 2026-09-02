/**
 * /candidatura/:token — il modulo di candidatura pubblico.
 *
 * L'impresa lo crea dalla tab Candidati e mette il link sul proprio sito o
 * nell'annuncio: chi si candida da qui finisce dritto nella banca dati, in
 * prima fase della pipeline, con CV allegato. Pagina anonima: parla con la
 * edge function candidatura-submit, mai col database.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { HardHat, CheckCircle2, Upload, Loader2, XCircle } from "lucide-react";

const EDGE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/candidatura-submit`;
const MAX_CV = 6 * 1024 * 1024;

type StatoCampo = "obbligatorio" | "facoltativo" | "nascosto";

interface ConfigModulo {
  titolo: string;
  descrizione: string | null;
  ruoli: string[];
  campi: Record<string, StatoCampo>;
  azienda: string;
}

export default function CandidaturaPubblica() {
  const { token } = useParams<{ token: string }>();
  const [config, setConfig] = useState<ConfigModulo | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inviata, setInviata] = useState(false);
  const [inviando, setInviando] = useState(false);
  const [cv, setCv] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ nome: "", cognome: "", telefono: "", email: "", citta: "", ruolo: "", messaggio: "", consenso: false, sito_web: "" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(`${EDGE}?token=${encodeURIComponent(token ?? "")}`);
        const data = await res.json();
        if (!vivo) return;
        if (!res.ok) { setErrore(data.error ?? "Modulo non trovato"); return; }
        setConfig(data);
        if (data.ruoli?.length === 1) setForm((p) => ({ ...p, ruolo: data.ruoli[0] }));
      } catch {
        if (vivo) setErrore("Non riusciamo a caricare il modulo, riprova tra poco.");
      }
    })();
    return () => { vivo = false; };
  }, [token]);

  const stato = (campo: string): StatoCampo => config?.campi?.[campo] ?? "facoltativo";
  const visibile = (campo: string) => stato(campo) !== "nascosto";
  const ast = (campo: string) => (stato(campo) === "obbligatorio" ? " *" : "");
  const invia = async () => {
    if (inviando) return;
    if (!form.nome.trim()) { setErrore("Il nome è obbligatorio"); return; }
    const manca = (c: string, v: string) => stato(c) === "obbligatorio" && !v.trim();
    if (manca("cognome", form.cognome)) { setErrore("Il cognome è obbligatorio"); return; }
    if (manca("telefono", form.telefono)) { setErrore("Il telefono è obbligatorio"); return; }
    if (manca("email", form.email)) { setErrore("L'email è obbligatoria"); return; }
    if (manca("citta", form.citta)) { setErrore("La città è obbligatoria"); return; }
    if (manca("ruolo", form.ruolo)) { setErrore("Scegli il ruolo"); return; }
    if (manca("messaggio", form.messaggio)) { setErrore("Scrivi due righe di presentazione"); return; }
    if (stato("cv") === "obbligatorio" && !cv) { setErrore("Allega il curriculum"); return; }
    if (stato("telefono") !== "nascosto" || stato("email") !== "nascosto") {
      const telOk = stato("telefono") !== "nascosto" && form.telefono.trim();
      const emailOk = stato("email") !== "nascosto" && form.email.trim();
      if (!telOk && !emailOk) { setErrore("Lascia almeno un contatto: telefono o email"); return; }
    }
    if (!form.consenso) { setErrore("Serve il consenso al trattamento dei dati"); return; }
    setErrore(null);
    setInviando(true);
    try {
      let cv_base64: string | undefined;
      let cv_nome: string | undefined;
      if (cv) {
        const buf = await cv.arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) {
          bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        cv_base64 = btoa(bin);
        cv_nome = cv.name;
      }
      const res = await fetch(EDGE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...form, ruolo: form.ruolo.trim() || undefined, cv_base64, cv_nome }),
      });
      const data = await res.json();
      if (!res.ok) { setErrore(data.error ?? "Invio non riuscito, riprova."); return; }
      setInviata(true);
    } catch {
      setErrore("Invio non riuscito: controlla la connessione e riprova.");
    } finally {
      setInviando(false);
    }
  };

  const scegliCv = (f: File | null) => {
    if (f && f.size > MAX_CV) { setErrore("Il CV supera i 6 MB: riducilo o invialo dopo."); return; }
    setErrore(null);
    setCv(f);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto w-full max-w-lg">
        {errore && !config ? (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <XCircle className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-800">Modulo non disponibile</p>
            <p className="mt-1 text-sm text-slate-500">{errore}</p>
          </div>
        ) : !config ? (
          <div className="flex items-center justify-center gap-2 py-24 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Caricamento…
          </div>
        ) : inviata ? (
          <div className="rounded-2xl border bg-white p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h1 className="mt-3 text-xl font-bold text-slate-900">Candidatura inviata</h1>
            <p className="mt-2 text-sm text-slate-600">
              Grazie {form.nome.trim()}! {config.azienda} ha ricevuto la tua candidatura
              {cv ? " e il tuo curriculum" : ""}. Se il profilo è in linea ti ricontattiamo noi.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-white shadow-sm">
            <div className="border-b bg-gradient-to-br from-orange-500 to-amber-400 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center gap-2 text-white/90 text-xs font-semibold uppercase tracking-wide">
                <HardHat className="h-4 w-4" /> {config.azienda || "Lavora con noi"}
              </div>
              <h1 className="mt-1 text-xl font-bold text-white">{config.titolo}</h1>
              {config.descrizione && <p className="mt-1 text-sm text-white/90">{config.descrizione}</p>}
            </div>

            <div className="space-y-3 p-6">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Nome *</span>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
                </label>
                {visibile("cognome") && (
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Cognome{ast("cognome")}</span>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.cognome} onChange={(e) => setForm({ ...form, cognome: e.target.value })} />
                </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {visibile("telefono") && (
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Telefono{ast("telefono")}</span>
                  <input type="tel" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                </label>
                )}
                {visibile("email") && (
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Email{ast("email")}</span>
                  <input type="email" className="w-full rounded-lg border px-3 py-2 text-sm" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {visibile("citta") && (
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Città{ast("citta")}</span>
                  <input className="w-full rounded-lg border px-3 py-2 text-sm" value={form.citta} onChange={(e) => setForm({ ...form, citta: e.target.value })} />
                </label>
                )}
                {visibile("ruolo") && (
                <label className="text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-600">Ruolo{ast("ruolo")}</span>
                  {config.ruoli.length > 0 ? (
                    <select className="w-full rounded-lg border bg-white px-3 py-2 text-sm" value={form.ruolo} onChange={(e) => setForm({ ...form, ruolo: e.target.value })}>
                      <option value="">— Scegli —</option>
                      {config.ruoli.map((r) => <option key={r} value={r}>{r}</option>)}
                      <option value="Altro">Altro</option>
                    </select>
                  ) : (
                    <input className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Es. Muratore" value={form.ruolo} onChange={(e) => setForm({ ...form, ruolo: e.target.value })} />
                  )}
                </label>
                )}
              </div>
              {visibile("messaggio") && (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-600">Presentati in due righe{ast("messaggio")}</span>
                <textarea rows={3} className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Esperienza, disponibilità, da quando puoi iniziare…" value={form.messaggio} onChange={(e) => setForm({ ...form, messaggio: e.target.value })} />
              </label>
              )}

              {/* Honeypot: invisibile agli umani, irresistibile per i bot. */}
              <input type="text" value={form.sito_web} onChange={(e) => setForm({ ...form, sito_web: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />

              {visibile("cv") && (
              <div className="rounded-lg border border-dashed p-3">
                {cv ? (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-slate-700">{cv.name}</span>
                    <button type="button" className="text-xs text-slate-500 underline" onClick={() => scegliCv(null)}>Rimuovi</button>
                  </div>
                ) : (
                  <button type="button" className="flex w-full items-center justify-center gap-2 text-sm text-slate-600" onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Allega il curriculum{ast("cv")} (PDF o foto, max 6 MB)
                  </button>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => { scegliCv(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              </div>
              )}

              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" className="mt-0.5" checked={form.consenso} onChange={(e) => setForm({ ...form, consenso: e.target.checked })} />
                <span>Autorizzo il trattamento dei miei dati personali per la selezione del personale (art. 13 GDPR). *</span>
              </label>

              {errore && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errore}</p>}

              <button
                type="button"
                disabled={inviando}
                onClick={invia}
                className="w-full rounded-xl bg-gradient-to-br from-orange-500 to-amber-400 py-3 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {inviando ? "Invio in corso…" : "Invia la candidatura"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
