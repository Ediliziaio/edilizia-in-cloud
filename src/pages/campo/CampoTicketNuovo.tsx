import { UniformSelect } from "@/components/ui/uniform-select";
/**
 * Segnalare un problema dal cantiere (02/11/2026): una frase, scritta o detta, e una foto.
 * All'ufficio arriva come ticket con fonte='campo': il titolo sono le prime parole.
 * Il cantiere è già scelto se si arriva da /campo/ticket/nuovo/:orderId.
 * 24/11: «Manca materiale» (?tipo=materiale) arriva con la merce da ordinare; «Serve entro» dice quando;
 * sotto, le mie ultime segnalazioni con lo stato (l'operaio non legge i ticket: campo_mie_segnalazioni).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { RapportinoSiteContext } from "@/components/campo/RapportinoSiteContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Camera, CheckCircle, Loader2, Mic, ShieldAlert, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import CampoAudioRecorder from "@/components/campo/CampoAudioRecorder";
import { useRapportinoVocale } from "@/hooks/campo/useRapportinoVocale";
import { senzaRete } from "@/lib/campo/timbra";
import { syncQueue } from "@/lib/campo/sync-queue";
import type { SegnalazioneInCoda } from "@/lib/campo/spese";
import type { TablesInsert } from "@/integrations/supabase/types";
import { MASSIMO_FOTO_SEGNALAZIONE, SERVE_ENTRO, dataServeEntro, segnalazioneDaTesto, type ServeEntro } from "@/lib/campo/segnalazione";
import { MieSegnalazioni } from "@/components/campo/MieSegnalazioni";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

function AnteprimaFoto({ file, numero }: { file: File; numero: number }) {
  const imageRef = useRef<HTMLImageElement>(null);
  const t = useT();

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;
    const url = URL.createObjectURL(file);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return <img ref={imageRef} alt={t("Foto {n}", { n: numero })} className="aspect-square w-full rounded-xl object-cover" />;
}

export default function CampoTicketNuovo() {
  const { orderId } = useParams<{ orderId?: string }>();
  const navigate = useNavigate();
  const t = useT();
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  // «Chiedi una correzione» dal rapportino arriva con il testo già iniziato (?testo=…): l'operaio aggiunge cosa cambiare.
  const [parametri] = useSearchParams();
  const [testo, setTesto] = useState(() => (parametri.get("testo") ?? "").slice(0, 500));
  const [urgente, setUrgente] = useState(false);
  const [materiale, setMateriale] = useState(() => parametri.get("tipo") === "materiale");
  // «?entro=domani» dalle richieste per domani della squadra (piano campo completo 2.2).
  const [entro, setEntro] = useState<ServeEntro | null>(() => SERVE_ENTRO.find(s => s.value === parametri.get("entro"))?.value ?? null);
  const [selectedOrderId, setSelectedOrderId] = useState(orderId ?? "");
  const [foto, setFoto] = useState<File[]>([]);
  const [voceAperta, setVoceAperta] = useState(false);
  const [done, setDone] = useState(false);
  const { processAudio, uploading, transcribing, error: erroreVoce } = useRapportinoVocale();

  const { data: cantieri = [] } = useQuery({
    queryKey: ["campo-cantieri-ticket", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_campo_assignments")
        .select("order_id, order:orders(id, order_code, description)")
        .eq("user_id", user!.id);
      return (data ?? []).map((a) => a.order as unknown as { id: string; order_code: string | null; description: string | null }).filter(Boolean);
    },
    enabled: !!user?.id && !orderId,
  });

  const submitMutation = useMutation({
    mutationFn: async (): Promise<{ fotoPerse: number; inCoda?: boolean }> => {
      // company_id è NOT NULL: senza guardia un profilo non ancora caricato
      // produceva un errore criptico invece di un messaggio chiaro.
      if (!companyId) throw new Error(t("Azienda non disponibile, riprova tra un istante"));
      // «Serve oggi» è urgente anche senza la spunta: l'ufficio lo vede in cima.
      const s = segnalazioneDaTesto(testo, urgente || entro === "oggi");
      if (!s) throw new Error(materiale ? t("Scrivi cosa manca") : t("Scrivi cosa succede"));
      const serveEntro = entro ? dataServeEntro(entro, new Date()) : null;
      // L'id nasce qui: l'operaio non può rileggere i ticket, e la foto si attacca a questo.
      const ticketId = crypto.randomUUID();
      const riga: TablesInsert<"tickets"> = {
        id: ticketId,
        company_id: companyId,
        order_id: selectedOrderId || null,
        created_by: user!.id,
        // customer_id resta null: i ticket dal campo non hanno un cliente
        // (la colonna è stata resa nullable proprio per questo); metterci
        // l'operaio lo faceva comparire come "cliente" in ufficio.
        customer_id: null,
        subject: s.titolo,
        titolo: s.titolo,
        descrizione: s.descrizione,
        priorita: s.priorita,
        // `priority` è la colonna che l'ufficio legge: `priorita` è quella vecchia.
        priority: s.priority,
        status: "aperto",
        fonte: "campo",
        serve_entro: serveEntro,
        // Cosa manca sta nel testo: `merce_mancante` il database la tiene solo per l'arrivo parziale.
        ...(materiale ? { category: "materiale_mancante", merce_stato: "da_ordinare" } : {}),
      };
      // Senza rete la segnalazione va in coda con le foto e parte da sola (piano campo completo 1.7).
      if (senzaRete()) {
        const payload: SegnalazioneInCoda = {
          company_id: companyId, user_id: user!.id, riga: { ...riga, id: ticketId },
          foto: foto.map(file => ({ path: `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`, blob: file, contentType: file.type, nome: file.name })),
        };
        await syncQueue.enqueue<SegnalazioneInCoda>({ type: "segnalazione", dedupKey: ticketId, operationId: ticketId, payload });
        return { fotoPerse: 0, inCoda: true };
      }
      const { error } = await supabase.from("tickets").insert(riga);
      if (error) throw error;

      let fotoPerse = 0;
      for (const file of foto) {
        try {
          const path = `${ticketId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
          const { error: upErr } = await supabase.storage.from("ticket-attachments").upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          const { error: msgErr } = await supabase.from("ticket_messages").insert({
            ticket_id: ticketId,
            sender_id: user!.id,
            message: `📎 ${file.name}`,
            attachment_url: path,
          });
          if (msgErr) throw msgErr;
        } catch (e) {
          console.warn("[CampoTicketNuovo] foto non allegata:", e);
          fotoPerse += 1;
        }
      }
      return { fotoPerse };
    },
    onSuccess: ({ fotoPerse, inCoda }) => {
      if (inCoda) toast.success(t("Sei senza rete: la segnalazione parte da sola appena torna il segnale."));
      if (fotoPerse > 0) toast.warning(t("Segnalazione inviata, ma una foto non è partita: mandala in chat."));
      setDone(true);
      // Da link diretto/notifica la history è vuota: -1 uscirebbe dall'app.
      setTimeout(() => {
        if (window.history.length > 2) navigate(-1);
        else navigate("/campo", { replace: true });
      }, 1500);
    },
    onError: (err: unknown) => toast.error(err instanceof Error && err.message ? err.message : t("Non sono riuscito a inviare. Riprova.")),
  });

  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 py-16">
        <CheckCircle className="h-14 w-14 text-green-600" aria-hidden="true" />
        <p className="text-lg font-bold text-foreground">{t("Inviata all'ufficio")}</p>
      </div>
    );
  }

  const cantiereVoce = selectedOrderId || cantieri[0]?.id || null;

  // Niente h-full + scroll interno: il <main> della shell è l'unico scroller mobile.
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
      {/* Un infortunio o un pericolo non è un ticket: va nel registro sicurezza e avvisa subito chi la segue. */}
      <Link to={selectedOrderId ? `/campo/sicurezza/segnala/${selectedOrderId}` : "/campo/sicurezza/segnala"}
        className="flex min-h-12 items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-900 dark:bg-red-950/40 dark:text-red-200">
        <ShieldAlert className="size-5 shrink-0 text-red-600" aria-hidden="true" />
        {t("Infortunio o pericolo? Usa la segnalazione sicurezza")}
      </Link>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t("Indietro")}
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-muted active:bg-muted shrink-0 max-md:hidden"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-bold">{materiale ? t("Manca materiale") : t("Segnala un problema")}</h1>
          {/* Arrivando da un cantiere si vede per quale (collaudo 23/11): prima non lo diceva da nessuna parte. */}
          {orderId && <RapportinoSiteContext orderId={orderId} companyId={companyId} compatto />}
        </div>
      </div>

      {!orderId && cantieri.length > 0 && (
        <UniformSelect
          aria-label={t("Cantiere")}
          value={selectedOrderId}
          onChange={(e) => setSelectedOrderId(e.target.value)}
          className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
        >
          <option value="">{t("Nessun cantiere specifico")}</option>
          {cantieri.map((c) => (
            <option key={c.id} value={c.id}>{c.order_code} — {c.description?.slice(0, 40)}</option>
          ))}
        </UniformSelect>
      )}

      <div className="grid grid-cols-2 gap-1 rounded-full border bg-muted/50 p-1" role="radiogroup" aria-label={t("Cosa vuoi segnalare")}>
        {([[false, "Un problema"], [true, "Manca materiale"]] as const).map(([v, l]) => (
          <button key={l} type="button" role="radio" aria-checked={materiale === v} onClick={() => setMateriale(v)}
            className={cn("min-h-11 rounded-full text-sm font-semibold", materiale === v ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {t(l)}
          </button>
        ))}
      </div>

      <textarea
        aria-label={materiale ? t("Cosa manca") : t("Cosa succede")}
        value={testo}
        onChange={(e) => setTesto(e.target.value)}
        placeholder={materiale ? t("Cosa manca e quanto? Es: 20 sacchi di collante, 2 rotoli di rete") : t("Cosa succede? Es: mancano i tasselli per il secondo piano")}
        rows={4}
        className="w-full resize-none rounded-2xl border bg-muted/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
      />

      <div className="grid grid-cols-2 gap-2">
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border text-sm font-semibold">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            aria-label={t("Scatta una foto del problema")}
            className="sr-only"
            disabled={foto.length >= MASSIMO_FOTO_SEGNALAZIONE}
            onChange={(e) => {
              const scelta = e.target.files?.[0];
              if (scelta) setFoto((prima) => [...prima, scelta].slice(0, MASSIMO_FOTO_SEGNALAZIONE));
              e.target.value = "";
            }}
          />
          <Camera className="h-4 w-4" aria-hidden="true" />{t("Foto")}
        </label>
        <button
          type="button"
          disabled={!cantiereVoce || uploading || transcribing}
          onClick={() => setVoceAperta((v) => !v)}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border text-sm font-semibold disabled:opacity-50"
        >
          {uploading || transcribing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}{t("Parla")}
        </button>
      </div>

      {voceAperta && cantiereVoce && (
        <CampoAudioRecorder
          disabled={uploading || transcribing}
          onConfirm={async (blob, durata, mime) => {
            const proposta = await processAudio(blob, durata, mime, cantiereVoce);
            if (proposta?.trascrizione) {
              setTesto((t) => [t.trim(), proposta.trascrizione.trim()].filter(Boolean).join(" "));
              setVoceAperta(false);
            }
          }}
        />
      )}
      {erroreVoce && <p role="alert" className="text-sm text-destructive">{erroreVoce}</p>}

      {foto.length > 0 && (
        <div className="grid grid-cols-4 gap-2">
          {foto.map((file, i) => (
            <div key={`${i}-${file.name}`} className="relative">
              <AnteprimaFoto file={file} numero={i + 1} />
              <button
                type="button"
                aria-label={t("Togli la foto {n}", { n: i + 1 })}
                onClick={() => setFoto((prima) => prima.filter((_, idx) => idx !== i))}
                className="tap-compact absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("Serve entro")}</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("Serve entro")}>
          {SERVE_ENTRO.map(q => (
            <button key={q.value} type="button" role="radio" aria-checked={entro === q.value} onClick={() => setEntro(entro === q.value ? null : q.value)}
              className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold", entro === q.value ? "border-primary bg-primary text-primary-foreground" : "bg-background")}>
              {t(q.label)}
            </button>
          ))}
        </div>
      </div>

      <label className="relative flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={urgente || entro === "oggi"} disabled={entro === "oggi"} onChange={(e) => setUrgente(e.target.checked)} className="h-5 w-5" />
        {t("È urgente")}
      </label>

      <button
        type="button"
        onClick={() => submitMutation.mutate()}
        disabled={!testo.trim() || submitMutation.isPending}
        className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-primary-foreground disabled:opacity-50"
      >
        {submitMutation.isPending && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
        {t("Invia all'ufficio")}
      </button>

      <MieSegnalazioni />
    </div>
  );
}
