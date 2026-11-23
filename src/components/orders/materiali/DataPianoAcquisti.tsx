import { useState } from "react";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { useImpostaDataFabbisogno } from "@/hooks/useFabbisognoMateriali";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function DataPianoAcquisti({ id, nome, dataAttuale, dataFase, onChiudi }: { id: string; nome: string; dataAttuale?: string | null; dataFase?: string | null; onChiudi: () => void }) {
  const t = useT();
  const [data, setData] = useState(dataAttuale ?? dataFase ?? "");
  const [errore, setErrore] = useState("");
  const imposta = useImpostaDataFabbisogno();
  const salva = async () => {
    setErrore("");
    if (data && (!/^\d{4}-\d{2}-\d{2}$/.test(data) || new Date(data + "T12:00:00").toLocaleDateString("en-CA") !== data)) { setErrore(t("Inserisci una data valida.")); return; }
    try {
      const n = await imposta.mutateAsync({ ids: [id], data: data || null });
      if (n !== 1) throw new Error(t("Data non aggiornata: verifica che la riga sia ancora modificabile."));
      onChiudi();
    } catch (e) { setErrore(e instanceof Error ? e.message : t("Non riesco a salvare la data.")); }
  };
  return <Dialog open onOpenChange={v => !v && !imposta.isPending && onChiudi()}><DialogContent className="max-w-md">
    <DialogHeader><DialogTitle>{t("Quando serve il materiale?")}</DialogTitle><DialogDescription>{nome}</DialogDescription></DialogHeader>
    <label className="text-sm">{t("Serve in cantiere il")}<Input className="mt-2" type="date" value={data} disabled={imposta.isPending} onChange={e => setData(e.target.value)} /></label>
    <p className="text-xs leading-5 text-muted-foreground">{t("La scadenza d'acquisto viene ricalcolata sottraendo i giorni di consegna. Senza una data specifica, il materiale segue l'inizio della fase.")}</p>
    <Button type="button" variant="ghost" size="sm" className="justify-start px-0" disabled={imposta.isPending} onClick={() => setData("")}>{t("Usa la data della fase")}</Button>
    {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
    <div className="flex justify-end gap-2"><Button variant="ghost" disabled={imposta.isPending} onClick={onChiudi}>{t("Annulla")}</Button><Button disabled={imposta.isPending || data === (dataAttuale ?? "")} onClick={salva}>{imposta.isPending ? t("Salvataggio…") : t("Salva data")}</Button></div>
  </DialogContent></Dialog>;
}
