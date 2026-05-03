/**
 * ExportButton — bottone universale "Esporta Excel" con loader.
 */

import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  /** Async function che esegue l'export e ritorna quando il download è partito */
  onExport: () => Promise<void>;
  label?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "ghost";
}

export function ExportButton({
  onExport,
  label = "Esporta Excel",
  size = "sm",
  variant = "outline",
}: Props) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handle = async () => {
    setLoading(true);
    try {
      await onExport();
      toast({ title: "Export completato" });
    } catch (e) {
      toast({
        title: "Errore export",
        description: String(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onClick={handle} disabled={loading} size={size} variant={variant}>
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {label}
    </Button>
  );
}
