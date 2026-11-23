// src/components/orders/generali/documenti/RiquadroDocumenti.tsx
// In Panoramica, sotto i quattro numeri: «3 documenti mancanti, 1 in scadenza», e un tocco apre
// la scheda Documenti. La Panoramica mostra soltanto gli avvisi da gestire.
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ChevronRight, Folder, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SENZA_CARTELLA } from "@/components/orders/DocumentFoldersNavigation";
import type { PropsScheda } from "@/components/orders/generali/tipiScheda";
import { useCartelleDocumenti } from "@/hooks/useCartelleDocumenti";
import { useChecklistGenerale } from "@/hooks/useGeneraleDocumenti";
import { contaPerCartella } from "@/lib/commesse/documentiCommessa";
import { testoConteggi } from "@/lib/orders/generali/documenti";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function RiquadroDocumenti({ riepilogo }: PropsScheda) {
  const t = useT();
  const { checklist } = useChecklistGenerale(riepilogo);
  const [parametri, setParametri] = useSearchParams();
  if (!checklist) return null;
  const c = checklist.conteggi;
  if (c.richiesti === 0 && c.inScadenza === 0 && c.scaduti === 0) return null;
  const testo = testoConteggi(c);
  if (!testo) return null;
  const apri = () => {
    const dopo = new URLSearchParams(parametri);
    dopo.set("scheda", "documenti");
    dopo.delete("vista-documenti");
    dopo.delete("ambito-documenti");
    dopo.set("stato-documenti", c.scaduti > 0 ? "scaduti" : c.mancanti > 0 ? "mancanti" : "in_scadenza");
    setParametri(dopo, { replace: true });
  };
  return (
    <button
      type="button"
      onClick={apri}
      className="generale-avviso-documenti flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-amber-900 hover:underline dark:text-amber-200"
    >
      <AlertTriangle className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{t("Documenti")}</span>
        {" · "}
        {testo}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
    </button>
  );
}

export function ArchivioDocumentiPanoramica({ riepilogo }: PropsScheda) {
  const t = useT();
  const [parametri] = useSearchParams();
  const dati = useChecklistGenerale(riepilogo);
  const categorie = useCartelleDocumenti({ tutte: true });
  const file = [...dati.allegatiPer.values()].flat();
  const conteggi = contaPerCartella(file);
  const note = categorie.cartelle.map(c => ({
    id: c.id,
    nome: c.archiviata_at ? t("{nome} · archiviata", { nome: c.nome }) : c.nome,
    quanti: conteggi[c.id] ?? 0,
  }));
  const raggruppati = note.reduce((totale, c) => totale + c.quanti, 0);
  const cartelle = categorie.isLoading || categorie.isError ? [] : [
    ...note.filter(c => c.quanti > 0),
    ...(file.length > raggruppati ? [{ id: SENZA_CARTELLA, nome: t("Senza cartella"), quanti: file.length - raggruppati }] : []),
  ];
  const cercaArchivio = (id?: string) => {
    const p = new URLSearchParams(parametri);
    p.set("scheda", "documenti");
    p.set("vista-documenti", "archivio");
    p.delete("stato-documenti");
    p.delete("ambito-documenti");
    if (id) p.set("cartella-documenti", id);
    else p.delete("cartella-documenti");
    return { search: `?${p.toString()}` };
  };
  return <section className="generale-panel" aria-labelledby="archivio-panoramica-titolo">
    <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FolderOpen className="size-4 text-primary" aria-hidden="true" />
        <h2 id="archivio-panoramica-titolo" className="text-sm font-semibold">{t("Documenti dell’operazione")}</h2>
        {!dati.isLoading && !dati.isError && <span className="text-xs tabular-nums text-muted-foreground">{t("{n} file", { n: file.length })}</span>}
      </div>
      <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5">
        <Link to={cercaArchivio()}>{t("Apri archivio")} <ChevronRight className="size-3.5" aria-hidden="true" /></Link>
      </Button>
    </header>
    {cartelle.length > 0 && <div className="flex flex-wrap gap-1.5 border-t px-3 py-2 sm:px-4">
      {cartelle.slice(0, 4).map(c => <Button key={c.id} asChild variant="outline" size="sm" className="h-8 min-w-0 max-w-full gap-1.5 text-xs">
        <Link to={cercaArchivio(c.id)} aria-label={t("{nome} · {quanti} file", { nome: String(c.nome ?? ""), quanti: String(c.quanti ?? "") })}>
          <Folder className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{c.nome}</span>
          <span className="tabular-nums text-muted-foreground">{c.quanti}</span>
        </Link>
      </Button>)}
    </div>}
  </section>;
}
