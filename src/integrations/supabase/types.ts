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
          address_city: string | null
          address_country: string | null
          address_line: string | null
          address_notes: string | null
          address_postal_code: string | null
          address_province: string | null
          appointment_date: string
          appointment_end_time: string | null
          appointment_time: string | null
          appointment_type: string
          assigned_to: string | null
          calendar_id: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          formatted_address: string | null
          id: string
          internal_notes: string | null
          is_blocked_slot: boolean
          is_completed: boolean
          lat: number | null
          lng: number | null
          order_id: string | null
          place_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_country?: string | null
          address_line?: string | null
          address_notes?: string | null
          address_postal_code?: string | null
          address_province?: string | null
          appointment_date: string
          appointment_end_time?: string | null
          appointment_time?: string | null
          appointment_type?: string
          assigned_to?: string | null
          calendar_id?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          formatted_address?: string | null
          id?: string
          internal_notes?: string | null
          is_blocked_slot?: boolean
          is_completed?: boolean
          lat?: number | null
          lng?: number | null
          order_id?: string | null
          place_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_country?: string | null
          address_line?: string | null
          address_notes?: string | null
          address_postal_code?: string | null
          address_province?: string | null
          appointment_date?: string
          appointment_end_time?: string | null
          appointment_time?: string | null
          appointment_type?: string
          assigned_to?: string | null
          calendar_id?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          formatted_address?: string | null
          id?: string
          internal_notes?: string | null
          is_blocked_slot?: boolean
          is_completed?: boolean
          lat?: number | null
          lng?: number | null
          order_id?: string | null
          place_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "marketing_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
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
      automation_connections: {
        Row: {
          company_id: string
          created_at: string
          flow_id: string
          from_node_id: string
          id: string
          label: string | null
          to_node_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          flow_id: string
          from_node_id: string
          id?: string
          label?: string | null
          to_node_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          flow_id?: string
          from_node_id?: string
          id?: string
          label?: string | null
          to_node_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_connections_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_connections_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_connections_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_enrollments: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          flow_id: string
          flow_version: number
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          flow_id: string
          flow_version?: number
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          flow_id?: string
          flow_version?: number
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_enrollments_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_execution_log: {
        Row: {
          company_id: string
          created_at: string
          enrollment_id: string | null
          error_message: string | null
          flow_id: string
          id: string
          input_json: Json | null
          node_id: string | null
          node_type: string | null
          output_json: Json | null
          status: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enrollment_id?: string | null
          error_message?: string | null
          flow_id: string
          id?: string
          input_json?: Json | null
          node_id?: string | null
          node_type?: string | null
          output_json?: Json | null
          status?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enrollment_id?: string | null
          error_message?: string | null
          flow_id?: string
          id?: string
          input_json?: Json | null
          node_id?: string | null
          node_type?: string | null
          output_json?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_execution_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "automation_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_execution_log_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_flows: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          folder_id: string | null
          id: string
          name: string
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          folder_id?: string | null
          id?: string
          name?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "automation_flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_flows_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "automation_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_folders: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "automation_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_nodes: {
        Row: {
          company_id: string
          config_json: Json
          created_at: string
          flow_id: string
          id: string
          label: string | null
          node_type: string
          position_x: number
          position_y: number
          updated_at: string
        }
        Insert: {
          company_id: string
          config_json?: Json
          created_at?: string
          flow_id: string
          id?: string
          label?: string | null
          node_type: string
          position_x?: number
          position_y?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_json?: Json
          created_at?: string
          flow_id?: string
          id?: string
          label?: string | null
          node_type?: string
          position_x?: number
          position_y?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_nodes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          actions: Json | null
          company_id: string
          conditions: Json | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          trigger_config: Json | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          actions?: Json | null
          company_id: string
          conditions?: Json | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          trigger_config?: Json | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          actions?: Json | null
          company_id?: string
          conditions?: Json | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          trigger_config?: Json | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          messaging_beta_enabled: boolean
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
          messaging_beta_enabled?: boolean
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
          messaging_beta_enabled?: boolean
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
      email_billing: {
        Row: {
          campaign_id: string | null
          company_id: string
          created_at: string
          emails_sent: number
          id: string
          month_reference: string
          total_cost: number
          unit_cost: number
        }
        Insert: {
          campaign_id?: string | null
          company_id: string
          created_at?: string
          emails_sent?: number
          id?: string
          month_reference: string
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          campaign_id?: string | null
          company_id?: string
          created_at?: string
          emails_sent?: number
          id?: string
          month_reference?: string
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_billing_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_billing_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_campaigns: {
        Row: {
          ab_subject_b: string | null
          ab_test_enabled: boolean
          auto_tag: boolean
          company_id: string
          created_at: string
          created_by: string
          folder_id: string | null
          html_content: string
          id: string
          json_content: Json | null
          name: string
          preview_text: string | null
          recipient_filter: Json | null
          resend_to_unopened: boolean
          scheduled_at: string | null
          send_mode: string
          sender_email: string | null
          sender_name: string | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          total_recipients: number
          track_clicks: boolean
          type: string
          updated_at: string
          utm_tracking: boolean
        }
        Insert: {
          ab_subject_b?: string | null
          ab_test_enabled?: boolean
          auto_tag?: boolean
          company_id: string
          created_at?: string
          created_by: string
          folder_id?: string | null
          html_content?: string
          id?: string
          json_content?: Json | null
          name: string
          preview_text?: string | null
          recipient_filter?: Json | null
          resend_to_unopened?: boolean
          scheduled_at?: string | null
          send_mode?: string
          sender_email?: string | null
          sender_name?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          total_recipients?: number
          track_clicks?: boolean
          type?: string
          updated_at?: string
          utm_tracking?: boolean
        }
        Update: {
          ab_subject_b?: string | null
          ab_test_enabled?: boolean
          auto_tag?: boolean
          company_id?: string
          created_at?: string
          created_by?: string
          folder_id?: string | null
          html_content?: string
          id?: string
          json_content?: Json | null
          name?: string
          preview_text?: string | null
          recipient_filter?: Json | null
          resend_to_unopened?: boolean
          scheduled_at?: string | null
          send_mode?: string
          sender_email?: string | null
          sender_name?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          total_recipients?: number
          track_clicks?: boolean
          type?: string
          updated_at?: string
          utm_tracking?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      email_folders: {
        Row: {
          company_id: string
          created_at: string
          folder_type: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          folder_type?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          folder_type?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_folders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      email_logs: {
        Row: {
          campaign_id: string
          company_id: string
          contact_id: string
          event_timestamp: string
          id: string
          metadata: Json | null
          sendgrid_message_id: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          company_id: string
          contact_id: string
          event_timestamp?: string
          id?: string
          metadata?: Json | null
          sendgrid_message_id?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          company_id?: string
          contact_id?: string
          event_timestamp?: string
          id?: string
          metadata?: Json | null
          sendgrid_message_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          folder: string
          folder_id: string | null
          html_content: string
          id: string
          json_content: Json | null
          name: string
          subject: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          folder?: string
          folder_id?: string | null
          html_content?: string
          id?: string
          json_content?: Json | null
          name: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          folder?: string
          folder_id?: string | null
          html_content?: string
          id?: string
          json_content?: Json | null
          name?: string
          subject?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "email_folders"
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
      marketing_calendar_availability: {
        Row: {
          calendar_id: string
          company_id: string
          created_at: string
          day_of_week: number | null
          end_time: string
          id: string
          is_enabled: boolean
          specific_date: string | null
          start_time: string
        }
        Insert: {
          calendar_id: string
          company_id: string
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          id?: string
          is_enabled?: boolean
          specific_date?: string | null
          start_time?: string
        }
        Update: {
          calendar_id?: string
          company_id?: string
          created_at?: string
          day_of_week?: number | null
          end_time?: string
          id?: string
          is_enabled?: boolean
          specific_date?: string | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_calendar_availability_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "marketing_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_calendar_availability_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_calendar_preferences: {
        Row: {
          company_id: string
          created_at: string
          id: string
          language: string
          show_equipment: boolean
          show_rooms: boolean
          show_services_menu: boolean
          time_format: string
          updated_at: string
          week_start_day: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          language?: string
          show_equipment?: boolean
          show_rooms?: boolean
          show_services_menu?: boolean
          time_format?: string
          updated_at?: string
          week_start_day?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          language?: string
          show_equipment?: boolean
          show_rooms?: boolean
          show_services_menu?: boolean
          time_format?: string
          updated_at?: string
          week_start_day?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_calendar_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_calendars: {
        Row: {
          base_address_city: string | null
          base_address_country: string | null
          base_address_line: string | null
          base_address_postal_code: string | null
          base_address_province: string | null
          base_formatted_address: string | null
          base_lat: number | null
          base_lng: number | null
          base_place_id: string | null
          calendar_type: string
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          group_name: string | null
          id: string
          is_active: boolean
          name: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          base_address_city?: string | null
          base_address_country?: string | null
          base_address_line?: string | null
          base_address_postal_code?: string | null
          base_address_province?: string | null
          base_formatted_address?: string | null
          base_lat?: number | null
          base_lng?: number | null
          base_place_id?: string | null
          calendar_type?: string
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          group_name?: string | null
          id?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          base_address_city?: string | null
          base_address_country?: string | null
          base_address_line?: string | null
          base_address_postal_code?: string | null
          base_address_province?: string | null
          base_formatted_address?: string | null
          base_lat?: number | null
          base_lng?: number | null
          base_place_id?: string | null
          calendar_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          group_name?: string | null
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_calendars_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contact_activities: {
        Row: {
          activity_type: string
          company_id: string
          contact_id: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          metadata: Json | null
        }
        Insert: {
          activity_type: string
          company_id: string
          contact_id: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          activity_type?: string
          company_id?: string
          contact_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_activities_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contact_field_values: {
        Row: {
          contact_id: string
          created_at: string
          field_id: string
          id: string
          value: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          field_id: string
          id?: string
          value?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          field_id?: string
          id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contact_field_values_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "marketing_custom_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contact_list_members: {
        Row: {
          added_at: string
          contact_id: string
          id: string
          list_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          id?: string
          list_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          id?: string
          list_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contact_list_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_list_members_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "marketing_contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contact_lists: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contact_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contact_notes: {
        Row: {
          company_id: string
          contact_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          opportunity_id: string | null
        }
        Insert: {
          company_id: string
          contact_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          opportunity_id?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          opportunity_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_notes_created_by"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_contact_notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "marketing_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contacts: {
        Row: {
          address: string | null
          assigned_to: string | null
          call_center_id: string | null
          city: string | null
          company_id: string
          company_name: string | null
          contact_type: string
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          follower_id: string | null
          id: string
          last_activity_at: string | null
          last_name: string | null
          notes: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          source: string | null
          tags: string[]
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          call_center_id?: string | null
          city?: string | null
          company_id: string
          company_name?: string | null
          contact_type?: string
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          follower_id?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          call_center_id?: string | null
          city?: string | null
          company_id?: string
          company_name?: string | null
          contact_type?: string
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          follower_id?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          source?: string | null
          tags?: string[]
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_custom_fields: {
        Row: {
          company_id: string
          created_at: string
          field_type: string
          id: string
          name: string
          object_type: string
          options: string[] | null
          position: number
          section: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_type?: string
          id?: string
          name: string
          object_type?: string
          options?: string[] | null
          position?: number
          section?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_type?: string
          id?: string
          name?: string
          object_type?: string
          options?: string[] | null
          position?: number
          section?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_custom_fields_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_documents: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id: string
          opportunity_id: string | null
          uploaded_by: string
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          file_name: string
          file_size: number
          file_type: string
          file_url: string
          id?: string
          opportunity_id?: string | null
          uploaded_by: string
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          file_name?: string
          file_size?: number
          file_type?: string
          file_url?: string
          id?: string
          opportunity_id?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_documents_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "marketing_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_opportunities: {
        Row: {
          assigned_to: string | null
          call_center_id: string | null
          company_id: string
          company_name: string | null
          contact_id: string
          created_at: string
          follower_id: string | null
          id: string
          name: string
          notes: string | null
          pipeline_id: string
          source: string | null
          stage_id: string
          status: string
          tags: string[]
          updated_at: string
          value: number
        }
        Insert: {
          assigned_to?: string | null
          call_center_id?: string | null
          company_id: string
          company_name?: string | null
          contact_id: string
          created_at?: string
          follower_id?: string | null
          id?: string
          name: string
          notes?: string | null
          pipeline_id: string
          source?: string | null
          stage_id: string
          status?: string
          tags?: string[]
          updated_at?: string
          value?: number
        }
        Update: {
          assigned_to?: string | null
          call_center_id?: string | null
          company_id?: string
          company_name?: string | null
          contact_id?: string
          created_at?: string
          follower_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          pipeline_id?: string
          source?: string | null
          stage_id?: string
          status?: string
          tags?: string[]
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "marketing_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "marketing_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_opportunity_field_values: {
        Row: {
          created_at: string
          field_id: string
          id: string
          opportunity_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          opportunity_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          opportunity_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_opportunity_field_values_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "marketing_custom_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_opportunity_field_values_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "marketing_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_opportunity_notes: {
        Row: {
          company_id: string
          content: string
          created_at: string
          created_by: string
          id: string
          opportunity_id: string
        }
        Insert: {
          company_id: string
          content: string
          created_at?: string
          created_by: string
          id?: string
          opportunity_id: string
        }
        Update: {
          company_id?: string
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          opportunity_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_opportunity_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_opportunity_notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "marketing_opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_pipeline_stages: {
        Row: {
          auto_status: string | null
          company_id: string
          created_at: string
          id: string
          name: string
          pipeline_id: string
          position: number
          show_in_reports: boolean
        }
        Insert: {
          auto_status?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
          pipeline_id: string
          position?: number
          show_in_reports?: boolean
        }
        Update: {
          auto_status?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          pipeline_id?: string
          position?: number
          show_in_reports?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "marketing_pipeline_stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "marketing_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_pipelines: {
        Row: {
          company_id: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_pipelines_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_tags: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_ai_runs: {
        Row: {
          ai_output: Json | null
          company_id: string
          confidence: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_actions: Json | null
          created_at: string
          id: string
          intent: string | null
          message_id: string
          raw_input: string | null
          status: string
        }
        Insert: {
          ai_output?: Json | null
          company_id: string
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_actions?: Json | null
          created_at?: string
          id?: string
          intent?: string | null
          message_id: string
          raw_input?: string | null
          status?: string
        }
        Update: {
          ai_output?: Json | null
          company_id?: string
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_actions?: Json | null
          created_at?: string
          id?: string
          intent?: string | null
          message_id?: string
          raw_input?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_ai_runs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_ai_runs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messaging_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_conversations: {
        Row: {
          company_id: string
          contact_name: string | null
          contact_type: string
          created_at: string
          id: string
          is_urgent: boolean
          last_message_at: string | null
          linked_entity_id: string | null
          linked_entity_type: string | null
          phone_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          id?: string
          is_urgent?: boolean
          last_message_at?: string | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          id?: string
          is_urgent?: boolean
          last_message_at?: string | null
          linked_entity_id?: string | null
          linked_entity_type?: string | null
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messaging_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_daily_reports: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          materials_used: Json | null
          order_id: string | null
          report_date: string
          source_message_id: string | null
          work_done: Json | null
          work_planned: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          materials_used?: Json | null
          order_id?: string | null
          report_date?: string
          source_message_id?: string | null
          work_done?: Json | null
          work_planned?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          materials_used?: Json | null
          order_id?: string | null
          report_date?: string
          source_message_id?: string | null
          work_done?: Json | null
          work_planned?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_daily_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_daily_reports_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messaging_daily_reports_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messaging_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_messages: {
        Row: {
          ai_processed: boolean
          content: string | null
          conversation_id: string
          created_at: string
          id: string
          media_url: string | null
          message_type: string
          sender_name: string | null
          sender_type: string
          transcription: string | null
        }
        Insert: {
          ai_processed?: boolean
          content?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          sender_name?: string | null
          sender_type?: string
          transcription?: string | null
        }
        Update: {
          ai_processed?: boolean
          content?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          media_url?: string | null
          message_type?: string
          sender_name?: string | null
          sender_type?: string
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "messaging_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      messaging_whatsapp_config: {
        Row: {
          access_token_encrypted: string | null
          account_status: string
          business_name: string | null
          company_id: string
          created_at: string
          id: string
          is_connected: boolean
          phone_number: string | null
          phone_number_id: string | null
          quality_rating: string
          updated_at: string
          waba_id: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          account_status?: string
          business_name?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_connected?: boolean
          phone_number?: string | null
          phone_number_id?: string | null
          quality_rating?: string
          updated_at?: string
          waba_id?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          account_status?: string
          business_name?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_connected?: boolean
          phone_number?: string | null
          phone_number_id?: string | null
          quality_rating?: string
          updated_at?: string
          waba_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messaging_whatsapp_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
      order_errors: {
        Row: {
          amount: number
          company_id: string
          created_at: string
          created_by: string
          description: string
          error_category: string
          error_date: string
          error_type: string
          id: string
          order_id: string
        }
        Insert: {
          amount?: number
          company_id: string
          created_at?: string
          created_by: string
          description: string
          error_category?: string
          error_date?: string
          error_type?: string
          id?: string
          order_id: string
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string
          error_category?: string
          error_date?: string
          error_type?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_errors_order_id_fkey"
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
          assigned_to: string | null
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
          assigned_to?: string | null
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
          assigned_to?: string | null
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
            foreignKeyName: "orders_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
          can_edit_marketing: boolean
          can_edit_orders: boolean | null
          can_edit_tickets: boolean | null
          can_edit_warehouse: boolean | null
          can_view_calendar: boolean | null
          can_view_customers: boolean | null
          can_view_dashboard: boolean | null
          can_view_employees: boolean | null
          can_view_forecast: boolean | null
          can_view_marketing: boolean
          can_view_orders: boolean | null
          can_view_settings: boolean | null
          can_view_tickets: boolean | null
          can_view_warehouse: boolean | null
          company_id: string
          created_at: string | null
          id: string
          must_change_password: boolean | null
          only_assigned: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_edit_customers?: boolean | null
          can_edit_marketing?: boolean
          can_edit_orders?: boolean | null
          can_edit_tickets?: boolean | null
          can_edit_warehouse?: boolean | null
          can_view_calendar?: boolean | null
          can_view_customers?: boolean | null
          can_view_dashboard?: boolean | null
          can_view_employees?: boolean | null
          can_view_forecast?: boolean | null
          can_view_marketing?: boolean
          can_view_orders?: boolean | null
          can_view_settings?: boolean | null
          can_view_tickets?: boolean | null
          can_view_warehouse?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          must_change_password?: boolean | null
          only_assigned?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_edit_customers?: boolean | null
          can_edit_marketing?: boolean
          can_edit_orders?: boolean | null
          can_edit_tickets?: boolean | null
          can_edit_warehouse?: boolean | null
          can_view_calendar?: boolean | null
          can_view_customers?: boolean | null
          can_view_dashboard?: boolean | null
          can_view_employees?: boolean | null
          can_view_forecast?: boolean | null
          can_view_marketing?: boolean
          can_view_orders?: boolean | null
          can_view_settings?: boolean | null
          can_view_tickets?: boolean | null
          can_view_warehouse?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          must_change_password?: boolean | null
          only_assigned?: boolean
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
          contact_id: string | null
          cost_id: string | null
          created_at: string
          created_by: string
          due_date: string | null
          id: string
          notes: string | null
          opportunity_id: string | null
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
          contact_id?: string | null
          cost_id?: string | null
          created_at?: string
          created_by: string
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
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
          contact_id?: string | null
          cost_id?: string | null
          created_at?: string
          created_by?: string
          due_date?: string | null
          id?: string
          notes?: string | null
          opportunity_id?: string | null
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
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
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
            foreignKeyName: "tasks_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "marketing_opportunities"
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
      check_staff_visibility: {
        Args: { _assigned_to: string; _user_id: string }
        Returns: boolean
      }
      execute_automation: {
        Args: {
          p_company_id: string
          p_order_id: string
          p_trigger_type: string
        }
        Returns: undefined
      }
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
