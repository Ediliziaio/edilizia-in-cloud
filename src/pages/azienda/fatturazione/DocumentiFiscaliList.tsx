import { FileText } from "lucide-react";

export default function DocumentiFiscaliList() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documenti Fiscali</h1>
        <p className="text-muted-foreground">
          Gestisci fatture, note di credito, DDT e preventivi.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FileText className="h-16 w-16 text-muted-foreground/30 mb-4" />
        <p className="text-lg font-medium text-foreground">
          Modulo fatturazione nativa
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          In fase di completamento — le funzionalità saranno disponibili a breve.
        </p>
      </div>
    </div>
  );
}
