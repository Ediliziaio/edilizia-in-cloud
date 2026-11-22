import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, MapPin, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStoricoCantieriMappa } from "@/hooks/useStoricoCantieriMappa";
import type { CalendarScope } from "@/types/calendar";
import { partiNelFuso } from "../../../../shared/mappa-operativa/calcoli";
import CartografiaOperativa, { type InquadraturaMappa, type Pin } from "./CartografiaOperativa";
import { fonteCartografica, servizioMappa } from "./servizio";
import { useMemoriaMappa } from "./useMappaCalendario";

const vuoto: NonNullable<ReturnType<typeof useStoricoCantieriMappa>["data"]> = [];
const meseItaliano = new Intl.DateTimeFormat("it", { month: "long", timeZone: "UTC" });
const mesi = Array.from({ length: 12 }, (_, i) => meseItaliano.format(new Date(Date.UTC(2026, i, 1))));
const formatoData = (data: string) => data.split("-").reverse().join("/");
const normalizza = (value: string) => value.toLocaleLowerCase("it").normalize("NFD").replace(/\p{M}/gu, "");
const stileFiltro = "h-9 rounded-md border bg-background px-2 text-sm";

export default function StoricoCantieriMappa({ company, utente, scope }: { company?: string; utente?: string; scope: CalendarScope }) {
  const [corrente] = useState(() => Number(partiNelFuso(new Date()).giorno.slice(0, 4)));
  const chiave = JSON.stringify([company, utente, scope]);
  const [predefinito] = useState({ anno: corrente as number | null, mese: "", cerca: "", selezionato: null as string | null });
  const [{ anno, mese, cerca, selezionato }, setFiltri] = useMemoriaMappa("filtri:storico", chiave, predefinito);
  const [inquadratura, salvaInquadratura] = useMemoriaMappa<InquadraturaMappa | null>("zoom:storico", chiave, null);
  const impostaAnno = (anno: number | null) => setFiltri(f => ({ ...f, anno, mese: "", selezionato: null }));
  const [altroAnno, setAltroAnno] = useState(false);
  const [tiles, setTiles] = useState({ consentiti: false, errore: "" });
  const storico = useStoricoCantieriMappa(scope, anno);
  const cantieri = storico.data ?? vuoto;

  useEffect(() => {
    if (!company) return;
    let attivo = true;
    void servizioMappa(company, "lavori", { azione: "vista", tile: fonteCartografica !== "leaflet", cartografia: fonteCartografica }).then(
      () => { if (attivo) setTiles({ consentiti: true, errore: "" }); },
      (errore: unknown) => {
        if (attivo && fonteCartografica !== "leaflet") setTiles({ consentiti: false, errore: errore instanceof Error ? errore.message : "Cartografia temporaneamente indisponibile." });
      },
    );
    return () => { attivo = false; };
  }, [company]);

  const anni = [...new Set([...Array.from({ length: 10 }, (_, i) => corrente - i), ...(anno ? [anno] : [])])]
    .sort((a, b) => b - a);
  const visibili = useMemo(() => {
    const query = normalizza(cerca.trim());
    return cantieri.filter(c => {
      const periodo = !mese || c.data?.slice(5, 7) === mese;
      return periodo && (!query || normalizza(`${c.titolo} ${c.codice ?? ""} ${c.indirizzo}`).includes(query));
    }).sort((a, b) => (b.data ?? "").localeCompare(a.data ?? "") || a.titolo.localeCompare(b.titolo, "it"));
  }, [cantieri, cerca, mese]);
  const pin = useMemo<Pin[]>(() => visibili.flatMap(c => c.punto ? [{ id: c.id, titolo: c.titolo, punto: c.punto }] : []), [visibili]);
  const attivo = visibili.find(c => c.id === selezionato);

  return <section aria-label="Mappa cantieri conclusi" className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Anno dei cantieri" className={stileFiltro} value={altroAnno ? "altro" : anno ?? ""} onChange={e => {
        const valore = e.target.value;
        setAltroAnno(valore === "altro");
        if (valore !== "altro") impostaAnno(valore ? Number(valore) : null);
      }}>
        {anni.map(a => <option value={a} key={a}>{a}</option>)}
        <option value="altro">Altro anno…</option>
        <option value="">Senza data</option>
      </select>
      {altroAnno && <form className="flex items-center gap-1" onSubmit={e => {
        e.preventDefault();
        impostaAnno(Number(new FormData(e.currentTarget).get("anno")));
        setAltroAnno(false);
      }}>
        <Input type="number" name="anno" aria-label="Inserisci un altro anno" min={1900} max={2100}
          defaultValue={anno ?? corrente} required className="w-24" />
        <Button type="submit" size="sm" variant="outline">Vai all’anno</Button>
      </form>}
      <select aria-label="Mese dei cantieri" className={stileFiltro} value={mese} disabled={!anno}
        onChange={e => setFiltri(f => ({ ...f, mese: e.target.value, selezionato: null }))}>
        <option value="">Tutto l’anno</option>
        {mesi.map((nome, i) => <option value={String(i + 1).padStart(2, "0")} key={nome}>{nome}</option>)}
      </select>
      <div className="relative min-w-32 flex-1 sm:max-w-sm">
        <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input aria-label="Cerca un cantiere concluso" placeholder="Cerca nome, codice o indirizzo" className="pl-8" value={cerca}
          onChange={e => setFiltri(f => ({ ...f, cerca: e.target.value, selezionato: null }))} />
      </div>
    </div>

    {storico.isError && <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
      Caricamento dei cantieri interrotto. <button className="underline" onClick={() => void storico.refetch()}>Riprova</button>
    </p>}

    <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.65fr)_minmax(17rem,1fr)]">
      <CartografiaOperativa pin={pin} selezionato={attivo?.id ?? null} onSeleziona={id => setFiltri(f => ({ ...f, selezionato: id }))} nomiPin
        contesto={String(anno)} inquadratura={inquadratura} onInquadratura={salvaInquadratura} attesaPunti={storico.isPending}
        tileConsentito={tiles.consentiti} erroreTiles={tiles.errore} />
      <div className="min-w-0 rounded-lg border bg-background">
        <p className="border-b px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
          {storico.isPending ? "Caricamento cantieri…" : `${visibili.length} in elenco · ${pin.length} sulla mappa${visibili.length > pin.length ? ` · ${visibili.length - pin.length} senza coordinate` : ""}`}
        </p>
        {attivo && <div role="region" aria-label="Cantiere selezionato" className="flex flex-wrap items-center justify-between gap-2 border-b bg-primary/5 p-3">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{attivo.titolo}</p>
            {attivo.indirizzo && <p className="text-xs text-muted-foreground">{attivo.indirizzo}</p>}
          </div>
          <Button asChild size="sm" variant="outline"><Link to={`/azienda/ordini/${attivo.id}`}>Apri commessa <ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></Button>
        </div>}
        <div className="divide-y lg:max-h-[29rem] lg:overflow-auto">
          {!storico.isPending && !storico.isError && !visibili.length && <p className="p-4 text-sm text-muted-foreground">Nessun cantiere concluso per i filtri scelti.</p>}
          {visibili.map(c => <button type="button" aria-pressed={attivo?.id === c.id} key={c.id}
            className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted/60 aria-pressed:bg-primary/10"
            onClick={() => setFiltri(f => ({ ...f, selezionato: c.id }))}>
            <MapPin className={`mt-0.5 size-4 shrink-0 ${c.punto ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
            <span className="min-w-0 space-y-0.5">
              <span className="block break-words font-medium">{c.titolo}</span>
              <span className="block break-words text-xs text-muted-foreground">
                {[c.codice, c.indirizzo, c.punto ? "" : "Senza coordinate"].filter(Boolean).join(" · ")}
              </span>
              <span className="block text-xs text-muted-foreground">
                {c.data ? `${c.chiusuraRegistrata ? "Chiuso il" : "Fine lavori pianificata"} ${formatoData(c.data)}` : "Data di chiusura da verificare"}
              </span>
            </span>
          </button>)}
        </div>
      </div>
    </div>
  </section>;
}
