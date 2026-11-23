import { useState } from "react";
import { Check, Focus, Ruler, DoorOpen, TriangleAlert } from "lucide-react";
import type { VerificaLettura } from "../../../../shared/planimetrie/letturaTipi.ts";
import { Button } from "@/components/ui/button";
import { FotoDocumentoVerifica } from "../FotoDocumentoVerifica";
import type { Pianta } from "./adattatore";

const vuota = () => {};
const eSerramento = (v: VerificaLettura) => v.tipo === "aperture" || v.riferimento?.tipo === "apertura";
const ordine = { discordante: 0, senza_quota: 1, compatibile: 3 };

export function SchizzoVerificheChat({ file, proporzione, pianta, fotoRaddrizzata, seleziona }: {
  file: Blob; proporzione: number; pianta: Pianta; fotoRaddrizzata?: boolean; seleziona: (v: VerificaLettura) => void;
}) {
  const [filtro, setFiltro] = useState<"quote" | "vani">("quote");
  const [attivaId, setAttivaId] = useState<string>();
  const verifiche = pianta.letturaDocumento?.verifiche ?? [];
  const attiva = verifiche.find(v => v.id === attivaId);
  const scegli = (v: VerificaLettura) => {
    setFiltro(eSerramento(v) ? "vani" : "quote");
    setAttivaId(v.id);
    seleziona(v);
  };
  const vani = verifiche.filter(eSerramento);
  const quote = verifiche.filter(v => !eSerramento(v));
  const lista = (filtro === "quote" ? quote : vani).slice().sort((a, b) =>
    (a.esitoQuota ? ordine[a.esitoQuota] : 2) - (b.esitoQuota ? ordine[b.esitoQuota] : 2));
  const compatibili = lista.filter(v => v.esitoQuota === "compatibile").length;
  const discordanti = lista.filter(v => v.esitoQuota === "discordante").length;
  const daVerificare = lista.length - compatibili - discordanti;
  return <section aria-label="Verifiche sullo schizzo" className="pl-chat-message flex h-full min-h-[225px] flex-col overflow-hidden rounded-xl border bg-background shadow-sm">
    <FotoDocumentoVerifica file={file} pianta={pianta} verifiche={attiva ? [attiva] : []} attiva={attiva}
      onSeleziona={scegli} onZone={vuota} solaLettura compatto proporzione={proporzione} fotoRaddrizzata={fotoRaddrizzata} />
    <div className="flex min-h-0 flex-1 flex-col gap-2 border-t p-2">
      <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Tipo di controllo">
        <Button type="button" variant={filtro === "quote" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs"
          aria-pressed={filtro === "quote"} onClick={() => setFiltro("quote")}><Ruler className="h-3.5 w-3.5" /> Quote ({quote.length})</Button>
        <Button type="button" variant={filtro === "vani" ? "secondary" : "ghost"} size="sm" className="h-8 text-xs"
          aria-pressed={filtro === "vani"} onClick={() => setFiltro("vani")}><DoorOpen className="h-3.5 w-3.5" /> Porte e finestre ({vani.length})</Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] font-medium">
        {discordanti > 0 && <span className="text-amber-700">{discordanti} {discordanti === 1 ? "discordante" : "discordanti"}</span>}
        {daVerificare > 0 && <span className="text-muted-foreground">{daVerificare} da verificare</span>}
        {compatibili > 0 && <span className="text-emerald-700">{compatibili} {compatibili === 1 ? "compatibile" : "compatibili"} da confermare</span>}
      </div>
      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto" aria-label={filtro === "quote" ? "Quote da verificare" : "Porte e finestre da verificare"}>
        {lista.map(v => <li key={v.id}>
          <button type="button" aria-pressed={v.id === attivaId} onClick={() => scegli(v)}
            className="flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-xs leading-snug hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 aria-pressed:border-orange-400 aria-pressed:bg-orange-50">
            {v.esitoQuota === "compatibile" ? <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-700" aria-hidden />
              : v.esitoQuota === "discordante" ? <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-700" aria-hidden />
              : <Focus className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />}{v.descrizione}
          </button>
        </li>)}
      </ul>
      {filtro === "vani" && !vani.length && <p className="px-1 text-xs text-muted-foreground">Controlla sul foglio se ci sono porte o finestre da aggiungere.</p>}
    </div>
  </section>;
}
