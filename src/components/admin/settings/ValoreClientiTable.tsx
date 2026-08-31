/**
 * ValoreClientiTable — la stessa realta' di Clienti-Servizio, ribaltata: una
 * riga per CLIENTE invece che una per contratto.
 *
 * La tabella di default elenca le relazioni, quindi chi compra tre volte
 * compare tre volte e per sapere quanto vale bisogna cercarlo e sommare a
 * mente. Qui gli acquisti dello stesso contatto stanno insieme, e il totale
 * speso e' un numero che si legge.
 *
 * Legge la vista public.v_aedix_valore_cliente, che aggrega su contact_id —
 * l'identita' obbligatoria del cliente-servizio. Senza quel vincolo questa
 * schermata non potrebbe esistere: gli acquisti della stessa persona non
 * sarebbero riconoscibili come tali.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Loader2, Search, UserRound, Repeat } from "lucide-react";

const sb = () => supabase as any;

const eur = (n: number) =>
  new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: true })
    .format(Math.round(n || 0));

const dataIt = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("it-IT", { month: "short", year: "numeric" }) : "—";

interface ValoreCliente {
  contact_id: string;
  cliente_nome: string | null;
  servizi_acquistati: number;
  servizi_attivi: number;
  primo_acquisto: string | null;
  ultimo_acquisto: string | null;
  totale_dovuto: number;
  totale_incassato: number;
  ultimo_incasso: string | null;
  ricorrente_mese: number;
  servizi: string[] | null;
}

export function ValoreClientiTable() {
  const [search, setSearch] = useState("");

  const { data: righe = [], isLoading } = useQuery<ValoreCliente[]>({
    queryKey: ["aedix-valore-cliente"],
    queryFn: async () => {
      const { data, error } = await sb()
        .from("v_aedix_valore_cliente")
        .select("*")
        .order("totale_incassato", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ValoreCliente[];
    },
  });

  const filtrate = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return righe;
    return righe.filter((r) =>
      (r.cliente_nome ?? "").toLowerCase().includes(q) ||
      (r.servizi ?? []).some((s) => s.toLowerCase().includes(q)));
  }, [righe, search]);

  // Chi ha comprato piu' di una volta e' il dato che questa vista esiste per
  // mostrare: e' la base su cui si costruiscono i lanci e le riproposizioni.
  const kpi = useMemo(() => {
    const ricorrenti = righe.filter((r) => r.servizi_acquistati > 1);
    const incassato = righe.reduce((s, r) => s + Number(r.totale_incassato || 0), 0);
    return {
      clienti: righe.length,
      ricorrenti: ricorrenti.length,
      incassato,
      medio: righe.length ? incassato / righe.length : 0,
    };
  }, [righe]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (righe.length === 0) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
        Ancora nessun cliente. Nascono da un'opportunità vinta o dal pulsante “Nuovo cliente-servizio”.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { l: "Clienti", v: String(kpi.clienti) },
          { l: "Hanno ricomprato", v: String(kpi.ricorrenti) },
          { l: "Incassato totale", v: eur(kpi.incassato) },
          { l: "Valore medio", v: eur(kpi.medio) },
        ].map((k) => (
          <Card key={k.l}><CardContent className="p-3">
            <div className="text-[11px] text-muted-foreground">{k.l}</div>
            <div className="text-lg font-semibold tabular-nums">{k.v}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca cliente o servizio…" className="pl-9" />
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Cosa ha comprato</TableHead>
              <TableHead>Dal</TableHead>
              <TableHead>Ultimo</TableHead>
              <TableHead className="text-right">Ricorrente</TableHead>
              <TableHead className="text-right">Totale speso</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrate.map((r) => (
              <TableRow key={r.contact_id}>
                <TableCell>
                  <span className="flex items-center gap-2 font-medium">
                    <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                    {r.cliente_nome || "—"}
                    {r.servizi_acquistati > 1 && (
                      <span title={`${r.servizi_acquistati} acquisti`}>
                        <Repeat className="h-3 w-3 text-emerald-600" />
                      </span>
                    )}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {(r.servizi ?? []).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                    ))}
                    {r.servizi_attivi === 0 && (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">nessuno attivo</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{dataIt(r.primo_acquisto)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{dataIt(r.ultimo_acquisto)}</TableCell>
                <TableCell className="text-right tabular-nums text-sm">
                  {r.ricorrente_mese > 0 ? `${eur(r.ricorrente_mese)}/mese` : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {eur(r.totale_incassato)}
                  {Number(r.totale_dovuto) > Number(r.totale_incassato) && (
                    <div className="text-[10px] font-normal text-amber-600">
                      {eur(Number(r.totale_dovuto) - Number(r.totale_incassato))} da incassare
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}
