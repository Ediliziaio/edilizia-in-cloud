/**
 * «Correggi prezzo» su una lavorazione della pianta (24/11/2026): il prezzo scritto qui
 * finisce nel listino dell'azienda, così vale anche per le altre piante e per i preventivi.
 * Il calcolo e la scrittura stanno in `lib/planimetrie/salvaNelListino.ts`.
 */
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { numeroEditor } from "@/lib/computo/editorNativo";
import { messaggioListino, salvaPrezzoNelListino } from "@/lib/planimetrie/salvaNelListino";
import type { RigaStudio } from "@/lib/planimetrie/studioImmobiliare";

export function CorreggiPrezzoLavorazione({ companyId, riga, etichetta }: {
  companyId: string;
  riga: RigaStudio;
  /** Il testo del pulsante quando un prezzo c'è già. */
  etichetta?: string;
}) {
  const [aperto, setAperto] = useState(false);
  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState("");
  const [occupato, setOccupato] = useState(false);
  const qc = useQueryClient();

  const apri = () => {
    setTesto(riga.prezzo ? String(riga.prezzo.importo).replace(".", ",") : "");
    setErrore("");
    setAperto(true);
  };

  const salva = async () => {
    const importo = numeroEditor(testo);
    if (importo === null || importo < 0) return setErrore("Scrivi un prezzo unitario valido.");
    setOccupato(true);
    try {
      const esito = await salvaPrezzoNelListino(companyId, { descrizione: riga.descrizione, unita: riga.unita, importo, riga });
      await qc.invalidateQueries({ queryKey: ["planimetrie", "fonti-prezzi"] });
      void qc.invalidateQueries({ queryKey: ["rst-listino-voci", companyId] });
      toast.success(messaggioListino(esito, riga.descrizione));
      setAperto(false);
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Prezzo non salvato: riprova.");
    } finally {
      setOccupato(false);
    }
  };

  if (!aperto) {
    return <button type="button" onClick={apri} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
      {riga.prezzo ? etichetta ?? "Correggi prezzo" : "Dai un prezzo"}
    </button>;
  }
  return (
    <form className="mt-1 space-y-1.5 rounded-md border bg-muted/40 p-2" onSubmit={(e) => { e.preventDefault(); void salva(); }}>
      <label className="block text-xs font-medium">Prezzo in €/{riga.unita}
        <Input autoFocus aria-label={`Prezzo per ${riga.descrizione}`} inputMode="decimal" value={testo} disabled={occupato}
          onChange={(e) => { setTesto(e.target.value); setErrore(""); }} className="mt-1 h-8 bg-background" />
      </label>
      <p className="text-xs text-muted-foreground">Lo salvo nel listino dell’azienda: varrà anche per le altre piante e per i preventivi.</p>
      <div className="flex flex-wrap gap-1.5">
        <Button type="submit" size="sm" className="h-7" disabled={occupato}>{occupato ? "Salvo…" : "Salva nel listino"}</Button>
        <Button type="button" size="sm" variant="ghost" className="h-7" disabled={occupato} onClick={() => setAperto(false)}>Annulla</Button>
      </div>
      {errore && <p role="alert" className="text-xs text-destructive">{errore}</p>}
    </form>
  );
}
