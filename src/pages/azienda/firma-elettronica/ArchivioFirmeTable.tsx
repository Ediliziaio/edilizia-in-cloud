import { BarraScorrimentoOrizzontale } from "@/components/common/BarraScorrimentoOrizzontale";
import { useMemo, useState, type ReactNode } from "react";
import { Columns3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatFirmaDate } from "@/lib/fea/firmaElettronicaHub";
import { costruisciCsv, scaricaCsv } from "@/lib/csv";
import type { SignatureRequestRow } from "./index";

const columns = ["Documento", "Tipo", "Firmatario", "Email", "Metodo", "Stato", "Creata il", "Inviata il", "Firmata il", "Scadenza"] as const;
type Column = typeof columns[number];
export function useColonneFirme(storageKey: string) {
  const initial = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved)) return columns.filter(c => c === "Documento" || saved.includes(c));
    } catch { /* Preferenze facoltative. */ }
    return [...columns];
  }, [storageKey]);
  const [choice, setChoice] = useState<{key: string; columns: Column[]}>();
  const visible = choice?.key === storageKey ? choice.columns : initial;
  function toggleColumn(column: Column) {
    const next = columns.filter(c => c === column ? !visible.includes(c) : visible.includes(c));
    setChoice({key: storageKey, columns: next});
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Valida nella sessione. */ }
  }
  return { visible, toggleColumn };
}

export function MenuColonneFirme({ visible, toggleColumn }: ReturnType<typeof useColonneFirme>) {
  return (<DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="outline"><Columns3 className="mr-1 h-4 w-4" />Colonne</Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label="Colonne visibili">{columns.map(c =>
          <DropdownMenuCheckboxItem key={c} checked={visible.includes(c)} disabled={c === "Documento"}
            onSelect={e => e.preventDefault()} onCheckedChange={() => toggleColumn(c)}>{c}</DropdownMenuCheckboxItem>)}</DropdownMenuContent>
      </DropdownMenu>);
}

export function ArchivioFirmeTable({ rows, visible, openDetail, status, documentType, actions }: {
  rows: SignatureRequestRow[];
  visible: Column[];
  openDetail: (id: string) => void;
  status: (row: SignatureRequestRow) => { label: string; className: string };
  documentType: (row: SignatureRequestRow) => string;
  actions: (row: SignatureRequestRow) => ReactNode;
}) {
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedRows = rows.filter(r => selected.has(r.id));
  const all = rows.length > 0 && selectedRows.length === rows.length;
  function values(r: SignatureRequestRow): Record<Column, string> {
    return {
      Documento: r.documento_label || "Documento", Tipo: documentType(r), Firmatario: r.signer_name || "—",
      Email: r.signer_email || "—", Metodo: r.metodo_firma, Stato: status(r).label,
      "Creata il": formatFirmaDate(r.created_at), "Inviata il": formatFirmaDate(r.sent_at),
      "Firmata il": formatFirmaDate(r.signed_at), Scadenza: formatFirmaDate(r.expires_at),
    };
  }
  return <div className="overflow-hidden rounded-xl border bg-card">
    {selectedRows.length > 0 && <div className="flex flex-wrap items-center justify-end gap-2 border-b px-3 py-1.5">
        <span role="status" className="mr-auto text-xs">{selectedRows.length} selezionate</span>
        <Button size="sm" variant="outline" onClick={() => scaricaCsv("richieste-firma.csv", costruisciCsv(selectedRows.map(values), visible.map(c => ({ label: c, valore: row => row[c] }))))}>Esporta CSV</Button>
        <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Deseleziona</Button>
    </div>}
      <BarraScorrimentoOrizzontale contenitore={scrollContainer} className="mx-3 my-2" />
    <Table wrapperRef={setScrollContainer} aria-label="Archivio richieste di firma" className="whitespace-nowrap text-sm [&_td]:py-2">
      <TableHeader><TableRow><TableHead><Checkbox aria-label="Seleziona tutte le richieste visualizzate"
        checked={all || (selectedRows.length ? "indeterminate" : false)} onCheckedChange={checked => setSelected(new Set(checked ? rows.map(r => r.id) : []))} /></TableHead>
        {visible.map(c => <TableHead key={c}>{c}</TableHead>)}<TableHead className="text-right">Azione</TableHead>
      </TableRow></TableHeader>
      <TableBody>{rows.map(r => {
        const data = values(r);
        return <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
          <TableCell><Checkbox aria-label={`Seleziona ${data.Documento} · ${data.Firmatario}`} checked={selected.has(r.id)}
            onCheckedChange={checked => setSelected(prev => {
              const next = new Set(prev);
              if (checked) next.add(r.id); else next.delete(r.id);
              return next;
            })} /></TableCell>
          {visible.map(c => <TableCell key={c}>{c === "Documento"
            ? <button type="button" title={data.Documento} className="block max-w-[32vw] truncate text-left font-medium text-blue-700 hover:underline" onClick={() => openDetail(r.id)}>{data.Documento}</button>
            : c === "Stato" ? <Badge className={status(r).className}>{data.Stato}</Badge> : data[c]}</TableCell>)}
          <TableCell className="text-right">{actions(r)}</TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </div>;
}
