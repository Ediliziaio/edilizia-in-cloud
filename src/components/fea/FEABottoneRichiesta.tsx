import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FEABottoneRichiestaProps {
  onRichiedi: () => void;
  disabled?: boolean;
  className?: string;
}

export function FEABottoneRichiesta({ onRichiedi, disabled, className }: FEABottoneRichiestaProps) {
  return (
    <Button
      onClick={onRichiedi}
      disabled={disabled}
      className={`bg-orange-500 hover:bg-orange-600 text-white gap-2 ${className ?? ''}`}
    >
      <PenLine className="h-4 w-4" />
      Richiedi firma FEA
    </Button>
  );
}
