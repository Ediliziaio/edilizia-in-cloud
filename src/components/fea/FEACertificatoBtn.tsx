import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface FEACertificatoBtnProps {
  certificatoUrl: string | null;
  disabled?: boolean;
}

export function FEACertificatoBtn({ certificatoUrl, disabled }: FEACertificatoBtnProps) {
  if (!certificatoUrl) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              variant="outline"
              size="sm"
              disabled
              className="gap-2 opacity-50 cursor-not-allowed"
            >
              <ExternalLink className="h-4 w-4" />
              Scarica certificato
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Certificato in elaborazione</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <a href={certificatoUrl} target="_blank" rel="noopener noreferrer" download>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled}
        className="gap-2"
      >
        <ExternalLink className="h-4 w-4" />
        Scarica certificato
      </Button>
    </a>
  );
}
