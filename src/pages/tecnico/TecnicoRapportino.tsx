import { useRef, useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  ArrowLeft,
  ChevronRight,
  Plus,
  Minus,
  Camera,
  X,
  Check,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

interface Materiale {
  descrizione: string;
  quantita: number;
  unita: string;
}

const PRESET_ORE = [1, 2, 3, 4];

export default function TecnicoRapportino() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1);
  const TOTAL_STEPS = 4;

  // Step 1
  const [descrizione, setDescrizione] = useState("");

  // Step 2
  const [materiali, setMateriali] = useState<Materiale[]>([]);
  const [nuovoMateriale, setNuovoMateriale] = useState({ descrizione: "", quantita: 1, unita: "pz" });
  const [showNuovoMat, setShowNuovoMat] = useState(false);

  // Step 3
  const [orePreset, setOrePreset] = useState<number | null>(null);
  const [oreCustom, setOreCustom] = useState("");
  const [showCustomOre, setShowCustomOre] = useState(false);
  const [fotoFiles, setFotoFiles] = useState<File[]>([]);
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([]);

  // Step 4 — firma canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [firmatoDa, setFirmatoDa] = useState("");
  const [hasSignature, setHasSignature] = useState(false);

  // Scorte furgone
  const { data: scorte = [] } = useQuery({
    queryKey: ["scorte-furgone", authUser?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("scorte_furgone")
        .select("*")
        .eq("tecnico_id", authUser!.id)
        // Schema reale di scorte_furgone: descrizione / quantita.
        // Il codice usava nome_materiale, quantita_attuale e un filtro
        // su "attivo": tre colonne inesistenti, quindi la query falliva
        // e (senza check sull'errore) la lista restava sempre vuota.
        .order("descrizione");
      return data ?? [];
    },
    enabled: !!authUser,
  });

  // Traccia decrementamenti sessione: scortaId → quantità usata
  const [decrementiFurgone, setDecrementiFurgone] = useState<Record<string, number>>({});

  // Scorte con disponibilità > 0 per questa sessione
  const scorteDisponibili = scorte.filter(
    (s: any) => (s.quantita - (decrementiFurgone[s.id] ?? 0)) > 0
  );

  // Canvas firma helpers
  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
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
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    isDrawingRef.current = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#ffffff";
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    setHasSignature(true);
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = false;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  // Foto handling
  // Revoca URL object al cleanup per evitare memory leak
  useEffect(() => {
    return () => {
      fotoPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [fotoPreviews]);

  const handleFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (fotoFiles.length + files.length > 5) {
      toast.error("Massimo 5 foto");
      return;
    }
    // Revoca le precedenti prima di rimpiazzarle
    fotoPreviews.forEach((url) => URL.revokeObjectURL(url));
    const newFiles = [...fotoFiles, ...files].slice(0, 5);
    setFotoFiles(newFiles);
    setFotoPreviews(newFiles.map((f) => URL.createObjectURL(f)));
  };

  const removeFoto = (idx: number) => {
    URL.revokeObjectURL(fotoPreviews[idx]);
    setFotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setFotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  // Materiale da scorte (con verifica disponibilità e tracking decremento)
  const addMaterialeScorta = (scorta: any) => {
    const available = (scorta.quantita ?? 0) - (decrementiFurgone[scorta.id] ?? 0);
    if (available <= 0) {
      toast.error("Scorta esaurita per questo intervento");
      return;
    }
    setDecrementiFurgone((prev) => ({ ...prev, [scorta.id]: (prev[scorta.id] ?? 0) + 1 }));
    setMateriali((prev) => {
      const existing = prev.findIndex((m) => m.descrizione === scorta.descrizione);
      if (existing >= 0) {
        return prev.map((m, i) =>
          i === existing ? { ...m, quantita: m.quantita + 1 } : m,
        );
      }
      return [...prev, { descrizione: scorta.descrizione, quantita: 1, unita: scorta.unita_misura ?? "pz" }];
    });
  };

  const updateMaterialeQta = (idx: number, delta: number) => {
    setMateriali((prev) =>
      prev
        .map((m, i) => (i === idx ? { ...m, quantita: Math.max(0, m.quantita + delta) } : m))
        .filter((m) => m.quantita > 0),
    );
  };

  const addNuovoMateriale = () => {
    if (!nuovoMateriale.descrizione.trim()) return;
    setMateriali((prev) => [...prev, { ...nuovoMateriale }]);
    setNuovoMateriale({ descrizione: "", quantita: 1, unita: "pz" });
    setShowNuovoMat(false);
  };

  const oreLavoro = showCustomOre ? parseFloat(oreCustom) || 0 : orePreset ?? 0;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!descrizione.trim()) throw new Error("Descrivi i lavori eseguiti");
      if (oreLavoro <= 0) throw new Error("Inserisci le ore di lavoro");

      // Upload foto
      const fotoUrls: string[] = [];
      const fotoUploadErrors: string[] = [];
      for (const file of fotoFiles) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const fileName = `rapportini/${id}/${Date.now()}_${safeName}`;
        const { error: uploadErr } = await supabase.storage
          .from("rapportini")
          .upload(fileName, file, { contentType: file.type });
        if (uploadErr) {
          console.error('[TecnicoRapportino] upload foto:', uploadErr.message);
          fotoUploadErrors.push(file.name);
          continue; // salta questa foto, continua con le altre
        }
        const { data: urlData } = supabase.storage.from("rapportini").getPublicUrl(fileName);
        if (urlData?.publicUrl) fotoUrls.push(urlData.publicUrl);
      }
      // Avvisa l'utente se alcune foto non sono state caricate
      if (fotoUploadErrors.length > 0) {
        toast.warning(
          `Rapportino salvato. ${fotoUploadErrors.length} foto non caricate: ` +
          fotoUploadErrors.join(', '),
          { duration: 6000 }
        );
      }

      // Firma
      let firmaBase64: string | null = null;
      if (hasSignature && canvasRef.current) {
        firmaBase64 = canvasRef.current.toDataURL("image/png");
      }

      // Get ticket for company_id
      const { data: ticket, error: ticketErr } = await supabase
        .from("tickets")
        .select("company_id")
        .eq("id", id!)
        .single();
      if (ticketErr) throw ticketErr;

      // Numero rapportino
      const { count } = await supabase
        .from("rapportini_intervento")
        .select("id", { count: "exact", head: true })
        .eq("ticket_id", id!);

      const { error: rapErr } = await supabase.from("rapportini_intervento").insert({
        company_id: ticket.company_id,
        ticket_id: id!,
        tecnico_id: authUser!.id,
        numero: (count ?? 0) + 1,
        data_intervento: new Date().toISOString(),
        descrizione: descrizione.trim(),
        ore_lavoro: oreLavoro,
        materiali_usati: materiali,
        foto_urls: fotoUrls,
        firma_cliente: firmaBase64,
        firmato_da: firmatoDa.trim() || null,
        firmato_il: firmaBase64 ? new Date().toISOString() : null,
        stato: firmaBase64 ? "firmato" : "bozza",
      });
      if (rapErr) throw rapErr;

      // Aggiorna ticket se firmato
      if (firmaBase64) {
        await supabase
          .from("tickets")
          .update({ status: "in_lavorazione" })
          .eq("id", id!);
      }

      // Decrementa scorte furgone usate in questa sessione
      const scorteMap = new Map(scorte.map((s: any) => [s.id, s]));
      for (const [scortaId, usedQty] of Object.entries(decrementiFurgone)) {
        if (usedQty <= 0) continue;
        const scorta = scorteMap.get(scortaId);
        if (!scorta) continue;
        const newQty = Math.max(0, (scorta.quantita ?? 0) - usedQty);
        await supabase
          .from("scorte_furgone")
          .update({ quantita: newQty })
          .eq("id", scortaId);
      }
    },
    onSuccess: () => {
      toast.success("Rapportino salvato!");
      queryClient.invalidateQueries({ queryKey: ["tecnico-lavori"] });
      queryClient.invalidateQueries({ queryKey: ["scorte-furgone"] });
      navigate("/tecnico");
    },
    onError: (err: Error) => toast.error(err.message || "Errore nel salvataggio"),
  });

  const canNext = () => {
    if (step === 1) return descrizione.trim().length > 10;
    if (step === 3) return oreLavoro > 0;
    return true;
  };

  return (
    <div className="flex flex-col min-h-[calc(100vh-68px)]">
      {/* Header step */}
      <div className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <button onClick={() => (step === 1 ? navigate(-1) : setStep((s) => s - 1))} className="flex items-center gap-1 text-slate-400 mb-3">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">{step === 1 ? "Annulla" : "Indietro"}</span>
        </button>
        <div className="flex gap-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`flex-1 h-1.5 rounded-full transition-colors ${i < step ? "bg-blue-500" : "bg-slate-600"}`}
            />
          ))}
        </div>
        <p className="text-slate-400 text-xs mt-2">
          Passo {step} di {TOTAL_STEPS}:{" "}
          {step === 1
            ? "Lavori eseguiti"
            : step === 2
            ? "Materiali usati"
            : step === 3
            ? "Ore e foto"
            : "Firma cliente"}
        </p>
      </div>

      {/* Contenuto step */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* Step 1 — Descrizione */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-white text-xl font-bold">Cosa hai fatto?</h2>
            <p className="text-slate-400 text-sm">Descrivi i lavori eseguiti in modo chiaro</p>
            <textarea
              value={descrizione}
              onChange={(e) => setDescrizione(e.target.value)}
              placeholder="Es: Ho sostituito il gruppo valvole della caldaia, verificato la pressione del circuito e riacceso il sistema. Il cliente ha confermato il corretto funzionamento..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white placeholder-slate-500 text-base focus:outline-none focus:border-blue-500 resize-none"
              style={{ minHeight: "180px", fontSize: "16px" }}
              autoFocus
            />
            <p className="text-slate-500 text-xs text-right">{descrizione.length} caratteri</p>
          </div>
        )}

        {/* Step 2 — Materiali */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-white text-xl font-bold">Materiali usati</h2>

            {/* Materiali già aggiunti */}
            {materiali.length > 0 && (
              <div className="space-y-2">
                {materiali.map((mat, i) => (
                  <div
                    key={i}
                    className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{mat.descrizione}</p>
                      <p className="text-slate-400 text-sm">{mat.unita}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateMaterialeQta(i, -1)}
                        className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-white active:bg-slate-600"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="text-white font-bold text-lg w-8 text-center">{mat.quantita}</span>
                      <button
                        onClick={() => updateMaterialeQta(i, 1)}
                        className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-white active:bg-slate-600"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Scorte furgone */}
            {scorte.length > 0 && (
              <div>
                <p className="text-slate-400 text-sm font-medium mb-2">Dal furgone:</p>
                {scorteDisponibili.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-2">Tutte le scorte disponibili sono state utilizzate</p>
                ) : (
                  <div className="space-y-2">
                    {scorteDisponibili.map((s: any) => {
                      const rimanenti = (s.quantita ?? 0) - (decrementiFurgone[s.id] ?? 0);
                      return (
                        <button
                          key={s.id}
                          onClick={() => addMaterialeScorta(s)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center justify-between text-left active:bg-slate-700"
                        >
                          <div>
                            <p className="text-white font-medium">{s.descrizione}</p>
                            <p className="text-slate-400 text-sm">
                              Disponibili: {rimanenti} {s.unita_misura ?? "pz"}
                            </p>
                          </div>
                          <Plus className="h-5 w-5 text-blue-400 shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Aggiungi materiale libero */}
            {showNuovoMat ? (
              <div className="bg-slate-800 border border-blue-500/50 rounded-xl p-4 space-y-3">
                <input
                  type="text"
                  value={nuovoMateriale.descrizione}
                  onChange={(e) => setNuovoMateriale((p) => ({ ...p, descrizione: e.target.value }))}
                  placeholder="Nome materiale"
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white text-base focus:outline-none focus:border-blue-500"
                  style={{ fontSize: "16px" }}
                  autoFocus
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="0"
                    value={nuovoMateriale.quantita}
                    onChange={(e) =>
                      setNuovoMateriale((p) => ({ ...p, quantita: parseFloat(e.target.value) || 1 }))
                    }
                    placeholder="Qtà"
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white text-base focus:outline-none focus:border-blue-500"
                    style={{ fontSize: "16px" }}
                  />
                  <input
                    type="text"
                    value={nuovoMateriale.unita}
                    onChange={(e) => setNuovoMateriale((p) => ({ ...p, unita: e.target.value }))}
                    placeholder="Unità"
                    className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-white text-base focus:outline-none focus:border-blue-500"
                    style={{ fontSize: "16px" }}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addNuovoMateriale}
                    className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium active:bg-blue-700"
                  >
                    Aggiungi
                  </button>
                  <button
                    onClick={() => setShowNuovoMat(false)}
                    className="px-4 bg-slate-700 text-white py-3 rounded-lg active:bg-slate-600"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNuovoMat(true)}
                className="w-full bg-slate-800 border border-dashed border-slate-600 rounded-xl p-4 text-slate-400 text-base flex items-center justify-center gap-2 active:bg-slate-750"
              >
                <Plus className="h-5 w-5" />
                Aggiungi materiale non in lista
              </button>
            )}

            {materiali.length === 0 && (
              <p className="text-center text-slate-500 text-sm pt-2">
                Nessun materiale usato? Va bene, puoi procedere.
              </p>
            )}
          </div>
        )}

        {/* Step 3 — Ore e foto */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-white text-xl font-bold">Ore di lavoro</h2>
              <div className="grid grid-cols-4 gap-2 mt-3">
                {PRESET_ORE.map((h) => (
                  <button
                    key={h}
                    onClick={() => {
                      setOrePreset(h);
                      setShowCustomOre(false);
                    }}
                    className={`py-4 rounded-xl text-lg font-bold transition-colors ${
                      !showCustomOre && orePreset === h
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 border border-slate-700 text-slate-300 active:bg-slate-700"
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setShowCustomOre(true);
                  setOrePreset(null);
                }}
                className={`w-full mt-2 py-3.5 rounded-xl text-base font-medium transition-colors ${
                  showCustomOre
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 border border-slate-700 text-slate-400 active:bg-slate-700"
                }`}
              >
                Personalizza
              </button>
              {showCustomOre && (
                <input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={oreCustom}
                  onChange={(e) => setOreCustom(e.target.value)}
                  placeholder="Es. 2.5"
                  className="w-full mt-2 bg-slate-800 border border-blue-500 rounded-xl px-4 py-3 text-white text-xl font-bold text-center focus:outline-none"
                  style={{ fontSize: "24px" }}
                  autoFocus
                />
              )}
            </div>

            {/* Foto */}
            <div>
              <h2 className="text-white text-xl font-bold">Foto (opzionale)</h2>
              <p className="text-slate-400 text-sm mt-1">Massimo 5 foto</p>

              <label className="mt-3 w-full bg-slate-800 border border-dashed border-slate-600 rounded-xl p-5 flex flex-col items-center justify-center gap-2 active:bg-slate-750 cursor-pointer block min-h-[100px]">
                <Camera className="h-8 w-8 text-slate-400" />
                <span className="text-slate-300 font-medium text-base">AGGIUNGI FOTO</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="sr-only"
                  onChange={handleFoto}
                />
              </label>

              {fotoPreviews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {fotoPreviews.map((src, i) => (
                    <div key={i} className="relative aspect-square">
                      <img loading="lazy" src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover rounded-xl" />
                      <button
                        onClick={() => removeFoto(i)}
                        className="absolute top-1.5 right-1.5 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center"
                        aria-label="Rimuovi foto"
                      >
                        <X className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4 — Firma */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="text-white text-xl font-bold">Firma cliente</h2>
            <p className="text-slate-400 text-base">Fai firmare il cliente sullo schermo</p>

            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <canvas
                ref={canvasRef}
                width={600}
                height={280}
                className="w-full touch-none bg-slate-900 rounded-xl"
                onMouseDown={startDraw}
                onMouseMove={draw}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                onTouchStart={startDraw}
                onTouchMove={draw}
                onTouchEnd={endDraw}
                style={{ cursor: "crosshair" }}
              />
            </div>

            <button
              onClick={clearCanvas}
              className="w-full bg-slate-700 border border-slate-600 text-slate-300 py-3 rounded-xl text-base font-medium active:bg-slate-600"
            >
              CANCELLA FIRMA
            </button>

            <div>
              <label className="block text-slate-400 text-sm mb-2">Nome del firmatario (opzionale)</label>
              <input
                type="text"
                value={firmatoDa}
                onChange={(e) => setFirmatoDa(e.target.value)}
                placeholder="Es. Mario Rossi"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-base focus:outline-none focus:border-blue-500"
                style={{ fontSize: "16px" }}
              />
            </div>

            <p className="text-slate-500 text-sm text-center">
              Senza firma il rapportino sarà salvato come bozza
            </p>
          </div>
        )}
      </div>

      {/* Footer azioni */}
      <div className="p-4 bg-slate-900 border-t border-slate-800">
        {step < TOTAL_STEPS ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canNext()}
            className="w-full bg-blue-600 text-white font-bold text-lg py-4 rounded-2xl min-h-[60px] active:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Avanti
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="w-full bg-green-600 text-white font-bold text-lg py-4 rounded-2xl min-h-[60px] active:bg-green-700 transition-colors flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <Check className="h-6 w-6" />
                FIRMA E CHIUDI INTERVENTO
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
