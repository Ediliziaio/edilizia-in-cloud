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
        id: d.id, titolo: d.numero_ddt ?? "Apri DDT", href: `/azienda/ddt/${d.id}`,
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
    <section aria-labelledby="cantiere-priorita" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b bg-muted/25 px-3 py-2.5 sm:px-4">
        <ListChecks className="size-4 text-primary" aria-hidden="true" />
        <h3 id="cantiere-priorita" className="text-sm font-semibold">Priorità del cantiere</h3>
        <Badge variant="outline" className="tabular-nums">{attivi.reduce((totale, g) => totale + g.righe.length, 0)}{dati.troncati.length > 0 && "+"}</Badge>
      </header>
      {attivi.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground sm:px-4">
        Nessuna priorità in questo ambito.
      </p> : <div className="divide-y">
        {attivi.map(({ icona: Icona, titolo, righe, troncato }) => (
          <div key={titolo} className="generale-priorita-gruppo" role="group" aria-label={titolo}>
            <div className="generale-priorita-categoria">
              <Icona className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <h4 className="text-xs font-medium">{titolo}</h4>
              <span className="text-xs tabular-nums text-muted-foreground">{righe.length}{troncato && "+"}</span>
            </div>
            <div className="min-w-0">
              <ul className="divide-y">{righe.slice(0, 4).map(r => <Priorita key={r.id} {...r} />)}</ul>
              {righe.length > 4 && <details className="border-t">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-primary">Mostra altri {righe.length - 4}</summary>
                <ul className="divide-y border-t">{righe.slice(4).map(r => <Priorita key={r.id} {...r} />)}</ul>
              </details>}
            </div>
          </div>
        ))}
      </div>}
      {dati.troncati.length > 0 && <p className="border-t px-3 py-2 text-xs text-muted-foreground sm:px-4">Per vedere l’elenco completo di {dati.troncati.join(", ")} apri le relative schede della singola commessa.</p>}
    </section>
  );
}

function Priorita({ titolo, dettaglio, href, azione }: { titolo: string; dettaglio: string; href?: string; azione?: () => void }) {
  const classe = "generale-priorita-link hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const contenuto = <>
    <span className="min-w-0 break-words text-sm font-medium">{titolo}</span>
    <span className="min-w-0 break-words text-xs text-muted-foreground">{dettaglio}</span>
    <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  </>;
  return <li>{href ? <Link to={href} className={classe}>{contenuto}</Link>
    : <button type="button" onClick={azione} className={classe}>{contenuto}</button>}</li>;
}
