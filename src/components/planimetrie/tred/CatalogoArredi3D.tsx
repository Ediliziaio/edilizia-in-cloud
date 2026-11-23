import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SimboloArredo } from "../editor/SimboloArredo";
import { CATALOGO_ARREDI_3D, GRUPPI_ARREDO_3D, type VoceCatalogo } from "../editor/catalogo";
const SUGGERITI: Readonly<Record<string, readonly string[]>> = {
  soggiorno: ["Soggiorno", "Cucina"], cucina: ["Cucina"], bagno: ["Bagno"], lavanderia: ["Bagno"],
  camera: ["Camere"], studio: ["Camere"], garage: ["Esterni e garage"],
  balcone: ["Giardino e piscina"], terrazzo: ["Giardino e piscina"], giardino: ["Giardino e piscina"],
};
const COMPLEMENTI_CAMERA = new Set(["tenda", "quadro", "pianta_vaso"]);
const cercaIn = (s: string) => s.toLocaleLowerCase("it").normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();

export function MiniaturaArredo({ voce }: { voce: Pick<VoceCatalogo, "tipo" | "larghezza" | "profondita"> }) {
  const { larghezza, profondita } = voce, lato = Math.max(larghezza, profondita, 1);
  return <svg aria-hidden="true" viewBox={`${-lato * .58} ${-lato * .58} ${lato * 1.16} ${lato * 1.16}`} className="size-9">
    <SimboloArredo tipo={voce.tipo} larghezza={larghezza} profondita={profondita} colore="#37577a" spessore={lato / 32} />
  </svg>;
}

export function CatalogoArredi3D({ destinazione, tipo, onScegli }: { destinazione: string; tipo: string; onScegli: (tipo: string) => void }) {
  const [ricerca, setRicerca] = useState("");
  const [gruppo, setGruppo] = useState("");
  const consigliati = SUGGERITI[destinazione] ?? [];
  const filtro = cercaIn(ricerca);
  const voci = CATALOGO_ARREDI_3D.filter(a => filtro ? cercaIn(`${a.nome} ${a.gruppo}`).includes(filtro) :
    gruppo === "tutti" || (gruppo ? a.gruppo === gruppo : !consigliati.length || consigliati.includes(a.gruppo) ||
      (destinazione === "camera" || destinazione === "studio") && COMPLEMENTI_CAMERA.has(a.tipo)));
  return <div className="space-y-2">
    <div className="relative">
      <Search aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"/>
      <Input type="search" aria-label="Cerca un arredo" placeholder="Cerca nel catalogo" value={ricerca}
        onChange={e => setRicerca(e.target.value)} className="h-9 pl-8"/>
    </div>
    {!filtro && <div role="group" aria-label="Categorie del catalogo" className="flex flex-wrap gap-1">
      {[...(consigliati.length ? [{ id: "", nome: "Per questa stanza" }] : []), { id: "tutti", nome: "Tutti" }, ...GRUPPI_ARREDO_3D.map(g => ({ id: g, nome: g }))].map(g =>
        <button key={g.id} type="button" aria-pressed={gruppo === g.id || (!consigliati.length && !gruppo && g.id === "tutti")}
          className="rounded-full border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted aria-pressed:border-primary/40 aria-pressed:bg-primary/10 aria-pressed:text-primary"
          onClick={() => setGruppo(g.id)}>{g.nome}</button>)}
    </div>}
    <div role="group" aria-label="Arredi del catalogo" className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto px-0.5 py-0.5">
      {voci.map(a => <button type="button" key={a.tipo} aria-label={a.nome} aria-pressed={a.tipo === tipo} onClick={() => onScegli(a.tipo)}
        className={cn("flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight motion-safe:transition-colors",
          a.tipo === tipo ? "border-primary bg-primary/10 text-primary" : "bg-card hover:border-primary/40 hover:bg-muted/60")}>
        <MiniaturaArredo voce={a}/><span>{a.nome}</span><span className="font-normal text-muted-foreground">{a.larghezza} × {a.profondita} cm</span>
      </button>)}
    </div>
    {!voci.length && <p role="status" className="text-xs text-muted-foreground">Nessun arredo corrisponde alla ricerca.</p>}
  </div>;
}
