import { useState } from 'react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { FEARichiediDTO, FEATipoFirmatario } from '@/types/fea';

interface FEAModalRichiestaProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: Omit<FEARichiediDTO, 'tipo_documento' | 'documento_id'>) => void;
  isLoading?: boolean;
}

export function FEAModalRichiesta({ open, onClose, onSubmit, isLoading }: FEAModalRichiestaProps) {
  const [signerEmail, setSignerEmail] = useState('');
  const [signerName, setSignerName] = useState('');
  const [tipoFirmatario, setTipoFirmatario] = useState<FEATipoFirmatario>('b2b');
  const [expiresGiorni, setExpiresGiorni] = useState('30');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      signer_email: signerEmail,
      signer_name: signerName,
      tipo_firmatario: tipoFirmatario,
      expires_giorni: parseInt(expiresGiorni, 10),
    });
  };

  const handleClose = () => {
    setSignerEmail('');
    setSignerName('');
    setTipoFirmatario('b2b');
    setExpiresGiorni('30');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Richiedi firma FEA</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signer-email">Email firmatario *</Label>
            <Input
              id="signer-email"
              type="email"
              required
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="firmatario@esempio.it"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signer-name">Nome firmatario *</Label>
            <Input
              id="signer-name"
              type="text"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Mario Rossi"
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo firmatario</Label>
            <RadioGroup
              value={tipoFirmatario}
              onValueChange={(v) => setTipoFirmatario(v as FEATipoFirmatario)}
              className="flex gap-4"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="b2b" id="tipo-b2b" />
                <Label htmlFor="tipo-b2b" className="cursor-pointer font-normal">
                  B2B (azienda)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="b2c" id="tipo-b2c" />
                <Label htmlFor="tipo-b2c" className="cursor-pointer font-normal">
                  B2C (privato)
                </Label>
              </div>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label htmlFor="expires">Scadenza link</Label>
            <Select value={expiresGiorni} onValueChange={setExpiresGiorni}>
              <SelectTrigger id="expires">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 giorni</SelectItem>
                <SelectItem value="15">15 giorni</SelectItem>
                <SelectItem value="30">30 giorni</SelectItem>
                <SelectItem value="60">60 giorni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Annulla
            </Button>
            <Button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white"
              disabled={isLoading || !signerEmail || !signerName}
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Invio...</>
              ) : (
                'Invia richiesta firma'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
