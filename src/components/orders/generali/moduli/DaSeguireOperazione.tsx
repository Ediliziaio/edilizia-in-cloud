import type { ReactNode } from "react";
import { ArrowUpRight, CalendarClock, ClipboardList, ListChecks, PackageCheck, Truck } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import type { MovimentiOperazione } from "@/hooks/useMovimentiOperazione";
import { fasiCronoprogramma, giornoLocale, lavoroRealeFasi, ritardoFase } from "@/lib/orders/cronoprogramma";
import { dataBreve } from "../piano/formato";

export function DaSeguireOperazione({ dati, commesse, apriFase, apriRapportini }: {
  dati: MovimentiOperazione;
  commesse: ReadonlyMap<string, { codice: string | null; nome: string | null }>;
  apriFase: (commessaId: string, faseId: string) => void;
  apriRapportini: (commessaId: string) => void;
}) {
  const oggi = giornoLocale(new Date().toISOString());
  const perId = new Map(dati.fasi.map(f => [f.id, f]));
  const fasi = fasiCronoprogramma(dati.fasi.map(f => ({ ...f, percentuale: f.percentuale ?? 0,
    completata_il: f.completata_il ? giornoLocale(f.completata_il) : null,
  })), lavoroRealeFasi(dati.rapportiniCronoprogramma), oggi)
    .flatMap(f => {
      if (f.stato === "completata") return [];
      const ritardo = ritardoFase(f);
      if (!ritardo && !f.dateIncoerenti) return [];
      return [{ fase: f, ritardo, commessaId: perId.get(f.id)!.order_id }];
    })
    .sort((a, b) => (b.ritardo?.giorni ?? 0) - (a.ritardo?.giorni ?? 0));
  const nome = (id: string) => commesse.get(id)?.nome || commesse.get(id)?.codice || "Commessa";
  const gruppi = [
    {
      icona: CalendarClock, titolo: "Fasi da verificare", troncato: false,
      righe: fasi.map(({ fase, ritardo, commessaId }) => ({
        id: fase.id, titolo: fase.nome,
        dettaglio: [nome(commessaId), ritardo ? `${ritardo.su === "inizio" ? "Inizio" : "Fine"} · +${ritardo.giorni} gg` : "Date incoerenti"].join(" · "),
        azione: () => apriFase(commessaId, fase.id),
      })),
    },
    {
      icona: PackageCheck, titolo: "Consegne in ritardo", troncato: dati.troncati.includes("ordini"),
      righe: dati.ordini.map(o => ({
        id: o.id, titolo: o.oda_number ?? "Ordine d’acquisto", href: `/azienda/ordini-acquisto/${o.id}`,
        dettaglio: [nome(o.order_id), o.supplier_id && dati.fornitori[o.supplier_id], `Atteso il ${dataBreve(o.expected_delivery_date)}`].filter(Boolean).join(" · "),
      })),
    },
    {
      icona: Truck, titolo: "DDT da verificare", troncato: dati.troncati.includes("DDT"),
      righe: dati.ddt.map(d => ({
        id: d.id, titolo: d.numero_ddt ? `DDT ${d.numero_ddt}` : "Apri DDT", href: `/azienda/ddt/${d.id}`,
        dettaglio: [nome(d.order_id), d.stato === "non_conforme" ? "Non conforme" : dataBreve(d.data_ricezione)].join(" · "),
      })),
    },
    {
      icona: ClipboardList, titolo: "Rapportini da approvare", troncato: dati.troncati.includes("rapportini"),
      righe: dati.rapportini.map(r => ({
        id: r.id, titolo: r.descrizione_lavori || "Rapportino",
        dettaglio: [nome(r.order_id), dataBreve(r.data_lavoro)].join(" · "), azione: () => apriRapportini(r.order_id),
      })),
    },
  ];
  const attivi = gruppi.filter(g => g.righe.length > 0);

  return (
    <section aria-labelledby="cantiere-priorita" className="space-y-3">
      <header className="flex items-center gap-2 px-0.5">
        <ListChecks className="size-4 text-primary" aria-hidden="true" />
        <h3 id="cantiere-priorita" className="text-base font-semibold">Priorità del cantiere</h3>
      </header>
      {attivi.length === 0 ? <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
        Nessuna priorità nelle fasi, nelle consegne, nei DDT e nei rapportini di questo ambito.
      </div> : <div className="grid gap-3 xl:grid-cols-2">
        {attivi.map(({ icona: Icona, titolo, righe, troncato }) => <article key={titolo} className="min-w-0 rounded-xl border bg-card">
          <header className="flex items-center gap-2 border-b bg-muted/25 px-4 py-3">
            <Icona className="size-4 text-primary" aria-hidden="true" />
            <h4 className="text-sm font-semibold">{titolo}</h4>
            <Badge variant="outline" className="ml-auto tabular-nums">{righe.length}{troncato && "+"}</Badge>
          </header>
          <ul className="divide-y">{righe.slice(0, 4).map(r => <Priorita key={r.id} {...r} />)}</ul>
          {righe.length > 4 && <details className="border-t">
            <summary className="cursor-pointer px-4 py-2.5 text-xs font-medium text-primary">Altri {righe.length - 4}</summary>
            <ul className="divide-y border-t">{righe.slice(4).map(r => <Priorita key={r.id} {...r} />)}</ul>
          </details>}
        </article>)}
      </div>}
      {dati.troncati.length > 0 && <p className="text-xs text-muted-foreground">Per vedere l’elenco completo di {dati.troncati.join(", ")} apri le relative schede della singola commessa.</p>}
    </section>
  );
}

function Priorita({ titolo, dettaglio, href, azione }: { titolo: string; dettaglio: string; href?: string; azione?: () => void }) {
  const classe = "flex w-full min-w-0 items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const contenuto: ReactNode = <>
    <span className="min-w-0"><span className="block truncate text-sm font-medium">{titolo}</span>
      <span className="block truncate text-xs text-muted-foreground">{dettaglio}</span></span>
    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </>;
  return <li>{href ? <Link to={href} className={classe}>{contenuto}</Link>
    : <button type="button" onClick={azione} className={classe}>{contenuto}</button>}</li>;
}
