import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, Search, X, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  useOrdiniByFattura,
  useLinkFatturaOrdine,
  useUnlinkFatturaOrdine,
  useSearchOrders,
} from "@/hooks/billing/useFatturaOrdineLink";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { formatCurrency } from "@/lib/formatters";
import type { EditorState } from "./useEditorState";

interface Props {
  state: EditorState;
  dispatch: React.Dispatch<any>;
  disabled?: boolean;
}

export function EditorOrdineSection({ state, disabled }: Props) {
  const companyId = useEffectiveCompanyId();
  const fatturaId = state.id;
  const [searchParams] = useSearchParams();
  const autoLinkRef = useRef(false);
  const { data: linkedOrdini = [], isLoading } = useOrdiniByFattura(fatturaId);
  const linkMutation = useLinkFatturaOrdine();
  const unlinkMutation = useUnlinkFatturaOrdine();

  const [search, setSearch] = useState("");
  const [popoverOpen, setPopoverOpen] = useState(false);
  const { data: searchResults = [] } = useSearchOrders(companyId, search);

  // Auto-link order when created from order CTA
  const ordineLinkParam = searchParams.get("ordine_link");
  useEffect(() => {
    if (ordineLinkParam && fatturaId && companyId && !autoLinkRef.current && !isLoading) {
      const alreadyLinked = linkedOrdini.some((l: any) => l.ordine_id === ordineLinkParam);
      if (!alreadyLinked) {
        autoLinkRef.current = true;
        linkMutation.mutate({ fatturaId, ordineId: ordineLinkParam, companyId });
      }
    }
  }, [ordineLinkParam, fatturaId, companyId, isLoading, linkedOrdini]);

  // Filter out already linked
  const linkedIds = new Set(linkedOrdini.map((l: any) => l.ordine_id));
  const filteredResults = searchResults.filter((o) => !linkedIds.has(o.id));

  const handleLink = (ordineId: string) => {
    if (!fatturaId || !companyId) return;
    linkMutation.mutate({ fatturaId, ordineId, companyId });
    setPopoverOpen(false);
    setSearch("");
  };

  const handleUnlink = (ordineId: string) => {
    if (!fatturaId) return;
    unlinkMutation.mutate({ fatturaId, ordineId });
  };

  if (!fatturaId) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Ordine collegato
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Linked orders */}
        {linkedOrdini.length > 0 && (
          <div className="space-y-2">
            {linkedOrdini.map((link: any) => {
              const ordine = link.ordine;
              if (!ordine) return null;
              return (
                <div
                  key={link.ordine_id}
                  className="flex items-center justify-between gap-2 p-2 rounded-md border bg-muted/30"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {ordine.order_code ?? "—"}
                    </Badge>
                    <span className="text-sm truncate">
                      {ordine.description?.slice(0, 50)}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {formatCurrency(ordine.total_amount)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                      <Link to={`/azienda/ordini/${ordine.id}`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {!disabled && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleUnlink(link.ordine_id)}
                        disabled={unlinkMutation.isPending}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add order button */}
        {!disabled && (
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="w-full text-xs">
                <Search className="h-3.5 w-3.5 mr-1.5" />
                {linkedOrdini.length === 0
                  ? "Collega un ordine"
                  : "Collega altro ordine"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-2" align="start">
              <Input
                placeholder="Cerca per codice o descrizione..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs mb-2"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {filteredResults.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {search ? "Nessun ordine trovato" : "Digita per cercare"}
                  </p>
                )}
                {filteredResults.map((o) => (
                  <button
                    key={o.id}
                    className="w-full text-left p-2 rounded-md hover:bg-accent text-xs space-y-0.5"
                    onClick={() => handleLink(o.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {o.order_code ?? "Senza codice"}
                      </span>
                      <span className="text-muted-foreground">
                        {formatCurrency(o.total_amount)}
                      </span>
                    </div>
                    <p className="text-muted-foreground truncate">
                      {o.description?.slice(0, 60)}
                    </p>
                    {o.customer && (
                      <p className="text-muted-foreground">
                        {o.customer.first_name} {o.customer.last_name}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {isLoading && linkedOrdini.length === 0 && (
          <p className="text-xs text-muted-foreground">Caricamento...</p>
        )}
      </CardContent>
    </Card>
  );
}
