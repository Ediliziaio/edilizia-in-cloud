import { Copy, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function MenuVoceComputoTelefono({ descrizione, onDuplica, onElimina }: {
  descrizione: string;
  onDuplica: () => void;
  onElimina: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={descrizione ? `Azioni voce: ${descrizione}` : "Azioni voce"}
          className="tap-compact order-2 hidden h-9 w-9 shrink-0 text-muted-foreground max-md:inline-flex"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onDuplica} className="min-h-11 gap-2"><Copy className="h-4 w-4" />Duplica voce</DropdownMenuItem>
        <DropdownMenuItem onSelect={onElimina} className="min-h-11 gap-2 text-red-700 focus:text-red-700"><Trash2 className="h-4 w-4" />Elimina voce</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
