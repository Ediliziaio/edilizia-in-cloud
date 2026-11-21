import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { outreachRpc } from "./outreachRpc";

const FILTRI = [
  ["tutte", "Tutte"], ["risposte", "Risposte"], ["chiamate", "Chiamate"],
  ["followup", "Follow-up"], ["assegnare", "Da assegnare o pianificare"],
] as const;
type Filtro = (typeof FILTRI)[number][0];
type Tipo = "email" | "whatsapp" | "chiamata" | "followup" | "trattativa";
interface AttivitaOggi {
  tipo: Tipo;
  id: string;
  titolo: string;
  descrizione: string;
  data: string | null;
  responsabile: string | null;
  nome_responsabile: string | null;
  priorita: number;
}
interface QuadroOggi { conteggi: Record<Filtro, number>; totale: number; righe: AttivitaOggi[] }
const PER_PAGINA = 10;
const dataOra = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
const dataGiorno = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "short" });
const AZIONI: Record<Tipo, { etichetta: string; link: string; pulsante: string }> = {
  email: { etichetta: "Email", link: "/admin/marketing?tab=posta&risposta=", pulsante: "Apri risposta" },
  whatsapp: { etichetta: "WhatsApp", link: "/admin/marketing/whatsapp-locale?chat=", pulsante: "Apri chat" },
  chiamata: { etichetta: "Chiamata", link: "/admin/marketing?tab=lead&chiamata=", pulsante: "Apri chiamata" },
  followup: { etichetta: "Follow-up", link: "/admin/marketing/opportunita?apri=", pulsante: "Apri trattativa" },
  trattativa: { etichetta: "Trattativa", link: "/admin/marketing/opportunita?apri=", pulsante: "Apri trattativa" },
};

export function OutreachTodayTasks({ companyId }: { companyId: string }) {
  const [filtro, setFiltro] = useState<Filtro>("tutte");
  const [pagina, setPagina] = useState(0);
  const q = useQuery({
    queryKey: ["outreach-oggi", companyId, filtro, pagina],
    queryFn: () => outreachRpc<QuadroOggi>("outreach_oggi", {
      p_company: companyId, p_filtro: filtro, p_offset: pagina * PER_PAGINA,
    }),
    refetchInterval: 30_000,
  });
  const righe = q.data?.righe ?? [];
  const totale = q.data?.totale ?? 0;

  return (
    <Card>
      <CardHeader className="px-4 py-4 sm:px-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" /> Da fare
        </CardTitle>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {FILTRI.map(([id, label]) => (
            <Button key={id} aria-pressed={filtro === id} size="sm" variant={filtro === id ? "secondary" : "ghost"}
              className="min-h-9 px-2.5" onClick={() => { setFiltro(id); setPagina(0); }}>
              {label}
              {q.data && <span className="ml-1.5 tabular-nums text-muted-foreground">{q.data.conteggi[id].toLocaleString("it-IT")}</span>}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {q.isPending ? <p role="status" className="px-5 pb-4 text-sm text-muted-foreground">Caricamento delle attività…</p>
          : q.isError ? (
            <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pb-4 text-sm">
              <span>Le attività sono momentaneamente indisponibili.</span>
              <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Riprova</Button>
            </div>
          ) : righe.length === 0 ? <p className="px-5 pb-4 text-sm text-muted-foreground">Nessuna attività per questa vista.</p>
            : (
              <ul className="divide-y border-t">
                {righe.map((riga) => {
                  const azione = AZIONI[riga.tipo];
                  const quando = riga.data
                    ? (riga.tipo === "trattativa" || riga.tipo === "followup" ? dataGiorno : dataOra).format(new Date(riga.data))
                    : "Senza scadenza";
                  return (
                    <li key={`${riga.tipo}:${riga.id}`} className="grid items-center gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:px-5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-xs font-normal">{azione.etichetta}</Badge>
                          <span className="min-w-0 truncate text-sm font-medium" title={riga.titolo}>{riga.titolo}</span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground" title={riga.descrizione}>{riga.descrizione}</p>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground sm:block">
                        <p className="truncate">{riga.nome_responsabile || (riga.responsabile ? "Assegnata" : "Da assegnare")}</p>
                        <p>{quando}</p>
                      </div>
                      <Button size="sm" variant="outline" asChild className="justify-self-start">
                        <Link to={azione.link + encodeURIComponent(riga.id)}>
                          {azione.pulsante}<ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
        {(pagina > 0 || totale > PER_PAGINA) && (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2">
            <span className="mr-auto text-xs text-muted-foreground">{totale.toLocaleString("it-IT")} attività</span>
            <Button size="sm" variant="outline" disabled={pagina === 0} onClick={() => setPagina(pagina - 1)}>Indietro</Button>
            <Button size="sm" variant="outline" disabled={(pagina + 1) * PER_PAGINA >= totale} onClick={() => setPagina(pagina + 1)}>Avanti</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
