import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OfficeSelect } from "@/components/orders/OfficeSelect";
import { cercaNellOperazione } from "@/lib/orders/generali/registroOperazione";
import { NOMI_MOVIMENTO, nomeVersamento, type ContoFonte, type Fonte, type Movimento } from "@/lib/orders/generali/investitoriConti";
import { notaMovimento } from "@/lib/orders/generali/movimentiFonti";
import { meseValido } from "@/lib/orders/rapportiniMese";
import type { FigliaGenerale } from "@/lib/orders/commesseGenerali";
import { dataBreve, euro, nomeMese } from "../piano/formato";
import type { AzioneMovimentoPrevisto } from "@/hooks/useGeneraleInvestitori";
import { MovimentoPrevistoDialog } from "./MovimentoPrevistoDialog";

const STATI = [
  { id: "tutti", nome: "Tutti" },
  { id: "da_confermare", nome: "Da confermare" },
  { id: "programmati", nome: "Programmati" },
  { id: "effettuati", nome: "Effettuati" },
] as const;
const PER_PAGINA = 20;

export function MovimentiOperazioneInvestitori({ generaleId, fonti, oggi, figlie, puoModificare, apriFonte, registra }: {
  generaleId: string;
  fonti: ContoFonte[];
  oggi: string;
  figlie: FigliaGenerale[];
  puoModificare: boolean;
  apriFonte: (id: string) => void;
  registra: (fonte: Fonte) => void;
}) {
  const [parametri, setParametri] = useSearchParams();
  const [ricerca, setRicerca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [modifica, setModifica] = useState<{ azione: AzioneMovimentoPrevisto; movimento: Movimento; fonte: string }>();
  const meseRichiesto = parametri.get("mese-movimenti-investitori");
  const mese = meseValido(meseRichiesto) ? meseRichiesto : "";
  const filtroFonte = parametri.get("fonte-movimenti-investitori");
  const stato = STATI.find(s => s.id === parametri.get("stato-movimenti-investitori"))?.id ?? "tutti";
  const cambiaFiltro = (chiave: "mese-movimenti-investitori" | "stato-movimenti-investitori" | "fonte-movimenti-investitori", valore: string) => {
    const p = new URLSearchParams(parametri);
    if (valore) p.set(chiave, valore);
    else p.delete(chiave);
    setPagina(1);
    setParametri(p, { replace: true });
  };
  const codici = useMemo(() => new Map(figlie.map(f => [f.id, f.codice ?? f.nome])), [figlie]);
  const righe = useMemo(() => fonti.flatMap(c => {
    const riga = (m: Movimento, programmato: boolean) => {
      const titolo = m.tipo === "versamento" ? nomeVersamento(c.fonte.tipo) : NOMI_MOVIMENTO[m.tipo];
      return { m, fonte: c.fonte, titolo, programmato, nota: notaMovimento(m.nota),
        daConfermare: programmato && m.data <= oggi, unita: m.unitaId ? codici.get(m.unitaId) : undefined };
    };
    return [...c.movimenti.map(m => riga(m, false)), ...(c.programmati ?? []).map(m => riga(m, true))];
  }), [fonti, oggi, codici]);
  const mesi = [...new Set([...righe.map(r => r.m.data.slice(0, 7)).filter(meseValido), ...(mese ? [mese] : [])])].sort().reverse();
  const ambito = filtroFonte && fonti.some(c => c.fonte.id === filtroFonte) ? filtroFonte : "";
  const visibili = righe.filter(r => (!ambito || r.fonte.id === ambito) &&
    (!mese || r.m.data.slice(0, 7) === mese) &&
    cercaNellOperazione(ricerca, [r.fonte.nome, r.titolo, r.nota, r.unita]));
  const richiesti = visibili.filter(r => {
    if (stato === "da_confermare") return r.daConfermare;
    if (stato === "programmati") return r.programmato;
    return stato !== "effettuati" || !r.programmato;
  });
  richiesti.sort((a, b) => Number(b.daConfermare) - Number(a.daConfermare) ||
    Number(b.programmato) - Number(a.programmato) ||
    (a.programmato ? a.m.data.localeCompare(b.m.data) : b.m.data.localeCompare(a.m.data))
    || a.m.id.localeCompare(b.m.id));
  const conteggi = {
    tutti: visibili.length,
    da_confermare: visibili.filter(r => r.daConfermare).length,
    programmati: visibili.filter(r => r.programmato).length,
    effettuati: visibili.filter(r => !r.programmato).length,
  };
  const pagine = Math.max(1, Math.ceil(richiesti.length / PER_PAGINA));
  const corrente = Math.min(pagina, pagine);
  const inizio = (corrente - 1) * PER_PAGINA;
  const fonte = fonti.find(c => c.fonte.id === ambito)?.fonte ?? (fonti.length === 1 ? fonti[0].fonte : undefined);

  return <section aria-labelledby="investitori-registro-titolo" className="generale-panel">
    <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <h3 id="investitori-registro-titolo" className="text-sm font-semibold">Registro dei movimenti</h3>
      {puoModificare && fonte && <Button type="button" size="sm" onClick={() => registra(fonte)} className="h-8 gap-1.5">
        <Plus className="size-4" aria-hidden="true" /> Registra movimento
      </Button>}
    </header>
    <div className="generale-registro-strumenti flex min-w-0 flex-wrap items-center gap-2 border-y px-3 py-2">
      <div className="relative min-w-[12rem] max-w-sm flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input type="search" aria-label="Cerca nei movimenti" placeholder="Fonte, movimento o unità…"
          className="h-9 pl-8 text-sm" value={ricerca} onChange={e => { setRicerca(e.target.value); setPagina(1); }} />
      </div>
      <OfficeSelect label="Fonte del movimento" className="h-9 w-52 max-w-full text-xs" value={ambito}
        options={[{ value: "", label: "Tutte le fonti" }, ...fonti.map(c => ({ value: c.fonte.id, label: c.fonte.nome }))]}
        onValueChange={id => cambiaFiltro("fonte-movimenti-investitori", id)} />
      <OfficeSelect label="Mese dei movimenti" className="h-9 w-36 max-w-full text-xs" value={mese}
        options={[{ value: "", label: "Tutti i mesi" }, ...mesi.map(m => ({ value: m, label: nomeMese(m) }))]}
        onValueChange={v => cambiaFiltro("mese-movimenti-investitori", v)} />
    </div>
    <div className="flex flex-wrap gap-1 border-b bg-muted/25 px-3 py-1.5" role="group" aria-label="Stato dei movimenti">
      {STATI.map(s => <Button type="button" size="sm" className="h-7 gap-1.5 px-2 text-xs" key={s.id}
        variant={stato === s.id ? "default" : "outline"} aria-pressed={stato === s.id}
        onClick={() => cambiaFiltro("stato-movimenti-investitori", s.id === "tutti" ? "" : s.id)}>
        {s.nome} <span className="tabular-nums">{conteggi[s.id]}</span>
      </Button>)}
    </div>
    {!richiesti.length ? <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
      <p role="status">{righe.length ? "Nessun movimento corrisponde ai filtri." : "Nessun movimento registrato per l’operazione."}</p>
      {mese && <Button type="button" size="sm" variant="ghost" onClick={() => cambiaFiltro("mese-movimenti-investitori", "")}>Mostra tutti i mesi</Button>}
    </div> : <>
      <div className="overflow-x-auto">
        <table aria-label="Movimenti delle fonti" className="generale-registro-tabella min-w-[38rem]">
          <thead className="bg-muted/40"><tr>
            <th scope="col">Data</th><th scope="col">Fonte</th><th scope="col">Movimento</th><th scope="col">Stato</th>
            <th scope="col" className="text-right">Importo</th><th scope="col"><span className="sr-only">Azioni</span></th>
          </tr></thead>
          <tbody>{richiesti.slice(inizio, inizio + PER_PAGINA).map(r => <tr key={r.m.id}>
            <td className="tabular-nums">{dataBreve(r.m.data)}</td>
            <td><button type="button" className="generale-registro-testo text-left font-medium text-primary hover:underline"
              title={r.fonte.nome} onClick={() => apriFonte(r.fonte.id)}>{r.fonte.nome}</button>
              {r.unita && <span className="block text-xs text-muted-foreground">{r.unita}</span>}
            </td>
            <td><span>{r.titolo}</span>{r.nota && <span className="generale-registro-testo text-xs text-muted-foreground" title={r.nota}>{r.nota}</span>}</td>
            <td><span className="generale-registro-stato" data-tono={!r.programmato ? "verde" : r.m.data < oggi ? "rosso" : "arancio"}>
              {!r.programmato ? "Effettuato" : r.m.data < oggi ? "In ritardo" : r.daConfermare ? "Da confermare" : "Programmato"}
            </span></td>
            <td className="text-right tabular-nums font-medium">{euro(r.m.importo)}</td>
            <td>{puoModificare && r.programmato && <div className="flex justify-end gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
                aria-label={`Riprogramma ${r.titolo.toLowerCase()} di ${r.fonte.nome} del ${dataBreve(r.m.data)}`}
                onClick={() => setModifica({ azione: "riprogramma", movimento: r.m, fonte: r.fonte.nome })}>Sposta</Button>
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
                aria-label={`Conferma ${r.titolo.toLowerCase()} di ${r.fonte.nome} del ${dataBreve(r.m.data)}`}
                onClick={() => setModifica({ azione: "conferma", movimento: r.m, fonte: r.fonte.nome })}>Conferma</Button>
            </div>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t px-3 py-1.5">
        <span role="status" className="text-xs text-muted-foreground tabular-nums">
          {pagine > 1 ? `${inizio + 1}–${Math.min(inizio + PER_PAGINA, richiesti.length)} di ` : ""}{richiesti.length} {richiesti.length === 1 ? "movimento" : "movimenti"}
        </span>
        {pagine > 1 && <nav aria-label="Pagine del registro" className="flex gap-1">
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Pagina precedente" disabled={corrente <= 1}
            onClick={() => setPagina(corrente - 1)}><ChevronLeft className="size-4" aria-hidden="true" /></Button>
          <Button type="button" variant="outline" size="icon" className="size-8" aria-label="Pagina successiva" disabled={corrente >= pagine}
            onClick={() => setPagina(corrente + 1)}><ChevronRight className="size-4" aria-hidden="true" /></Button>
        </nav>}
      </footer>
    </>}
    {modifica && puoModificare && <MovimentoPrevistoDialog generaleId={generaleId} oggi={oggi}
      {...modifica} onClose={() => setModifica(undefined)} />}
  </section>;
}
