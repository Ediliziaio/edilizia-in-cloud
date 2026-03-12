import { useNavigate } from "react-router-dom";
import { Plus, Building, CreditCard, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AdminQuickActions() {
  const navigate = useNavigate();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Azioni
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => navigate("/admin/aziende/nuova")} className="gap-2">
          <Building className="h-4 w-4" /> Nuova Azienda
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/admin/piani")} className="gap-2">
          <CreditCard className="h-4 w-4" /> Gestisci Piani
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate("/admin/annunci")} className="gap-2">
          <Megaphone className="h-4 w-4" /> Nuovo Annuncio
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
