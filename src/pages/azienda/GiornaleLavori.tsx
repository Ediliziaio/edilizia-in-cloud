import { useState, useRef } from "react";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { UpgradeScopriWall } from "@/components/subscription/UpgradeScopriBanner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useGPS } from "@/hooks/useGPS";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { NotebookPen, Plus, MapPin, Camera, Loader2, Sun, Cloud, CloudRain, Snowflake, Wind, Download, X } from "lucide-react";
import { format } from "date-fns";
import { GiornaleCard } from "@/components/orders/GiornaleCard";
import { EntityCustomFieldsSection } from "@/components/shared/EntityCustomFieldsSection";
import { PrintPreviewModal } from "@/components/shared/PrintPreviewModal";

const METEO_OPTIONS = [
  { value: "soleggiato", label: "Soleggiato", icon: Sun, color: "text-yellow-500" },
  { value: "nuvoloso", label: "Nuvoloso", icon: Cloud, color: "text-slate-500" },
  { value: "pioggia", label: "Pioggia", icon: CloudRain, color: "text-blue-500" },
  { value: "neve", label: "Neve", icon: Snowflake, color: "text-sky-400" },
  { value: "vento forte", label: "Vento", icon: Wind, color: "text-teal-500" },
];

interface FotoPreview {
  file: File;
  preview: string;
}

export default function GiornaleLavori() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { isScopriPlan } = useSubscriptionLimits();
  const [searchParams] = useSearchParams();
  const { lat: gpsLat, lng: gpsLng, status: gpsStatus, requestPosition } = useGPS(companyId || null);

  const [selectedOrderId, setSelectedOrderId] = useState(searchParams.get("ordine") || "");
  const [isExporting, setIsExporting] = useState(false);
  const [printHtml, setPrintHtml] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasFirma, setHasFirma] = useState(false);
  const [visibileCliente, setVisibileCliente] = useState(true);
  const [fotoPreview, setFotoPreview] = useState<FotoPreview[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState({
    data_lavori: format(new Date(), "yyyy-MM-dd"),
    condizioni_meteo: "soleggiato",
    lavorazioni_eseguite: "",
    materiali_utilizzati: "",
    personale_presente: 1,
    note: "",
    avanzamento_percentuale: 0,
    temperatura: "",
    firmato_da: "",
  });

  // Fetch orders — filter out any with missing/empty id to prevent Radix SelectItem crash
  const { data: rawOrders = [] } = useQuery({
    queryKey: ["orders-attivi", companyId],
    queryFn: async () => {
      // 2026-05-27 (UX audit fix): rimosso .limit(50) — l'impresa con 50+
      // cantieri vedeva il 51° in poi sparire dal dropdown senza errore
      // visibile, impossibile registrare giornale lavori su cantieri vecchi.
      // Alzato a 500: copre tutte le imprese reali; per chi supera, va aggiunto
      // un combobox cercabile (TODO).
      const { data } = await supabase
        .from("orders")
        .select("id, description, order_code")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false })
        .limit(500);
      return data || [];
    },
    enabled: !!companyId,
  });
  const orders = rawOrders.filter((o: any) => o?.id && typeof o.id === "string" && o.id.length > 0);

  // Fetch giornale entries
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["giornale-lavori", companyId, selectedOrderId],
    queryFn: async () => {
      let q = supabase
        .from("giornale_lavori")
        .select("*, giornale_foto(id, url)")
        .eq("company_id", companyId!)
        .order("data_lavori", { ascending: false })
        .limit(200);
      if (selectedOrderId) q = q.eq("order_id", selectedOrderId);
      const { data } = await q;
      return data || [];
    },
    enabled: !!companyId,
  });

  const resetForm = () => {
    setFormData({
      data_lavori: format(new Date(), "yyyy-MM-dd"),
      condizioni_meteo: "soleggiato",
      lavorazioni_eseguite: "",
      materiali_utilizzati: "",
      personale_presente: 1,
      note: "",
      avanzamento_percentuale: 0,
      temperatura: "",
      firmato_da: "",
    });
    // Revoke object URLs to prevent memory leaks before clearing state
    setFotoPreview((prev) => {
      prev.forEach((f) => URL.revokeObjectURL(f.preview));
      return [];
    });
    setHasFirma(false);
    setVisibileCliente(true);
    setEditingEntry(null);
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const openNew = () => {
    resetForm();
    setSheetOpen(true);
  };

  // Canvas drawing for firma — with HiDPI scaling so coordinates match on Retina/mobile screens
  const getCanvasPos = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    canvas: HTMLCanvasElement,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e, canvas);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getCanvasPos(e, canvas);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    setHasFirma(true);
  };

  const stopDrawing = () => setIsDrawing(false);

  const clearFirma = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasFirma(false);
  };

  // Handle foto selection
  const handleFotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const previews: FotoPreview[] = files.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setFotoPreview((prev) => [...prev, ...previews]);
  };

  const removeFoto = (index: number) => {
    setFotoPreview((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Save mutation
  const saveEntry = useMutation({
    mutationFn: async () => {
      if (!selectedOrderId) throw new Error("Seleziona un ordine");
      if (!formData.lavorazioni_eseguite.trim()) throw new Error("Le lavorazioni eseguite sono obbligatorie");

      // Get firma as base64 if present
      let firmaBase64: string | undefined;
      if (hasFirma && canvasRef.current) {
        firmaBase64 = canvasRef.current.toDataURL("image/png");
      }

      // Get GPS if available
      const lat = gpsStatus === "success" ? gpsLat : undefined;
      const lng = gpsStatus === "success" ? gpsLng : undefined;

      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;

      // Insert giornale entry
      const { data: entry, error: entryError } = await supabase
        .from("giornale_lavori")
        .insert({
          company_id: companyId,
          order_id: selectedOrderId,
          ...formData,
          personale_presente: Number(formData.personale_presente),
          avanzamento_percentuale: Number(formData.avanzamento_percentuale),
          latitude: lat,
          longitude: lng,
          firma_capocantiere: firmaBase64,
          firmato_da: formData.firmato_da || null,
          firmato_il: hasFirma ? new Date().toISOString() : null,
          visibile_cliente: visibileCliente,
          created_by: userId,
        })
        .select()
        .single();

      if (entryError) throw new Error(entryError.message);

      // Upload photos
      for (const foto of fotoPreview) {
        const fileName = `${companyId}/${entry.id}/${Date.now()}_${foto.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("giornale-foto")
          .upload(fileName, foto.file);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from("giornale-foto")
            .getPublicUrl(fileName);

          await supabase.from("giornale_foto").insert({
            giornale_id: entry.id,
            company_id: companyId,
            storage_path: fileName,
            url: urlData.publicUrl,
            latitude: lat,
            longitude: lng,
          });
        }
      }

      return entry;
    },
    onSuccess: (entry) => {
      toast.success("Report giornaliero salvato!");
      queryClient.invalidateQueries({ queryKey: ["giornale-lavori", companyId, selectedOrderId] });
      // Keep sheet open to allow filling in custom fields for the newly saved entry
      setEditingEntry(entry);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleExportPdf = async () => {
    if (!companyId) return;
    setIsExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-giornale-pdf", {
        body: { company_id: companyId, ...(selectedOrderId ? { order_id: selectedOrderId } : {}) },
      });
      if (error) {
        const detail = error.context ? await error.context.json?.().catch((): null => null) : null;
        throw new Error(detail?.error || error.message || "Errore nella generazione del PDF");
      }
      if (!data?.html) throw new Error("Nessun contenuto generato");
      setPrintHtml(data.html);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Errore nell'esportazione");
    } finally {
      setIsExporting(false);
    }
  };

  if (isScopriPlan) return <UpgradeScopriWall type="generic" inline />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-4 shadow-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200">
              <NotebookPen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-slate-950 sm:text-2xl">Giornale dei Lavori</h1>
              <p className="text-xs text-slate-600 sm:text-sm">Diario ufficiale del cantiere</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" size="sm" className="border-slate-200 bg-white/80 hover:bg-white" onClick={handleExportPdf} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span className="hidden sm:inline ml-1">{isExporting ? "Generazione..." : "Esporta PDF"}</span>
            </Button>
            <Button size="sm" className="bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600" onClick={openNew}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Report</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Order selector */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row">
        <Select
          value={selectedOrderId || "__all__"}
          onValueChange={(v) => setSelectedOrderId(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="flex-1 sm:max-w-xs">
            <SelectValue placeholder="Tutti gli ordini" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Tutti gli ordini</SelectItem>
            {orders.map((o: any) => (
              <SelectItem key={o.id} value={o.id}>
                {o.order_code ? `#${o.order_code} — ` : ""}{o.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {gpsStatus === "success" && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 text-green-500" />
            <span>GPS attivo</span>
          </div>
        )}
      </div>

      {/* Entries list */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : entries.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <NotebookPen className="h-16 w-16 text-muted-foreground/40" />
            <div>
              <p className="font-semibold text-lg">Nessun report giornaliero</p>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedOrderId ? "Nessun report per questo ordine." : "Seleziona un ordine e aggiungi il primo report."}
              </p>
            </div>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Aggiungi report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry: any) => (
            <GiornaleCard
              key={entry.id}
              entry={entry}
            />
          ))}
        </div>
      )}

      {/* ───── Sheet inserimento ───── */}
      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) resetForm(); setSheetOpen(open); }}>
        <SheetContent side="bottom" className="h-[95vh] overflow-y-auto">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <NotebookPen className="h-5 w-5" />
              {editingEntry?.id ? "Report salvato — campi personalizzati" : "Report Giornaliero"}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-5 pb-8">
            {/* Ordine (se non già selezionato) */}
            {!selectedOrderId && (
              <div className="space-y-2">
                <Label>Cantiere / Ordine *</Label>
                <Select value={selectedOrderId || undefined} onValueChange={setSelectedOrderId}>
                  <SelectTrigger><SelectValue placeholder="Seleziona ordine" /></SelectTrigger>
                  <SelectContent>
                    {orders.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.order_code ? `#${o.order_code} — ` : ""}{o.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Data */}
            <div className="space-y-2">
              <Label>Data lavori</Label>
              <Input
                type="date"
                value={formData.data_lavori}
                onChange={(e) => setFormData((p) => ({ ...p, data_lavori: e.target.value }))}
              />
            </div>

            {/* Meteo */}
            <div className="space-y-2">
              <Label>Condizioni meteo</Label>
              <div className="flex flex-wrap gap-2">
                {METEO_OPTIONS.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setFormData((p) => ({ ...p, condizioni_meteo: m.value }))}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-colors ${
                        formData.condizioni_meteo === m.value
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${m.color}`} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Temperatura */}
            <div className="space-y-2">
              <Label>Temperatura (opzionale)</Label>
              <Input
                placeholder="es. 18°C"
                value={formData.temperatura}
                onChange={(e) => setFormData((p) => ({ ...p, temperatura: e.target.value }))}
              />
            </div>

            {/* Lavorazioni */}
            <div className="space-y-2">
              <Label>Lavorazioni eseguite oggi *</Label>
              <Textarea
                placeholder="Descrivi le attività svolte nella giornata..."
                value={formData.lavorazioni_eseguite}
                onChange={(e) => setFormData((p) => ({ ...p, lavorazioni_eseguite: e.target.value }))}
                rows={4}
                className="resize-none"
              />
            </div>

            {/* Materiali */}
            <div className="space-y-2">
              <Label>Materiali utilizzati</Label>
              <Textarea
                placeholder="Cemento, ferro, laterizi..."
                value={formData.materiali_utilizzati}
                onChange={(e) => setFormData((p) => ({ ...p, materiali_utilizzati: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Personale */}
            <div className="space-y-2">
              <Label>N. operai presenti</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="0"
                max="999"
                value={formData.personale_presente}
                onChange={(e) => setFormData((p) => ({ ...p, personale_presente: parseInt(e.target.value) || 0 }))}
                className="w-24"
              />
            </div>

            {/* Avanzamento */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Avanzamento lavori</Label>
                <span className="text-sm font-semibold text-primary">{formData.avanzamento_percentuale}%</span>
              </div>
              <Slider
                min={0}
                max={100}
                step={5}
                value={[formData.avanzamento_percentuale]}
                onValueChange={([v]) => setFormData((p) => ({ ...p, avanzamento_percentuale: v }))}
                className="py-2"
              />
            </div>

            {/* Note */}
            <div className="space-y-2">
              <Label>Note aggiuntive</Label>
              <Textarea
                placeholder="Problemi, osservazioni, comunicazioni..."
                value={formData.note}
                onChange={(e) => setFormData((p) => ({ ...p, note: e.target.value }))}
                rows={2}
                className="resize-none"
              />
            </div>

            {/* Visibilità cliente */}
            <div className="flex items-center gap-2 p-3 rounded-lg border">
              <input
                type="checkbox"
                id="visibile_cliente"
                checked={visibileCliente}
                onChange={(e) => setVisibileCliente(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="visibile_cliente" className="text-sm font-normal cursor-pointer">
                Visibile nel portale cliente
              </Label>
            </div>

            {/* GPS */}
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <MapPin className={`h-5 w-5 shrink-0 ${gpsStatus === "success" ? "text-green-500" : "text-muted-foreground"}`} />
              <div className="flex-1 min-w-0">
                {gpsStatus === "success" ? (
                  <p className="text-sm text-green-600 font-medium">
                    GPS: {gpsLat.toFixed(4)}, {gpsLng.toFixed(4)}
                  </p>
                ) : gpsStatus === "loading" ? (
                  <p className="text-sm text-muted-foreground">Rilevamento posizione...</p>
                ) : (
                  <p className="text-sm text-muted-foreground">Posizione GPS non rilevata</p>
                )}
              </div>
              {gpsStatus !== "success" && gpsStatus !== "loading" && (
                <Button variant="outline" size="sm" onClick={requestPosition}>Richiedi GPS</Button>
              )}
            </div>

            {/* Foto */}
            <div className="space-y-2">
              <Label>Foto cantiere</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handleFotoSelect}
              />
              {fotoPreview.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {fotoPreview.map((foto, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                      <img src={foto.preview} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeFoto(i)}
                        className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5"
                      >
                        <X className="h-3 w-3 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
              >
                <Camera className="h-4 w-4 mr-2" />
                {fotoPreview.length > 0 ? "Aggiungi altre foto" : "Scatta / Allega foto"}
              </Button>
            </div>

            {/* Firma */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Firma capocantiere</Label>
                {hasFirma && (
                  <Button variant="ghost" size="sm" className="h-9 md:h-6 text-xs" onClick={clearFirma}>
                    Cancella
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Input
                  placeholder="Nome e cognome firmatario"
                  value={formData.firmato_da}
                  onChange={(e) => setFormData((p) => ({ ...p, firmato_da: e.target.value }))}
                />
                <div className="border rounded-lg overflow-hidden bg-white">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={120}
                    className="w-full touch-none cursor-crosshair"
                    style={{ maxHeight: "120px" }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                </div>
                {!hasFirma && (
                  <p className="text-xs text-muted-foreground text-center">Firma nello spazio sopra</p>
                )}
              </div>
            </div>

            {/* Custom fields — shown after save when entry has an id */}
            {editingEntry?.id && (
              <div className="border rounded-lg p-3">
                <EntityCustomFieldsSection
                  entityType="giornale_lavori"
                  entityId={editingEntry.id}
                />
              </div>
            )}

            {/* Hint se ordine non selezionato */}
            {!selectedOrderId && !editingEntry?.id && (
              <p className="text-xs text-amber-600 text-center">
                Seleziona un cantiere prima di salvare.
              </p>
            )}

            {/* Save button / Close button */}
            {editingEntry?.id ? (
              <Button
                className="w-full"
                size="lg"
                variant="outline"
                onClick={() => { setSheetOpen(false); resetForm(); }}
              >
                Chiudi
              </Button>
            ) : (
              <Button
                className="w-full"
                size="lg"
                onClick={() => saveEntry.mutate()}
                disabled={saveEntry.isPending || !formData.lavorazioni_eseguite.trim() || !selectedOrderId}
              >
                {saveEntry.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvataggio in corso...</>
                ) : (
                  "Salva report giornaliero"
                )}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {printHtml && (
        <PrintPreviewModal
          htmlContent={printHtml}
          fileName="giornale-lavori"
          title="Giornale dei Lavori"
          open={!!printHtml}
          onOpenChange={(open) => { if (!open) setPrintHtml(null); }}
        />
      )}

      {/* Mobile FAB — fixed above bottom nav */}
      <button
        onClick={openNew}
        className="md:hidden fixed bottom-20 right-4 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 active:scale-95 transition-all"
        aria-label="Nuovo report giornaliero"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <Plus className="h-7 w-7" aria-hidden="true" />
      </button>
    </div>
  );
}
