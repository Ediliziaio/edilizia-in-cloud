import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScanLine, Flashlight, FlashlightOff, Keyboard, Camera, AlertCircle, Loader2, Pause, Play } from "lucide-react";
import { useBatchScannerCamera } from "@/hooks/warehouse/useBatchScannerCamera";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

interface BarcodeScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (result: string) => void;
}

export function BarcodeScanner(props: BarcodeScannerProps) {
  return props.open ? <BarcodeScannerSession {...props} /> : null;
}

function BarcodeScannerSession({ open, onOpenChange, onScan }: BarcodeScannerProps) {
  const t = useT();
  const [manualMode, setManualMode] = useState(false);
  const [paused, setPaused] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const manualInputRef = useRef<HTMLInputElement>(null);
  const consumed = useRef(false);
  const acceptCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code || consumed.current) return;
    consumed.current = true;
    onScan(code);
    onOpenChange(false);
  }, [onOpenChange, onScan]);
  const { videoRef, cameraError, cameraReady, isStarting, torchOn, torchSupported, toggleTorch, handleTapFocus } = useBatchScannerCamera({
    open, manualMode, paused, onScan: acceptCode, onCameraError: () => setManualMode(true),
  });

  useEffect(() => {
    if (!manualMode) return;
    const timer = setTimeout(() => manualInputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [manualMode]);

  const submit = (event: FormEvent) => { event.preventDefault(); acceptCode(manualCode); };

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" className="h-[100dvh] max-h-[100dvh] sm:h-[90dvh] sm:max-h-[90dvh] flex flex-col gap-0 overflow-hidden p-0 [&>div[aria-hidden=true]]:hidden [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:top-1 [&>button]:right-1 [&>button]:text-white">
      <SheetHeader className="bg-[#193b64] text-white pl-4 pr-14 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-left shrink-0">
        <SheetTitle className="text-white flex items-center gap-2 text-base"><ScanLine className="h-5 w-5 text-amber-400" />{t("Scansiona codice")}</SheetTitle>
        <SheetDescription className="text-blue-100 text-xs">{t("Inquadra un codice a barre o QR. Puoi anche digitarlo.")}</SheetDescription>
      </SheetHeader>
      {manualMode ? <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <form onSubmit={submit} className="space-y-4" aria-label={t("Inserimento codice scanner")}>
          {cameraError && <Alert className="border-amber-200 bg-amber-50 text-amber-900"><AlertCircle className="h-4 w-4" /><AlertDescription>{t("{cameraError} Puoi riprovare o digitare il codice.", { cameraError: String(cameraError ?? "") })}</AlertDescription></Alert>}
          <div className="space-y-2"><Label htmlFor="barcode-manual">{t("Codice manuale")}</Label><Input ref={manualInputRef} id="barcode-manual" value={manualCode} onChange={event => setManualCode(event.target.value)} placeholder={t("Digita o incolla QR/barcode...")} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="search" className="h-12 text-base font-mono" /></div>
          <Button type="submit" disabled={!manualCode.trim()} className="h-12 w-full gap-2"><ScanLine className="h-4 w-4" />{t("Cerca codice")}</Button>
          <Button type="button" variant="outline" onClick={() => {setPaused(false);setManualMode(false);}} className="h-12 w-full gap-2"><Camera className="h-4 w-4" />{cameraError ? t("Riprova fotocamera") : t("Torna alla fotocamera")}</Button>
        </form>
      </div> : <>
        <div className="flex-1 min-h-0 relative bg-slate-950 overflow-hidden">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover cursor-pointer" autoPlay muted playsInline onClick={handleTapFocus} aria-label={t("Anteprima fotocamera scanner")} />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none"><div className="relative w-[80%] max-w-sm h-[45%] rounded-2xl border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" /></div>
          {(isStarting || paused || !cameraReady) && <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center gap-3 px-4 text-white text-center" role="status">{isStarting ? <Loader2 className="h-8 w-8 animate-spin" /> : <ScanLine className="h-8 w-8 text-amber-400" />}<p>{paused ? t("Scansione in pausa") : t("Avvio fotocamera…")}</p></div>}
          <p className="absolute bottom-4 inset-x-4 text-center text-xs text-white bg-black/60 rounded-xl p-2 pointer-events-none">{t("Inquadra un codice alla volta. Tocca l’immagine per mettere a fuoco.")}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3 border-t shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]" aria-label={t("Comandi scanner")}>
          <Button type="button" variant="outline" onClick={() => {setPaused(false);setManualMode(true);}} aria-label={t("Inserimento manuale")} className="h-12 px-2 text-xs gap-1.5"><Keyboard className="h-4 w-4" />{t("Digita codice")}</Button>
          <Button type="button" variant="outline" onClick={toggleTorch} disabled={!torchSupported || paused || isStarting} aria-label={torchOn ? t("Spegni torcia") : t("Accendi torcia")} aria-pressed={torchOn} className="h-12 px-2 text-xs gap-1.5">{torchOn ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />}{t("Luce")}</Button>
          <Button type="button" variant={paused ? "default" : "outline"} onClick={() => setPaused(value => !value)} aria-pressed={paused} className="h-12 px-2 text-xs gap-1.5">{paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{paused ? t("Riprendi") : t("Pausa")}</Button>
        </div>
      </>}
    </SheetContent>
  </Sheet>;
}
