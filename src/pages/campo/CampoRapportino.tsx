/**
 * Rapportino giornaliero multi-step (5 step):
 * 1. Descrizione lavori
 * 2. Materiali usati (da furgone + manuale)
 * 3. Ore + Avanzamento + Foto
 * 4. Firma cliente (canvas touch)
 * 5. Conferma e invio
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft, ChevronRight, ChevronLeft,
  Camera, X, Minus, Plus, Loader2, Send, PenLine
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsCampo } from "@/hooks/useIsCampo";
import { useGPS } from "@/hooks/useGPS";

const TOTAL_STEPS = 5;

interface Materiale {
  nome: string;
  quantita: number;
  unita: string;
  da_furgone: boolean;
  scorta_id?: string;
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
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [materialeManuale, setMaterialeManuale] = useState({ nome: "", quantita: 1, unita: "pz" });
  const [decrementiFurgone, setDecrementiFurgone] = useState<Record<string, number>>({});

  // Step 3
  const [oreLavorate, setOreLavorate] = useState(8);
  const [percentuale, setPercentuale] = useState(0);
  const [fotoFiles, setFotoFiles] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  // Step 4
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [firmatoDa, setFirmatoDa] = useState("");
  const [hasSignature, setHasSignature] = useState(false);
  const [firmaUrl, setFirmaUrl] = useState<string | null>(null);

  // Step 3 extra
  const [oreStraordinario, setOreStraordinario] = useState(0);

  // Step 5
  const [lavoro_completato, setLavoroCompletato] = useState(false);
  const firmaOperaioRef = useRef<HTMLCanvasElement>(null);
  const isDrawingOperaioRef = useRef(false);
  const [hasSignatureOperaio, setHasSignatureOperaio] = useState(false);

  // Acquisisci GPS all'inizio
  useEffect(() => {
    requestPosition();
  }, [requestPosition]);

  // Scorte furgone (solo operaio)
  const { data: scorte = [] } = useQuery({
    queryKey: ["scorte-furgone", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("scorte_furgone")
        .select("*")
        .eq("tecnico_id", user!.id)
        .eq("attivo", true)
        .order("nome_materiale");
      return data ?? [];
    },
    enabled: !!user?.id && !isSubappaltatore,
  });

  const scorteDisponibili = scorte.filter(
    (s: any) => (s.quantita_attuale - (decrementiFurgone[s.id] ?? 0)) > 0
  );

  // ── Canvas firma ─────────────────────────────────────────────────────
  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    isDrawingRef.current = true;
    const { x, y } = getPos(e, canvasRef.current);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e, canvasRef.current);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = () => { isDrawingRef.current = false; };

  const clearFirma = () => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setHasSignature(false);
  };

  // ── Canvas firma operaio ─────────────────────────────────────────────────
  const startDrawOperaio = (e: React.MouseEvent | React.TouchEvent) => {
    if (!firmaOperaioRef.current) return;
    e.preventDefault();
    const ctx = firmaOperaioRef.current.getContext("2d");
    if (!ctx) return;
    isDrawingOperaioRef.current = true;
    const { x, y } = getPos(e, firmaOperaioRef.current);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const drawOperaio = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingOperaioRef.current || !firmaOperaioRef.current) return;
    e.preventDefault();
    const ctx = firmaOperaioRef.current.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e, firmaOperaioRef.current);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
    setHasSignatureOperaio(true);
  };

  const endDrawOperaio = () => { isDrawingOperaioRef.current = false; };

  const clearFirmaOperaio = () => {
    if (!firmaOperaioRef.current) return;
    const ctx = firmaOperaioRef.current.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, firmaOperaioRef.current.width, firmaOperaioRef.current.height);
    setHasSignatureOperaio(false);
  };

  // ── Upload foto ─────────────────────────────────────────────────��────
  const handleFotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const files = Array.from(e.target.files).slice(0, 5);
    setUploadingFoto(true);

    const previews: string[] = [];
    const urls: string[] = [];

    for (const file of files) {
      previews.push(URL.createObjectURL(file));

      // Comprimi e carica
      const canvas = document.createElement("canvas");
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(res => { img.onload = res; });
      canvas.width = Math.min(img.width, 1280);
      canvas.height = img.height * (canvas.width / img.width);
      const ctx2 = canvas.getContext("2d")!;
      ctx2.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), "image/jpeg", 0.75));

      const path = `${profile!.company_id}/${orderId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { data: up } = await supabase.storage.from("campo-rapportini").upload(path, blob);
      if (up?.path) {
        const { data: urlData } = supabase.storage.from("campo-rapportini").getPublicUrl(up.path);
        urls.push(urlData.publicUrl);
      }
    }

    setFotoFiles(prev => [...prev, ...files]);
    setFotoPreviews(prev => [...prev, ...previews]);
    setFotoUrls(prev => [...prev, ...urls]);
    setUploadingFoto(false);
  };

  // ── Salvataggio ─────────────────────────────────────────────────────────
  const { mutate: salva, isPending: saving } = useMutation({
    mutationFn: async () => {
      // Upload firma cliente
      let uploadedFirmaUrl: string | null = null;
      if (hasSignature && canvasRef.current) {
        const blob = await new Promise<Blob>(res =>
          canvasRef.current!.toBlob(b => res(b!), "image/png")
        );
        const path = `${profile!.company_id}/${orderId}/${Date.now()}_firma.png`;
        const { data: upFirma } = await supabase.storage.from("campo-firme").upload(path, blob);
        if (upFirma?.path) {
          const { data: urlD } = supabase.storage.from("campo-firme").getPublicUrl(upFirma.path);
          uploadedFirmaUrl = urlD.publicUrl;
        }
      }

      // Upload firma operaio
      let uploadedFirmaOperaioUrl: string | null = null;
      if (hasSignatureOperaio && firmaOperaioRef.current) {
        const blob = await new Promise<Blob>(res =>
          firmaOperaioRef.current!.toBlob(b => res(b!), "image/png")
        );
        const path = `${profile!.company_id}/${orderId}/${Date.now()}_firma_operaio.png`;
        const { data: upFirmaOp } = await supabase.storage.from("campo-firme").upload(path, blob);
        if (upFirmaOp?.path) {
          const { data: urlD } = supabase.storage.from("campo-firme").getPublicUrl(upFirmaOp.path);
          uploadedFirmaOperaioUrl = urlD.publicUrl;
        }
      }

      // Decrementa scorte furgone
      for (const [scorta_id, qtaUsata] of Object.entries(decrementiFurgone)) {
        if (qtaUsata > 0) {
          await supabase.rpc("decrement_scorta", { p_id: scorta_id, p_qty: qtaUsata });
        }
      }

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
          descrizione_lavori: descrizione,
          materiali_usati: materiali,
          foto_urls: fotoUrls,
          lavoro_completato,
          percentuale_avanzamento: percentuale,
          gps_lat: lat || null,
          gps_lng: lng || null,
          gps_accuracy: accuracy || null,
          meteo: meteo || null,
          firma_cliente_url: uploadedFirmaUrl,
          firma_cliente_nome: firmatoDa || null,
          firma_cliente_at: hasSignature ? new Date().toISOString() : null,
          firma_operaio_url: uploadedFirmaOperaioUrl,
          stato: "inviato",
        })
        .select("id")
        .single();

      if (error) throw error;

      // Aggiorna avanzamento sull'ordine
      await supabase
        .from("orders")
        .update({ percentuale_avanzamento: percentuale })
        .eq("id", orderId!);

      // Genera PDF in background (fire-and-forget — non bloccare UX)
      if (inserted?.id) {
        supabase.functions
          .invoke("genera-pdf-rapportino", { body: { rapportino_id: inserted.id } })
          .catch(() => { /* PDF generato in background, errore non bloccante */ });
      }
    },
    onSuccess: () => {
      navigator.vibrate?.([10, 50, 10]);
      toast.success("Rapportino inviato!");
      queryClient.invalidateQueries({ queryKey: ["campo-rapportini-ordine", orderId] });
      navigate(`/campo/lavoro/${orderId}`);
    },
    onError: () => {
      toast.error("Errore nel salvataggio. Riprova.");
    },
  });

  const goNext = () => {
    if (step === 1 && !descrizione.trim()) {
      toast.error("Inserisci una descrizione dei lavori");
      return;
    }
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3">
        <button
          onClick={goBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 shrink-0"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex-1">
          <p className="text-xs text-slate-400">Rapportino — Passo {step} di {TOTAL_STEPS}</p>
          {/* Progress bar */}
          <div className="w-full bg-slate-800 rounded-full h-1 mt-1">
            <div
              className="bg-amber-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenuto */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">

        {/* ── Step 1: Descrizione ── */}
        {step === 1 && (
          <>
            <h2 className="text-lg font-bold text-white">Cosa hai fatto oggi?</h2>
            <textarea
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base resize-none placeholder:text-slate-500"
              rows={6}
              placeholder="Es: Ho installato il telaio finestra al piano primo, sigillato con schiuma poliuretanica..."
              value={descrizione}
              onChange={e => setDescrizione(e.target.value)}
            />
            <div>
              <p className="text-sm text-slate-400 mb-2">Condizioni meteo</p>
              <div className="flex gap-2">
                {METEO_OPTIONS.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setMeteo(meteo === m.value ? "" : m.value)}
                    className={`flex flex-col items-center p-2 rounded-xl border transition-all ${
                      meteo === m.value
                        ? "bg-amber-500/20 border-amber-500/40"
                        : "bg-slate-800 border-slate-700"
                    }`}
                  >
                    <span className="text-lg">{m.emoji}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Step 2: Materiali ── */}
        {step === 2 && (
          <>
            <h2 className="text-lg font-bold text-white">Materiali utilizzati</h2>

            {/* Scorte furgone */}
            {!isSubappaltatore && scorteDisponibili.length > 0 && (
              <div>
                <p className="text-sm text-slate-400 mb-2">Dal furgone</p>
                <div className="space-y-2">
                  {scorteDisponibili.map((s: any) => {
                    const qtaInUso = decrementiFurgone[s.id] ?? 0;
                    return (
                      <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm text-white">{s.nome_materiale}</p>
                          <p className="text-xs text-slate-400">
                            Disponibili: {s.quantita_attuale - qtaInUso} {s.unita_misura}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              if (qtaInUso <= 0) return;
                              setDecrementiFurgone(d => ({ ...d, [s.id]: qtaInUso - 1 }));
                              setMateriali(m => m.filter(x => x.scorta_id !== s.id || (x.quantita > 1 && (x.quantita-- , true))));
                            }}
                            className="w-7 h-7 rounded-lg bg-slate-700 flex items-center justify-center"
                          >
                            <Minus className="w-3 h-3 text-white" />
                          </button>
                          <span className="text-white w-6 text-center">{qtaInUso}</span>
                          <button
                            onClick={() => {
                              const newQta = qtaInUso + 1;
                              if (newQta > s.quantita_attuale) return;
                              setDecrementiFurgone(d => ({ ...d, [s.id]: newQta }));
                              const existing = materiali.find(x => x.scorta_id === s.id);
                              if (existing) {
                                setMateriali(m => m.map(x => x.scorta_id === s.id ? { ...x, quantita: newQta } : x));
                              } else {
                                setMateriali(m => [...m, {
                                  nome: s.nome_materiale,
                                  quantita: newQta,
                                  unita: s.unita_misura,
                                  da_furgone: true,
                                  scorta_id: s.id,
                                }]);
                              }
                            }}
                            className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center"
                          >
                            <Plus className="w-3 h-3 text-black" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Aggiunta manuale */}
            <div>
              <p className="text-sm text-slate-400 mb-2">Aggiungi manuale</p>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-base placeholder:text-slate-500"
                  placeholder="Nome materiale"
                  value={materialeManuale.nome}
                  onChange={e => setMaterialeManuale(m => ({ ...m, nome: e.target.value }))}
                />
                <input
                  type="number"
                  className="w-16 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-base"
                  value={materialeManuale.quantita}
                  min={1}
                  onChange={e => setMaterialeManuale(m => ({ ...m, quantita: Number(e.target.value) }))}
                />
                <input
                  className="w-14 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-base"
                  placeholder="pz"
                  value={materialeManuale.unita}
                  onChange={e => setMaterialeManuale(m => ({ ...m, unita: e.target.value }))}
                />
                <button
                  onClick={() => {
                    if (!materialeManuale.nome.trim()) return;
                    setMateriali(m => [...m, { ...materialeManuale, da_furgone: false }]);
                    setMaterialeManuale({ nome: "", quantita: 1, unita: "pz" });
                  }}
                  className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0"
                >
                  <Plus className="w-5 h-5 text-black" />
                </button>
              </div>

              {materiali.filter(m => !m.da_furgone).length > 0 && (
                <div className="mt-2 space-y-1">
                  {materiali.filter(m => !m.da_furgone).map((m, i) => (
                    <div key={i} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">{m.nome} — {m.quantita} {m.unita}</span>
                      <button
                        onClick={() => setMateriali(prev => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step 3: Ore + Avanzamento + Foto ── */}
        {step === 3 && (
          <>
            <h2 className="text-lg font-bold text-white">Ore e avanzamento</h2>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-400">Ore lavorate</p>
                <span className="text-amber-400 font-bold">{oreLavorate}h</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOreLavorate(o => Math.max(0.5, o - 0.5))}
                  className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center"
                >
                  <Minus className="w-4 h-4 text-white" />
                </button>
                <input
                  type="range"
                  min={0.5}
                  max={12}
                  step={0.5}
                  value={oreLavorate}
                  onChange={e => setOreLavorate(Number(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <button
                  onClick={() => setOreLavorate(o => Math.min(12, o + 0.5))}
                  className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 text-black" />
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-400">Avanzamento lavori</p>
                <span className="text-amber-400 font-bold">{percentuale}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={percentuale}
                onChange={e => setPercentuale(Number(e.target.value))}
                className="w-full accent-amber-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>

            {/* Ore straordinario */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-slate-400">Ore straordinario</p>
                <span className="text-amber-400 font-bold">{oreStraordinario}h</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setOreStraordinario(o => Math.max(0, o - 0.5))}
                  className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center"
                >
                  <Minus className="w-4 h-4 text-white" />
                </button>
                <input
                  type="range"
                  min={0}
                  max={6}
                  step={0.5}
                  value={oreStraordinario}
                  onChange={e => setOreStraordinario(Number(e.target.value))}
                  className="flex-1 accent-amber-500"
                />
                <button
                  onClick={() => setOreStraordinario(o => Math.min(6, o + 0.5))}
                  className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center"
                >
                  <Plus className="w-4 h-4 text-black" />
                </button>
              </div>
            </div>

            <div>
              <p className="text-sm text-slate-400 mb-2">Foto cantiere</p>
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
                <div className="bg-slate-800 border-2 border-dashed border-slate-700 rounded-xl p-6 flex flex-col items-center gap-2 active:border-amber-500 transition-colors cursor-pointer">
                  {uploadingFoto ? (
                    <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
                  ) : (
                    <>
                      <Camera className="w-8 h-8 text-slate-400" />
                      <span className="text-sm text-slate-400">Scatta o scegli foto</span>
                    </>
                  )}
                </div>
              </label>
              {fotoPreviews.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {fotoPreviews.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p} className="w-16 h-16 rounded-lg object-cover" alt="preview" />
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

        {/* ── Step 4: Firma cliente ── */}
        {step === 4 && (
          <>
            <h2 className="text-lg font-bold text-white">Firma cliente</h2>
            <p className="text-sm text-slate-400">
              Fai firmare il cliente a conferma dei lavori eseguiti oggi
            </p>

            <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={640}
                height={320}
                className="w-full touch-none bg-slate-800"
                style={{ height: 160 }}
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
              />
              <div className="p-3 flex items-center justify-between border-t border-slate-700">
                <span className="text-xs text-slate-400">Firma nell'area sopra</span>
                <button
                  onClick={clearFirma}
                  className="text-xs text-slate-400 flex items-center gap-1 active:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancella
                </button>
              </div>
            </div>

            <input
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base placeholder:text-slate-500"
              placeholder="Nome del cliente (opzionale)"
              value={firmatoDa}
              onChange={e => setFirmatoDa(e.target.value)}
            />

            <button
              onClick={() => setStep(5)}
              className="w-full bg-slate-800 border border-slate-700 text-slate-400 py-3 rounded-xl text-sm active:bg-slate-700 transition-colors"
            >
              Salta firma
            </button>
          </>
        )}

        {/* ── Step 5: Firma operaio + Riepilogo ── */}
        {step === 5 && (
          <>
            <h2 className="text-lg font-bold text-white">Firma e riepilogo</h2>

            {/* Firma operaio */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <PenLine className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-semibold text-white">Firma operaio</p>
                {hasSignatureOperaio && (
                  <span className="text-xs text-green-400">✓ Firmato</span>
                )}
              </div>
              <div className="bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                <canvas
                  ref={firmaOperaioRef}
                  width={640}
                  height={240}
                  className="w-full touch-none bg-slate-800"
                  style={{ height: 120 }}
                  onMouseDown={startDrawOperaio}
                  onMouseMove={drawOperaio}
                  onMouseUp={endDrawOperaio}
                  onTouchStart={startDrawOperaio}
                  onTouchMove={drawOperaio}
                  onTouchEnd={endDrawOperaio}
                />
                <div className="p-3 flex items-center justify-between border-t border-slate-700">
                  <span className="text-xs text-slate-400">Firma nell'area sopra</span>
                  <button
                    onClick={clearFirmaOperaio}
                    className="text-xs text-slate-400 flex items-center gap-1 active:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                    Cancella
                  </button>
                </div>
              </div>
            </div>

            {/* Riepilogo */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Data</span>
                <span className="text-white">{format(new Date(), "d MMMM yyyy")}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Ore lavorate</span>
                <span className="text-amber-400 font-bold">{oreLavorate}h</span>
              </div>
              {oreStraordinario > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Ore straordinario</span>
                  <span className="text-amber-400 font-bold">{oreStraordinario}h</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Avanzamento</span>
                <span className="text-amber-400 font-bold">{percentuale}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Materiali</span>
                <span className="text-white">{materiali.length} voci</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Foto</span>
                <span className="text-white">{fotoPreviews.length} foto</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Firma cliente</span>
                <span className={hasSignature ? "text-green-400" : "text-slate-500"}>
                  {hasSignature ? "✓ Presente" : "Non firmato"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Firma operaio</span>
                <span className={hasSignatureOperaio ? "text-green-400" : "text-slate-500"}>
                  {hasSignatureOperaio ? "✓ Presente" : "Non firmato"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4">
              <button
                onClick={() => setLavoroCompletato(!lavoro_completato)}
                className={`w-12 h-6 rounded-full transition-colors ${
                  lavoro_completato ? "bg-green-500" : "bg-slate-700"
                } relative`}
              >
                <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  lavoro_completato ? "translate-x-6" : "translate-x-0.5"
                }`} />
              </button>
              <div>
                <p className="text-sm font-semibold text-white">Lavoro completato</p>
                <p className="text-xs text-slate-400">Il cantiere è terminato</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Navigazione */}
      <div
        className="flex-none bg-slate-950 border-t border-slate-800 px-4 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="flex gap-3">
          <button
            onClick={goBack}
            className="bg-slate-800 border border-slate-700 text-white font-semibold py-3.5 px-6 rounded-xl active:bg-slate-700 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={goNext}
            disabled={saving}
            className="flex-1 bg-amber-500 text-black font-bold py-3.5 rounded-xl text-base active:scale-[0.98] transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
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
