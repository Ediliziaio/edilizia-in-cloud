import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronLeft, Wrench, Calendar, Eye, Zap, CheckCircle2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PortaleLayout } from "@/components/portale/PortaleLayout";
import { usePortaleAuth } from "@/hooks/usePortaleAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

const TIPO_OPTIONS = [
  { value: "Intervento", label: "Intervento", emoji: "🔧" },
  { value: "Manutenzione", label: "Manutenzione", emoji: "🛠️" },
  { value: "Sopralluogo", label: "Sopralluogo", emoji: "👁️" },
  { value: "Emergenza", label: "Emergenza", emoji: "🚨" },
];

const URGENZA_OPTIONS = [
  { value: "normale", label: "Normale", color: "bg-gray-100 border-gray-300 text-gray-700", activeColor: "bg-gray-200 border-gray-500" },
  { value: "urgente", label: "Urgente", color: "bg-amber-50 border-amber-300 text-amber-700", activeColor: "bg-amber-100 border-amber-500" },
  { value: "emergenza", label: "Emergenza", color: "bg-red-50 border-red-300 text-red-700", activeColor: "bg-red-100 border-red-500" },
];

export default function NuovaRichiesta() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { loading, valido, cliente } = usePortaleAuth(token);

  const [step, setStep] = useState(1);
  const [selectedImpianto, setSelectedImpianto] = useState<string | null>(null);
  const [tipo, setTipo] = useState("");
  const [urgenza, setUrgenza] = useState("normale");
  const [descrizione, setDescrizione] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && !valido) {
      navigate("/portale/accesso-scaduto", { replace: true });
    }
  }, [loading, valido, navigate]);

  // Query impianti
  const { data: impianti = [] } = useQuery({
    queryKey: ["portale-impianti", cliente?.cliente_id, cliente?.company_id],
    enabled: !!cliente,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("impianti_cliente")
        .select("id, tipo_impianto, marca, modello, matricola")
        .eq("customer_id", cliente!.cliente_id)
        .eq("company_id", cliente!.company_id)
        .order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  const handleSubmit = async () => {
    if (!cliente) return;
    if (descrizione.trim().length < 20) {
      toast.error("La descrizione deve essere di almeno 20 caratteri.");
      return;
    }

    setSubmitting(true);
    try {
      const payload: Record<string, any> = {
        cliente_id: cliente.cliente_id,
        company_id: cliente.company_id,
        tipo,
        urgenza,
        descrizione: descrizione.trim(),
        stato: "inviata",
      };
      if (selectedImpianto) {
        payload.impianto_id = selectedImpianto;
      }

      const { error } = await (supabase as any).from("portale_richieste").insert(payload);
      if (error) throw error;

      toast.success("Richiesta inviata!");
      navigate(`/portale/${token}`, { replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Errore durante l'invio della richiesta.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#1E3A5F] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!valido || !cliente) return null;

  const selectedImpiantoObj = impianti.find((i: any) => i.id === selectedImpianto);

  return (
    <PortaleLayout cliente={cliente} token={token!}>
      <div className="p-4 space-y-5">
        {/* Back + Title */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={() => (step > 1 ? setStep(step - 1) : navigate(-1))}
            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Indietro"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Nuova Richiesta</h1>
            <p className="text-xs text-gray-500">Passo {step} di 3</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={cn(
                "h-1.5 flex-1 rounded-full transition-all duration-300",
                s <= step ? "bg-orange-500" : "bg-gray-200"
              )}
            />
          ))}
        </div>

        {/* Step 1: Impianto */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Seleziona impianto</h2>

            {/* Nessun impianto */}
            <button
              onClick={() => setSelectedImpianto(null)}
              className={cn(
                "w-full text-left p-4 rounded-xl border-2 transition-all duration-150",
                selectedImpianto === null
                  ? "border-orange-500 bg-orange-50"
                  : "border-gray-200 bg-white"
              )}
            >
              <p className="font-medium text-gray-900 text-sm">Nessun impianto specifico</p>
              <p className="text-xs text-gray-500 mt-0.5">La richiesta non è collegata a un impianto</p>
            </button>

            {impianti.map((imp: any) => (
              <button
                key={imp.id}
                onClick={() => setSelectedImpianto(imp.id)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border-2 transition-all duration-150 flex items-start gap-3",
                  selectedImpianto === imp.id
                    ? "border-orange-500 bg-orange-50"
                    : "border-gray-200 bg-white"
                )}
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Wrench className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {imp.tipo_impianto ?? "Impianto"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {[imp.marca, imp.modello].filter(Boolean).join(" — ") || "Nessun dettaglio"}
                  </p>
                  {imp.matricola && (
                    <p className="text-[10px] text-gray-400 mt-0.5">Matr. {imp.matricola}</p>
                  )}
                </div>
              </button>
            ))}

            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 text-base font-semibold rounded-xl"
              onClick={() => setStep(2)}
            >
              Avanti <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 2: Tipo, Urgenza, Descrizione */}
        {step === 2 && (
          <div className="space-y-5">
            {/* Tipo */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Tipo di richiesta</h2>
              <div className="grid grid-cols-2 gap-2">
                {TIPO_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTipo(opt.value)}
                    className={cn(
                      "p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all duration-150 min-h-[80px]",
                      tipo === opt.value
                        ? "border-orange-500 bg-orange-50"
                        : "border-gray-200 bg-white"
                    )}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <span className="text-xs font-semibold text-gray-800">{opt.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Urgenza */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Urgenza</h2>
              <div className="flex gap-2">
                {URGENZA_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setUrgenza(opt.value)}
                    className={cn(
                      "flex-1 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all duration-150",
                      urgenza === opt.value ? opt.activeColor : opt.color
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Descrizione */}
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-2">
                Descrizione <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={descrizione}
                onChange={(e) => setDescrizione(e.target.value)}
                placeholder="Descrivi il problema o la richiesta in dettaglio (min. 20 caratteri)..."
                className="min-h-[120px] resize-none rounded-xl border-gray-200 focus:border-orange-500 text-sm"
              />
              <p className={cn(
                "text-xs mt-1",
                descrizione.length < 20 ? "text-gray-400" : "text-green-600"
              )}>
                {descrizione.length}/20 caratteri minimi
              </p>
            </div>

            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 text-base font-semibold rounded-xl"
              onClick={() => {
                if (!tipo) { toast.error("Seleziona il tipo di richiesta."); return; }
                if (descrizione.trim().length < 20) { toast.error("La descrizione deve essere di almeno 20 caratteri."); return; }
                setStep(3);
              }}
            >
              Avanti <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step 3: Riepilogo */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Riepilogo richiesta</h2>

            <Card className="border-0 shadow-sm bg-white rounded-xl">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-500">Impianto</span>
                  <span className="text-xs font-medium text-gray-900 text-right max-w-[60%]">
                    {selectedImpiantoObj
                      ? `${selectedImpiantoObj.tipo_impianto ?? ""} ${selectedImpiantoObj.marca ?? ""} ${selectedImpiantoObj.modello ?? ""}`.trim()
                      : "Nessun impianto specifico"}
                  </span>
                </div>
                <div className="border-t border-gray-100" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Tipo</span>
                  <span className="text-xs font-medium text-gray-900">{tipo}</span>
                </div>
                <div className="border-t border-gray-100" />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Urgenza</span>
                  <span className="text-xs font-medium text-gray-900 capitalize">{urgenza}</span>
                </div>
                <div className="border-t border-gray-100" />
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Descrizione</span>
                  <p className="text-xs text-gray-800 leading-relaxed">{descrizione}</p>
                </div>
              </CardContent>
            </Card>

            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white h-12 text-base font-semibold rounded-xl"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Invio in corso...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4 mr-2" /> Invia Richiesta</>
              )}
            </Button>
          </div>
        )}
      </div>
    </PortaleLayout>
  );
}
