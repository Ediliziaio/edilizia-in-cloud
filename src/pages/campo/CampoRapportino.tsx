/**
 * Rapportino giornaliero multi-step (3 step):
 * 1. Descrizione lavori + meteo (facoltativo)
 * 2. Ore + Avanzamento + Foto (facoltativo)
 * 3. Riepilogo e invio
 *
 * Nessun campo obbligatorio. Firme cliente/operaio rimosse dal rapportino
 * (la firma cliente serve per documenti di collaudo / fine lavori).
 */
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronRight, ChevronLeft,
  Camera, X, Minus, Plus, Loader2, Send,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useGPS } from "@/hooks/useGPS";

const TOTAL_STEPS = 3;

/**
 * Compressione immagine lato client con gestione completa degli errori:
 * - img.onerror rifiuta la Promise (prima restava pending → loader infinito)
 * - toBlob può ritornare null → Promise rifiutata, il caller usa fallback
 * - URL.revokeObjectURL per evitare memory leak dei blob URL temporanei
 * - timeout 10s per evitare loader "Uploading…" bloccato se il browser non risponde
 */
async function compressImage(file: File, maxWidth = 1280, quality = 0.75): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      const t = setTimeout(() => reject(new Error("image load timeout")), 10000);
      el.onload = () => { clearTimeout(t); resolve(el); };
      el.onerror = () => { clearTimeout(t); reject(new Error("image load error")); };
      el.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.min(img.width || maxWidth, maxWidth);
    canvas.height = Math.round((img.height || canvas.width) * (canvas.width / (img.width || canvas.width)));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", quality);
    });
    if (!blob) throw new Error("toBlob returned null");
    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function CampoRapportino() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { isSubappaltatore } = useIsCampo();
  const queryClient = useQueryClient();
  const { lat, lng, accuracy, requestPosition } = useGPS(profile?.company_id ?? null);

  const [step, setStep] = useState(1);

  // Step 1
  const [descrizione, setDescrizione] = useState("");
  const [meteo, setMeteo] = useState<string>("");

  // Step 2
  const [oreLavorate, setOreLavorate] = useState(8);
  const [oreStraordinario, setOreStraordinario] = useState(0);
  const [percentuale, setPercentuale] = useState(0);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Step 3
  const [lavoro_completato, setLavoroCompletato] = useState(false);

  // Acquisisci GPS all'inizio — una sola volta al mount (requestPosition è useCallback
  // con dep [companyId]; se companyId cambia da null a valore, l'effect rilancia una
  // volta sola). Evitiamo comunque di ciclare includendo requestPosition nelle deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (profile?.company_id) requestPosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  // ── Upload foto ──────────────────────────────────────────────────────
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    if (!profile?.company_id || !orderId) {
      toast.error("Sessione non pronta, riprova");
      return;
    }
    const files = Array.from(e.target.files).slice(0, 5);
    setUploadingFoto(true);

    const previews: string[] = [];
    const urls: string[] = [];
    let failed = 0;

    for (const file of files) {
      const previewUrl = URL.createObjectURL(file);
      previews.push(previewUrl);

      try {
        // Comprimi: se il browser fallisce qualsiasi step, carica il file originale
        const compressed = await compressImage(file).catch(() => null);
        const payload: Blob = compressed ?? file;

        const path = `${profile.company_id}/${orderId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
        const { data: up, error: upErr } = await supabase.storage
          .from("campo-rapportini")
          .upload(path, payload, { contentType: "image/jpeg", upsert: false });

        if (upErr) throw upErr;
        if (!up?.path) throw new Error("Upload senza path");

        const { data: urlData } = supabase.storage.from("campo-rapportini").getPublicUrl(up.path);
        urls.push(urlData.publicUrl);
      } catch (err) {
        failed++;
        console.error("[CampoRapportino] upload foto:", err);
      }
    }

    setFotoPreviews(prev => [...prev, ...previews]);
    setFotoUrls(prev => [...prev, ...urls]);
    setUploadingFoto(false);

    if (failed > 0) {
      toast.error(
        failed === files.length
          ? "Impossibile caricare le foto — riprova"
          : `Caricate ${files.length - failed}/${files.length} foto`,
      );
    }
  };

  // ── Salvataggio ──────────────────────────────────────────────────────
  const { mutate: salva, isPending: saving } = useMutation({
    mutationFn: async () => {
      // Inserisci rapportino
      const { data: inserted, error } = await supabase
        .from("campo_rapportini")
        .insert({
          company_id: profile!.company_id,
          order_id: orderId,
          user_id: user!.id,
          role_type: isSubappaltatore ? "subcontractor" : "employee",
          data_lavoro: format(new Date(), "yyyy-MM-dd"),
          ore_lavorate: oreLavorate,
          ore_straordinario: oreStraordinario > 0 ? oreStraordinario : 0,
          descrizione_lavori: descrizione || null,
          foto_urls: fotoUrls,
          lavoro_completato,
          percentuale_avanzamento: percentuale,
          gps_lat: lat || null,
          gps_lng: lng || null,
          gps_accuracy: accuracy || null,
          meteo: meteo || null,
          stato: "inviato",
        })
        .select("id")
        .single();

      if (error) throw error;

      if (inserted?.id && profile?.company_id) {
        const actorName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.email || "Operatore campo";
        await supabase
          .from("order_events" as never)
          .insert({
            order_id: orderId,
            company_id: profile.company_id,
            event_type: "reportino_cantiere",
            actor_id: user!.id,
            actor_name: actorName,
            payload: {
              rapportino_id: inserted.id,
              data_lavoro: format(new Date(), "yyyy-MM-dd"),
              ore_lavorate: oreLavorate,
              ore_straordinario: oreStraordinario > 0 ? oreStraordinario : 0,
              percentuale_avanzamento: percentuale,
              lavoro_completato,
              meteo: meteo || null,
              foto_count: fotoUrls.length,
              descrizione_lavori: descrizione || null,
              origine: "app_campo",
            },
          } as never)
          .then(({ error: eventError }) => {
            if (eventError) console.warn("[CampoRapportino] diario ordine non aggiornato:", eventError);
          });
      }

      // Aggiorna avanzamento sull'ordine se impostato
      if (percentuale > 0) {
        await supabase
          .from("orders")
          .update({ percentuale_avanzamento: percentuale })
          .eq("id", orderId!);
      }

      // Genera PDF in background (fire-and-forget)
      if (inserted?.id) {
        supabase.functions
          .invoke("genera-pdf-rapportino", { body: { rapportino_id: inserted.id } })
          .catch(() => {});
      }
    },
    onSuccess: () => {
      navigator.vibrate?.([10, 50, 10]);
      toast.success("Rapportino inviato!");
      queryClient.invalidateQueries({ queryKey: ["campo-rapportini-ordine", orderId] });
      queryClient.invalidateQueries({ queryKey: ["order-events", orderId] });
      navigate(`/campo/lavoro/${orderId}`);
    },
    onError: () => {
      toast.error("Errore nel salvataggio. Riprova.");
    },
  });

  const goNext = () => {
    if (step < TOTAL_STEPS) setStep(s => s + 1);
    else salva();
  };

  const goBack = () => {
    if (step > 1) setStep(s => s - 1);
    else navigate(`/campo/lavoro/${orderId}`);
  };

  const METEO_OPTIONS = [
    { value: "soleggiato", emoji: "☀️" },
    { value: "nuvoloso", emoji: "☁️" },
    { value: "pioggia", emoji: "🌧️" },
    { value: "neve", emoji: "❄️" },
    { value: "vento", emoji: "💨" },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-3 py-3 shadow-sm md:px-4">
        <button
          onClick={goBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted active:bg-muted"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground">Rapportino — Passo {step} di {TOTAL_STEPS}</p>
          <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenuto */}
      <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 pb-28 md:px-4 md:py-5">

        {/* ── Step 1: Descrizione ── */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-black text-foreground">Cosa hai fatto oggi?</h2>
            <textarea
              className="w-full resize-none rounded-2xl border border-border bg-muted/60 px-4 py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              rows={7}
              placeholder="Es: Ho installato il telaio finestra al piano primo, sigillato con schiuma poliuretanica..."
              value={descrizione}
              onChange={e => setDescrizione(e.target.value)}
            />
            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Condizioni meteo</p>
              <div className="grid grid-cols-5 gap-2">
                {METEO_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMeteo(meteo === m.value ? "" : m.value)}
                    className={`flex min-h-12 flex-col items-center justify-center rounded-xl border p-2 transition-all ${
                      meteo === m.value
                        ? "bg-primary/10 border-primary/40"
                        : "bg-muted border-border"
                    }`}
                  >
                    <span className="text-lg">{m.emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Ore + Avanzamento + Foto ── */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-black text-foreground">Ore e avanzamento</h2>

            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Ore lavorate</p>
                <span className="text-primary font-bold">{oreLavorate}h</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOreLavorate(o => Math.max(0.5, o - 0.5))}
                  className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
                >
                  <Minus className="w-4 h-4 text-foreground" />
                </button>
                <input
                  type="range"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={oreLavorate}
                  onChange={e => setOreLavorate(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <button
                  onClick={() => setOreLavorate(o => Math.min(12, o + 0.5))}
                  className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Avanzamento lavori</p>
                <span className="text-primary font-bold">{percentuale}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percentuale}
                onChange={e => setPercentuale(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Ore straordinario */}
            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-muted-foreground">Ore straordinario</p>
                <span className="text-primary font-bold">{oreStraordinario}h</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOreStraordinario(o => Math.max(0, o - 0.5))}
                  className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center"
                >
                  <Minus className="w-4 h-4 text-foreground" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.5}
                  value={oreStraordinario}
                  onChange={e => setOreStraordinario(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <button
                  onClick={() => setOreStraordinario(o => Math.min(6, o + 0.5))}
                  className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 text-primary-foreground" />
                </button>
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4 shadow-sm">
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Foto cantiere</p>
              <label className="block w-full">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={handleFotoChange}
                  disabled={uploadingFoto}
                />
                <div className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/60 p-6 transition-colors active:border-primary">
                  {uploadingFoto ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Scatta o scegli foto</span>
                    </>
                  )}
                </div>
              </label>
              {fotoPreviews.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {fotoPreviews.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p} className="aspect-square w-full rounded-xl object-cover" alt="preview" />
                      <button
                        onClick={() => {
                          setFotoPreviews(prev => prev.filter((_, idx) => idx !== i));
                          setFotoUrls(prev => prev.filter((_, idx) => idx !== i));
                        }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 3: Riepilogo ── */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-black text-foreground">Riepilogo</h2>

            {/* Riepilogo dati */}
            <div className="space-y-3 rounded-2xl border border-border bg-muted/60 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Data</span>
                <span className="text-foreground">{format(new Date(), "d MMMM yyyy")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ore lavorate</span>
                <span className="text-primary font-bold">{oreLavorate}h</span>
              </div>
              {oreStraordinario > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Ore straordinario</span>
                  <span className="text-primary font-bold">{oreStraordinario}h</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Avanzamento</span>
                <span className="text-primary font-bold">{percentuale}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Foto</span>
                <span className="text-foreground">{fotoUrls.length} foto</span>
              </div>
              {descrizione && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Descrizione</p>
                  <p className="text-sm text-foreground">{descrizione}</p>
                </div>
              )}
              {meteo && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Meteo</span>
                  <span className="text-foreground capitalize">{meteo}</span>
                </div>
              )}
            </div>

            {/* Toggle lavoro completato */}
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-4 shadow-sm">
              <button
                onClick={() => setLavoroCompletato(!lavoro_completato)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  lavoro_completato ? "bg-green-500" : "bg-border"
                } relative`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  lavoro_completato ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-foreground">Lavoro completato</p>
                <p className="text-xs text-muted-foreground">Il cantiere è terminato</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigazione */}
      <div
        className="flex-none border-t border-border bg-background px-3 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] md:px-4"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-3">
          <button
            onClick={goBack}
            className="bg-muted border border-border text-foreground font-semibold py-3.5 px-6 rounded-xl active:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            disabled={saving}
            className="flex-1 bg-primary text-white font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : step < TOTAL_STEPS ? (
              <>
                Avanti
                <ChevronRight className="w-5 h-5" />
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Invia rapportino
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
