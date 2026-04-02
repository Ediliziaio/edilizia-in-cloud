import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RenderConfigForm, type RenderConfig } from "@/components/render/RenderConfigForm";
import { RenderCreditsWidget } from "@/components/render/RenderCreditsWidget";
import { toast } from "sonner";
import { ArrowLeft, Upload, Image, Loader2, Zap } from "lucide-react";

const DEFAULT_CONFIG: RenderConfig = {
  materiale: "pvc",
  apertura: "battente",
  colore: "grigio-antracite",
  vetro: "basso_emissivo",
  stile_ambiente: "moderno",
  larghezza: 120,
  altezza: 150,
  numero_ante: 2,
  note_libere: "",
};

export default function RenderNew() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [config, setConfig] = useState<RenderConfig>(DEFAULT_CONFIG);
  const fileRef = useRef<HTMLInputElement>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Nessuna azienda selezionata");
      if (!photo) throw new Error("Carica una foto prima di procedere");

      // 1. Upload foto originale
      const ext = photo.name.split(".").pop() ?? "jpg";
      const photoPath = `${companyId}/${Date.now()}_original.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("render-originals")
        .upload(photoPath, photo, { contentType: photo.type, upsert: true });
      if (upErr) throw new Error(`Upload foto fallito: ${upErr.message}`);

      // 2. Crea sessione render
      const { data: session, error: sessErr } = await supabase
        .from("render_sessions" as never)
        .insert({
          company_id: companyId,
          status: "pending",
          original_photo_url: photoPath,
          config,
        } as never)
        .select("id")
        .single();
      if (sessErr || !session) throw new Error("Creazione sessione fallita");
      const sessionId = (session as { id: string }).id;

      // 3. Invoca Edge Function
      const { data, error: fnErr } = await supabase.functions.invoke("generate-render", {
        body: { session_id: sessionId, config },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (data?.error) throw new Error(data.message ?? data.error);

      return { sessionId, resultUrl: data.result_url as string };
    },
    onSuccess: ({ sessionId }) => {
      toast.success("Render completato con successo!");
      queryClient.invalidateQueries({ queryKey: ["render-sessions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-credits", companyId] });
      queryClient.invalidateQueries({ queryKey: ["render-gallery", companyId] });
      navigate(`/azienda/render/gallery/${sessionId}`);
    },
    onError: (err: Error) => {
      if (err.message.includes("insufficient_credits")) {
        toast.error("Crediti render insufficienti. Acquista nuovi crediti.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File troppo grande (max 20 MB)");
      return;
    }
    setPhoto(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const isGenerating = generateMutation.isPending;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/azienda/render")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Nuovo render infissi</h1>
          <p className="text-sm text-muted-foreground">Carica la foto e configura gli infissi</p>
        </div>
        <RenderCreditsWidget />
      </div>

      {/* Step 1: Upload foto */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Upload className="h-4 w-4" />
            1. Foto facciata
          </CardTitle>
        </CardHeader>
        <CardContent>
          {photoPreview ? (
            <div className="relative">
              <img
                src={photoPreview}
                alt="Foto caricata"
                className="w-full max-h-64 object-cover rounded-lg"
              />
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => { setPhoto(null); setPhotoPreview(null); }}
                disabled={isGenerating}
              >
                Cambia foto
              </Button>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Image className="h-10 w-10 text-muted-foreground/40" />
              <div className="text-center">
                <p className="text-sm font-medium">Carica foto facciata</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WEBP · max 20 MB</p>
              </div>
              <Button variant="outline" size="sm" type="button">Sfoglia file</Button>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={isGenerating}
          />
        </CardContent>
      </Card>

      {/* Step 2: Configurazione */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-4 w-4" />
            2. Configura infissi
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RenderConfigForm value={config} onChange={setConfig} disabled={isGenerating} />
        </CardContent>
      </Card>

      {/* Generate button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate("/azienda/render")} disabled={isGenerating}>
          Annulla
        </Button>
        <Button
          size="lg"
          onClick={() => generateMutation.mutate()}
          disabled={isGenerating || !photo}
          className="gap-2"
        >
          {isGenerating ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Generazione in corso...</>
          ) : (
            <><Zap className="h-4 w-4" />Genera render AI</>
          )}
        </Button>
      </div>

      {isGenerating && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4 flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">Render in elaborazione...</p>
              <p className="text-xs text-muted-foreground">
                L&apos;AI sta modificando la foto. Può richiedere 30-90 secondi.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
