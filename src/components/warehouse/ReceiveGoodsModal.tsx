import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useGoodsReceipt } from '@/hooks/warehouse/useGoodsReceipt';
import { Camera, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';

interface ReceiveGoodsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string;
  orderItemName?: string;
}

export function ReceiveGoodsModal({
  open,
  onOpenChange,
  orderItemId,
  orderItemName = 'Articolo',
}: ReceiveGoodsModalProps) {
  const { createGoodsReceipt, isCreating, uploadProgress } = useGoodsReceipt();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [quantityReceived, setQuantityReceived] = useState('');
  const [ddtNumber, setDdtNumber] = useState('');
  const [qualityStatus, setQualityStatus] = useState<'ok' | 'pending'>('ok');
  const [qualityNotes, setQualityNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [ddtPhoto, setDdtPhoto] = useState<File | null>(null);
  const [ddtPhotoPreview, setDdtPhotoPreview] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStreamRef(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraOpen(true);
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
    setCameraOpen(false);
  };

  const handlePhotoSelect = (file: File) => {
    setDdtPhoto(file);
    const reader = new FileReader();
    reader.onloadend = () => setDdtPhotoPreview(reader.result as string);
    reader.readAsDataURL(file);
    stopCamera();
  };

  const handleCameraCapture = () => {
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
        const file = new File([blob], `ddt_${Date.now()}.jpg`, { type: 'image/jpeg' });
        handlePhotoSelect(file);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!quantityReceived) {
      toast.error('Inserire la quantità ricevuta');
      return;
    }
    const qty = parseInt(quantityReceived);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Quantità non valida — deve essere maggiore di zero');
      return;
    }

    try {
      await createGoodsReceipt({
        order_item_id: orderItemId,
        quantity_received: qty,
        ddt_number: ddtNumber || undefined,
        ddt_photo: ddtPhoto || undefined,
        quality_check_status: qualityStatus,
        quality_notes: qualityNotes || undefined,
        notes: notes || undefined,
      });

      // Reset form
      setQuantityReceived('');
      setDdtNumber('');
      setQualityStatus('ok');
      setQualityNotes('');
      setNotes('');
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
          <DialogTitle>📦 Ricevi Merce — {orderItemName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quantità */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Quantità ricevuta *</label>
            <Input
              type="number"
              min="1"
              value={quantityReceived}
              onChange={(e) => setQuantityReceived(e.target.value)}
              placeholder="Es. 10"
              disabled={isCreating}
            />
          </div>

          {/* Numero DDT (Opzionale) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Numero DDT (opzionale)</label>
            <Input
              type="text"
              value={ddtNumber}
              onChange={(e) => setDdtNumber(e.target.value)}
              placeholder="Es. DT-2024-0123"
              disabled={isCreating}
            />
          </div>

          {/* Foto DDT (Opzionale) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">📷 Foto DDT (opzionale)</label>

            {ddtPhotoPreview ? (
              <div className="relative w-full bg-gray-100 rounded border">
                <img src={ddtPhotoPreview} alt="Anteprima foto DDT caricata" className="w-full h-auto rounded" />
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
                  onClick={() => cameraOpen ? stopCamera() : startCamera()}
                  disabled={isCreating}
                >
                  <Camera size={16} className="mr-2" />
                  {cameraOpen ? 'Chiudi fotocamera' : 'Scatta foto'}
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
                    if (file) handlePhotoSelect(file);
                  }}
                />
              </div>
            )}

            {cameraOpen && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={handleCameraCapture} disabled={isCreating} className="w-full">
                  Scatta foto DDT
                </Button>
              </div>
            )}
          </div>

          {/* Stato qualità */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Stato qualità *</label>
            <Select value={qualityStatus} onValueChange={(v: 'ok' | 'pending') => setQualityStatus(v)}>
              <SelectTrigger disabled={isCreating}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ok">✓ OK</SelectItem>
                <SelectItem value="pending">⏳ In verifica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Note qualità */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Note qualità</label>
            <Input
              type="text"
              value={qualityNotes}
              onChange={(e) => setQualityNotes(e.target.value)}
              placeholder="Es. Nessun danno visibile"
              disabled={isCreating}
            />
          </div>

          {/* Note generali */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Note generali</label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Stoccato in sezione A"
              disabled={isCreating}
            />
          </div>

          {/* Upload Progress */}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="space-y-2">
              <div className="text-xs text-gray-600">Upload foto... {uploadProgress}%</div>
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
            <Button type="submit" disabled={isCreating || !quantityReceived}>
              {isCreating ? 'Registrando...' : '✓ Registra ricezione'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
