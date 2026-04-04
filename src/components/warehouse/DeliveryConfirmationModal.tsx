import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSiteDelivery } from '@/hooks/warehouse/useSiteDelivery';
import { Camera, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface DeliveryItem {
  name: string;
  qty: number;
}

interface DeliveryConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipmentId: string;
  orderId: string;
  items: DeliveryItem[];
}

export function DeliveryConfirmationModal({
  open,
  onOpenChange,
  shipmentId,
  orderId,
  items,
}: DeliveryConfirmationModalProps) {
  const { confirmDelivery, isConfirming, uploadProgress } = useSiteDelivery();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [receivedByName, setReceivedByName] = useState('');
  const [qualityStatus, setQualityStatus] = useState<'ok' | 'partial' | 'damaged'>('ok');
  const [quantityDelivered, setQuantityDelivered] = useState('');
  const [deliveryPhoto, setDeliveryPhoto] = useState<File | null>(null);
  const [deliveryPhotoPreview, setDeliveryPhotoPreview] = useState<string | null>(null);
  const [signaturePhoto, setSignaturePhoto] = useState<File | null>(null);
  const [signaturePhotoPreview, setSignaturePhotoPreview] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'delivery' | 'signature' | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);

  const startCamera = async (mode: 'delivery' | 'signature') => {
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

  const handlePhotoSelect = (file: File, type: 'delivery' | 'signature') => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;
      if (type === 'delivery') {
        setDeliveryPhoto(file);
        setDeliveryPhotoPreview(preview);
      } else {
        setSignaturePhoto(file);
        setSignaturePhotoPreview(preview);
      }
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (type: 'delivery' | 'signature') => {
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
        const fileName = type === 'delivery' ? `delivery_${Date.now()}.jpg` : `signature_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        handlePhotoSelect(file, type);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!receivedByName) { toast.error('Inserire il nome del ricevente'); return; }
    if (!deliveryPhoto) { toast.error('La foto di consegna è obbligatoria'); return; }
    if (!signaturePhoto) { toast.error('La firma digitale è obbligatoria'); return; }
    if (!quantityDelivered) { toast.error('Inserire la quantità consegnata'); return; }

    const qty = parseInt(quantityDelivered);
    if (isNaN(qty) || qty <= 0) { toast.error('Quantità non valida — deve essere maggiore di zero'); return; }

    try {
      await confirmDelivery({
        shipment_id: shipmentId,
        order_id: orderId,
        received_by_name: receivedByName,
        delivery_photo: deliveryPhoto,
        signature_photo: signaturePhoto,
        quality_status: qualityStatus,
        quantity_delivered: qty,
        delivery_notes: deliveryNotes || undefined,
      });

      // Reset form
      setReceivedByName('');
      setQualityStatus('ok');
      setQuantityDelivered('');
      setDeliveryPhoto(null);
      setDeliveryPhotoPreview(null);
      setSignaturePhoto(null);
      setSignaturePhotoPreview(null);
      setDeliveryNotes('');
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
          <DialogTitle>📦 Conferma Consegna al Cantiere</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Riepilogo articoli */}
          <div className="bg-green-50 p-4 rounded border border-green-200">
            <h3 className="font-medium mb-2 text-sm">Articoli spediti:</h3>
            <div className="space-y-1 text-sm">
              {items.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>{item.name}</span>
                  <span className="font-medium">{item.qty} pz</span>
                </div>
              ))}
            </div>
          </div>

          {/* Nome ricevente */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Nome ricevente *</label>
            <Input
              type="text"
              value={receivedByName}
              onChange={(e) => setReceivedByName(e.target.value)}
              placeholder="Es. Giovanni Rossi"
              disabled={isConfirming}
            />
          </div>

          {/* Quantità consegnata */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Quantità consegnata *</label>
            <Input
              type="number"
              min="1"
              value={quantityDelivered}
              onChange={(e) => setQuantityDelivered(e.target.value)}
              disabled={isConfirming}
            />
          </div>

          {/* Stato qualità */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Stato qualità *</label>
            <Select value={qualityStatus} onValueChange={(v: 'ok' | 'partial' | 'damaged') => setQualityStatus(v)}>
              <SelectTrigger disabled={isConfirming}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ok">✓ OK</SelectItem>
                <SelectItem value="partial">⚠️ Parziale</SelectItem>
                <SelectItem value="damaged">✗ Danneggiato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Foto Consegna (OBBLIGATORIO) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">📷 Foto Consegna *</label>

            {deliveryPhotoPreview ? (
              <div className="relative w-full bg-gray-100 rounded border">
                <img src={deliveryPhotoPreview} alt="Consegna" className="w-full h-auto rounded" />
                <button
                  type="button"
                  onClick={() => { setDeliveryPhoto(null); setDeliveryPhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded"
                  disabled={isConfirming}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraMode === 'delivery' ? stopCamera() : startCamera('delivery')}
                  disabled={isConfirming}
                >
                  <Camera size={16} className="mr-2" />
                  Scatta foto
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isConfirming}
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
                    if (file) handlePhotoSelect(file, 'delivery');
                  }}
                />
              </div>
            )}

            {cameraMode === 'delivery' && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={() => handleCameraCapture('delivery')} disabled={isConfirming} className="w-full">
                  Scatta foto consegna
                </Button>
              </div>
            )}
          </div>

          {/* Firma Digitale (OBBLIGATORIO) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">✍️ Firma Digitale *</label>

            {signaturePhotoPreview ? (
              <div className="relative w-full bg-gray-100 rounded border h-40">
                <img src={signaturePhotoPreview} alt="Firma" className="w-full h-full object-cover rounded" />
                <button
                  type="button"
                  onClick={() => { setSignaturePhoto(null); setSignaturePhotoPreview(null); }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded"
                  disabled={isConfirming}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraMode === 'signature' ? stopCamera() : startCamera('signature')}
                  disabled={isConfirming}
                >
                  <Camera size={16} className="mr-2" />
                  Scatta firma
                </Button>
              </div>
            )}

            {cameraMode === 'signature' && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <p className="text-xs text-gray-600">Firma sullo schermo e scatta</p>
                <video ref={videoRef} autoPlay playsInline className="w-full rounded border-2 border-dashed" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={() => handleCameraCapture('signature')} disabled={isConfirming} className="w-full">
                  Scatta firma
                </Button>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Note consegna</label>
            <Input
              type="text"
              value={deliveryNotes}
              onChange={(e) => setDeliveryNotes(e.target.value)}
              placeholder="Es. Merce in buone condizioni"
              disabled={isConfirming}
            />
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
              disabled={isConfirming}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isConfirming || !deliveryPhoto || !signaturePhoto}>
              {isConfirming ? 'Registrando...' : '✓ Conferma consegna'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
