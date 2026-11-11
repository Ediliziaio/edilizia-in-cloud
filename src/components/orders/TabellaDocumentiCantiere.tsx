import { useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ArrowUpRight, Download, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  linkGiornale,
  nomeCantiereGiornale,
  type DocumentoCantiere,
} from "@/lib/orders/documentiCantiere";
import {
  nomeCantiere,
  oreDi,
  personeDi,
  statoDi,
  type RapportinoRiga,
} from "@/lib/orders/rapportiniMese";
import { statoGiornale } from "@/lib/campo/statoGiornale";

const STATI: Record<string, { label: string; classe: string }> = {
  inviato: {
    label: "Da approvare",
    classe: "border-amber-300 bg-amber-50 text-amber-700",
  },
  approvato: {
    label: "Approvato",
    classe: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  rifiutato: {
    label: "Rifiutato",
    classe: "border-red-200 bg-red-50 text-red-700",
  },
  bozza: {
    label: "Bozza",
    classe: "border-slate-200 bg-slate-50 text-slate-600",
  },
  firmata: {
    label: "Firmata",
    classe: "border-violet-200 bg-violet-50 text-violet-700",
  },
};

export function TabellaDocumentiCantiere({
  righe,
  onApri,
  onPdf,
  pdfInCorso,
  giornoLungo,
}: {
  righe: DocumentoCantiere[];
  onApri: (id: string) => void;
  onPdf: (r: RapportinoRiga) => void;
  pdfInCorso: string | null;
  giornoLungo: (giorno: string) => string;
}) {
  const [pagina, setPagina] = useState(0);
  const pagine = Math.max(1, Math.ceil(righe.length / 50));
  const attuale = Math.min(pagina, pagine - 1);
  return (
    <>
      <div className="overflow-x-auto">
        <table
          aria-label="Elenco rapportini"
          className="w-full min-w-[1000px] table-fixed border-collapse text-sm"
        >
          <colgroup>
            <col className="w-[6.5rem]" />
            <col className="w-[6.5rem]" />
            <col className="w-32" />
            <col className="w-44" />
            <col />
            <col className="w-32" />
            <col className="w-16" />
            <col className="w-12" />
            <col className="w-14" />
          </colgroup>
          <thead className="border-b bg-slate-50 text-xs text-slate-500">
            <tr>
              {[
                "Data",
                "Stato",
                "Tipo",
                "Cantiere",
                "Lavori eseguiti",
                "Persone / presenze",
                "Ore",
                "Foto",
                "Azioni",
              ].map((nome) => (
                <th
                  key={nome}
                  scope="col"
                  title={nome}
                  className="truncate px-3 py-2 text-left font-medium"
                >
                  {nome}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {righe.slice(attuale * 50, (attuale + 1) * 50).map((d) => {
              const r = d.riga;
              const nome =
                d.tipo === "giornale"
                  ? nomeCantiereGiornale(d.riga)
                  : nomeCantiere(d.riga);
              const cantiere = [nome, r.order?.order_code]
                .filter(Boolean)
                .join(" · ");
              const descrizione =
                (d.tipo === "giornale"
                  ? d.riga.lavorazioni_eseguite
                  : d.riga.descrizione_lavori
                )?.trim() || "Nessuna descrizione";
              const persone =
                d.tipo === "giornale"
                  ? d.riga.personale_presente == null
                    ? "—"
                    : `${d.riga.personale_presente} presenze`
                  : personeDi(d.riga)
                      .map((p) => p.nome)
                      .join(", ");
              const stato =
                STATI[
                  d.tipo === "giornale"
                    ? statoGiornale(d.riga)
                    : statoDi(d.riga)
                ];
              const etichetta = `Apri ${d.tipo === "giornale" ? "giornale lavori" : "rapportino"}: ${cantiere}, ${d.data}`;
              return (
                <tr
                  key={d.chiave}
                  className="h-11 whitespace-nowrap hover:bg-slate-50"
                  onClick={
                    d.tipo === "rapportino"
                      ? () => onApri(d.riga.id)
                      : undefined
                  }
                >
                  <td className="truncate px-3" title={giornoLungo(d.data)}>
                    {format(parseISO(d.data), "dd/MM/yyyy")}
                  </td>
                  <td className="px-3">
                    <Badge
                      variant="outline"
                      className={`whitespace-nowrap py-0 text-[11px] font-medium ${stato.classe}`}
                    >
                      {stato.label}
                    </Badge>
                  </td>
                  <td
                    className="truncate px-3 text-xs"
                    title={
                      d.tipo === "giornale" ? "Giornale lavori" : "Rapportino"
                    }
                  >
                    {d.tipo === "giornale" ? "Giornale lavori" : "Rapportino"}
                  </td>
                  <td className="min-w-0 px-3">
                    {d.tipo === "giornale" ? (
                      <Link
                        className="block truncate font-medium text-slate-900 hover:underline"
                        title={cantiere}
                        aria-label={etichetta}
                        to={linkGiornale(d.riga)}
                      >
                        {cantiere}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="block w-full truncate text-left font-medium text-slate-900 hover:underline"
                        title={cantiere}
                        aria-label={etichetta}
                        onClick={(e) => {
                          e.stopPropagation();
                          onApri(d.riga.id);
                        }}
                      >
                        {cantiere}
                      </button>
                    )}
                  </td>
                  <td
                    className="truncate px-3 text-slate-700"
                    title={descrizione}
                  >
                    {descrizione}
                  </td>
                  <td
                    className="truncate px-3 text-xs text-slate-500"
                    title={persone}
                  >
                    {persone}
                  </td>
                  <td
                    className="px-3 text-right tabular-nums"
                    title={
                      d.tipo === "giornale"
                        ? "Ore conteggiate nei rapportini, senza duplicarle nel giornale"
                        : undefined
                    }
                  >
                    {d.tipo === "giornale"
                      ? "—"
                      : `${oreDi(d.riga).toLocaleString("it-IT", { maximumFractionDigits: 1 })} h`}
                  </td>
                  <td className="px-3 text-right tabular-nums">
                    {(d.tipo === "giornale"
                      ? d.riga.giornale_foto?.length
                      : d.riga.foto_urls?.length) || "—"}
                  </td>
                  <td className="px-1">
                    {d.tipo === "giornale" ? (
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                      >
                        <Link
                          to={linkGiornale(d.riga)}
                          aria-label={`Apri il giornale: ${nome}, ${giornoLungo(d.data)}`}
                          title="Apri il giornale"
                        >
                          <ArrowUpRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9"
                        disabled={pdfInCorso === r.id}
                        aria-label={`Scarica il PDF: ${nome}, ${giornoLungo(d.data)}`}
                        title="Scarica PDF"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (d.tipo === "rapportino") onPdf(d.riga);
                        }}
                      >
                        {pdfInCorso === r.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-slate-500">
        <span>
          {attuale * 50 + 1}–{Math.min((attuale + 1) * 50, righe.length)} di{" "}
          {righe.length} documenti
        </span>
        {pagine > 1 && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={attuale === 0}
              onClick={() => setPagina(attuale - 1)}
            >
              Precedenti
            </Button>
            <span>
              Pagina {attuale + 1} di {pagine}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={attuale + 1 === pagine}
              onClick={() => setPagina(attuale + 1)}
            >
              Successivi
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
