/**
 * EmailSearchBar — barra ricerca con operators stile Gmail
 *
 * Operatori supportati:
 *   from:user@dominio.it    → filtra mittente
 *   to:user@dominio.it      → filtra destinatario
 *   subject:keyword         → filtra oggetto
 *   has:attachment          → solo con allegati
 *   has:star                → solo starred
 *   is:unread               → solo non letti
 *   before:2026-05-01       → ricevute prima di
 *   after:2026-05-01        → ricevute dopo di
 *
 * Token query (testo libero) cerca in subject + raw_text.
 *
 * Il search applica i filtri al frontend usando v_my_email_inbox; per
 * full-text + vector search avanzato (Sprint E5+) servirà un edge dedicato.
 */
import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, X, HelpCircle } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

export interface SearchQuery {
  raw: string;
  text?: string;
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  hasStar?: boolean;
  isUnread?: boolean;
  before?: string; // ISO date
  after?: string;  // ISO date
}

const OPERATOR_RE = /(from|to|subject|has|is|before|after):(\S+)/g;

export function parseSearchQuery(raw: string): SearchQuery {
  const q: SearchQuery = { raw };
  let textPart = raw;
  let m;
  while ((m = OPERATOR_RE.exec(raw)) !== null) {
    const [, op, val] = m;
    textPart = textPart.replace(m[0], "").trim();
    switch (op) {
      case "from":     q.from = val; break;
      case "to":       q.to = val; break;
      case "subject":  q.subject = val; break;
      case "has":
        if (val === "attachment") q.hasAttachment = true;
        else if (val === "star" || val === "starred") q.hasStar = true;
        break;
      case "is":
        if (val === "unread") q.isUnread = true;
        break;
      case "before":   q.before = val; break;
      case "after":    q.after = val; break;
    }
  }
  if (textPart.trim().length > 0) q.text = textPart.trim();
  return q;
}

interface EmailSearchBarProps {
  onSearch: (query: SearchQuery | null) => void;
}

export function EmailSearchBar({ onSearch }: EmailSearchBarProps) {
  const [value, setValue] = useState("");
  const debRef = useRef<number | null>(null);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = window.setTimeout(() => {
      if (!value.trim()) {
        onSearch(null);
      } else {
        onSearch(parseSearchQuery(value.trim()));
      }
    }, 250);
    return () => {
      if (debRef.current) clearTimeout(debRef.current);
    };
  }, [value, onSearch]);

  return (
    <div className="px-3 py-2 border-b bg-background">
      <div className="relative flex items-center gap-1">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Cerca: from:nome@dominio.it has:attachment …"
          className="pl-8 pr-8 h-8 text-xs"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            className="absolute right-9 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Operators">
              <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 text-xs space-y-2 p-3">
            <p className="font-semibold">Operatori ricerca</p>
            <ul className="space-y-1">
              <li><Badge variant="outline" className="text-[10px]">from:</Badge> mittente</li>
              <li><Badge variant="outline" className="text-[10px]">to:</Badge> destinatario</li>
              <li><Badge variant="outline" className="text-[10px]">subject:</Badge> oggetto contiene</li>
              <li><Badge variant="outline" className="text-[10px]">has:attachment</Badge> con allegati</li>
              <li><Badge variant="outline" className="text-[10px]">has:star</Badge> starred</li>
              <li><Badge variant="outline" className="text-[10px]">is:unread</Badge> non letti</li>
              <li><Badge variant="outline" className="text-[10px]">before:2026-05-01</Badge></li>
              <li><Badge variant="outline" className="text-[10px]">after:2026-05-01</Badge></li>
            </ul>
            <p className="text-muted-foreground text-[10px]">
              Combina più operatori: <code>from:bob has:attachment is:unread</code>
            </p>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
