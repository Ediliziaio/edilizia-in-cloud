import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { FirmaDigitaleCanvas } from "@/components/firma/FirmaDigitaleCanvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  MapPin,
  User,
  FileText,
  CheckCircle2,
  Loader2,
  AlertCircle,
  PenTool,
  ClipboardList,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type Step = "riepilogo" | "note" | "firma";

type StatoChiusura = "completato" | "in_lavorazione";

interface TicketData {
  id: string;
  subject: string;
  company_id: string;
  customer_id: string | null;
  assigned_to: string | null;
  impianto_id: string | null;
  indirizzo_intervento: string | null;
  customer?: { first_name: string | null; last_name: string | null } | null;
}

interface GpsCoords {
  lat: number;
  lng: number;
  accuracy: number;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function getGpsPosition(): Promise<GpsCoords | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => resolve(null),
      { timeout: 5000, maximumAge: 60000 }
    );
  });
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEPS: { key: Step; label: string; icon: React.ReactNode }[] = [
  { key: "riepilogo", label: "Riepilogo", icon: <Info className="h-4 w-4" /> },
  { key: "note", label: "Note chiusura", icon: <ClipboardList className="h-4 w-4" /> },
  { key: "firma", label: "Firma", icon: <PenTool className="h-4 w-4" /> },
];

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const isActive = step.key === current;
        const isDone = idx < currentIdx;
        return (
          <div key={step.key} className="flex items-center">
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
                isActive
                  ? "bg-[#1E3A5F] text-white"
                  : isDone
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-400"
              )}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.icon}
              {step.label}
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-0.5 w-6 mx-1",
                  isDone ? "bg-green-300" : "bg-gray-200"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChiusuraIntervento() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, effectiveCompany } = useAuth();

  // Step state
  const [step, setStep] = useState<Step>("riepilogo");

  // Form state
  const [noteChiusura, setNoteChiusura] = useState("");
  const [oreLavoro, setOreLavoro] = useState<string>("");
  const [statoChiusura, setStatoChiusura] = useState<StatoChiusura>("completato");
  const [firmaDataUrl, setFirmaDataUrl] = useState<string | null>(null);

  // ── Query ticket ──────────────────────────────────────────────────────────
  const { data: ticket, isLoading } = useQuery({
    queryKey: ["ticket-chiusura", id],
    queryFn: async () => {
      if (!id) throw new Error("ID mancante");
      const { data, error } = await supabase
        .from("tickets")
        .select(
          "id, subject, company_id, customer_id, assigned_to, impianto_id, indirizzo_intervento, customer:profiles!tickets_customer_id_fkey(first_name, last_name)"
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as TicketData;
    },
    enabled: !!id,
  });

  // ── Query existing rapportino ─────────────────────────────────────────────
  const { data: rapportiniEsistenti = [] } = useQuery({
    queryKey: ["rapportini-chiusura", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("rapportini_intervento")
        .select("id, numero, stato, firma_tecnico_url")
        .eq("ticket_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        numero: number;
        stato: string;
        firma_tecnico_url: string | null;
      }>;
    },
    enabled: !!id,
  });

  // ── Submit mutation ───────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!firmaDataUrl) throw new Error("Firma non presente");
      if (!id) throw new Error("ID intervento mancante");
      const companyId = effectiveCompany?.id ?? ticket?.company_id;
      if (!companyId) throw new Error("Azienda non trovata");

      // 1. GPS (non bloccante)
      const gps = await getGpsPosition();

      // 2. Determine or create rapportino
      let rapportinoId: string;
      const nextNumero = 1;

      if (rapportiniEsistenti.length > 0) {
        // Use the most recent one
        rapportinoId = rapportiniEsistenti[0].id;
      } else {
        // Insert new rapportino
        const { data: newRap, error: insErr } = await (supabase as any)
          .from("rapportini_intervento")
          .insert({
            ticket_id: id,
            company_id: companyId,
            tecnico_id: user?.id ?? null,
            numero: nextNumero,
            data_intervento: new Date().toISOString(),
            descrizione: noteChiusura.trim() || "Intervento completato",
            ore_lavoro: parseFloat(oreLavoro) || 0,
            stato: "bozza",
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        rapportinoId = newRap.id;
      }

      // 3. Upload firma to Supabase Storage
      const fileName = `${id}-${rapportinoId}.png`;
      const base64Data = firmaDataUrl.replace(/^data:image\/png;base64,/, "");
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/png" });

      const { error: uploadError } = await supabase.storage
        .from("firme-tecnici")
        .upload(fileName, blob, { upsert: true, contentType: "image/png" });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("firme-tecnici")
        .getPublicUrl(fileName);

      const firmaUrl = urlData.publicUrl;

      // 4. Update rapportino
      const { error: updateErr } = await (supabase as any)
        .from("rapportini_intervento")
        .update({
          firma_tecnico_url: firmaUrl,
          firmato_tecnico_at: new Date().toISOString(),
          note_chiusura: noteChiusura.trim() || null,
          ore_lavoro_effettive: parseFloat(oreLavoro) || null,
          coordinatore_gps: gps ? JSON.stringify(gps) : null,
          stato_chiusura: "firmato",
          stato: "firmato",
        })
        .eq("id", rapportinoId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast.success("Intervento firmato con successo");
      navigate(`/azienda/assistenza/${id}`);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Errore durante il salvataggio della firma");
    },
  });

  // ── Loading / error states ────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-4 max-w-2xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="p-6 text-center py-20">
        <AlertCircle className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Intervento non trovato</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/azienda/assistenza?tipo=intervento")}>
          Torna agli interventi
        </Button>
      </div>
    );
  }

  const customerName = ticket.customer
    ? [ticket.customer.first_name, ticket.customer.last_name].filter(Boolean).join(" ")
    : null;

  // ── Navigation helpers ─────────────────────────────────────────────────────

  const goNext = () => {
    if (step === "riepilogo") setStep("note");
    else if (step === "note") setStep("firma");
  };

  const goBack = () => {
    if (step === "note") setStep("riepilogo");
    else if (step === "firma") setStep("note");
    else navigate(`/azienda/assistenza/${id}`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={goBack}
          className="mt-0.5 -ml-2"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">Chiusura Intervento</h1>
          <p className="text-sm text-gray-500 mt-0.5 line-clamp-1">{ticket.subject}</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="overflow-x-auto">
        <StepIndicator current={step} />
      </div>

      {/* ── Step 1: Riepilogo ── */}
      {step === "riepilogo" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Info className="h-4 w-4 text-[#1E3A5F]" />
              Riepilogo Intervento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2.5">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Oggetto</p>
                  <p className="font-medium text-gray-800">{ticket.subject}</p>
                </div>
                {customerName && (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400 shrink-0" />
                    <p className="text-gray-700">{customerName}</p>
                  </div>
                )}
                {ticket.indirizzo_intervento && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                    <p className="text-gray-700">{ticket.indirizzo_intervento}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                  <p className="text-gray-700">
                    {rapportiniEsistenti.length > 0
                      ? `${rapportiniEsistenti.length} rapportino/i esistente/i`
                      : "Nessun rapportino — verrà creato automaticamente"}
                  </p>
                </div>
              </div>

              {rapportiniEsistenti.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide">Rapportini</p>
                  {rapportiniEsistenti.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between py-2 px-3 bg-white border rounded-lg"
                    >
                      <span className="text-sm font-medium text-gray-700">
                        Rapportino #{r.numero}
                      </span>
                      <div className="flex items-center gap-2">
                        {r.firma_tecnico_url && (
                          <Badge className="bg-green-100 text-green-700 text-xs">
                            Già firmato
                          </Badge>
                        )}
                        <Badge
                          className={cn(
                            "text-xs",
                            r.stato === "firmato"
                              ? "bg-green-100 text-green-700"
                              : r.stato === "fatturato"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-gray-100 text-gray-600"
                          )}
                        >
                          {r.stato}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <Button onClick={goNext} className="gap-2 bg-[#1E3A5F] hover:bg-[#162d4a]">
                Avanti
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 2: Note chiusura ── */}
      {step === "note" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-[#1E3A5F]" />
              Note di Chiusura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Note */}
            <div className="space-y-1.5">
              <Label htmlFor="note_chiusura">Note di chiusura</Label>
              <Textarea
                id="note_chiusura"
                value={noteChiusura}
                onChange={(e) => setNoteChiusura(e.target.value)}
                placeholder="Descrivi i lavori eseguiti, problemi riscontrati, raccomandazioni..."
                rows={4}
              />
            </div>

            {/* Ore effettive */}
            <div className="space-y-1.5">
              <Label htmlFor="ore_lavoro_effettive">Ore di lavoro effettive</Label>
              <Input
                id="ore_lavoro_effettive"
                type="number"
                min="0"
                step="0.5"
                value={oreLavoro}
                onChange={(e) => setOreLavoro(e.target.value)}
                placeholder="es. 2.5"
                className="w-36"
              />
            </div>

            {/* Stato chiusura */}
            <div className="space-y-1.5">
              <Label htmlFor="stato_chiusura">Stato chiusura</Label>
              <Select
                value={statoChiusura}
                onValueChange={(v) => setStatoChiusura(v as StatoChiusura)}
              >
                <SelectTrigger className="w-56" id="stato_chiusura">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="completato">Completato</SelectItem>
                  <SelectItem value="in_lavorazione">In lavorazione</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={goBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Indietro
              </Button>
              <Button onClick={goNext} className="gap-2 bg-[#1E3A5F] hover:bg-[#162d4a]">
                Avanti — Firma
                <PenTool className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Step 3: Firma ── */}
      {step === "firma" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <PenTool className="h-4 w-4 text-[#1E3A5F]" />
              Firma Tecnico Digitale
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {firmaDataUrl ? (
              // Firma completata — show preview + conferma finale
              <div className="space-y-4">
                <div className="text-center space-y-2">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                  <p className="font-medium text-gray-800">Firma acquisita</p>
                </div>
                <div className="border rounded-lg overflow-hidden bg-gray-50 p-2">
                  <img loading="lazy"
                    src={firmaDataUrl}
                    alt="Anteprima firma"
                    className="max-h-28 mx-auto object-contain"
                  />
                </div>
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => setFirmaDataUrl(null)}
                    className="text-red-600 border-red-200 hover:bg-red-50"
                  >
                    Rifirma
                  </Button>
                  <Button
                    onClick={() => submitMutation.mutate()}
                    disabled={submitMutation.isPending}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    {submitMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    Conferma e salva
                  </Button>
                </div>
              </div>
            ) : (
              <FirmaDigitaleCanvas
                onFirmaCompleta={(dataUrl) => setFirmaDataUrl(dataUrl)}
                onAnnulla={goBack}
                interventoId={id}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
