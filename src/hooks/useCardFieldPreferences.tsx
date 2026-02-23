import { useState, useCallback, createContext, useContext, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";

export type CardLayout = "default" | "compact" | "no-label";

export interface FieldDefinition {
  key: string;
  label: string;
  section: string;
  locked?: boolean;
}

const DEFAULT_ACTIVE_FIELDS = [
  "opp_name",
  "tags",
  "owner",
  "source",
  "value",
  "lost_reason",
  "contact_email",
  "contact_phone",
];

export const BUILT_IN_FIELDS: FieldDefinition[] = [
  { key: "opp_name", label: "Nome opportunità", section: "main", locked: true },
  { key: "tags", label: "Etichette intelligenti", section: "main" },
  { key: "owner", label: "Titolare dell'opportunità", section: "main" },
  { key: "source", label: "Fonte dell'opportunità", section: "main" },
  { key: "value", label: "Valore dell'opportunità", section: "main" },
  { key: "lost_reason", label: "Motivo della perdita", section: "main" },
  { key: "contact_email", label: "Email del contatto", section: "main" },
  { key: "contact_phone", label: "Telefono del contatto", section: "main" },
  { key: "created_at", label: "Creato il", section: "other" },
  { key: "updated_at", label: "Aggiornato il", section: "other" },
  { key: "status_changed_at", label: "Data ultima modifica stato", section: "other" },
  { key: "stage_changed_at", label: "Data ultima modifica fase", section: "other" },
  { key: "appointment_date", label: "Data appuntamento", section: "other" },
  { key: "contact_name", label: "Contatto (nome completo)", section: "contact" },
  { key: "contact_company", label: "Nome dell'azienda", section: "contact" },
  { key: "contact_city", label: "Città", section: "contact" },
  { key: "contact_source", label: "Fonte contatto", section: "contact" },
  { key: "pipeline", label: "Sequenza", section: "opportunity" },
  { key: "stage", label: "Fase", section: "opportunity" },
  { key: "status", label: "Stato", section: "opportunity" },
];

function getFieldsKey(companyId: string) {
  return `opp_card_fields_${companyId}`;
}
function getLayoutKey(companyId: string) {
  return `opp_card_layout_${companyId}`;
}

interface CardFieldPreferencesValue {
  activeFields: string[];
  layout: CardLayout;
  setActiveFields: (fields: string[]) => void;
  setLayout: (l: CardLayout) => void;
  isFieldActive: (key: string) => boolean;
}

const CardFieldPreferencesContext = createContext<CardFieldPreferencesValue | null>(null);

export function CardFieldPreferencesProvider({ children }: { children: ReactNode }) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id || "default";

  const [activeFields, setActiveFieldsState] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(getFieldsKey(companyId));
      return stored ? JSON.parse(stored) : DEFAULT_ACTIVE_FIELDS;
    } catch {
      return DEFAULT_ACTIVE_FIELDS;
    }
  });

  const [layout, setLayoutState] = useState<CardLayout>(() => {
    try {
      return (localStorage.getItem(getLayoutKey(companyId)) as CardLayout) || "default";
    } catch {
      return "default";
    }
  });

  const setActiveFields = useCallback(
    (fields: string[]) => {
      const withLocked = fields.includes("opp_name") ? fields : ["opp_name", ...fields];
      setActiveFieldsState(withLocked);
      localStorage.setItem(getFieldsKey(companyId), JSON.stringify(withLocked));
    },
    [companyId],
  );

  const setLayout = useCallback(
    (l: CardLayout) => {
      setLayoutState(l);
      localStorage.setItem(getLayoutKey(companyId), l);
    },
    [companyId],
  );

  const isFieldActive = useCallback((key: string) => activeFields.includes(key), [activeFields]);

  return (
    <CardFieldPreferencesContext.Provider value={{ activeFields, layout, setActiveFields, setLayout, isFieldActive }}>
      {children}
    </CardFieldPreferencesContext.Provider>
  );
}

export function useCardFieldPreferences(): CardFieldPreferencesValue {
  const ctx = useContext(CardFieldPreferencesContext);
  if (!ctx) {
    throw new Error("useCardFieldPreferences must be used within CardFieldPreferencesProvider");
  }
  return ctx;
}
