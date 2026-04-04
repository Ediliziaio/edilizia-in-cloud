import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useShipmentToSite } from '@/hooks/warehouse/useShipmentToSite';
import { Camera, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface ShipmentItem {
  order_item_id: string;
  goods_receipt_id: string;
  qty: number;
  name: string;
}

interface ShipmentDetailPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  items: ShipmentItem[];
}

export function ShipmentDetailPanel({
  open,
  onOpenChange,
  orderId,
  items,
}: ShipmentDetailPanelProps) {
  const { createShipment, isCreating, uploadProgress } = useShipmentToSite();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [ddtNumber, setDdtNumber] = useState(`DT-${Date.now()}`);
  const [loadingPhoto, setLoadingPhoto] = useState<File | null>(null);
  const [loadingPhotoPreview, setLoadingPhotoPreview] = useState<string | null>(null);
  const [ddtPhoto, setDdtPhoto] = useState<File | null>(null);
  const [ddtPhotoPreview, setDdtPhotoPreview] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'loading' | 'ddt' | null>(null);
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);

  const startCamera = async (mode: 'loading' | 'ddt') => {
    try {
      if (streamRef) streamRef.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStreamRef(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraMode(mode);
    } catch (err) {
      console.error('Camera error:', err);
      toast.error('Impossibile accedere alla fotocamera. Verifica i permessi del browser.');
    }
  };

  const stopCamera = () => {
    if (streamRef) {
      streamRef.getTracks().forEach(t => t.stop());
      setStreamRef(null);
    }
    setCameraMode(null);
  };

  const handlePhotoSelect = (file: File, type: 'loading' | 'ddt') => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;
      if (type === 'loading') {
        setLoadingPhoto(file);
        setLoadingPhotoPreview(preview);
      } else {
        setDdtPhoto(file);
        setDdtPhotoPreview(preview);
      }
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (type: 'loading' | 'ddt') => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        const fileName = type === 'loading' ? `loading_${Date.now()}.jpg` : `ddt_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        handlePhotoSelect(file, type);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loadingPhoto) {
      toast.error('La foto del carico è obbligatoria');
      return;
    }

    try {
      await createShipment({
        order_id: orderId,
        items: items.map((item) => ({
          order_item_id: item.order_item_id,
          goods_receipt_id: item.goods_receipt_id,
          qty_shipped: item.qty,
        })),
        shipment_ddt_number: ddtNumber,
        loading_photo: loadingPhoto,
        shipment_ddt_photo: ddtPhoto || undefined,
      });

      // Reset form
      setDdtNumber(`DT-${Date.now()}`);
      setLoadingPhoto(null);
      setLoadingPhotoPreview(null);
      setDdtPhoto(null);
      setDdtPhotoPreview(null);
      stopCamera();
      onOpenChange(false);
    } catch (error) {
      console.error('Submit error:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) stopCamera(); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🚚 Carica Merce per Cantiere</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Riepilogo articoli */}
          <div className="bg-blue-50 p-4 rounded border border-blue-200">
            <h3 className="font-medium mb-2 text-sm">Articoli da spedire:</h3>
            <div className="space-y-1 text-sm">
              {items.map((item) => (
                <div key={item.order_item_id} className="flex justify-between">
                  <span>{item.name}</span>
                  <span className="font-medium">{item.qty} pz</span>
                </div>
              ))}
            </div>
          </div>

          {/* Numero DDT */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Numero DDT Trasporto *</label>
            <Input
              type="text"
              value={ddtNumber}
              onChange={(e) => setDdtNumber(e.target.value)}
              disabled={isCreating}
            />
          </div>

          {/* Foto Carico (OBBLIGATORIO) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">📷 Foto Carico *</label>

            {loadingPhotoPreview ? (
              <div className="relative w-full bg-gray-100 rounded border">
                <img src={loadingPhotoPreview} alt="Anteprima foto carico caricata" className="w-full h-auto rounded" />
                <button
                  type="button"
                  onClick={() => { setLoadingPhoto(null); setLoadingPhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded"
                  disabled={isCreating}
                  aria-label="Rimuovi foto carico"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraMode === 'loading' ? stopCamera() : startCamera('loading')}
                  disabled={isCreating}
                >
                  <Camera size={16} className="mr-2" />
                  {cameraMode === 'loading' ? 'Chiudi' : 'Scatta foto'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isCreating}
                >
                  Seleziona file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) handlePhotoSelect(file, 'loading');
                  }}
                />
              </div>
            )}

            {cameraMode === 'loading' && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={() => handleCameraCapture('loading')} disabled={isCreating} className="w-full">
                  Scatta foto carico
                </Button>
              </div>
            )}
          </div>

          {/* Foto DDT Trasporto (OPZIONALE) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">📷 Foto DDT Trasporto (opzionale)</label>

            {ddtPhotoPreview ? (
              <div className="relative w-full bg-gray-100 rounded border">
                <img src={ddtPhotoPreview} alt="Anteprima foto DDT trasporto caricata" className="w-full h-auto rounded" />
                <button
                  type="button"
                  onClick={() => { setDdtPhoto(null); setDdtPhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded"
                  disabled={isCreating}
                  aria-label="Rimuovi foto DDT"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraMode === 'ddt' ? stopCamera() : startCamera('ddt')}
                  disabled={isCreating}
                >
                  <Camera size={16} className="mr-2" />
                  {cameraMode === 'ddt' ? 'Chiudi' : 'Scatta foto DDT'}
                </Button>
              </div>
            )}

            {cameraMode === 'ddt' && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={() => handleCameraCapture('ddt')} disabled={isCreating} className="w-full">
                  Scatta foto DDT
                </Button>
              </div>
            )}
          </div>

          {/* Upload Progress */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-600">Upload... {uploadProgress}%</div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {/* Bottoni */}
          <div className="flex gap-2 justify-end pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => { stopCamera(); onOpenChange(false); }}
              disabled={isCreating}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isCreating || !loadingPhoto}>
              {isCreating ? 'Spedendo...' : '✓ Parte per cantiere'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
