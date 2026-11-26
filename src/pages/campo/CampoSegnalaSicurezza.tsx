/**
 * Sicurezza: segnalare un infortunio, un quasi-incidente o una situazione pericolosa (richiesta del founder, 23/11/2026).
 *
 * Prima c'era solo «Segnala un problema», che finisce nei ticket dell'assistenza clienti. Qui il percorso è apposta:
 * in cima il 112, poi cosa è successo, chi si è fatto male e che soccorso c'è stato, dove e quando, foto. Va nel
 * registro `sicurezza_eventi` e chi segue la sicurezza riceve subito un avviso. Sotto, le proprie segnalazioni con lo
 * stato (nuova, presa in carico, chiusa).
 *
 * L'id nasce sul telefono: se l'invio parte due volte (doppio tocco, rete che cade a metà) la seconda trova la riga
 * già scritta e vale come riuscita.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle, HeartPulse, Loader2, MapPin, Phone, ShieldAlert, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { SicurezzaEvento } from "@/integrations/supabase/appDatabase";
import { useAuth } from "@/contexts/AuthContext";
import { UniformSelect } from "@/components/ui/uniform-select";
import { useUnaVolta } from "@/hooks/campo/useUnaVolta";
import { preparaFoto, avvisiPreparazione } from "@/lib/campo/preparaFoto";
import { senzaRete } from "@/lib/campo/timbra";
import { intlCampo, useT } from "@/lib/campo/lingua/LinguaCampo";
import { cn } from "@/lib/utils";

type Tipo = SicurezzaEvento["tipo"];
type Soccorso = SicurezzaEvento["soccorso"];

export const MASSIMO_FOTO_SICUREZZA = 6;

const TIPI: { valore: Tipo; titolo: string; spiegazione: string }[] = [
  { valore: "infortunio", titolo: "Infortunio", spiegazione: "Qualcuno si è fatto male." },
  { valore: "quasi_incidente", titolo: "Quasi incidente", spiegazione: "Poteva succedere: nessuno si è fatto male." },
  { valore: "pericolo", titolo: "Situazione pericolosa", spiegazione: "Un rischio da sistemare prima che succeda qualcosa." },
];
const SOCCORSI: { valore: Soccorso; titolo: string }[] = [
  { valore: "nessuno", titolo: "Nessuno" },
  { valore: "primo_soccorso", titolo: "Primo soccorso in cantiere" },
  { valore: "pronto_soccorso", titolo: "Pronto soccorso" },
  { valore: "ambulanza", titolo: "Ambulanza" },
];
const STATI: Record<SicurezzaEvento["stato"], string> = {
  nuova: "Inviata all'ufficio",
  presa_in_carico: "Presa in carico",
  chiusa: "Chiusa",
};

/** «2026-11-23T08:15» per l'input del telefono, nell'ora locale. */
function oraLocale(data = new Date()): string {
  const d = new Date(data.getTime() - data.getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}

/**
 * Cosa dire al 112: l'indirizzo del cantiere scelto, grande, e — a richiesta — la posizione del telefono.
 * La posizione si chiede solo al tocco: niente richiesta di permesso aprendo la pagina.
 */
function DoveSiamo({ indirizzo }: { indirizzo: string | null }) {
  const t = useT();
  const [posizione, setPosizione] = useState<{ lat: number; lon: number; precisione: number } | null>(null);
  const [stato, setStato] = useState<"fermo" | "cerco" | "errore">("fermo");
  const cerca = () => {
    if (!("geolocation" in navigator)) { setStato("errore"); return; }
    setStato("cerco");
    navigator.geolocation.getCurrentPosition(
      p => { setPosizione({ lat: p.coords.latitude, lon: p.coords.longitude, precisione: Math.round(p.coords.accuracy) }); setStato("fermo"); },
      () => setStato("errore"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };
  return (
    <section aria-label={t("Dove siamo")} className="space-y-2 rounded-2xl border border-red-200 bg-red-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-900">{t("Da dire ai soccorsi")}</p>
      {indirizzo
        ? <p dir="auto" className="text-lg font-bold leading-snug text-foreground">{indirizzo}</p>
        : <p className="text-sm text-muted-foreground">{t("Scegli il cantiere qui sotto per vedere l'indirizzo.")}</p>}
      {posizione ? (
        <p className="text-sm tabular-nums" dir="ltr">
          {t("Posizione del telefono")}: <span className="font-semibold">{posizione.lat.toFixed(5)}, {posizione.lon.toFixed(5)}</span>
          <span className="text-muted-foreground"> (±{posizione.precisione} m)</span>
        </p>
      ) : (
        <button type="button" onClick={cerca} disabled={stato === "cerco"}
          className="flex min-h-11 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-semibold">
          {stato === "cerco" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <MapPin className="size-4 text-red-700" aria-hidden="true" />}
          {stato === "errore" ? t("Posizione non disponibile: riprova") : t("Mostra la mia posizione")}
        </button>
      )}
    </section>
  );
}

export default function CampoSegnalaSicurezza() {
  const t = useT();
  const navigate = useNavigate();
  const { orderId } = useParams<{ orderId?: string }>();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const unaVolta = useUnaVolta();

  const [id, setId] = useState(() => crypto.randomUUID());
  const [tipo, setTipo] = useState<Tipo | null>(null);
  const [cantiere, setCantiere] = useState(orderId ?? "");
  const [quando, setQuando] = useState(() => oraLocale());
  const [luogo, setLuogo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [proprioIo, setProprioIo] = useState(true);
  const [persona, setPersona] = useState("");
  const [parteCorpo, setParteCorpo] = useState("");
  const [soccorso, setSoccorso] = useState<Soccorso>("nessuno");
  const [testimoni, setTestimoni] = useState("");
  const [foto, setFoto] = useState<File[]>([]);
  const [inviata, setInviata] = useState(false);
  const ferito = tipo === "infortunio";

  const { data: cantieri = [] } = useQuery({
    queryKey: ["campo-cantieri-sicurezza", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_campo_assignments")
        .select("order_id, order:orders(id, order_code, description, indirizzo_lavori)")
        .eq("user_id", user!.id);
      if (error) throw error;
      type Cantiere = { id: string; order_code: string | null; description: string | null; indirizzo_lavori: string | null };
      const visti = new Map<string, Cantiere>();
      for (const riga of data ?? []) {
        const o = riga.order as unknown as Cantiere | null;
        if (o) visti.set(o.id, o);
      }
      return [...visti.values()];
    },
  });
  // Con un cantiere solo è già scelto: calcolato al volo, senza effetti.
  const cantiereScelto = cantiere || (cantieri.length === 1 ? cantieri[0].id : "");

  const mie = useQuery({
    queryKey: ["campo-sicurezza-mie", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sicurezza_eventi")
        .select("id, tipo, descrizione, stato, accaduto_il, azioni_correttive")
        .eq("segnalato_da", user!.id)
        .order("accaduto_il", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const anteprime = useMemo(() => foto.map(f => URL.createObjectURL(f)), [foto]);
  useEffect(() => () => anteprime.forEach(u => URL.revokeObjectURL(u)), [anteprime]);

  const invio = useMutation({
    mutationFn: async () => {
      if (!companyId || !user?.id) throw new Error(t("Azienda non disponibile, riprova tra un istante"));
      if (!tipo) throw new Error(t("Scegli cosa è successo"));
      if (descrizione.trim().length < 3) throw new Error(t("Scrivi in due parole cosa è successo"));
      if (senzaRete()) throw new Error(t("Sei senza rete: la segnalazione resta qui. Se è grave chiama subito il capocantiere."));

      const percorsi: string[] = [];
      if (foto.length) {
        const esito = await preparaFoto(foto, { massimo: MASSIMO_FOTO_SICUREZZA });
        for (const pronta of esito.pronte) {
          const percorso = `${companyId}/${id}/${pronta.nomeFile}`;
          const { error } = await supabase.storage.from("sicurezza-eventi")
            .upload(percorso, pronta.blob, { contentType: pronta.contentType, upsert: false });
          // Una foto già caricata al tentativo precedente va bene così.
          if (error && !/exists|duplicate/i.test(error.message)) throw new Error(t("Una foto non è partita. Riprova."));
          percorsi.push(percorso);
        }
        for (const avviso of avvisiPreparazione(esito, MASSIMO_FOTO_SICUREZZA, t)) toast.warning(avviso);
      }

      const { error } = await supabase.from("sicurezza_eventi").insert({
        id,
        company_id: companyId,
        order_id: cantiereScelto || null,
        tipo,
        accaduto_il: new Date(quando).toISOString(),
        luogo: luogo.trim() || null,
        descrizione: descrizione.trim(),
        ferito,
        persona_coinvolta: ferito ? (proprioIo ? null : persona.trim() || null) : null,
        parte_corpo: ferito ? parteCorpo.trim() || null : null,
        soccorso: ferito ? soccorso : "nessuno",
        testimoni: testimoni.trim() || null,
        foto: percorsi,
      });
      // Riga già scritta da un invio precedente: è arrivata.
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: () => {
      setInviata(true);
      void queryClient.invalidateQueries({ queryKey: ["campo-sicurezza-mie"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error && e.message ? e.message : t("Non sono riuscito a inviare. Riprova.")),
  });

  function nuovaSegnalazione() {
    setId(crypto.randomUUID());
    setTipo(null); setDescrizione(""); setLuogo(""); setPersona(""); setParteCorpo(""); setSoccorso("nessuno");
    setTestimoni(""); setFoto([]); setProprioIo(true); setQuando(oraLocale()); setInviata(false);
  }

  const torna = () => (window.history.length > 2 ? navigate(-1) : navigate("/campo", { replace: true }));

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-28">
      {/* La freccia per tornare indietro sta già nella testata del campo. */}
      <div className="flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldAlert className="size-5 text-red-600" aria-hidden="true" /> {t("Sicurezza: segnala")}
        </h1>
      </div>

      {/* Prima di tutto il 112: chi è ferito grave non deve compilare niente. */}
      <a href="tel:112" className="flex min-h-14 items-center gap-3 rounded-2xl bg-red-600 px-4 py-3 text-white shadow-sm active:bg-red-700">
        <Phone className="size-6 shrink-0" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-base font-bold">{t("Ferito grave? Chiama il 112")}</span>
          <span className="block text-xs text-white/90">{t("Prima i soccorsi, poi la segnalazione.")}</span>
        </span>
      </a>
      {/* Cosa dire al 112 (piano campo completo 1.5, 26/11/2026): l'indirizzo del cantiere scritto grande e la
          posizione del telefono, da leggere all'operatore. */}
      <DoveSiamo indirizzo={cantieri.find(c => c.id === cantiereScelto)?.indirizzo_lavori ?? null} />

      {inviata ? (
        <div role="status" className="space-y-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950">
          <p className="flex items-center gap-2 text-base font-semibold">
            <CheckCircle className="size-5" aria-hidden="true" /> {t("Segnalazione inviata")}
          </p>
          <p className="text-sm">{t("L'ufficio è stato avvisato subito. Ti diranno cosa fare.")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={nuovaSegnalazione} className="min-h-11 rounded-xl border bg-background px-3 text-sm font-semibold">
              {t("Nuova segnalazione")}
            </button>
            <button type="button" onClick={torna} className="min-h-11 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground">
              {t("Fatto")}
            </button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={e => { e.preventDefault(); unaVolta(() => invio.mutateAsync()); }}>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold">{t("Cosa è successo?")}</legend>
            {TIPI.map(v => (
              <button key={v.valore} type="button" aria-pressed={tipo === v.valore} onClick={() => setTipo(v.valore)}
                className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-start",
                  tipo === v.valore ? "border-red-500 bg-red-50 dark:bg-red-950/40" : "bg-background active:bg-muted")}>
                {v.valore === "infortunio" ? <HeartPulse className="size-5 shrink-0 text-red-600" aria-hidden="true" />
                  : <AlertTriangle className="size-5 shrink-0 text-amber-600" aria-hidden="true" />}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{t(v.titolo)}</span>
                  <span className="block text-xs text-muted-foreground">{t(v.spiegazione)}</span>
                </span>
              </button>
            ))}
          </fieldset>

          {tipo && <>
            {ferito && (
              <fieldset className="space-y-3 rounded-2xl border p-3">
                <legend className="px-1 text-sm font-semibold">{t("Chi si è fatto male?")}</legend>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" aria-pressed={proprioIo} onClick={() => setProprioIo(true)}
                    className={cn("min-h-11 rounded-xl border text-sm font-semibold", proprioIo && "border-primary bg-primary/10")}>{t("Io")}</button>
                  <button type="button" aria-pressed={!proprioIo} onClick={() => setProprioIo(false)}
                    className={cn("min-h-11 rounded-xl border text-sm font-semibold", !proprioIo && "border-primary bg-primary/10")}>{t("Un'altra persona")}</button>
                </div>
                {!proprioIo && (
                  <input value={persona} onChange={e => setPersona(e.target.value)} maxLength={200}
                    aria-label={t("Nome della persona")} placeholder={t("Nome della persona")}
                    className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
                )}
                <input value={parteCorpo} onChange={e => setParteCorpo(e.target.value)} maxLength={200}
                  aria-label={t("Parte del corpo")} placeholder={t("Parte del corpo: mano, schiena…")}
                  className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
                <div>
                  <p className="mb-1 text-sm font-medium">{t("Che soccorso c'è stato?")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SOCCORSI.map(s => (
                      <button key={s.valore} type="button" aria-pressed={soccorso === s.valore} onClick={() => setSoccorso(s.valore)}
                        className={cn("min-h-11 rounded-xl border px-2 text-sm", soccorso === s.valore && "border-primary bg-primary/10 font-semibold")}>
                        {t(s.titolo)}
                      </button>
                    ))}
                  </div>
                </div>
              </fieldset>
            )}

            <label className="block space-y-1">
              <span className="text-sm font-semibold">{t("Racconta cosa è successo")}</span>
              <textarea value={descrizione} onChange={e => setDescrizione(e.target.value)} maxLength={4000} rows={4}
                placeholder={t("Es. scivolato dal secondo gradino della scala mentre scendevo con il secchio")}
                className="w-full rounded-xl border bg-background p-3 text-base" />
            </label>

            {cantieri.length > 0 && (
              <label className="block space-y-1">
                <span className="text-sm font-semibold">{t("Cantiere")}</span>
                <UniformSelect value={cantiereScelto} onChange={e => setCantiere(e.target.value)} className="h-12 w-full text-base">
                  <option value="">{t("Non in un cantiere")}</option>
                  {cantieri.map(c => <option key={c.id} value={c.id}>{[c.order_code, c.description].filter(Boolean).join(" · ")}</option>)}
                </UniformSelect>
              </label>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-semibold">{t("Quando")}</span>
                <input type="datetime-local" value={quando} max={oraLocale()} onChange={e => setQuando(e.target.value || oraLocale())}
                  className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold">{t("Dove, di preciso")}</span>
                <input value={luogo} onChange={e => setLuogo(e.target.value)} maxLength={300} placeholder={t("Es. ponteggio lato strada, 2° piano")}
                  className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
              </label>
            </div>

            <label className="block space-y-1">
              <span className="text-sm font-semibold">{t("Chi ha visto? (se c'era qualcuno)")}</span>
              <input value={testimoni} placeholder={t("Nomi dei colleghi presenti")} onChange={e => setTestimoni(e.target.value)} maxLength={500}
                className="h-12 w-full rounded-xl border bg-background px-3 text-base" />
            </label>

            <div className="space-y-2">
              <p className="text-sm font-semibold">{t("Foto (fino a {n})", { n: MASSIMO_FOTO_SICUREZZA })}</p>
              {foto.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {anteprime.map((url, i) => (
                    <div key={url} className="relative">
                      <img src={url} alt={t("Foto {n}", { n: i + 1 })} className="aspect-square w-full rounded-xl object-cover" />
                      <button type="button" aria-label={t("Togli la foto {n}", { n: i + 1 })} onClick={() => setFoto(f => f.filter((_, j) => j !== i))}
                        className="absolute end-1 top-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {foto.length < MASSIMO_FOTO_SICUREZZA && (
                <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed text-sm font-semibold">
                  <Camera className="size-5" aria-hidden="true" /> {t("Aggiungi foto")}
                  <input type="file" accept="image/*" multiple className="sr-only"
                    onChange={e => { const scelte = [...(e.target.files ?? [])]; e.target.value = ""; setFoto(f => [...f, ...scelte].slice(0, MASSIMO_FOTO_SICUREZZA)); }} />
                </label>
              )}
            </div>

            <button type="submit" disabled={invio.isPending}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 text-base font-bold text-white disabled:opacity-60">
              {invio.isPending && <Loader2 className="size-5 animate-spin" aria-hidden="true" />}
              {invio.isPending ? t("Invio in corso…") : t("Invia all'ufficio")}
            </button>
          </>}
        </form>
      )}

      {(mie.data?.length ?? 0) > 0 && (
        <section aria-labelledby="mie-segnalazioni" className="space-y-2">
          <h2 id="mie-segnalazioni" className="text-sm font-semibold text-muted-foreground">{t("Le mie segnalazioni")}</h2>
          <ul className="space-y-2">
            {mie.data!.map(e => (
              <li key={e.id} className="rounded-xl border bg-background p-3">
                <p className="text-sm font-semibold">
                  {t(TIPI.find(v => v.valore === e.tipo)?.titolo ?? "Segnalazione")}
                  <span className="font-normal text-muted-foreground"> · {new Date(e.accaduto_il).toLocaleDateString(intlCampo(), { day: "numeric", month: "short" })}</span>
                </p>
                <p className="line-clamp-2 text-sm text-muted-foreground">{e.descrizione}</p>
                <p className={cn("mt-1 text-xs font-semibold", e.stato === "chiusa" ? "text-emerald-700" : "text-amber-700")}>{t(STATI[e.stato])}</p>
                {e.azioni_correttive && <p className="mt-1 text-xs">{t("Cosa si è deciso:")} {e.azioni_correttive}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
