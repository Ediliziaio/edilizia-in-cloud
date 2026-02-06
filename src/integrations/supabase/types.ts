export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      article_templates: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string
          email: string
          id: string
          logo_url: string | null
          name: string
          sector: Database["public"]["Enums"]["company_sector"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          logo_url?: string | null
          name: string
          sector?: Database["public"]["Enums"]["company_sector"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          logo_url?: string | null
          name?: string
          sector?: Database["public"]["Enums"]["company_sector"]
          updated_at?: string
        }
        Relationships: []
      }
      order_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          order_id: string
          uploaded_by: string
          visible_to_customer: boolean
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          order_id: string
          uploaded_by: string
          visible_to_customer?: boolean
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          order_id?: string
          uploaded_by?: string
          visible_to_customer?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "order_attachments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_item_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          order_item_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          order_item_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          order_item_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_item_attachments_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          order_id: string
          position: number | null
          purchase_price: number | null
          quantity: number | null
          status: string | null
          supplier_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          order_id: string
          position?: number | null
          purchase_price?: number | null
          quantity?: number | null
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          order_id?: string
          position?: number | null
          purchase_price?: number | null
          quantity?: number | null
          status?: string | null
          supplier_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string
          id: string
          order_id: string
          status_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          id?: string
          order_id: string
          status_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          id?: string
          order_id?: string
          status_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_history_status_id_fkey"
            columns: ["status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_statuses: {
        Row: {
          color: string
          company_id: string
          created_at: string
          icon: string
          id: string
          is_default: boolean
          name: string
          position: number
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          icon?: string
          id?: string
          is_default?: boolean
          name: string
          position?: number
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          icon?: string
          id?: string
          is_default?: boolean
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_statuses_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          balance_amount: number
          balance_expected_date: string | null
          balance_paid: boolean | null
          balance_paid_date: string | null
          company_id: string
          created_at: string
          current_status_id: string | null
          customer_id: string
          deposit_2_amount: number | null
          deposit_2_expected_date: string | null
          deposit_2_paid: boolean | null
          deposit_2_paid_date: string | null
          deposit_amount: number
          deposit_expected_date: string | null
          deposit_paid: boolean | null
          deposit_paid_date: string | null
          description: string
          expected_date: string | null
          financing_amount: number | null
          id: string
          internal_notes: string | null
          order_code: string | null
          payment_type: string | null
          total_amount: number
          updated_at: string
          vat_rate: number | null
          warehouse_arrival_date: string | null
          work_end_date: string | null
          work_start_date: string | null
        }
        Insert: {
          balance_amount?: number
          balance_expected_date?: string | null
          balance_paid?: boolean | null
          balance_paid_date?: string | null
          company_id: string
          created_at?: string
          current_status_id?: string | null
          customer_id: string
          deposit_2_amount?: number | null
          deposit_2_expected_date?: string | null
          deposit_2_paid?: boolean | null
          deposit_2_paid_date?: string | null
          deposit_amount?: number
          deposit_expected_date?: string | null
          deposit_paid?: boolean | null
          deposit_paid_date?: string | null
          description: string
          expected_date?: string | null
          financing_amount?: number | null
          id?: string
          internal_notes?: string | null
          order_code?: string | null
          payment_type?: string | null
          total_amount?: number
          updated_at?: string
          vat_rate?: number | null
          warehouse_arrival_date?: string | null
          work_end_date?: string | null
          work_start_date?: string | null
        }
        Update: {
          balance_amount?: number
          balance_expected_date?: string | null
          balance_paid?: boolean | null
          balance_paid_date?: string | null
          company_id?: string
          created_at?: string
          current_status_id?: string | null
          customer_id?: string
          deposit_2_amount?: number | null
          deposit_2_expected_date?: string | null
          deposit_2_paid?: boolean | null
          deposit_2_paid_date?: string | null
          deposit_amount?: number
          deposit_expected_date?: string | null
          deposit_paid?: boolean | null
          deposit_paid_date?: string | null
          description?: string
          expected_date?: string | null
          financing_amount?: number | null
          id?: string
          internal_notes?: string | null
          order_code?: string | null
          payment_type?: string | null
          total_amount?: number
          updated_at?: string
          vat_rate?: number | null
          warehouse_arrival_date?: string | null
          work_end_date?: string | null
          work_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_current_status_id_fkey"
            columns: ["current_status_id"]
            isOneToOne: false
            referencedRelation: "order_statuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          company_id: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          first_name: string
          id: string
          last_name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message: string
          sender_id: string
          ticket_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          company_id: string
          created_at: string
          customer_id: string
          id: string
          order_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          order_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          order_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "company_admin" | "customer"
      company_sector:
        | "serramenti"
        | "infissi"
        | "bagni"
        | "tetti"
        | "fotovoltaico"
        | "pittura"
        | "ristrutturazioni"
        | "altro"
      ticket_status: "aperto" | "in_lavorazione" | "risolto"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "company_admin", "customer"],
      company_sector: [
        "serramenti",
        "infissi",
        "bagni",
        "tetti",
        "fotovoltaico",
        "pittura",
        "ristrutturazioni",
        "altro",
      ],
      ticket_status: ["aperto", "in_lavorazione", "risolto"],
    },
  },
} as const
