import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInstallation } from '@/hooks/warehouse/useInstallation';
import { Camera, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface InstallationPhotoCaptureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItemId: string;
  orderItemName?: string;
  siteDeliveryId?: string;
}

export function InstallationPhotoCaptureModal({
  open,
  onOpenChange,
  orderItemId,
  orderItemName = 'Articolo',
  siteDeliveryId,
}: InstallationPhotoCaptureModalProps) {
  const { recordInstallation, isRecording, uploadProgress } = useInstallation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputBeforeRef = useRef<HTMLInputElement>(null);
  const fileInputAfterRef = useRef<HTMLInputElement>(null);

  const [installationLocation, setInstallationLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [photoBefore, setPhotoBefore] = useState<File | null>(null);
  const [photoBeforePreview, setPhotoBeforePreview] = useState<string | null>(null);
  const [photoAfter, setPhotoAfter] = useState<File | null>(null);
  const [photoAfterPreview, setPhotoAfterPreview] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<'before' | 'after' | null>(null);
  const [streamRef, setStreamRef] = useState<MediaStream | null>(null);

  const startCamera = async (mode: 'before' | 'after') => {
    try {
      if (streamRef) streamRef.getTracks().forEach(t => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setStreamRef(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraMode(mode);
    } catch (err) {
      console.error('Camera error:', err);
      alert('Impossibile accedere alla fotocamera');
    }
  };

  const stopCamera = () => {
    if (streamRef) {
      streamRef.getTracks().forEach(t => t.stop());
      setStreamRef(null);
    }
    setCameraMode(null);
  };

  const handlePhotoSelect = (file: File, type: 'before' | 'after') => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const preview = reader.result as string;
      if (type === 'before') {
        setPhotoBefore(file);
        setPhotoBeforePreview(preview);
      } else {
        setPhotoAfter(file);
        setPhotoAfterPreview(preview);
      }
      stopCamera();
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (type: 'before' | 'after') => {
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
        const fileName = type === 'before' ? `before_${Date.now()}.jpg` : `after_${Date.now()}.jpg`;
        const file = new File([blob], fileName, { type: 'image/jpeg' });
        handlePhotoSelect(file, type);
      }
    }, 'image/jpeg', 0.9);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!photoBefore) { alert('Foto prima è obbligatoria'); return; }
    if (!photoAfter) { alert('Foto dopo è obbligatoria'); return; }

    try {
      await recordInstallation({
        order_item_id: orderItemId,
        site_delivery_id: siteDeliveryId,
        installation_location: installationLocation || undefined,
        photo_before: photoBefore,
        photo_after: photoAfter,
        notes: notes || undefined,
      });

      // Reset form
      setInstallationLocation('');
      setNotes('');
      setPhotoBefore(null);
      setPhotoBeforePreview(null);
      setPhotoAfter(null);
      setPhotoAfterPreview(null);
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
          <DialogTitle>🔧 Installa — {orderItemName}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Posizione */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Posizione installazione</label>
            <Input
              type="text"
              value={installationLocation}
              onChange={(e) => setInstallationLocation(e.target.value)}
              placeholder="Es. Sala, Cucina, Camera"
              disabled={isRecording}
            />
          </div>

          {/* Foto PRIMA (OBBLIGATORIO) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">📷 Foto PRIMA *</label>

            {photoBeforePreview ? (
              <div className="relative w-full bg-gray-100 rounded border">
                <img src={photoBeforePreview} alt="Prima" className="w-full h-auto rounded" />
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
                  ✓ Caricata
                </div>
                <button
                  type="button"
                  onClick={() => { setPhotoBefore(null); setPhotoBeforePreview(null); }}
                  className="absolute bottom-2 right-2 bg-red-500 text-white p-1 rounded"
                  disabled={isRecording}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraMode === 'before' ? stopCamera() : startCamera('before')}
                  disabled={isRecording}
                >
                  <Camera size={16} className="mr-2" />
                  {cameraMode === 'before' ? 'Chiudi' : 'Scatta foto'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputBeforeRef.current?.click()}
                  disabled={isRecording}
                >
                  Seleziona file
                </Button>
                <input
                  ref={fileInputBeforeRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) handlePhotoSelect(file, 'before');
                  }}
                />
              </div>
            )}

            {cameraMode === 'before' && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={() => handleCameraCapture('before')} disabled={isRecording} className="w-full">
                  Scatta foto PRIMA
                </Button>
              </div>
            )}
          </div>

          {/* Indicatore step intermedio */}
          {photoBeforePreview && !photoAfterPreview && (
            <div className="bg-blue-50 p-4 rounded border border-blue-200 text-center">
              <p className="text-sm font-medium text-blue-800">✓ Foto prima acquisita</p>
              <p className="text-xs text-blue-600 mt-1">Puoi ora procedere con l'installazione, poi scatta la foto DOPO</p>
            </div>
          )}

          {/* Foto DOPO (OBBLIGATORIO) */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">📷 Foto DOPO *</label>

            {photoAfterPreview ? (
              <div className="relative w-full bg-gray-100 rounded border">
                <img src={photoAfterPreview} alt="Dopo" className="w-full h-auto rounded" />
                <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
                  ✓ Caricata
                </div>
                <button
                  type="button"
                  onClick={() => { setPhotoAfter(null); setPhotoAfterPreview(null); }}
                  className="absolute bottom-2 right-2 bg-red-500 text-white p-1 rounded"
                  disabled={isRecording}
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => cameraMode === 'after' ? stopCamera() : startCamera('after')}
                  disabled={isRecording}
                >
                  <Camera size={16} className="mr-2" />
                  {cameraMode === 'after' ? 'Chiudi' : 'Scatta foto'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputAfterRef.current?.click()}
                  disabled={isRecording}
                >
                  Seleziona file
                </Button>
                <input
                  ref={fileInputAfterRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.currentTarget.files?.[0];
                    if (file) handlePhotoSelect(file, 'after');
                  }}
                />
              </div>
            )}

            {cameraMode === 'after' && (
              <div className="space-y-2 border rounded p-4 bg-gray-50">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded" />
                <canvas ref={canvasRef} className="hidden" />
                <Button type="button" onClick={() => handleCameraCapture('after')} disabled={isRecording} className="w-full">
                  Scatta foto DOPO
                </Button>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Note installazione</label>
            <Input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Es. Sigillato, verniciato"
              disabled={isRecording}
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
              disabled={isRecording}
            >
              Annulla
            </Button>
            <Button type="submit" disabled={isRecording || !photoBefore || !photoAfter}>
              {isRecording ? 'Registrando...' : '✓ Installazione completata'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
