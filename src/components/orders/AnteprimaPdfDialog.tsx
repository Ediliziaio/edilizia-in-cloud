import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  file: { blob: Blob; filename: string } | null;
  titolo: string;
  descrizione: string;
  azione: string;
  inCorso?: boolean;
  onConferma: () => void;
  onChiudi: () => void;
}

/** Il PDF com'è prima che esca: si vede, poi si decide. */
export function AnteprimaPdfDialog({ file, titolo, descrizione, azione, inCorso, onConferma, onChiudi }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) return;
    const creato = URL.createObjectURL(file.blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL del blob: nasce e muore con il file
    setUrl(creato);
    return () => URL.revokeObjectURL(creato);
  }, [file]);

  return (
    <Dialog open={!!file} onOpenChange={(aperto) => { if (!aperto) onChiudi(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription>{descrizione}</DialogDescription>
        </DialogHeader>
        {file && url && <iframe src={url} title={file.filename} className="h-[65vh] w-full rounded border" />}
        <DialogFooter>
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>Annulla</Button>
          <Button onClick={onConferma} disabled={inCorso}>
            {inCorso && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {azione}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
