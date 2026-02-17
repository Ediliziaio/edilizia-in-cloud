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
      admin_audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      admin_notification_prefs: {
        Row: {
          created_at: string
          id: string
          new_company: boolean
          new_ticket: boolean
          trial_expiring: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          new_company?: boolean
          new_ticket?: boolean
          trial_expiring?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          new_company?: boolean
          new_ticket?: boolean
          trial_expiring?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          appointment_type: string
          assigned_to: string | null
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_completed: boolean
          order_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          appointment_type?: string
          assigned_to?: string | null
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_completed?: boolean
          order_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          appointment_type?: string
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_completed?: boolean
          order_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      article_templates: {
        Row: {
          category: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          sku: string | null
          standard_cost: number | null
          supplier_id: string | null
          unit_of_measure: string | null
          unit_price: number | null
          vat_rate: number | null
        }
        Insert: {
          category?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sku?: string | null
          standard_cost?: number | null
          supplier_id?: string | null
          unit_of_measure?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Update: {
          category?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sku?: string | null
          standard_cost?: number | null
          supplier_id?: string | null
          unit_of_measure?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "article_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_templates_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          bank_account_holder: string | null
          bank_iban: string | null
          bank_name: string | null
          business_name: string | null
          created_at: string
          email: string
          fiscal_code: string | null
          id: string
          legal_address: string | null
          legal_city: string | null
          legal_postal_code: string | null
          legal_province: string | null
          logo_url: string | null
          name: string
          notes: string | null
          operational_address: string | null
          operational_city: string | null
          operational_postal_code: string | null
          operational_province: string | null
          payment_method: string
          payment_notes: string | null
          pec: string | null
          phone: string | null
          referred_by: string | null
          sdi_code: string | null
          sector: Database["public"]["Enums"]["company_sector"]
          status: string
          stripe_customer_id: string | null
          subscription_plan_id: string | null
          trial_ends_at: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          bank_account_holder?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          business_name?: string | null
          created_at?: string
          email: string
          fiscal_code?: string | null
          id?: string
          legal_address?: string | null
          legal_city?: string | null
          legal_postal_code?: string | null
          legal_province?: string | null
          logo_url?: string | null
          name: string
          notes?: string | null
          operational_address?: string | null
          operational_city?: string | null
          operational_postal_code?: string | null
          operational_province?: string | null
          payment_method?: string
          payment_notes?: string | null
          pec?: string | null
          phone?: string | null
          referred_by?: string | null
          sdi_code?: string | null
          sector?: Database["public"]["Enums"]["company_sector"]
          status?: string
          stripe_customer_id?: string | null
          subscription_plan_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          bank_account_holder?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          business_name?: string | null
          created_at?: string
          email?: string
          fiscal_code?: string | null
          id?: string
          legal_address?: string | null
          legal_city?: string | null
          legal_postal_code?: string | null
          legal_province?: string | null
          logo_url?: string | null
          name?: string
          notes?: string | null
          operational_address?: string | null
          operational_city?: string | null
          operational_postal_code?: string | null
          operational_province?: string | null
          payment_method?: string
          payment_notes?: string | null
          pec?: string | null
          phone?: string | null
          referred_by?: string | null
          sdi_code?: string | null
          sector?: Database["public"]["Enums"]["company_sector"]
          status?: string
          stripe_customer_id?: string | null
          subscription_plan_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_subscription_plan_id_fkey"
            columns: ["subscription_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      company_activity_log: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: Json | null
          id: string
          target_id: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_activity_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_costs: {
        Row: {
          amount: number
          category: string | null
          company_id: string
          cost_type: string
          created_at: string
          due_date: string
          id: string
          is_paid: boolean
          name: string
          notes: string | null
          order_id: string | null
          paid_date: string | null
          recurrence: string
          supplier_id: string | null
          treasury_category_id: string | null
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          amount?: number
          category?: string | null
          company_id: string
          cost_type?: string
          created_at?: string
          due_date: string
          id?: string
          is_paid?: boolean
          name: string
          notes?: string | null
          order_id?: string | null
          paid_date?: string | null
          recurrence?: string
          supplier_id?: string | null
          treasury_category_id?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string
          cost_type?: string
          created_at?: string
          due_date?: string
          id?: string
          is_paid?: boolean
          name?: string
          notes?: string | null
          order_id?: string | null
          paid_date?: string | null
          recurrence?: string
          supplier_id?: string | null
          treasury_category_id?: string | null
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "company_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_costs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_costs_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_costs_treasury_category_id_fkey"
            columns: ["treasury_category_id"]
            isOneToOne: false
            referencedRelation: "treasury_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      company_subscriptions: {
        Row: {
          billing_period: string
          canceled_at: string | null
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          status: string
          stripe_subscription_id: string | null
        }
        Insert: {
          billing_period?: string
          canceled_at?: string | null
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          status?: string
          stripe_subscription_id?: string | null
        }
        Update: {
          billing_period?: string
          canceled_at?: string | null
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          status?: string
          stripe_subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_attachments: {
        Row: {
          created_at: string
          document_type: string | null
          employee_id: string
          expiry_date: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          notes: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          employee_id: string
          expiry_date?: string | null
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          notes?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_type?: string | null
          employee_id?: string
          expiry_date?: string | null
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          notes?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_attachments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          company_id: string
          created_at: string
          email: string | null
          first_name: string
          gross_salary: number
          id: string
          is_active: boolean
          last_name: string
          monthly_hours: number
          net_salary: number
          phone: string | null
          role_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          email?: string | null
          first_name: string
          gross_salary?: number
          id?: string
          is_active?: boolean
          last_name: string
          monthly_hours?: number
          net_salary?: number
          phone?: string | null
          role_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          gross_salary?: number
          id?: string
          is_active?: boolean
          last_name?: string
          monthly_hours?: number
          net_salary?: number
          phone?: string | null
          role_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      external_team_attachments: {
        Row: {
          created_at: string
          document_type: string | null
          expiry_date: string | null
          external_team_id: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          notes: string | null
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_type?: string | null
          expiry_date?: string | null
          external_team_id: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          notes?: string | null
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_type?: string | null
          expiry_date?: string | null
          external_team_id?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          notes?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_team_attachments_external_team_id_fkey"
            columns: ["external_team_id"]
            isOneToOne: false
            referencedRelation: "external_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      external_teams: {
        Row: {
          company_id: string
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          vat_rate: number | null
        }
        Insert: {
          company_id: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          vat_rate?: number | null
        }
        Update: {
          company_id?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "external_teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      order_employees: {
        Row: {
          created_at: string
          employee_id: string
          hourly_rate: number
          hours_worked: number
          id: string
          is_paid: boolean
          notes: string | null
          order_id: string
          paid_date: string | null
          total_cost: number
        }
        Insert: {
          created_at?: string
          employee_id: string
          hourly_rate?: number
          hours_worked?: number
          id?: string
          is_paid?: boolean
          notes?: string | null
          order_id: string
          paid_date?: string | null
          total_cost?: number
        }
        Update: {
          created_at?: string
          employee_id?: string
          hourly_rate?: number
          hours_worked?: number
          id?: string
          is_paid?: boolean
          notes?: string | null
          order_id?: string
          paid_date?: string | null
          total_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_employees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_employees_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_external_teams: {
        Row: {
          created_at: string
          external_team_id: string
          id: string
          is_paid: boolean
          notes: string | null
          order_id: string
          paid_date: string | null
          payment_date: string | null
          total_cost: number
          vat_rate: number | null
        }
        Insert: {
          created_at?: string
          external_team_id: string
          id?: string
          is_paid?: boolean
          notes?: string | null
          order_id: string
          paid_date?: string | null
          payment_date?: string | null
          total_cost?: number
          vat_rate?: number | null
        }
        Update: {
          created_at?: string
          external_team_id?: string
          id?: string
          is_paid?: boolean
          notes?: string | null
          order_id?: string
          paid_date?: string | null
          payment_date?: string | null
          total_cost?: number
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_external_teams_external_team_id_fkey"
            columns: ["external_team_id"]
            isOneToOne: false
            referencedRelation: "external_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_external_teams_order_id_fkey"
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
          balance_amount: number | null
          balance_expected_date: string | null
          balance_paid: boolean | null
          balance_paid_date: string | null
          created_at: string | null
          deposit_amount: number | null
          deposit_expected_date: string | null
          deposit_paid: boolean | null
          deposit_paid_date: string | null
          description: string | null
          discount_percent: number | null
          id: string
          is_paid: boolean | null
          name: string
          order_id: string
          paid_date: string | null
          payment_method: string | null
          position: number | null
          purchase_price: number | null
          quantity: number | null
          standard_cost: number | null
          status: string | null
          stock_item_id: string | null
          supplier_id: string | null
          unit_price: number | null
          updated_at: string | null
          vat_rate: number | null
        }
        Insert: {
          balance_amount?: number | null
          balance_expected_date?: string | null
          balance_paid?: boolean | null
          balance_paid_date?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          deposit_expected_date?: string | null
          deposit_paid?: boolean | null
          deposit_paid_date?: string | null
          description?: string | null
          discount_percent?: number | null
          id?: string
          is_paid?: boolean | null
          name: string
          order_id: string
          paid_date?: string | null
          payment_method?: string | null
          position?: number | null
          purchase_price?: number | null
          quantity?: number | null
          standard_cost?: number | null
          status?: string | null
          stock_item_id?: string | null
          supplier_id?: string | null
          unit_price?: number | null
          updated_at?: string | null
          vat_rate?: number | null
        }
        Update: {
          balance_amount?: number | null
          balance_expected_date?: string | null
          balance_paid?: boolean | null
          balance_paid_date?: string | null
          created_at?: string | null
          deposit_amount?: number | null
          deposit_expected_date?: string | null
          deposit_paid?: boolean | null
          deposit_paid_date?: string | null
          description?: string | null
          discount_percent?: number | null
          id?: string
          is_paid?: boolean | null
          name?: string
          order_id?: string
          paid_date?: string | null
          payment_method?: string | null
          position?: number | null
          purchase_price?: number | null
          quantity?: number | null
          standard_cost?: number | null
          status?: string | null
          stock_item_id?: string | null
          supplier_id?: string | null
          unit_price?: number | null
          updated_at?: string | null
          vat_rate?: number | null
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
            foreignKeyName: "order_items_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock"
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
      order_salespeople: {
        Row: {
          commission_amount: number
          commission_type: string
          commission_value: number
          created_at: string
          deduction_amount: number
          id: string
          is_paid: boolean
          notes: string | null
          order_id: string
          paid_date: string | null
          payment_expected_date: string | null
          salesperson_id: string
        }
        Insert: {
          commission_amount?: number
          commission_type: string
          commission_value?: number
          created_at?: string
          deduction_amount?: number
          id?: string
          is_paid?: boolean
          notes?: string | null
          order_id: string
          paid_date?: string | null
          payment_expected_date?: string | null
          salesperson_id: string
        }
        Update: {
          commission_amount?: number
          commission_type?: string
          commission_value?: number
          created_at?: string
          deduction_amount?: number
          id?: string
          is_paid?: boolean
          notes?: string | null
          order_id?: string
          paid_date?: string | null
          payment_expected_date?: string | null
          salesperson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_salespeople_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_salespeople_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
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
          financing_cost: number | null
          financing_expected_date: string | null
          financing_paid: boolean | null
          financing_paid_date: string | null
          has_building_bonus: boolean
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
          financing_cost?: number | null
          financing_expected_date?: string | null
          financing_paid?: boolean | null
          financing_paid_date?: string | null
          has_building_bonus?: boolean
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
          financing_cost?: number | null
          financing_expected_date?: string | null
          financing_paid?: boolean | null
          financing_paid_date?: string | null
          has_building_bonus?: boolean
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
          fiscal_code: string | null
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          site_address: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          first_name: string
          fiscal_code?: string | null
          id: string
          last_name: string
          notes?: string | null
          phone?: string | null
          site_address?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          first_name?: string
          fiscal_code?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          site_address?: string | null
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
      referral_companies: {
        Row: {
          company_id: string
          id: string
          is_active: boolean
          notes: string | null
          referred_at: string
          referrer_id: string
        }
        Insert: {
          company_id: string
          id?: string
          is_active?: boolean
          notes?: string | null
          referred_at?: string
          referrer_id: string
        }
        Update: {
          company_id?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          referred_at?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_companies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_companies_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_payouts: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: string
          period_end: string
          period_start: string
          referrer_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          period_end: string
          period_start: string
          referrer_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          period_end?: string
          period_start?: string
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_payouts_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      referrers: {
        Row: {
          commission_type: string
          commission_value: number
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          referral_code: string
          total_earned: number
          total_paid: number
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          referral_code: string
          total_earned?: number
          total_paid?: number
        }
        Update: {
          commission_type?: string
          commission_value?: number
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          referral_code?: string
          total_earned?: number
          total_paid?: number
        }
        Relationships: []
      }
      salespeople: {
        Row: {
          commission_type: string
          commission_value: number
          company_id: string
          created_at: string
          email: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          phone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          company_id: string
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          commission_type?: string
          commission_value?: number
          company_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          phone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salespeople_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          can_edit_customers: boolean | null
          can_edit_orders: boolean | null
          can_edit_tickets: boolean | null
          can_edit_warehouse: boolean | null
          can_view_calendar: boolean | null
          can_view_customers: boolean | null
          can_view_dashboard: boolean | null
          can_view_employees: boolean | null
          can_view_forecast: boolean | null
          can_view_orders: boolean | null
          can_view_settings: boolean | null
          can_view_tickets: boolean | null
          can_view_warehouse: boolean | null
          company_id: string
          created_at: string | null
          id: string
          must_change_password: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_edit_customers?: boolean | null
          can_edit_orders?: boolean | null
          can_edit_tickets?: boolean | null
          can_edit_warehouse?: boolean | null
          can_view_calendar?: boolean | null
          can_view_customers?: boolean | null
          can_view_dashboard?: boolean | null
          can_view_employees?: boolean | null
          can_view_forecast?: boolean | null
          can_view_orders?: boolean | null
          can_view_settings?: boolean | null
          can_view_tickets?: boolean | null
          can_view_warehouse?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          must_change_password?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_edit_customers?: boolean | null
          can_edit_orders?: boolean | null
          can_edit_tickets?: boolean | null
          can_edit_warehouse?: boolean | null
          can_view_calendar?: boolean | null
          can_view_customers?: boolean | null
          can_view_dashboard?: boolean | null
          can_view_employees?: boolean | null
          can_view_forecast?: boolean | null
          can_view_orders?: boolean | null
          can_view_settings?: boolean | null
          can_view_tickets?: boolean | null
          can_view_warehouse?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          must_change_password?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_logs: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          new_status: string | null
          notes: string | null
          old_status: string | null
          performed_by: string | null
          plan_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          performed_by?: string | null
          plan_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          performed_by?: string | null
          plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          description: string | null
          features: Json | null
          id: string
          included_modules: Json | null
          is_active: boolean
          max_orders: number
          max_storage_mb: number
          max_users: number
          name: string
          position: number
          price_monthly: number
          price_yearly: number
          slug: string
          stripe_price_monthly_id: string | null
          stripe_price_yearly_id: string | null
          stripe_product_id: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          included_modules?: Json | null
          is_active?: boolean
          max_orders?: number
          max_storage_mb?: number
          max_users?: number
          name: string
          position?: number
          price_monthly?: number
          price_yearly?: number
          slug: string
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          features?: Json | null
          id?: string
          included_modules?: Json | null
          is_active?: boolean
          max_orders?: number
          max_storage_mb?: number
          max_users?: number
          name?: string
          position?: number
          price_monthly?: number
          price_yearly?: number
          slug?: string
          stripe_price_monthly_id?: string | null
          stripe_price_yearly_id?: string | null
          stripe_product_id?: string | null
        }
        Relationships: []
      }
      super_admin_permissions: {
        Row: {
          allowed_company_ids: string[] | null
          can_manage_admins: boolean
          can_manage_companies: boolean
          can_manage_plans: boolean
          can_manage_referrals: boolean
          can_manage_tickets: boolean
          can_view_platform_stats: boolean
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_company_ids?: string[] | null
          can_manage_admins?: boolean
          can_manage_companies?: boolean
          can_manage_plans?: boolean
          can_manage_referrals?: boolean
          can_manage_tickets?: boolean
          can_view_platform_stats?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_company_ids?: string[] | null
          can_manage_admins?: boolean
          can_manage_companies?: boolean
          can_manage_plans?: boolean
          can_manage_referrals?: boolean
          can_manage_tickets?: boolean
          can_view_platform_stats?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          company_id: string
          country: string | null
          created_at: string
          email: string | null
          fiscal_code: string | null
          id: string
          is_foreign: boolean
          name: string
          notes: string | null
          payment_method: string | null
          phone: string | null
          postal_code: string | null
          product_category: string | null
          province: string | null
          vat_number: string | null
          vat_rate: number | null
          website: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          email?: string | null
          fiscal_code?: string | null
          id?: string
          is_foreign?: boolean
          name: string
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          postal_code?: string | null
          product_category?: string | null
          province?: string | null
          vat_number?: string | null
          vat_rate?: number | null
          website?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          email?: string | null
          fiscal_code?: string | null
          id?: string
          is_foreign?: boolean
          name?: string
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          postal_code?: string | null
          product_category?: string | null
          province?: string | null
          vat_number?: string | null
          vat_rate?: number | null
          website?: string | null
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
      support_conversations: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          id: string
          internal_notes: string | null
          priority: string
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          id?: string
          internal_notes?: string | null
          priority?: string
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          company_id: string
          created_at: string
          id: string
          message: string
          sender_id: string
          sender_role: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          message: string
          sender_id: string
          sender_role?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          message?: string
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          category: string
          company_id: string
          completed_at: string | null
          cost_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          notes: string | null
          order_id: string | null
          priority: string
          status: string
          stock_item_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          company_id: string
          completed_at?: string | null
          cost_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          priority?: string
          status?: string
          stock_item_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          company_id?: string
          completed_at?: string | null
          cost_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          order_id?: string | null
          priority?: string
          status?: string
          stock_item_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "company_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock"
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
      treasury_categories: {
        Row: {
          area: string
          company_id: string
          created_at: string | null
          id: string
          is_income: boolean | null
          name: string
          parent_id: string | null
          position: number | null
        }
        Insert: {
          area: string
          company_id: string
          created_at?: string | null
          id?: string
          is_income?: boolean | null
          name: string
          parent_id?: string | null
          position?: number | null
        }
        Update: {
          area?: string
          company_id?: string
          created_at?: string | null
          id?: string
          is_income?: boolean | null
          name?: string
          parent_id?: string | null
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treasury_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treasury_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "treasury_categories"
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
      warehouse_movements: {
        Row: {
          created_at: string
          id: string
          movement_type: string
          notes: string | null
          order_item_id: string | null
          performed_by: string
          quantity: number
          stock_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          movement_type: string
          notes?: string | null
          order_item_id?: string | null
          performed_by: string
          quantity: number
          stock_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          movement_type?: string
          notes?: string | null
          order_item_id?: string | null
          performed_by?: string
          quantity?: number
          stock_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_movements_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "warehouse_stock"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          min_stock_level: number
          name: string
          quantity: number
          supplier_id: string | null
          unit_cost: number
          updated_at: string
          vat_rate: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          min_stock_level?: number
          name: string
          quantity?: number
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
          vat_rate?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          min_stock_level?: number
          name?: string
          quantity?: number
          supplier_id?: string | null
          unit_cost?: number
          updated_at?: string
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      work_logs: {
        Row: {
          activity_type: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          description: string | null
          employee_id: string
          hours_worked: number
          id: string
          is_approved: boolean | null
          order_id: string | null
          updated_at: string | null
          work_date: string
        }
        Insert: {
          activity_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          employee_id: string
          hours_worked?: number
          id?: string
          is_approved?: boolean | null
          order_id?: string | null
          updated_at?: string | null
          work_date: string
        }
        Update: {
          activity_type?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          description?: string | null
          employee_id?: string
          hours_worked?: number
          id?: string
          is_approved?: boolean | null
          order_id?: string | null
          updated_at?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "company_admin"
        | "customer"
        | "company_staff"
        | "employee"
        | "salesperson"
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
      app_role: [
        "super_admin",
        "company_admin",
        "customer",
        "company_staff",
        "employee",
        "salesperson",
      ],
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
