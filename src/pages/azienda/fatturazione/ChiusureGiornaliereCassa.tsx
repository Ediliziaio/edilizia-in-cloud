import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { supabase } from "@/integrations/supabase/client";
import { chiaveQueryCassa, leggiPropostaCassa } from "@/lib/cassaInCloud";
import { chiaveGiornoCassa, confrontoChiusura } from "@/lib/fatturazione/confrontoCassa";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";
import { formatCount, formatCurrency, formatDateShort } from "@/lib/formatters";
import type { ConfrontoCassa, ValoriPropostaCassa } from "../../../../shared/cassaInCloud";
import { AbbinaAccreditoCassa, RiepilogoAccreditoCassa, ScritturaChiusuraCassa } from "./OperazioniChiusureCassa";

const importo = (n: number | null, valuta: string | null) => n === null ? "—" : valuta === "EUR" ? formatCurrency(n)
  : `${n.toLocaleString("it-IT", { minimumFractionDigits: 2 })}${valuta ? ` ${valuta}` : ""}`;

function DettaglioGiorno({ companyId, gruppo, puoAbbinare }: { companyId: string; gruppo: ConfrontoCassa; puoAbbinare: boolean }) {
  const permessi = usePermissions();
  const [scrittura, setScrittura] = useState<ValoriPropostaCassa | null>(null);
  const [abbina, setAbbina] = useState(false);
  const proposta = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "proposta", chiaveGiornoCassa(gruppo)],
    enabled: !!gruppo.cassa_id && (permessi.canViewPrimaNota || permessi.canViewTesoreria),
    queryFn: () => leggiPropostaCassa(companyId, gruppo),
  });
  const p = proposta.data;
  return (
    <div className="space-y-3 px-3 pb-3">
      {(gruppo.scontrini_assenti > 0 || gruppo.con_resi || gruppo.con_differiti || gruppo.con_fatture) && (
        <div className="flex flex-wrap gap-1">
          {gruppo.scontrini_assenti > 0 && <Badge variant="outline">Scontrini assenti {gruppo.scontrini_assenti}</Badge>}
          {gruppo.con_resi && <Badge variant="outline">Resi</Badge>}
          {gruppo.con_differiti && <Badge variant="outline">Differiti</Badge>}
          {gruppo.con_fatture && <Badge variant="outline">Fatture collegate</Badge>}
        </div>
      )}
      {gruppo.chiusure.map(({ id, dati: c, valuta, presente }) => (
        <div key={id} className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Chiusura {c.numero ? `n. ${c.numero}` : ""} · {formatDateShort(c.data_chiusura)} {c.ora?.slice(0, 5)}
            {!presente && <Badge variant="outline" className="ml-2">Assente nell’ultimo import</Badge>}
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {[
              ["Scontrini", c.totale_scontrini], ["Contanti", c.contanti], ["Elettronici", c.elettronici], ["Buoni", c.ticket],
              ["Differiti", c.differiti], ["Non incassati", c.non_incassato], ["Annulli", c.annulli],
              ["Fatture dirette", c.fatture_dirette], ["Note di credito", c.note_credito],
            ].map(([etichetta, valore]) => valore !== null && (
              <div key={String(etichetta)}>
                <dt className="text-xs text-muted-foreground">{etichetta}</dt><dd className="tabular-nums">{importo(Number(valore), valuta)}</dd>
              </div>
            ))}
          </dl>
          {!!c.iva.length && (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Aliquota IVA</TableHead><TableHead>Totale scontrini</TableHead><TableHead>Annulli</TableHead><TableHead>Pagamenti</TableHead>
              </TableRow></TableHeader>
              <TableBody>{c.iva.map((t, i) => (
                <TableRow key={`${t.id ?? "iva"}-${i}`}>
                  <TableCell>{[t.nome, t.aliquota !== null && `${t.aliquota}%`, t.natura, t.ventilazione && "Ventilazione"].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell>{importo(t.scontrini, valuta)}</TableCell>
                  <TableCell>{importo(t.annulli, valuta)}</TableCell>
                  <TableCell>{t.pagamenti.filter((q) => q.importo || q.annulli).map((q, j) => (
                    <p key={j} className="whitespace-nowrap">
                      {q.descrizione ?? (q.tipo === "CASH" ? "Contanti" : ["CASHCARD", "CREDITCARD"].includes(q.tipo) ? "Carta/POS" : q.tipo)}
                      {" · "}{importo(q.importo, valuta)}{!!q.annulli && ` · annulli ${importo(q.annulli, valuta)}`}
                    </p>
                  ))}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          )}
        </div>
      ))}
      {proposta.isLoading && proposta.fetchStatus === "fetching" && <p role="status" className="text-sm text-muted-foreground">Verifica operazioni collegate…</p>}
      {proposta.isError && <p role="alert" className="text-sm text-destructive">Operazioni collegate non disponibili. <button className="underline" onClick={() => void proposta.refetch()}>Riprova</button></p>}
      {p && (
        <>
          {!p.valori && <p className="text-sm text-muted-foreground">La proposta contabile richiede totali coerenti e pagamenti in contanti o con carta. Controlla dati, resi, annulli e fatture collegate.</p>}
          <div className="flex flex-wrap gap-2">
            {p.scrittura_id && <Button size="sm" variant="outline" asChild>
              <Link to={`/azienda/contabilita-generale?anno=${gruppo.giorno.slice(0, 4)}`}>Scrittura registrata</Link>
            </Button>}
            {!p.scrittura_id && p.puo_registrare && p.valori &&
              <Button size="sm" variant="outline" onClick={() => setScrittura(p.valori)}>Proponi scrittura Dare/Avere</Button>}
            {puoAbbinare && !p.accredito_id && p.valori?.pos > 0 &&
              <Button size="sm" variant="outline" onClick={() => setAbbina(true)}>Abbina accredito POS</Button>}
          </div>
          {p.scrittura_da_verificare && <p role="alert" className="text-sm text-destructive">I dati della chiusura sono cambiati dopo la registrazione. Verifica la scrittura.</p>}
          {p.pos_da_verificare && <p role="alert" className="text-sm text-destructive">I dati della chiusura sono cambiati dopo l’abbinamento. Verifica l’accredito POS.</p>}
          {p.accredito_id && <RiepilogoAccreditoCassa companyId={companyId} id={p.accredito_id} puoScollegare={puoAbbinare} />}
        </>
      )}
      {scrittura && <ScritturaChiusuraCassa companyId={companyId} gruppo={gruppo} valori={scrittura} onClose={() => setScrittura(null)} />}
      {abbina && <AbbinaAccreditoCassa companyId={companyId} gruppi={[gruppo]} onClose={() => setAbbina(false)} onFatto={() => setAbbina(false)} />}
    </div>
  );
}

export default function ChiusureGiornaliereCassa({ companyId, dal, al, punto }: { companyId: string; dal: string; al: string; punto: string }) {
  const permessi = usePermissions();
  const puoAbbinare = permessi.canReconcileBankTransactions && !permessi.solaLettura;
  const [aperto, setAperto] = useState<string | null>(null);
  const [selezionati, setSelezionati] = useState<string[]>([]);
  const [gruppiPos, setGruppiPos] = useState<ConfrontoCassa[] | null>(null);
  const giorni = (Date.parse(al) - Date.parse(dal)) / 86_400_000;
  const elenco = useQuery({
    queryKey: [...chiaveQueryCassa(companyId), "chiusure", dal, al],
    enabled: giorni >= 0 && giorni <= 61,
    queryFn: ({ signal }) => tutteLePagine<ConfrontoCassa>((da, a) =>
      supabase.rpc("cassa_in_cloud_confronto" as never, { p_company_id: companyId, p_dal: dal, p_al: al } as never)
        .range(da, a).abortSignal(signal)),
  });
  if (giorni > 61) return <p className="text-sm text-muted-foreground">Per confrontare le chiusure, seleziona fino a 62 giorni.</p>;
  if (elenco.isLoading) return <p role="status" className="text-sm text-muted-foreground">Caricamento chiusure…</p>;
  if (elenco.isError) return <p role="alert" className="text-sm text-destructive">Impossibile leggere le chiusure. <button className="underline" onClick={() => void elenco.refetch()}>Riprova</button></p>;
  const righe = (elenco.data ?? []).filter((g) => !punto || g.punto_vendita_id === punto);
  const attive = righe.filter((g) => selezionati.includes(chiaveGiornoCassa(g)) && confrontoChiusura(g).stato === "Scontrini allineati");
  if (!righe.length) return <p className="text-sm text-muted-foreground">Nessuna chiusura o scontrino importato nel periodo.</p>;
  return (
    <div className="space-y-2">
      {!!attive.length && puoAbbinare && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setGruppiPos(attive)}>Abbina accredito POS ({attive.length})</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelezionati([])}>Deseleziona</Button>
        </div>
      )}
      <Card>
        <Table>
          <TableHeader><TableRow>
            {puoAbbinare && <TableHead className="w-10">POS</TableHead>}
            <TableHead>Giorno e cassa</TableHead><TableHead>Scontrini importati</TableHead>
            <TableHead>Chiusura</TableHead><TableHead>Confronto</TableHead><TableHead />
          </TableRow></TableHeader>
          <TableBody>{righe.map((g) => {
            const key = chiaveGiornoCassa(g);
            const c = confrontoChiusura(g);
            const eAperto = aperto === key;
            return (
              <RigaChiusura key={key} g={g} c={c} aperta={eAperto} puoAbbinare={puoAbbinare}
                selezionata={selezionati.includes(key)} limite={selezionati.length >= 31}
                onApri={() => setAperto(eAperto ? null : key)}
                onSeleziona={(checked) => setSelezionati((s) => checked ? [...s, key] : s.filter((k) => k !== key))}>
                {eAperto && <DettaglioGiorno companyId={companyId} gruppo={g} puoAbbinare={puoAbbinare} />}
              </RigaChiusura>
            );
          })}</TableBody>
        </Table>
      </Card>
      {gruppiPos && puoAbbinare && <AbbinaAccreditoCassa companyId={companyId} gruppi={gruppiPos}
        onClose={() => setGruppiPos(null)} onFatto={() => { setGruppiPos(null); setSelezionati([]); }} />}
    </div>
  );
}

function RigaChiusura({ g, c, aperta, puoAbbinare, selezionata, limite, onApri, onSeleziona, children }: {
  g: ConfrontoCassa; c: ReturnType<typeof confrontoChiusura>; aperta: boolean; puoAbbinare: boolean;
  selezionata: boolean; limite: boolean; onApri: () => void; onSeleziona: (v: boolean) => void; children: React.ReactNode;
}) {
  return (
    <>
      <TableRow>
        {puoAbbinare && <TableCell>{c.stato === "Scontrini allineati" && (
          <Checkbox aria-label={`Seleziona ${g.punto_vendita_nome}, cassa ${g.cassa_id}, ${g.giorno} per il POS`}
            checked={selezionata} disabled={limite && !selezionata} onCheckedChange={(v) => onSeleziona(v === true)} />
        )}</TableCell>}
        <TableCell>
          <p className="whitespace-nowrap font-medium">{formatDateShort(g.giorno)} · {g.cassa_id ? `Cassa ${g.cassa_id}` : "Cassa non indicata"}</p>
          <p className="text-xs text-muted-foreground">{g.punto_vendita_nome}</p>
        </TableCell>
        <TableCell className="whitespace-nowrap">{formatCount(g.numero_scontrini)} · {importo(g.totale_scontrini, c.valuta)}</TableCell>
        <TableCell className="whitespace-nowrap">{c.numero === null ? "—" : `${formatCount(c.numero)} · ${importo(c.importo, c.valuta)}`}</TableCell>
        <TableCell>
          <Badge variant={c.stato === "Scontrini allineati" ? "secondary" : "outline"} className="whitespace-nowrap">{c.stato}</Badge>
          {c.scostamento !== null && c.scostamento !== 0 && <p className="mt-1 text-xs text-destructive">{importo(c.scostamento, c.valuta)}</p>}
        </TableCell>
        <TableCell><Button size="sm" variant="ghost" aria-expanded={aperta} onClick={onApri}>{aperta ? "Chiudi" : "Dettaglio"}</Button></TableCell>
      </TableRow>
      {aperta && <TableRow><TableCell colSpan={puoAbbinare ? 6 : 5} className="p-0">{children}</TableCell></TableRow>}
    </>
  );
}
