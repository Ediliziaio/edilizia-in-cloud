import { useState } from 'react';
import { CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  signatureRequestId: string;
}

export function FEAOTPSmsModal({ open, onOpenChange, signatureRequestId }: Props) {
  const [phone, setPhone] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleClose = (v: boolean) => {
    if (!isSending) {
      onOpenChange(v);
      if (!v) {
        // Reset state on close
        setTimeout(() => {
          setPhone('');
          setSent(false);
        }, 300);
      }
    }
  };

  const handleInviaOtp = async () => {
    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      toast.error('Inserisci un numero di telefono valido');
      return;
    }

    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke('fea-genera-otp-sms', {
        body: {
          signature_request_id: signatureRequestId,
          phone: trimmedPhone,
        },
      });

      if (error) throw error;

      toast.success('OTP inviato via SMS');
      setSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore durante l\'invio dell\'OTP';
      toast.error(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invia OTP via SMS</DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <p className="text-sm font-medium text-gray-800">
              OTP inviato! Il firmatario riceverà un SMS.
            </p>
            <Button variant="outline" onClick={() => handleClose(false)}>
              Chiudi
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="otp-phone">Numero di telefono</Label>
                <Input
                  id="otp-phone"
                  type="tel"
                  placeholder="+39 333 1234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSending}
                  onKeyDown={(e) => e.key === 'Enter' && !isSending && handleInviaOtp()}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={isSending}>
                Annulla
              </Button>
              <Button onClick={handleInviaOtp} disabled={isSending}>
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Invio in corso...
                  </>
                ) : (
                  'Invia OTP via SMS'
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
