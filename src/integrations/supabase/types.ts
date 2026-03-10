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
      active_impersonations: {
        Row: {
          admin_user_id: string
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          target_company_id: string
          token: string
          user_agent: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: string | null
          target_company_id: string
          token: string
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          target_company_id?: string
          token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_impersonations_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
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
      admin_credit_adjustments: {
        Row: {
          amount_eur: number
          company_id: string
          created_at: string
          created_by: string
          id: string
          reason: string
          service: string
        }
        Insert: {
          amount_eur: number
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          reason: string
          service: string
        }
        Update: {
          amount_eur?: number
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          reason?: string
          service?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_credit_adjustments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_ip_allowlist: {
        Row: {
          created_at: string
          created_by: string
          id: string
          ip_address: string
          label: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          ip_address: string
          label?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          ip_address?: string
          label?: string | null
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
      ai_agent_audit_log: {
        Row: {
          action: string
          agent_id: string | null
          company_id: string
          created_at: string
          details: Json | null
          id: string
          user_id: string
        }
        Insert: {
          action: string
          agent_id?: string | null
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          agent_id?: string | null
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_branches: {
        Row: {
          agent_id: string
          appointments_count: number
          avg_duration_seconds: number
          company_id: string
          conversations_count: number
          created_at: string
          first_message: string | null
          id: string
          is_main: boolean
          llm_model: string | null
          name: string
          system_prompt: string | null
          traffic_percent: number
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          agent_id: string
          appointments_count?: number
          avg_duration_seconds?: number
          company_id: string
          conversations_count?: number
          created_at?: string
          first_message?: string | null
          id?: string
          is_main?: boolean
          llm_model?: string | null
          name?: string
          system_prompt?: string | null
          traffic_percent?: number
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          agent_id?: string
          appointments_count?: number
          avg_duration_seconds?: number
          company_id?: string
          conversations_count?: number
          created_at?: string
          first_message?: string | null
          id?: string
          is_main?: boolean
          llm_model?: string | null
          name?: string
          system_prompt?: string | null
          traffic_percent?: number
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_branches_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_conversations: {
        Row: {
          agent_id: string
          appointment_created: boolean
          branch_id: string | null
          call_direction: string
          company_id: string
          contact_id: string | null
          duration_seconds: number
          elevenlabs_conversation_id: string | null
          id: string
          messages_count: number
          metadata: Json | null
          started_at: string
          status: string
          summary: string | null
          transcript: Json | null
        }
        Insert: {
          agent_id: string
          appointment_created?: boolean
          branch_id?: string | null
          call_direction?: string
          company_id: string
          contact_id?: string | null
          duration_seconds?: number
          elevenlabs_conversation_id?: string | null
          id?: string
          messages_count?: number
          metadata?: Json | null
          started_at?: string
          status?: string
          summary?: string | null
          transcript?: Json | null
        }
        Update: {
          agent_id?: string
          appointment_created?: boolean
          branch_id?: string | null
          call_direction?: string
          company_id?: string
          contact_id?: string | null
          duration_seconds?: number
          elevenlabs_conversation_id?: string | null
          id?: string
          messages_count?: number
          metadata?: Json | null
          started_at?: string
          status?: string
          summary?: string | null
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_conversations_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_credits: {
        Row: {
          company_id: string
          cost_per_minute_billed: number
          cost_per_minute_platform: number
          id: string
          minutes_used: number
          total_minutes_purchased: number
          updated_at: string
        }
        Insert: {
          company_id: string
          cost_per_minute_billed?: number
          cost_per_minute_platform?: number
          id?: string
          minutes_used?: number
          total_minutes_purchased?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          cost_per_minute_billed?: number
          cost_per_minute_platform?: number
          id?: string
          minutes_used?: number
          total_minutes_purchased?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_knowledge_docs: {
        Row: {
          agent_id: string | null
          company_id: string
          created_at: string
          created_by: string
          elevenlabs_doc_id: string | null
          id: string
          name: string
          source_url: string | null
          type: string
        }
        Insert: {
          agent_id?: string | null
          company_id: string
          created_at?: string
          created_by: string
          elevenlabs_doc_id?: string | null
          id?: string
          name: string
          source_url?: string | null
          type?: string
        }
        Update: {
          agent_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          elevenlabs_doc_id?: string | null
          id?: string
          name?: string
          source_url?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_knowledge_docs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_docs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_phone_numbers: {
        Row: {
          agent_id: string
          capabilities: Json | null
          company_id: string
          created_at: string
          elevenlabs_phone_id: string | null
          elevenlabs_phone_number_id: string | null
          id: string
          internal_agent_id: string | null
          is_inbound_enabled: boolean | null
          is_outbound_enabled: boolean | null
          label: string | null
          monthly_cost_eur: number | null
          phone_number: string
          provider: string
          routing_mode: string
          telnyx_connection_id: string | null
          telnyx_phone_id: string | null
        }
        Insert: {
          agent_id: string
          capabilities?: Json | null
          company_id: string
          created_at?: string
          elevenlabs_phone_id?: string | null
          elevenlabs_phone_number_id?: string | null
          id?: string
          internal_agent_id?: string | null
          is_inbound_enabled?: boolean | null
          is_outbound_enabled?: boolean | null
          label?: string | null
          monthly_cost_eur?: number | null
          phone_number: string
          provider?: string
          routing_mode?: string
          telnyx_connection_id?: string | null
          telnyx_phone_id?: string | null
        }
        Update: {
          agent_id?: string
          capabilities?: Json | null
          company_id?: string
          created_at?: string
          elevenlabs_phone_id?: string | null
          elevenlabs_phone_number_id?: string | null
          id?: string
          internal_agent_id?: string | null
          is_inbound_enabled?: boolean | null
          is_outbound_enabled?: boolean | null
          label?: string | null
          monthly_cost_eur?: number | null
          phone_number?: string
          provider?: string
          routing_mode?: string
          telnyx_connection_id?: string | null
          telnyx_phone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_phone_numbers_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_phone_numbers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_phone_numbers_internal_agent_id_fkey"
            columns: ["internal_agent_id"]
            isOneToOne: false
            referencedRelation: "internal_ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_tests: {
        Row: {
          agent_id: string
          company_id: string
          created_at: string | null
          created_by: string
          expected_outcome: string | null
          id: string
          name: string
          result_summary: string | null
          scenario: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          company_id: string
          created_at?: string | null
          created_by: string
          expected_outcome?: string | null
          id?: string
          name: string
          result_summary?: string | null
          scenario?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          company_id?: string
          created_at?: string | null
          created_by?: string
          expected_outcome?: string | null
          id?: string
          name?: string
          result_summary?: string | null
          scenario?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_tests_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_tests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          auto_end_on_silence: boolean | null
          company_id: string
          conversation_timeout: number | null
          created_at: string
          created_by: string
          domain_whitelist: string[] | null
          elevenlabs_agent_id: string | null
          error_message: string | null
          first_message: string
          id: string
          is_interruptible: boolean
          language: string
          llm_model: string
          max_duration: number | null
          name: string
          rate_limit_enabled: boolean | null
          rate_limit_per_minute: number | null
          require_auth: boolean | null
          send_confirmation_after_booking: boolean
          silence_timeout: number | null
          status: string
          system_prompt: string
          tools_config: Json | null
          tts_model: string | null
          updated_at: string
          voice_id: string | null
        }
        Insert: {
          auto_end_on_silence?: boolean | null
          company_id: string
          conversation_timeout?: number | null
          created_at?: string
          created_by: string
          domain_whitelist?: string[] | null
          elevenlabs_agent_id?: string | null
          error_message?: string | null
          first_message?: string
          id?: string
          is_interruptible?: boolean
          language?: string
          llm_model?: string
          max_duration?: number | null
          name: string
          rate_limit_enabled?: boolean | null
          rate_limit_per_minute?: number | null
          require_auth?: boolean | null
          send_confirmation_after_booking?: boolean
          silence_timeout?: number | null
          status?: string
          system_prompt?: string
          tools_config?: Json | null
          tts_model?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Update: {
          auto_end_on_silence?: boolean | null
          company_id?: string
          conversation_timeout?: number | null
          created_at?: string
          created_by?: string
          domain_whitelist?: string[] | null
          elevenlabs_agent_id?: string | null
          error_message?: string | null
          first_message?: string
          id?: string
          is_interruptible?: boolean
          language?: string
          llm_model?: string
          max_duration?: number | null
          name?: string
          rate_limit_enabled?: boolean | null
          rate_limit_per_minute?: number | null
          require_auth?: boolean | null
          send_confirmation_after_booking?: boolean
          silence_timeout?: number | null
          status?: string
          system_prompt?: string
          tools_config?: Json | null
          tts_model?: string | null
          updated_at?: string
          voice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_topups: {
        Row: {
          amount_eur: number
          company_id: string
          created_at: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          payment_method: string | null
          payment_ref: string | null
          processed_at: string | null
          status: string
          triggered_by: string | null
          type: string
        }
        Insert: {
          amount_eur: number
          company_id: string
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          processed_at?: string | null
          status?: string
          triggered_by?: string | null
          type?: string
        }
        Update: {
          amount_eur?: number
          company_id?: string
          created_at?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_ref?: string | null
          processed_at?: string | null
          status?: string
          triggered_by?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_topups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credit_usage: {
        Row: {
          agent_id: string | null
          balance_after: number
          balance_before: number
          call_direction: string | null
          company_id: string
          conversation_id: string | null
          cost_billed_per_min: number
          cost_billed_total: number
          cost_real_per_min: number
          cost_real_total: number
          created_at: string | null
          duration_min: number
          duration_sec: number
          id: string
          llm_model: string
          margin_total: number
          tts_model: string
        }
        Insert: {
          agent_id?: string | null
          balance_after: number
          balance_before: number
          call_direction?: string | null
          company_id: string
          conversation_id?: string | null
          cost_billed_per_min: number
          cost_billed_total: number
          cost_real_per_min: number
          cost_real_total: number
          created_at?: string | null
          duration_min: number
          duration_sec: number
          id?: string
          llm_model: string
          margin_total: number
          tts_model: string
        }
        Update: {
          agent_id?: string | null
          balance_after?: number
          balance_before?: number
          call_direction?: string | null
          company_id?: string
          conversation_id?: string | null
          cost_billed_per_min?: number
          cost_billed_total?: number
          cost_real_per_min?: number
          cost_real_total?: number
          created_at?: string | null
          duration_min?: number
          duration_sec?: number
          id?: string
          llm_model?: string
          margin_total?: number
          tts_model?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_usage_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_credit_usage_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_credits: {
        Row: {
          alert_email_sent_at: string | null
          alert_threshold_eur: number | null
          auto_recharge_amount: number | null
          auto_recharge_enabled: boolean | null
          auto_recharge_method: string | null
          auto_recharge_payment_ref: string | null
          auto_recharge_threshold: number | null
          balance_eur: number | null
          blocked_at: string | null
          blocked_reason: string | null
          calls_blocked: boolean | null
          company_id: string
          id: string
          total_recharged_eur: number | null
          total_spent_eur: number | null
          updated_at: string | null
        }
        Insert: {
          alert_email_sent_at?: string | null
          alert_threshold_eur?: number | null
          auto_recharge_amount?: number | null
          auto_recharge_enabled?: boolean | null
          auto_recharge_method?: string | null
          auto_recharge_payment_ref?: string | null
          auto_recharge_threshold?: number | null
          balance_eur?: number | null
          blocked_at?: string | null
          blocked_reason?: string | null
          calls_blocked?: boolean | null
          company_id: string
          id?: string
          total_recharged_eur?: number | null
          total_spent_eur?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_email_sent_at?: string | null
          alert_threshold_eur?: number | null
          auto_recharge_amount?: number | null
          auto_recharge_enabled?: boolean | null
          auto_recharge_method?: string | null
          auto_recharge_payment_ref?: string | null
          auto_recharge_threshold?: number | null
          balance_eur?: number | null
          blocked_at?: string | null
          blocked_reason?: string | null
          calls_blocked?: boolean | null
          company_id?: string
          id?: string
          total_recharged_eur?: number | null
          total_spent_eur?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_subscriptions: {
        Row: {
          company_id: string
          created_at: string
          current_period_end: string | null
          id: string
          price_eur: number | null
          status: string
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_eur?: number | null
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          id?: string
          price_eur?: number | null
          status?: string
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          rate_limit_per_day: number
          rate_limit_per_minute: number
          scopes: string[]
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_day?: number
          rate_limit_per_minute?: number
          scopes?: string[]
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          rate_limit_per_day?: number
          rate_limit_per_minute?: number
          scopes?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_daily: {
        Row: {
          api_key_id: string
          avg_response_time_ms: number | null
          company_id: string
          date: string
          failed_requests: number
          id: string
          successful_requests: number
          total_requests: number
        }
        Insert: {
          api_key_id: string
          avg_response_time_ms?: number | null
          company_id: string
          date?: string
          failed_requests?: number
          id?: string
          successful_requests?: number
          total_requests?: number
        }
        Update: {
          api_key_id?: string
          avg_response_time_ms?: number | null
          company_id?: string
          date?: string
          failed_requests?: number
          id?: string
          successful_requests?: number
          total_requests?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_daily_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_daily_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      api_usage_log: {
        Row: {
          api_key_id: string
          company_id: string
          created_at: string
          endpoint: string
          id: string
          ip_address: string | null
          method: string
          response_time_ms: number | null
          status_code: number
        }
        Insert: {
          api_key_id: string
          company_id: string
          created_at?: string
          endpoint: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number
        }
        Update: {
          api_key_id?: string
          company_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          ip_address?: string | null
          method?: string
          response_time_ms?: number | null
          status_code?: number
        }
        Relationships: [
          {
            foreignKeyName: "api_usage_log_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "api_usage_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders_sent: {
        Row: {
          appointment_id: string
          id: string
          reminder_type: string
          sent_at: string | null
        }
        Insert: {
          appointment_id: string
          id?: string
          reminder_type: string
          sent_at?: string | null
        }
        Update: {
          appointment_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reminders_sent_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
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
          reminder_minutes: number | null
          reminder_sent: boolean | null
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
          reminder_minutes?: number | null
          reminder_sent?: boolean | null
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
          reminder_minutes?: number | null
          reminder_sent?: boolean | null
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
      attribution_sessions: {
        Row: {
          browser: string | null
          city: string | null
          company_id: string
          contact_id: string | null
          converted_at: string | null
          country: string | null
          created_at: string
          device_type: string | null
          ended_at: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          ip_hash: string | null
          landing_page: string | null
          landing_url: string | null
          li_fat_id: string | null
          msclkid: string | null
          os: string | null
          pages_viewed: number | null
          referrer: string | null
          session_id: string
          started_at: string
          ttclid: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          company_id: string
          contact_id?: string | null
          converted_at?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          landing_url?: string | null
          li_fat_id?: string | null
          msclkid?: string | null
          os?: string | null
          pages_viewed?: number | null
          referrer?: string | null
          session_id: string
          started_at?: string
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          company_id?: string
          contact_id?: string | null
          converted_at?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          ended_at?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          ip_hash?: string | null
          landing_page?: string | null
          landing_url?: string | null
          li_fat_id?: string | null
          msclkid?: string | null
          os?: string | null
          pages_viewed?: number | null
          referrer?: string | null
          session_id?: string
          started_at?: string
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attribution_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attribution_sessions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
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
          config_json: Json
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
          config_json?: Json
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
          config_json?: Json
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
      automation_global_settings: {
        Row: {
          company_id: string
          config_json: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          config_json?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          config_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_global_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
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
      automation_queue: {
        Row: {
          attempts: number
          company_id: string
          context_json: Json | null
          created_at: string
          current_node_id: string
          enrollment_id: string
          entity_id: string
          entity_type: string
          execute_at: string
          flow_id: string
          id: string
          last_error: string | null
          max_attempts: number
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          context_json?: Json | null
          created_at?: string
          current_node_id: string
          enrollment_id: string
          entity_id: string
          entity_type?: string
          execute_at?: string
          flow_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          context_json?: Json | null
          created_at?: string
          current_node_id?: string
          enrollment_id?: string
          entity_id?: string
          entity_type?: string
          execute_at?: string
          flow_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "automation_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_queue_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_trigger_events: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          payload: Json | null
          processed: boolean
          trigger_event: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id: string
          entity_type?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          trigger_event: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          payload?: Json | null
          processed?: boolean
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_trigger_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      bank_accounts: {
        Row: {
          account_name: string | null
          account_owner_name: string | null
          account_type: string | null
          available_balance: number | null
          balance_updated_at: string | null
          bban: string | null
          company_id: string
          connection_id: string
          created_at: string
          currency: string
          current_balance: number | null
          display_name: string | null
          external_account_id: string
          iban: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_owner_name?: string | null
          account_type?: string | null
          available_balance?: number | null
          balance_updated_at?: string | null
          bban?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          currency?: string
          current_balance?: number | null
          display_name?: string | null
          external_account_id: string
          iban?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_owner_name?: string | null
          account_type?: string | null
          available_balance?: number | null
          balance_updated_at?: string | null
          bban?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          currency?: string
          current_balance?: number | null
          display_name?: string | null
          external_account_id?: string
          iban?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_categorization_rules: {
        Row: {
          auto_apply: boolean
          category: string
          category_icon: string | null
          company_id: string
          created_at: string
          id: string
          is_case_sensitive: boolean
          match_field: string
          match_type: string
          match_value: string
          priority: number
        }
        Insert: {
          auto_apply?: boolean
          category: string
          category_icon?: string | null
          company_id: string
          created_at?: string
          id?: string
          is_case_sensitive?: boolean
          match_field?: string
          match_type?: string
          match_value: string
          priority?: number
        }
        Update: {
          auto_apply?: boolean
          category?: string
          category_icon?: string | null
          company_id?: string
          created_at?: string
          id?: string
          is_case_sensitive?: boolean
          match_field?: string
          match_type?: string
          match_value?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "bank_categorization_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          accounts_count: number | null
          company_id: string
          created_at: string
          created_by: string | null
          error_message: string | null
          expires_at: string | null
          id: string
          institution_country: string | null
          institution_id: string
          institution_logo: string | null
          institution_name: string
          last_sync_at: string | null
          provider_slug: string
          requisition_id: string | null
          requisition_link: string | null
          status: string
          updated_at: string
        }
        Insert: {
          accounts_count?: number | null
          company_id: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          institution_country?: string | null
          institution_id: string
          institution_logo?: string | null
          institution_name: string
          last_sync_at?: string | null
          provider_slug?: string
          requisition_id?: string | null
          requisition_link?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          accounts_count?: number | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          expires_at?: string | null
          id?: string
          institution_country?: string | null
          institution_id?: string
          institution_logo?: string | null
          institution_name?: string
          last_sync_at?: string | null
          provider_slug?: string
          requisition_id?: string | null
          requisition_link?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_provider_configs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          logo_url: string | null
          provider_name: string
          provider_slug: string
          supported_countries: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          logo_url?: string | null
          provider_name: string
          provider_slug: string
          supported_countries?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          logo_url?: string | null
          provider_name?: string
          provider_slug?: string
          supported_countries?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      bank_reconciliations: {
        Row: {
          company_id: string
          created_at: string
          id: string
          invoice_id: string
          match_score: number | null
          match_type: string
          matched_amount: number
          matched_at: string
          matched_by: string | null
          notes: string | null
          transaction_id: string
          unmatched_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          invoice_id: string
          match_score?: number | null
          match_type?: string
          matched_amount?: number
          matched_at?: string
          matched_by?: string | null
          notes?: string | null
          transaction_id: string
          unmatched_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          match_score?: number | null
          match_type?: string
          matched_amount?: number
          matched_at?: string
          matched_by?: string | null
          notes?: string | null
          transaction_id?: string
          unmatched_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_reconciliations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "bank_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_sync_logs: {
        Row: {
          accounts_synced: number
          company_id: string
          completed_at: string | null
          connection_id: string | null
          error_message: string | null
          id: string
          started_at: string
          status: string
          sync_type: string
          transactions_fetched: number
          triggered_by: string | null
        }
        Insert: {
          accounts_synced?: number
          company_id: string
          completed_at?: string | null
          connection_id?: string | null
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          sync_type?: string
          transactions_fetched?: number
          triggered_by?: string | null
        }
        Update: {
          accounts_synced?: number
          company_id?: string
          completed_at?: string | null
          connection_id?: string | null
          error_message?: string | null
          id?: string
          started_at?: string
          status?: string
          sync_type?: string
          transactions_fetched?: number
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_sync_logs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount: number
          booking_date: string | null
          category: string | null
          category_icon: string | null
          company_id: string
          created_at: string
          creditor_iban: string | null
          creditor_name: string | null
          currency: string
          debtor_iban: string | null
          debtor_name: string | null
          description: string | null
          external_transaction_id: string
          id: string
          linked_cost_id: string | null
          linked_invoice_id: string | null
          merchant_name: string | null
          metadata: Json
          note: string | null
          reference: string | null
          status: string
          synced_at: string
          transaction_type: string
          value_date: string | null
        }
        Insert: {
          account_id: string
          amount: number
          booking_date?: string | null
          category?: string | null
          category_icon?: string | null
          company_id: string
          created_at?: string
          creditor_iban?: string | null
          creditor_name?: string | null
          currency?: string
          debtor_iban?: string | null
          debtor_name?: string | null
          description?: string | null
          external_transaction_id: string
          id?: string
          linked_cost_id?: string | null
          linked_invoice_id?: string | null
          merchant_name?: string | null
          metadata?: Json
          note?: string | null
          reference?: string | null
          status?: string
          synced_at?: string
          transaction_type?: string
          value_date?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          booking_date?: string | null
          category?: string | null
          category_icon?: string | null
          company_id?: string
          created_at?: string
          creditor_iban?: string | null
          creditor_name?: string | null
          currency?: string
          debtor_iban?: string | null
          debtor_name?: string | null
          description?: string | null
          external_transaction_id?: string
          id?: string
          linked_cost_id?: string | null
          linked_invoice_id?: string | null
          merchant_name?: string | null
          metadata?: Json
          note?: string | null
          reference?: string | null
          status?: string
          synced_at?: string
          transaction_type?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_integrations: {
        Row: {
          access_token: string | null
          api_key: string | null
          auto_sync: boolean | null
          company_external_id: string | null
          company_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          last_sync_at: string | null
          last_sync_error: string | null
          last_sync_status: string | null
          provider: string
          provider_company_name: string | null
          provider_vat_number: string | null
          refresh_token: string | null
          sync_direction: string | null
          token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          api_key?: string | null
          auto_sync?: boolean | null
          company_external_id?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          provider: string
          provider_company_name?: string | null
          provider_vat_number?: string | null
          refresh_token?: string | null
          sync_direction?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          api_key?: string | null
          auto_sync?: boolean | null
          company_external_id?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          last_sync_at?: string | null
          last_sync_error?: string | null
          last_sync_status?: string | null
          provider?: string
          provider_company_name?: string | null
          provider_vat_number?: string | null
          refresh_token?: string | null
          sync_direction?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_sync_log: {
        Row: {
          action: string
          company_id: string
          direction: string
          error_message: string | null
          executed_at: string | null
          id: string
          invoice_id: string | null
          provider: string
          request_payload: Json | null
          response_payload: Json | null
          status: string
        }
        Insert: {
          action: string
          company_id: string
          direction: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          invoice_id?: string | null
          provider: string
          request_payload?: Json | null
          response_payload?: Json | null
          status: string
        }
        Update: {
          action?: string
          company_id?: string
          direction?: string
          error_message?: string | null
          executed_at?: string | null
          id?: string
          invoice_id?: string | null
          provider?: string
          request_payload?: Json | null
          response_payload?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_sync_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_sync_log_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          company_id: string
          contact_id: string | null
          created_at: string
          duration_sec: number
          id: string
          notes: string | null
          outcome: string
          started_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          created_at?: string
          duration_sec?: number
          id?: string
          notes?: string | null
          outcome?: string
          started_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          created_at?: string
          duration_sec?: number
          id?: string
          notes?: string | null
          outcome?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_costs: {
        Row: {
          campaign_name: string | null
          company_id: string
          created_at: string
          date: string
          id: string
          notes: string | null
          source: string
          spend_amount: number
        }
        Insert: {
          campaign_name?: string | null
          company_id: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          source: string
          spend_amount?: number
        }
        Update: {
          campaign_name?: string | null
          company_id?: string
          created_at?: string
          date?: string
          id?: string
          notes?: string | null
          source?: string
          spend_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_costs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          alert_late_orders_threshold: number | null
          alert_margin_min_pct: number | null
          alert_open_tickets_threshold: number | null
          alert_runway_days_warning: number | null
          allowed_ips: string[] | null
          bank_account_holder: string | null
          bank_iban: string | null
          bank_name: string | null
          brand_accent_color: string | null
          brand_favicon_url: string | null
          brand_hide_powered_by: boolean | null
          brand_login_bg_url: string | null
          brand_platform_name: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          brand_text_on_primary: string | null
          business_name: string | null
          created_at: string
          dunning_started_at: string | null
          dunning_status: string | null
          email: string
          enforce_2fa: boolean
          enforce_2fa_roles: string[] | null
          fiscal_code: string | null
          id: string
          last_payment_failure_at: string | null
          legal_address: string | null
          legal_city: string | null
          legal_postal_code: string | null
          legal_province: string | null
          lockout_duration_minutes: number
          logo_url: string | null
          max_failed_attempts: number
          messaging_beta_enabled: boolean
          monthly_orders_target: number | null
          monthly_revenue_target: number | null
          name: string
          notes: string | null
          operational_address: string | null
          operational_city: string | null
          operational_lat: number | null
          operational_lng: number | null
          operational_postal_code: string | null
          operational_province: string | null
          password_expiry_days: number
          password_min_length: number
          password_require_numbers: boolean
          password_require_special: boolean
          password_require_uppercase: boolean
          payment_failure_count: number | null
          payment_method: string
          payment_notes: string | null
          pec: string | null
          phone: string | null
          referred_by: string | null
          sdi_code: string | null
          sector: Database["public"]["Enums"]["company_sector"]
          security_notifications: Json | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_status: string | null
          subscription_plan_id: string | null
          tesoreria_enabled: boolean | null
          trial_ends_at: string | null
          trial_extensions_count: number
          updated_at: string
          vat_number: string | null
          website: string | null
          white_label_enabled: boolean
          white_label_enabled_at: string | null
          white_label_enabled_by: string | null
          white_label_monthly_price: number | null
        }
        Insert: {
          alert_late_orders_threshold?: number | null
          alert_margin_min_pct?: number | null
          alert_open_tickets_threshold?: number | null
          alert_runway_days_warning?: number | null
          allowed_ips?: string[] | null
          bank_account_holder?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          brand_accent_color?: string | null
          brand_favicon_url?: string | null
          brand_hide_powered_by?: boolean | null
          brand_login_bg_url?: string | null
          brand_platform_name?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          brand_text_on_primary?: string | null
          business_name?: string | null
          created_at?: string
          dunning_started_at?: string | null
          dunning_status?: string | null
          email: string
          enforce_2fa?: boolean
          enforce_2fa_roles?: string[] | null
          fiscal_code?: string | null
          id?: string
          last_payment_failure_at?: string | null
          legal_address?: string | null
          legal_city?: string | null
          legal_postal_code?: string | null
          legal_province?: string | null
          lockout_duration_minutes?: number
          logo_url?: string | null
          max_failed_attempts?: number
          messaging_beta_enabled?: boolean
          monthly_orders_target?: number | null
          monthly_revenue_target?: number | null
          name: string
          notes?: string | null
          operational_address?: string | null
          operational_city?: string | null
          operational_lat?: number | null
          operational_lng?: number | null
          operational_postal_code?: string | null
          operational_province?: string | null
          password_expiry_days?: number
          password_min_length?: number
          password_require_numbers?: boolean
          password_require_special?: boolean
          password_require_uppercase?: boolean
          payment_failure_count?: number | null
          payment_method?: string
          payment_notes?: string | null
          pec?: string | null
          phone?: string | null
          referred_by?: string | null
          sdi_code?: string | null
          sector?: Database["public"]["Enums"]["company_sector"]
          security_notifications?: Json | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_status?: string | null
          subscription_plan_id?: string | null
          tesoreria_enabled?: boolean | null
          trial_ends_at?: string | null
          trial_extensions_count?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          white_label_enabled?: boolean
          white_label_enabled_at?: string | null
          white_label_enabled_by?: string | null
          white_label_monthly_price?: number | null
        }
        Update: {
          alert_late_orders_threshold?: number | null
          alert_margin_min_pct?: number | null
          alert_open_tickets_threshold?: number | null
          alert_runway_days_warning?: number | null
          allowed_ips?: string[] | null
          bank_account_holder?: string | null
          bank_iban?: string | null
          bank_name?: string | null
          brand_accent_color?: string | null
          brand_favicon_url?: string | null
          brand_hide_powered_by?: boolean | null
          brand_login_bg_url?: string | null
          brand_platform_name?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          brand_text_on_primary?: string | null
          business_name?: string | null
          created_at?: string
          dunning_started_at?: string | null
          dunning_status?: string | null
          email?: string
          enforce_2fa?: boolean
          enforce_2fa_roles?: string[] | null
          fiscal_code?: string | null
          id?: string
          last_payment_failure_at?: string | null
          legal_address?: string | null
          legal_city?: string | null
          legal_postal_code?: string | null
          legal_province?: string | null
          lockout_duration_minutes?: number
          logo_url?: string | null
          max_failed_attempts?: number
          messaging_beta_enabled?: boolean
          monthly_orders_target?: number | null
          monthly_revenue_target?: number | null
          name?: string
          notes?: string | null
          operational_address?: string | null
          operational_city?: string | null
          operational_lat?: number | null
          operational_lng?: number | null
          operational_postal_code?: string | null
          operational_province?: string | null
          password_expiry_days?: number
          password_min_length?: number
          password_require_numbers?: boolean
          password_require_special?: boolean
          password_require_uppercase?: boolean
          payment_failure_count?: number | null
          payment_method?: string
          payment_notes?: string | null
          pec?: string | null
          phone?: string | null
          referred_by?: string | null
          sdi_code?: string | null
          sector?: Database["public"]["Enums"]["company_sector"]
          security_notifications?: Json | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_status?: string | null
          subscription_plan_id?: string | null
          tesoreria_enabled?: boolean | null
          trial_ends_at?: string | null
          trial_extensions_count?: number
          updated_at?: string
          vat_number?: string | null
          website?: string | null
          white_label_enabled?: boolean
          white_label_enabled_at?: string | null
          white_label_enabled_by?: string | null
          white_label_monthly_price?: number | null
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
      company_addons_log: {
        Row: {
          action: string
          addon_key: string
          company_id: string
          created_at: string | null
          id: string
          new_value: Json | null
          notes: string | null
          old_value: Json | null
          performed_by: string | null
          performed_by_email: string | null
        }
        Insert: {
          action: string
          addon_key: string
          company_id: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          notes?: string | null
          old_value?: Json | null
          performed_by?: string | null
          performed_by_email?: string | null
        }
        Update: {
          action?: string
          addon_key?: string
          company_id?: string
          created_at?: string | null
          id?: string
          new_value?: Json | null
          notes?: string | null
          old_value?: Json | null
          performed_by?: string | null
          performed_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_addons_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_auto_topup: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          last_topup_at: string | null
          payment_method: string | null
          stripe_payment_method_id: string | null
          threshold_eur: number
          topup_amount_eur: number
          updated_at: string
          wallet_type: string
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_topup_at?: string | null
          payment_method?: string | null
          stripe_payment_method_id?: string | null
          threshold_eur?: number
          topup_amount_eur?: number
          updated_at?: string
          wallet_type?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_topup_at?: string | null
          payment_method?: string | null
          stripe_payment_method_id?: string | null
          threshold_eur?: number
          topup_amount_eur?: number
          updated_at?: string
          wallet_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_auto_topup_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_billing_overrides: {
        Row: {
          company_id: string
          custom_notes: string | null
          id: string
          is_enabled: boolean
          is_free: boolean
          markup_multiplier: number | null
          monthly_fee_eur: number | null
          price_per_unit_eur: number | null
          service: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          custom_notes?: string | null
          id?: string
          is_enabled?: boolean
          is_free?: boolean
          markup_multiplier?: number | null
          monthly_fee_eur?: number | null
          price_per_unit_eur?: number | null
          service: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          custom_notes?: string | null
          id?: string
          is_enabled?: boolean
          is_free?: boolean
          markup_multiplier?: number | null
          monthly_fee_eur?: number | null
          price_per_unit_eur?: number | null
          service?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_billing_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_branding: {
        Row: {
          accent_color: string | null
          company_id: string
          created_at: string
          custom_domain: string | null
          email_footer_text: string | null
          email_header_logo_url: string | null
          favicon_url: string | null
          hide_platform_branding: boolean | null
          id: string
          login_bg_color: string | null
          login_logo_url: string | null
          login_subtitle: string | null
          login_title: string | null
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          sidebar_bg_color: string | null
          sidebar_text_color: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          company_id: string
          created_at?: string
          custom_domain?: string | null
          email_footer_text?: string | null
          email_header_logo_url?: string | null
          favicon_url?: string | null
          hide_platform_branding?: boolean | null
          id?: string
          login_bg_color?: string | null
          login_logo_url?: string | null
          login_subtitle?: string | null
          login_title?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          sidebar_bg_color?: string | null
          sidebar_text_color?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          company_id?: string
          created_at?: string
          custom_domain?: string | null
          email_footer_text?: string | null
          email_header_logo_url?: string | null
          favicon_url?: string | null
          hide_platform_branding?: boolean | null
          id?: string
          login_bg_color?: string | null
          login_logo_url?: string | null
          login_subtitle?: string | null
          login_title?: string | null
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          sidebar_bg_color?: string | null
          sidebar_text_color?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_branding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
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
          recurrence_auto: boolean
          recurrence_end_date: string | null
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
          recurrence_auto?: boolean
          recurrence_end_date?: string | null
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
          recurrence_auto?: boolean
          recurrence_end_date?: string | null
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
      company_feature_overrides: {
        Row: {
          company_id: string
          created_at: string | null
          expires_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean
          override_by: string | null
          override_reason: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          expires_at?: string | null
          feature_key: string
          id?: string
          is_enabled: boolean
          override_by?: string | null
          override_reason?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          expires_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean
          override_by?: string | null
          override_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_feature_overrides_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_feature_overrides_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "platform_feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      company_health_scores: {
        Row: {
          calculated_at: string
          churn_risk: number
          company_id: string
          engagement_score: number
          features_score: number
          health: string
          id: string
          login_score: number
          orders_score: number
          score: number
          signals: Json | null
          team_score: number
        }
        Insert: {
          calculated_at?: string
          churn_risk?: number
          company_id: string
          engagement_score?: number
          features_score?: number
          health?: string
          id?: string
          login_score?: number
          orders_score?: number
          score?: number
          signals?: Json | null
          team_score?: number
        }
        Update: {
          calculated_at?: string
          churn_risk?: number
          company_id?: string
          engagement_score?: number
          features_score?: number
          health?: string
          id?: string
          login_score?: number
          orders_score?: number
          score?: number
          signals?: Json | null
          team_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "company_health_scores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_notes: {
        Row: {
          author_id: string
          company_id: string
          content: string
          created_at: string
          id: string
        }
        Insert: {
          author_id: string
          company_id: string
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string
          company_id?: string
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_notes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_onboarding: {
        Row: {
          assigned_cs: string | null
          company_id: string
          completed_at: string | null
          id: string
          started_at: string
          status: string
          template_id: string
        }
        Insert: {
          assigned_cs?: string | null
          company_id: string
          completed_at?: string | null
          id?: string
          started_at?: string
          status?: string
          template_id: string
        }
        Update: {
          assigned_cs?: string | null
          company_id?: string
          completed_at?: string | null
          id?: string
          started_at?: string
          status?: string
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_onboarding_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_onboarding_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      company_onboarding_completions: {
        Row: {
          company_id: string
          completed_at: string
          completed_by: string | null
          id: string
          notes: string | null
          step_id: string
        }
        Insert: {
          company_id: string
          completed_at?: string
          completed_by?: string | null
          id?: string
          notes?: string | null
          step_id: string
        }
        Update: {
          company_id?: string
          completed_at?: string
          completed_by?: string | null
          id?: string
          notes?: string | null
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_onboarding_completions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_onboarding_completions_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_steps"
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
      company_tags: {
        Row: {
          color: string
          company_id: string
          created_at: string
          id: string
          tag: string
        }
        Insert: {
          color?: string
          company_id: string
          created_at?: string
          id?: string
          tag: string
        }
        Update: {
          color?: string
          company_id?: string
          created_at?: string
          id?: string
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_tags_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_attributions: {
        Row: {
          attribution_model: string | null
          company_id: string
          contact_id: string
          created_at: string
          first_campaign: string | null
          first_medium: string | null
          first_source: string | null
          first_touch_at: string | null
          first_touch_session_id: string | null
          ft_content: string | null
          ft_fbclid: string | null
          ft_gclid: string | null
          ft_landing_url: string | null
          ft_term: string | null
          ft_ttclid: string | null
          id: string
          last_campaign: string | null
          last_medium: string | null
          last_source: string | null
          last_touch_at: string | null
          last_touch_session_id: string | null
          lt_content: string | null
          lt_fbclid: string | null
          lt_gclid: string | null
          lt_landing_url: string | null
          lt_term: string | null
          lt_ttclid: string | null
          total_sessions: number | null
          updated_at: string
        }
        Insert: {
          attribution_model?: string | null
          company_id: string
          contact_id: string
          created_at?: string
          first_campaign?: string | null
          first_medium?: string | null
          first_source?: string | null
          first_touch_at?: string | null
          first_touch_session_id?: string | null
          ft_content?: string | null
          ft_fbclid?: string | null
          ft_gclid?: string | null
          ft_landing_url?: string | null
          ft_term?: string | null
          ft_ttclid?: string | null
          id?: string
          last_campaign?: string | null
          last_medium?: string | null
          last_source?: string | null
          last_touch_at?: string | null
          last_touch_session_id?: string | null
          lt_content?: string | null
          lt_fbclid?: string | null
          lt_gclid?: string | null
          lt_landing_url?: string | null
          lt_term?: string | null
          lt_ttclid?: string | null
          total_sessions?: number | null
          updated_at?: string
        }
        Update: {
          attribution_model?: string | null
          company_id?: string
          contact_id?: string
          created_at?: string
          first_campaign?: string | null
          first_medium?: string | null
          first_source?: string | null
          first_touch_at?: string | null
          first_touch_session_id?: string | null
          ft_content?: string | null
          ft_fbclid?: string | null
          ft_gclid?: string | null
          ft_landing_url?: string | null
          ft_term?: string | null
          ft_ttclid?: string | null
          id?: string
          last_campaign?: string | null
          last_medium?: string | null
          last_source?: string | null
          last_touch_at?: string | null
          last_touch_session_id?: string | null
          lt_content?: string | null
          lt_fbclid?: string | null
          lt_gclid?: string | null
          lt_landing_url?: string | null
          lt_term?: string | null
          lt_ttclid?: string | null
          total_sessions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_attributions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attributions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: true
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attributions_first_touch_session_id_fkey"
            columns: ["first_touch_session_id"]
            isOneToOne: false
            referencedRelation: "attribution_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_attributions_last_touch_session_id_fkey"
            columns: ["last_touch_session_id"]
            isOneToOne: false
            referencedRelation: "attribution_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          channel: string
          company_id: string
          contact_id: string
          content: string
          created_at: string | null
          id: string
          sent_at: string | null
          sent_by: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          channel: string
          company_id: string
          contact_id: string
          content: string
          created_at?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          channel?: string
          company_id?: string
          contact_id?: string
          content?: string
          created_at?: string | null
          id?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_budgets: {
        Row: {
          budget_amount: number
          category: string
          company_id: string
          created_at: string
          id: string
          month: string
        }
        Insert: {
          budget_amount?: number
          category: string
          company_id: string
          created_at?: string
          id?: string
          month: string
        }
        Update: {
          budget_amount?: number
          category?: string
          company_id?: string
          created_at?: string
          id?: string
          month?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_budgets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_tasks: {
        Row: {
          assigned_to: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_messages: {
        Row: {
          body: string
          company_id: string
          created_at: string
          customer_id: string
          id: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_function_rate_limits: {
        Row: {
          called_at: string
          caller_id: string
          function_name: string
          id: string
        }
        Insert: {
          called_at?: string
          caller_id: string
          function_name: string
          id?: string
        }
        Update: {
          called_at?: string
          caller_id?: string
          function_name?: string
          id?: string
        }
        Relationships: []
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
          ab_html_content_b: string | null
          ab_split_percent: number | null
          ab_subject_b: string | null
          ab_test_duration_hours: number | null
          ab_test_enabled: boolean
          ab_winner: string | null
          ab_winner_criteria: string | null
          auto_tag: boolean
          company_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          credits_used: number
          failed_count: number
          folder_id: string | null
          html_content: string
          id: string
          json_content: Json | null
          name: string
          preview_text: string | null
          recipient_filter: Json | null
          resend_to_unopened: boolean
          scheduled_at: string | null
          segment_json: Json | null
          send_mode: string
          sender_email: string | null
          sender_name: string | null
          sent_at: string | null
          sent_count: number
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
          ab_html_content_b?: string | null
          ab_split_percent?: number | null
          ab_subject_b?: string | null
          ab_test_duration_hours?: number | null
          ab_test_enabled?: boolean
          ab_winner?: string | null
          ab_winner_criteria?: string | null
          auto_tag?: boolean
          company_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          credits_used?: number
          failed_count?: number
          folder_id?: string | null
          html_content?: string
          id?: string
          json_content?: Json | null
          name: string
          preview_text?: string | null
          recipient_filter?: Json | null
          resend_to_unopened?: boolean
          scheduled_at?: string | null
          segment_json?: Json | null
          send_mode?: string
          sender_email?: string | null
          sender_name?: string | null
          sent_at?: string | null
          sent_count?: number
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
          ab_html_content_b?: string | null
          ab_split_percent?: number | null
          ab_subject_b?: string | null
          ab_test_duration_hours?: number | null
          ab_test_enabled?: boolean
          ab_winner?: string | null
          ab_winner_criteria?: string | null
          auto_tag?: boolean
          company_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          credits_used?: number
          failed_count?: number
          folder_id?: string | null
          html_content?: string
          id?: string
          json_content?: Json | null
          name?: string
          preview_text?: string | null
          recipient_filter?: Json | null
          resend_to_unopened?: boolean
          scheduled_at?: string | null
          segment_json?: Json | null
          send_mode?: string
          sender_email?: string | null
          sender_name?: string | null
          sent_at?: string | null
          sent_count?: number
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
      email_credits: {
        Row: {
          alert_email_sent_at: string | null
          alert_threshold_eur: number | null
          auto_recharge_amount: number | null
          auto_recharge_enabled: boolean | null
          auto_recharge_threshold: number | null
          balance_eur: number
          company_id: string
          id: string
          sends_blocked: boolean
          total_recharged_eur: number
          total_spent_eur: number
          updated_at: string
        }
        Insert: {
          alert_email_sent_at?: string | null
          alert_threshold_eur?: number | null
          auto_recharge_amount?: number | null
          auto_recharge_enabled?: boolean | null
          auto_recharge_threshold?: number | null
          balance_eur?: number
          company_id: string
          id?: string
          sends_blocked?: boolean
          total_recharged_eur?: number
          total_spent_eur?: number
          updated_at?: string
        }
        Update: {
          alert_email_sent_at?: string | null
          alert_threshold_eur?: number | null
          auto_recharge_amount?: number | null
          auto_recharge_enabled?: boolean | null
          auto_recharge_threshold?: number | null
          balance_eur?: number
          company_id?: string
          id?: string
          sends_blocked?: boolean
          total_recharged_eur?: number
          total_spent_eur?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      email_credits_log: {
        Row: {
          amount_eur: number
          balance_after: number
          balance_before: number
          campaign_id: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          type: string
        }
        Insert: {
          amount_eur?: number
          balance_after?: number
          balance_before?: number
          campaign_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          type?: string
        }
        Update: {
          amount_eur?: number
          balance_after?: number
          balance_before?: number
          campaign_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_credits_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "email_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_credits_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          ab_variant: string | null
          campaign_id: string
          clicked_at: string | null
          company_id: string
          contact_id: string
          error_message: string | null
          event_timestamp: string
          id: string
          metadata: Json | null
          opened_at: string | null
          provider: string | null
          provider_message_id: string | null
          sendgrid_message_id: string | null
          status: string
          stream: string | null
        }
        Insert: {
          ab_variant?: string | null
          campaign_id: string
          clicked_at?: string | null
          company_id: string
          contact_id: string
          error_message?: string | null
          event_timestamp?: string
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          sendgrid_message_id?: string | null
          status?: string
          stream?: string | null
        }
        Update: {
          ab_variant?: string | null
          campaign_id?: string
          clicked_at?: string | null
          company_id?: string
          contact_id?: string
          error_message?: string | null
          event_timestamp?: string
          id?: string
          metadata?: Json | null
          opened_at?: string | null
          provider?: string | null
          provider_message_id?: string | null
          sendgrid_message_id?: string | null
          status?: string
          stream?: string | null
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
      email_pricing: {
        Row: {
          cost_billed_per_email: number
          cost_real_per_email: number
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          markup_multiplier: number
          provider: string
          updated_at: string
        }
        Insert: {
          cost_billed_per_email?: number
          cost_real_per_email?: number
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          markup_multiplier?: number
          provider?: string
          updated_at?: string
        }
        Update: {
          cost_billed_per_email?: number
          cost_real_per_email?: number
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          markup_multiplier?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
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
      form_submissions: {
        Row: {
          company_id: string
          contact_id: string | null
          data: Json
          device_type: string | null
          fbclid: string | null
          form_id: string
          gclid: string | null
          id: string
          ip_hash: string | null
          li_fat_id: string | null
          msclkid: string | null
          session_id: string | null
          submitted_at: string
          ttclid: string | null
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          company_id: string
          contact_id?: string | null
          data?: Json
          device_type?: string | null
          fbclid?: string | null
          form_id: string
          gclid?: string | null
          id?: string
          ip_hash?: string | null
          li_fat_id?: string | null
          msclkid?: string | null
          session_id?: string | null
          submitted_at?: string
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          company_id?: string
          contact_id?: string | null
          data?: Json
          device_type?: string | null
          fbclid?: string | null
          form_id?: string
          gclid?: string | null
          id?: string
          ip_hash?: string | null
          li_fat_id?: string | null
          msclkid?: string | null
          session_id?: string | null
          submitted_at?: string
          ttclid?: string | null
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "lead_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_views: {
        Row: {
          company_id: string
          form_id: string
          id: string
          ip_hash: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          viewed_at: string
          visitor_id: string | null
        }
        Insert: {
          company_id: string
          form_id: string
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          viewed_at?: string
          visitor_id?: string | null
        }
        Update: {
          company_id?: string
          form_id?: string
          id?: string
          ip_hash?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          viewed_at?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_views_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_views_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "lead_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_audit_log: {
        Row: {
          action: string
          company_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          action: string
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          action?: string
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_consents: {
        Row: {
          company_id: string
          consent_type: string
          created_at: string
          granted: boolean
          granted_at: string | null
          id: string
          ip_address: string | null
          revoked_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          consent_type: string
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          consent_type?: string
          created_at?: string
          granted?: boolean
          granted_at?: string | null
          id?: string
          ip_address?: string | null
          revoked_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_consents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      gdpr_data_requests: {
        Row: {
          company_id: string
          created_at: string
          download_url: string | null
          expires_at: string | null
          id: string
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          request_type: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          download_url?: string | null
          expires_at?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          request_type?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          download_url?: string | null
          expires_at?: string | null
          id?: string
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          request_type?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gdpr_data_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gdpr_data_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_busy_slots: {
        Row: {
          company_id: string
          created_at: string
          end_at: string
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          is_all_day: boolean
          start_at: string
          summary: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          end_at: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_all_day?: boolean
          start_at: string
          summary?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          end_at?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          is_all_day?: boolean
          start_at?: string
          summary?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_busy_slots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          access_token_encrypted: string | null
          company_id: string
          created_at: string
          google_account_email: string | null
          google_sub: string | null
          id: string
          last_error: string | null
          last_sync_at: string | null
          refresh_token_encrypted: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
          webhook_channel_id: string | null
          webhook_expiry_at: string | null
          webhook_resource_id: string | null
        }
        Insert: {
          access_token_encrypted?: string | null
          company_id: string
          created_at?: string
          google_account_email?: string | null
          google_sub?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          refresh_token_encrypted?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
          webhook_channel_id?: string | null
          webhook_expiry_at?: string | null
          webhook_resource_id?: string | null
        }
        Update: {
          access_token_encrypted?: string | null
          company_id?: string
          created_at?: string
          google_account_email?: string | null
          google_sub?: string | null
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          refresh_token_encrypted?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
          webhook_channel_id?: string | null
          webhook_expiry_at?: string | null
          webhook_resource_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_event_map: {
        Row: {
          appointment_id: string | null
          company_id: string
          created_at: string
          etag: string | null
          google_calendar_id: string | null
          google_event_id: string
          id: string
          last_synced_at: string | null
          last_updated_by: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          appointment_id?: string | null
          company_id: string
          created_at?: string
          etag?: string | null
          google_calendar_id?: string | null
          google_event_id: string
          id?: string
          last_synced_at?: string | null
          last_updated_by?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          appointment_id?: string | null
          company_id?: string
          created_at?: string
          etag?: string | null
          google_calendar_id?: string | null
          google_event_id?: string
          id?: string
          last_synced_at?: string | null
          last_updated_by?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_event_map_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_event_map_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_settings: {
        Row: {
          company_id: string
          conflict_calendar_ids: string[]
          connection_id: string | null
          create_contacts_from_guests: boolean
          created_at: string
          id: string
          import_google_events_to_crm: boolean
          primary_calendar_id: string | null
          sync_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          conflict_calendar_ids?: string[]
          connection_id?: string | null
          create_contacts_from_guests?: boolean
          created_at?: string
          id?: string
          import_google_events_to_crm?: boolean
          primary_calendar_id?: string | null
          sync_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          conflict_calendar_ids?: string[]
          connection_id?: string | null
          create_contacts_from_guests?: boolean
          created_at?: string
          id?: string
          import_google_events_to_crm?: boolean
          primary_calendar_id?: string | null
          sync_mode?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "google_calendar_settings_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "google_calendar_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_sync_log: {
        Row: {
          completed_at: string | null
          connections_failed: number
          connections_found: number
          connections_synced: number
          error_message: string | null
          id: string
          results: Json | null
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          connections_failed?: number
          connections_found?: number
          connections_synced?: number
          error_message?: string | null
          id?: string
          results?: Json | null
          started_at?: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          connections_failed?: number
          connections_found?: number
          connections_synced?: number
          error_message?: string | null
          id?: string
          results?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      integration_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          access_token_encrypted: string
          created_at: string
          expires_at: string | null
          granted_scopes: Json | null
          id: string
          integration_id: string
          meta_page_tokens: Json | null
          meta_user_id: string | null
          meta_user_name: string | null
          token_type: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          expires_at?: string | null
          granted_scopes?: Json | null
          id?: string
          integration_id: string
          meta_page_tokens?: Json | null
          meta_user_id?: string | null
          meta_user_name?: string | null
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          expires_at?: string | null
          granted_scopes?: Json | null
          id?: string
          integration_id?: string
          meta_page_tokens?: Json | null
          meta_user_id?: string | null
          meta_user_name?: string | null
          token_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_field_mappings: {
        Row: {
          company_id: string
          created_at: string
          form_id: string
          id: string
          integration_id: string
          mapping_version: number
          rules: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          form_id: string
          id?: string
          integration_id: string
          mapping_version?: number
          rules?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          form_id?: string
          id?: string
          integration_id?: string
          mapping_version?: number
          rules?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_field_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_field_mappings_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_jobs: {
        Row: {
          attempts: number
          company_id: string
          created_at: string
          finished_at: string | null
          id: string
          integration_id: string
          job_type: string
          params: Json | null
          result: Json | null
          scheduled_at: string
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          company_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          integration_id: string
          job_type: string
          params?: Json | null
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          integration_id?: string
          job_type?: string
          params?: Json | null
          result?: Json | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_sync_jobs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhook_events: {
        Row: {
          company_id: string | null
          event_id: string | null
          event_type: string
          fail_count: number
          id: string
          integration_id: string | null
          last_fail_reason: string | null
          locked_at: string | null
          locked_by: string | null
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          company_id?: string | null
          event_id?: string | null
          event_type?: string
          fail_count?: number
          id?: string
          integration_id?: string | null
          last_fail_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Update: {
          company_id?: string | null
          event_id?: string | null
          event_type?: string
          fail_count?: number
          id?: string
          integration_id?: string | null
          last_fail_reason?: string | null
          locked_at?: string | null
          locked_by?: string | null
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_events_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhook_subscriptions: {
        Row: {
          callback_url: string | null
          company_id: string
          created_at: string
          fields: Json | null
          id: string
          integration_id: string
          object: string
          provider: string
          status: string
          updated_at: string
          verify_token_hash: string | null
        }
        Insert: {
          callback_url?: string | null
          company_id: string
          created_at?: string
          fields?: Json | null
          id?: string
          integration_id: string
          object?: string
          provider?: string
          status?: string
          updated_at?: string
          verify_token_hash?: string | null
        }
        Update: {
          callback_url?: string | null
          company_id?: string
          created_at?: string
          fields?: Json | null
          id?: string
          integration_id?: string
          object?: string
          provider?: string
          status?: string
          updated_at?: string
          verify_token_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_webhook_subscriptions_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          company_id: string
          connected_by: string | null
          created_at: string
          health: string
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_sync_at: string | null
          provider: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          connected_by?: string | null
          created_at?: string
          health?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_sync_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          connected_by?: string | null
          created_at?: string
          health?: string
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_sync_at?: string | null
          provider?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_agent_actions: {
        Row: {
          action_type: string
          call_id: string
          company_id: string
          entity_id: string | null
          entity_type: string
          error_message: string | null
          executed_at: string
          id: string
          input_params: Json | null
          result: Json | null
          status: string
          tool_name: string
        }
        Insert: {
          action_type: string
          call_id: string
          company_id: string
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          executed_at?: string
          id?: string
          input_params?: Json | null
          result?: Json | null
          status?: string
          tool_name: string
        }
        Update: {
          action_type?: string
          call_id?: string
          company_id?: string
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          executed_at?: string
          id?: string
          input_params?: Json | null
          result?: Json | null
          status?: string
          tool_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_agent_actions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "internal_call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_agent_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_ai_agents: {
        Row: {
          agent_type: string
          company_id: string
          created_at: string
          created_by: string
          elevenlabs_agent_id: string | null
          enabled_tools: string[]
          error_message: string | null
          first_message: string
          id: string
          is_interruptible: boolean
          language: string
          llm_model: string
          max_duration: number | null
          name: string
          phone_number_id: string | null
          silence_timeout: number | null
          status: string
          system_prompt: string
          tools_config: Json
          updated_at: string
          voice_id: string
        }
        Insert: {
          agent_type?: string
          company_id: string
          created_at?: string
          created_by: string
          elevenlabs_agent_id?: string | null
          enabled_tools?: string[]
          error_message?: string | null
          first_message?: string
          id?: string
          is_interruptible?: boolean
          language?: string
          llm_model?: string
          max_duration?: number | null
          name: string
          phone_number_id?: string | null
          silence_timeout?: number | null
          status?: string
          system_prompt?: string
          tools_config?: Json
          updated_at?: string
          voice_id?: string
        }
        Update: {
          agent_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          elevenlabs_agent_id?: string | null
          enabled_tools?: string[]
          error_message?: string | null
          first_message?: string
          id?: string
          is_interruptible?: boolean
          language?: string
          llm_model?: string
          max_duration?: number | null
          name?: string
          phone_number_id?: string | null
          silence_timeout?: number | null
          status?: string
          system_prompt?: string
          tools_config?: Json
          updated_at?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_ai_agents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_ai_agents_phone_number_id_fkey"
            columns: ["phone_number_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_phone_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_automation_connections: {
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
            foreignKeyName: "internal_automation_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_connections_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_connections_from_node_id_fkey"
            columns: ["from_node_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_connections_to_node_id_fkey"
            columns: ["to_node_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_automation_enrollments: {
        Row: {
          company_id: string
          context_json: Json
          created_at: string
          current_node_id: string | null
          entity_id: string
          entity_type: string
          flow_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          context_json?: Json
          created_at?: string
          current_node_id?: string | null
          entity_id: string
          entity_type?: string
          flow_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          context_json?: Json
          created_at?: string
          current_node_id?: string | null
          entity_id?: string
          entity_type?: string
          flow_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_automation_enrollments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_enrollments_current_node_id_fkey"
            columns: ["current_node_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_enrollments_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_automation_execution_log: {
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
            foreignKeyName: "internal_automation_execution_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_execution_log_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_execution_log_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_execution_log_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_automation_flows: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          failed_runs: number
          id: string
          last_run_at: string | null
          name: string
          status: string
          successful_runs: number
          total_runs: number
          trigger_config: Json
          trigger_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          failed_runs?: number
          id?: string
          last_run_at?: string | null
          name?: string
          status?: string
          successful_runs?: number
          total_runs?: number
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          failed_runs?: number
          id?: string
          last_run_at?: string | null
          name?: string
          status?: string
          successful_runs?: number
          total_runs?: number
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_automation_flows_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_automation_nodes: {
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
            foreignKeyName: "internal_automation_nodes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_nodes_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_automation_queue: {
        Row: {
          attempts: number
          company_id: string
          context_json: Json | null
          created_at: string
          enrollment_id: string
          entity_id: string
          entity_type: string
          execute_at: string
          flow_id: string
          id: string
          last_error: string | null
          max_attempts: number
          node_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          company_id: string
          context_json?: Json | null
          created_at?: string
          enrollment_id: string
          entity_id: string
          entity_type?: string
          execute_at?: string
          flow_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          node_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          company_id?: string
          context_json?: Json | null
          created_at?: string
          enrollment_id?: string
          entity_id?: string
          entity_type?: string
          execute_at?: string
          flow_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          node_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_automation_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_queue_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_queue_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_automation_queue_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "internal_automation_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_call_logs: {
        Row: {
          agent_id: string
          call_direction: string
          caller_phone: string | null
          campaign_id: string | null
          company_id: string
          contact_id: string | null
          contact_name: string | null
          duration_seconds: number
          elevenlabs_conversation_id: string | null
          id: string
          messages_count: number
          metadata: Json | null
          outcome: string | null
          started_at: string
          status: string
          summary: string | null
          transcript: Json | null
        }
        Insert: {
          agent_id: string
          call_direction?: string
          caller_phone?: string | null
          campaign_id?: string | null
          company_id: string
          contact_id?: string | null
          contact_name?: string | null
          duration_seconds?: number
          elevenlabs_conversation_id?: string | null
          id?: string
          messages_count?: number
          metadata?: Json | null
          outcome?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          transcript?: Json | null
        }
        Update: {
          agent_id?: string
          call_direction?: string
          caller_phone?: string | null
          campaign_id?: string | null
          company_id?: string
          contact_id?: string | null
          contact_name?: string | null
          duration_seconds?: number
          elevenlabs_conversation_id?: string | null
          id?: string
          messages_count?: number
          metadata?: Json | null
          outcome?: string | null
          started_at?: string
          status?: string
          summary?: string | null
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "internal_call_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "internal_ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_call_logs_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "internal_outbound_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_call_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_call_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_chat_channels: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_channels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_chat_members: {
        Row: {
          channel_id: string
          company_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          company_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          company_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "internal_chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_chat_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_chat_messages: {
        Row: {
          attachment_name: string | null
          attachment_url: string | null
          channel_id: string
          company_id: string
          content: string
          created_at: string
          id: string
          is_edited: boolean
          reply_to_id: string | null
          sender_id: string
          updated_at: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_url?: string | null
          channel_id: string
          company_id: string
          content: string
          created_at?: string
          id?: string
          is_edited?: boolean
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string
        }
        Update: {
          attachment_name?: string | null
          attachment_url?: string | null
          channel_id?: string
          company_id?: string
          content?: string
          created_at?: string
          id?: string
          is_edited?: boolean
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_chat_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "internal_chat_channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "internal_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_outbound_campaigns: {
        Row: {
          agent_id: string
          calls_answered: number
          calls_failed: number
          calls_per_minute: number
          campaign_type: string
          company_id: string
          completed_at: string | null
          contact_ids: string[] | null
          created_at: string
          created_by: string
          dynamic_vars: Json | null
          filter_config: Json | null
          id: string
          name: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          target_type: string
          total_calls: number
        }
        Insert: {
          agent_id: string
          calls_answered?: number
          calls_failed?: number
          calls_per_minute?: number
          campaign_type?: string
          company_id: string
          completed_at?: string | null
          contact_ids?: string[] | null
          created_at?: string
          created_by: string
          dynamic_vars?: Json | null
          filter_config?: Json | null
          id?: string
          name: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          target_type?: string
          total_calls?: number
        }
        Update: {
          agent_id?: string
          calls_answered?: number
          calls_failed?: number
          calls_per_minute?: number
          campaign_type?: string
          company_id?: string
          completed_at?: string | null
          contact_ids?: string[] | null
          created_at?: string
          created_by?: string
          dynamic_vars?: Json | null
          filter_config?: Json | null
          id?: string
          name?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          target_type?: string
          total_calls?: number
        }
        Relationships: [
          {
            foreignKeyName: "internal_outbound_campaigns_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "internal_ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_outbound_campaigns_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string | null
          description: string
          discount_percent: number | null
          id: string
          invoice_id: string
          line_gross: number
          line_net: number
          line_tax: number
          product_code: string | null
          quantity: number
          sort_order: number | null
          tax_nature: string | null
          tax_rate: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          description: string
          discount_percent?: number | null
          id?: string
          invoice_id: string
          line_gross?: number
          line_net?: number
          line_tax?: number
          product_code?: string | null
          quantity?: number
          sort_order?: number | null
          tax_nature?: string | null
          tax_rate?: number
          unit?: string | null
          unit_price?: number
        }
        Update: {
          created_at?: string | null
          description?: string
          discount_percent?: number | null
          id?: string
          invoice_id?: string
          line_gross?: number
          line_net?: number
          line_tax?: number
          product_code?: string | null
          quantity?: number
          sort_order?: number | null
          tax_nature?: string | null
          tax_rate?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_payments: {
        Row: {
          amount: number
          company_id: string
          created_at: string | null
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_date: string
          payment_method: string | null
          reference: string | null
        }
        Insert: {
          amount: number
          company_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference?: string | null
        }
        Update: {
          amount?: number
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          bank_iban: string | null
          client_address: string | null
          client_city: string | null
          client_company_name: string
          client_country: string | null
          client_email: string | null
          client_fiscal_code: string | null
          client_id: string | null
          client_pec: string | null
          client_sdi_code: string | null
          client_vat_number: string | null
          client_zip: string | null
          company_id: string
          created_at: string | null
          created_by: string | null
          credited_invoice_id: string | null
          document_type: string
          due_date: string | null
          external_id: string | null
          external_provider: string | null
          external_sdi_id: string | null
          external_status: string | null
          external_sync_at: string | null
          external_xml_url: string | null
          footer_text: string | null
          id: string
          invoice_number: string | null
          invoice_year: number | null
          issue_date: string
          last_synced_at: string | null
          notes: string | null
          order_id: string | null
          paid_amount: number | null
          payment_date: string | null
          payment_days: number | null
          payment_method: string | null
          payment_terms: string | null
          pdf_generated_at: string | null
          pdf_url: string | null
          progressive_number: number | null
          quote_id: string | null
          status: string
          subtotal: number | null
          tax_amount: number | null
          total: number | null
          updated_at: string | null
        }
        Insert: {
          bank_iban?: string | null
          client_address?: string | null
          client_city?: string | null
          client_company_name: string
          client_country?: string | null
          client_email?: string | null
          client_fiscal_code?: string | null
          client_id?: string | null
          client_pec?: string | null
          client_sdi_code?: string | null
          client_vat_number?: string | null
          client_zip?: string | null
          company_id: string
          created_at?: string | null
          created_by?: string | null
          credited_invoice_id?: string | null
          document_type?: string
          due_date?: string | null
          external_id?: string | null
          external_provider?: string | null
          external_sdi_id?: string | null
          external_status?: string | null
          external_sync_at?: string | null
          external_xml_url?: string | null
          footer_text?: string | null
          id?: string
          invoice_number?: string | null
          invoice_year?: number | null
          issue_date?: string
          last_synced_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_days?: number | null
          payment_method?: string | null
          payment_terms?: string | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          progressive_number?: number | null
          quote_id?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Update: {
          bank_iban?: string | null
          client_address?: string | null
          client_city?: string | null
          client_company_name?: string
          client_country?: string | null
          client_email?: string | null
          client_fiscal_code?: string | null
          client_id?: string | null
          client_pec?: string | null
          client_sdi_code?: string | null
          client_vat_number?: string | null
          client_zip?: string | null
          company_id?: string
          created_at?: string | null
          created_by?: string | null
          credited_invoice_id?: string | null
          document_type?: string
          due_date?: string | null
          external_id?: string | null
          external_provider?: string | null
          external_sdi_id?: string | null
          external_status?: string | null
          external_sync_at?: string | null
          external_xml_url?: string | null
          footer_text?: string | null
          id?: string
          invoice_number?: string | null
          invoice_year?: number | null
          issue_date?: string
          last_synced_at?: string | null
          notes?: string | null
          order_id?: string | null
          paid_amount?: number | null
          payment_date?: string | null
          payment_days?: number | null
          payment_method?: string | null
          payment_terms?: string | null
          pdf_generated_at?: string | null
          pdf_url?: string | null
          progressive_number?: number | null
          quote_id?: string | null
          status?: string
          subtotal?: number | null
          tax_amount?: number | null
          total?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_credited_invoice_id_fkey"
            columns: ["credited_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_forms: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          fields: Json
          id: string
          is_active: boolean
          is_published: boolean
          name: string
          settings: Json
          slug: string
          theme: Json
          total_submissions: number
          total_views: number
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          is_published?: boolean
          name: string
          settings?: Json
          slug: string
          theme?: Json
          total_submissions?: number
          total_views?: number
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          fields?: Json
          id?: string
          is_active?: boolean
          is_published?: boolean
          name?: string
          settings?: Json
          slug?: string
          theme?: Json
          total_submissions?: number
          total_views?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          company_id: string
          employee_id: string
          ferie_days_total: number
          ferie_days_used: number
          id: string
          permessi_hours_total: number
          permessi_hours_used: number
          rol_hours_total: number
          rol_hours_used: number
          updated_at: string
          year: number
        }
        Insert: {
          company_id: string
          employee_id: string
          ferie_days_total?: number
          ferie_days_used?: number
          id?: string
          permessi_hours_total?: number
          permessi_hours_used?: number
          rol_hours_total?: number
          rol_hours_used?: number
          updated_at?: string
          year: number
        }
        Update: {
          company_id?: string
          employee_id?: string
          ferie_days_total?: number
          ferie_days_used?: number
          id?: string
          permessi_hours_total?: number
          permessi_hours_used?: number
          rol_hours_total?: number
          rol_hours_used?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_balances_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          employee_id: string
          end_date: string
          id: string
          notes: string | null
          rejection_note: string | null
          start_date: string
          status: string
          total_days: number | null
          total_hours: number | null
          type: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          notes?: string | null
          rejection_note?: string | null
          start_date: string
          status?: string
          total_days?: number | null
          total_hours?: number | null
          type: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          notes?: string | null
          rejection_note?: string | null
          start_date?: string
          status?: string
          total_days?: number | null
          total_hours?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          is_dismissed: boolean
          is_read: boolean
          message: string
          metadata: Json | null
          notification_date: string
          notification_type: string
          title: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          message: string
          metadata?: Json | null
          notification_date?: string
          notification_type: string
          title: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_date?: string
          notification_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          created_at: string
          email: string
          failure_reason: string | null
          id: string
          ip_address: unknown
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          failure_reason?: string | null
          id?: string
          ip_address?: unknown
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          default_appointment_duration_minutes: number
          default_max_daily_km: number
          id: string
          language: string
          max_travel_minutes: number
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
          default_appointment_duration_minutes?: number
          default_max_daily_km?: number
          id?: string
          language?: string
          max_travel_minutes?: number
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
          default_appointment_duration_minutes?: number
          default_max_daily_km?: number
          id?: string
          language?: string
          max_travel_minutes?: number
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
          booking_slug: string | null
          calendar_type: string
          company_id: string
          created_at: string
          created_by: string
          description: string | null
          duration_minutes: number
          group_name: string | null
          id: string
          is_active: boolean
          max_daily_km: number | null
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
          booking_slug?: string | null
          calendar_type?: string
          company_id: string
          created_at?: string
          created_by: string
          description?: string | null
          duration_minutes?: number
          group_name?: string | null
          id?: string
          is_active?: boolean
          max_daily_km?: number | null
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
          booking_slug?: string | null
          calendar_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          duration_minutes?: number
          group_name?: string | null
          id?: string
          is_active?: boolean
          max_daily_km?: number | null
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
          attr_campaign: string | null
          attr_content: string | null
          attr_medium: string | null
          attr_model: string | null
          attr_source: string | null
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
          fiscal_code: string | null
          follower_id: string | null
          id: string
          last_activity_at: string | null
          last_name: string | null
          notes: string | null
          optout_call: boolean | null
          optout_email: boolean | null
          optout_sms: boolean | null
          optout_whatsapp: boolean | null
          phone: string | null
          postal_code: string | null
          preferred_channel: string | null
          preferred_language: string | null
          province: string | null
          score: number
          source: string | null
          source_campaign_id: string | null
          tags: string[]
          unsubscribed: boolean
          unsubscribed_at: string | null
          updated_at: string
          vat_number: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          assigned_to?: string | null
          attr_campaign?: string | null
          attr_content?: string | null
          attr_medium?: string | null
          attr_model?: string | null
          attr_source?: string | null
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
          fiscal_code?: string | null
          follower_id?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          notes?: string | null
          optout_call?: boolean | null
          optout_email?: boolean | null
          optout_sms?: boolean | null
          optout_whatsapp?: boolean | null
          phone?: string | null
          postal_code?: string | null
          preferred_channel?: string | null
          preferred_language?: string | null
          province?: string | null
          score?: number
          source?: string | null
          source_campaign_id?: string | null
          tags?: string[]
          unsubscribed?: boolean
          unsubscribed_at?: string | null
          updated_at?: string
          vat_number?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          assigned_to?: string | null
          attr_campaign?: string | null
          attr_content?: string | null
          attr_medium?: string | null
          attr_model?: string | null
          attr_source?: string | null
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
          fiscal_code?: string | null
          follower_id?: string | null
          id?: string
          last_activity_at?: string | null
          last_name?: string | null
          notes?: string | null
          optout_call?: boolean | null
          optout_email?: boolean | null
          optout_sms?: boolean | null
          optout_whatsapp?: boolean | null
          phone?: string | null
          postal_code?: string | null
          preferred_channel?: string | null
          preferred_language?: string | null
          province?: string | null
          score?: number
          source?: string | null
          source_campaign_id?: string | null
          tags?: string[]
          unsubscribed?: boolean
          unsubscribed_at?: string | null
          updated_at?: string
          vat_number?: string | null
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
          expected_close_date: string | null
          follower_id: string | null
          id: string
          loss_notes: string | null
          loss_reason: string | null
          name: string
          notes: string | null
          pipeline_id: string
          probability: number | null
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
          expected_close_date?: string | null
          follower_id?: string | null
          id?: string
          loss_notes?: string | null
          loss_reason?: string | null
          name: string
          notes?: string | null
          pipeline_id: string
          probability?: number | null
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
          expected_close_date?: string | null
          follower_id?: string | null
          id?: string
          loss_notes?: string | null
          loss_reason?: string | null
          name?: string
          notes?: string | null
          pipeline_id?: string
          probability?: number | null
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
      marketing_opportunity_lists: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          filters: Json | null
          id: string
          name: string
          pipeline_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          filters?: Json | null
          id?: string
          name: string
          pipeline_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          filters?: Json | null
          id?: string
          name?: string
          pipeline_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_opportunity_lists_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_opportunity_lists_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "marketing_pipelines"
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
          delivered_at: string | null
          delivery_status: string | null
          id: string
          media_url: string | null
          message_type: string
          meta_message_id: string | null
          read_at: string | null
          sender_name: string | null
          sender_type: string
          transcription: string | null
        }
        Insert: {
          ai_processed?: boolean
          content?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          meta_message_id?: string | null
          read_at?: string | null
          sender_name?: string | null
          sender_type?: string
          transcription?: string | null
        }
        Update: {
          ai_processed?: boolean
          content?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          delivery_status?: string | null
          id?: string
          media_url?: string | null
          message_type?: string
          meta_message_id?: string | null
          read_at?: string | null
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
      meta_ad_accounts: {
        Row: {
          account_status: number | null
          ad_account_id: string
          ad_account_name: string
          company_id: string
          created_at: string | null
          currency: string | null
          id: string
          integration_id: string
          selected: boolean | null
          updated_at: string | null
        }
        Insert: {
          account_status?: number | null
          ad_account_id: string
          ad_account_name?: string
          company_id: string
          created_at?: string | null
          currency?: string | null
          id?: string
          integration_id: string
          selected?: boolean | null
          updated_at?: string | null
        }
        Update: {
          account_status?: number | null
          ad_account_id?: string
          ad_account_name?: string
          company_id?: string
          created_at?: string | null
          currency?: string | null
          id?: string
          integration_id?: string
          selected?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_assets: {
        Row: {
          asset_id: string
          asset_name: string
          asset_type: string
          company_id: string
          created_at: string
          id: string
          integration_id: string
          metadata: Json | null
          selected: boolean
          updated_at: string
        }
        Insert: {
          asset_id: string
          asset_name: string
          asset_type: string
          company_id: string
          created_at?: string
          id?: string
          integration_id: string
          metadata?: Json | null
          selected?: boolean
          updated_at?: string
        }
        Update: {
          asset_id?: string
          asset_name?: string
          asset_type?: string
          company_id?: string
          created_at?: string
          id?: string
          integration_id?: string
          metadata?: Json | null
          selected?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_assets_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_insights_cache: {
        Row: {
          ad_account_id: string
          company_id: string
          date_end: string
          date_start: string
          expires_at: string | null
          fetched_at: string | null
          id: string
          level: string
          payload_json: Json
        }
        Insert: {
          ad_account_id: string
          company_id: string
          date_end: string
          date_start: string
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          level?: string
          payload_json?: Json
        }
        Update: {
          ad_account_id?: string
          company_id?: string
          date_end?: string
          date_start?: string
          expires_at?: string | null
          fetched_at?: string | null
          id?: string
          level?: string
          payload_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "meta_insights_cache_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_forms: {
        Row: {
          company_id: string
          created_at: string
          form_id: string
          form_name: string
          id: string
          integration_id: string
          last_pull_at: string | null
          page_asset_id: string | null
          since_date: string | null
          status: string
          sync_mode: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          form_id: string
          form_name: string
          id?: string
          integration_id: string
          last_pull_at?: string | null
          page_asset_id?: string | null
          since_date?: string | null
          status?: string
          sync_mode?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          form_id?: string
          form_name?: string
          id?: string
          integration_id?: string
          last_pull_at?: string | null
          page_asset_id?: string | null
          since_date?: string | null
          status?: string
          sync_mode?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_forms_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_forms_page_asset_id_fkey"
            columns: ["page_asset_id"]
            isOneToOne: false
            referencedRelation: "meta_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body: string | null
          company_id: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          is_dismissed: boolean
          is_read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body?: string | null
          company_id: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body?: string | null
          company_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          is_dismissed?: boolean
          is_read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_steps: {
        Row: {
          auto_check_key: string | null
          created_at: string
          description: string | null
          id: string
          is_required: boolean | null
          sort_order: number
          template_id: string
          title: string
        }
        Insert: {
          auto_check_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean | null
          sort_order?: number
          template_id: string
          title: string
        }
        Update: {
          auto_check_key?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_required?: boolean | null
          sort_order?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      opportunity_loss_reasons: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          label: string
          position: number | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          label: string
          position?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          label?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_loss_reasons_company_id_fkey"
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
      order_installments: {
        Row: {
          amount: number
          created_at: string
          expected_date: string | null
          id: string
          is_paid: boolean
          label: string
          order_id: string
          paid_date: string | null
          position: number
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expected_date?: string | null
          id?: string
          is_paid?: boolean
          label?: string
          order_id: string
          paid_date?: string | null
          position?: number
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expected_date?: string | null
          id?: string
          is_paid?: boolean
          label?: string
          order_id?: string
          paid_date?: string | null
          position?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_installments_order_id_fkey"
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
          notes: string | null
          order_id: string
          paid_date: string | null
          payment_method: string | null
          position: number | null
          purchase_price: number | null
          quantity: number | null
          section_id: string | null
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
          notes?: string | null
          order_id: string
          paid_date?: string | null
          payment_method?: string | null
          position?: number | null
          purchase_price?: number | null
          quantity?: number | null
          section_id?: string | null
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
          notes?: string | null
          order_id?: string
          paid_date?: string | null
          payment_method?: string | null
          position?: number | null
          purchase_price?: number | null
          quantity?: number | null
          section_id?: string | null
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
            foreignKeyName: "order_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sections"
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
      partner_materials: {
        Row: {
          created_at: string | null
          description: string | null
          file_url: string
          id: string
          is_active: boolean | null
          min_tier: string | null
          name: string
          sort_order: number | null
          thumbnail_url: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_url: string
          id?: string
          is_active?: boolean | null
          min_tier?: string | null
          name: string
          sort_order?: number | null
          thumbnail_url?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_url?: string
          id?: string
          is_active?: boolean | null
          min_tier?: string | null
          name?: string
          sort_order?: number | null
          thumbnail_url?: string | null
          type?: string
        }
        Relationships: []
      }
      password_history: {
        Row: {
          created_at: string
          id: string
          password_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          password_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          password_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      permission_templates: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system_default: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_default?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system_default?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_announcements: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          target_status: string
          title: string
          type: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          target_status?: string
          title: string
          type?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          target_status?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      platform_elevenlabs_config: {
        Row: {
          api_key_encrypted: string | null
          default_llm: string
          id: string
          markup_multiplier: number
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          default_llm?: string
          id?: string
          markup_multiplier?: number
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          default_llm?: string
          id?: string
          markup_multiplier?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_feature_flags: {
        Row: {
          category: string | null
          created_at: string | null
          default_value: boolean | null
          description: string | null
          icon: string | null
          id: string
          is_beta: boolean | null
          key: string
          name: string
          plans_included: string[] | null
          price_per_month: number | null
          sort_order: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          default_value?: boolean | null
          description?: string | null
          icon?: string | null
          id?: string
          is_beta?: boolean | null
          key: string
          name: string
          plans_included?: string[] | null
          price_per_month?: number | null
          sort_order?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          default_value?: boolean | null
          description?: string | null
          icon?: string | null
          id?: string
          is_beta?: boolean | null
          key?: string
          name?: string
          plans_included?: string[] | null
          price_per_month?: number | null
          sort_order?: number | null
        }
        Relationships: []
      }
      platform_pricing: {
        Row: {
          cost_billed_per_min: number
          cost_real_per_min: number
          id: string
          is_active: boolean | null
          label: string | null
          llm_model: string
          markup_multiplier: number
          tts_model: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          cost_billed_per_min: number
          cost_real_per_min: number
          id?: string
          is_active?: boolean | null
          label?: string | null
          llm_model: string
          markup_multiplier?: number
          tts_model: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          cost_billed_per_min?: number
          cost_real_per_min?: number
          id?: string
          is_active?: boolean | null
          label?: string | null
          llm_model?: string
          markup_multiplier?: number
          tts_model?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string
        }
        Insert: {
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value: string
        }
        Update: {
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string
        }
        Relationships: []
      }
      prima_nota_entries: {
        Row: {
          account_label: string | null
          amount: number
          attachment_name: string | null
          attachment_url: string | null
          auto_source: string | null
          category: string
          company_id: string
          cost_id: string | null
          created_at: string
          created_by: string | null
          description: string
          direction: string
          entry_date: string
          id: string
          invoice_id: string | null
          is_auto: boolean
          notes: string | null
          order_id: string | null
          order_item_id: string | null
          payment_method: string | null
          reference_number: string | null
          scadenza_id: string | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          amount: number
          attachment_name?: string | null
          attachment_url?: string | null
          auto_source?: string | null
          category?: string
          company_id: string
          cost_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          direction: string
          entry_date?: string
          id?: string
          invoice_id?: string | null
          is_auto?: boolean
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          payment_method?: string | null
          reference_number?: string | null
          scadenza_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          auto_source?: string | null
          category?: string
          company_id?: string
          cost_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string
          entry_date?: string
          id?: string
          invoice_id?: string | null
          is_auto?: boolean
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          payment_method?: string | null
          reference_number?: string | null
          scadenza_id?: string | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prima_nota_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prima_nota_entries_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "company_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prima_nota_entries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prima_nota_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prima_nota_entries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prima_nota_entries_scadenza_id_fkey"
            columns: ["scadenza_id"]
            isOneToOne: false
            referencedRelation: "scadenze"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prima_nota_entries_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
          failed_login_count: number
          first_name: string
          fiscal_code: string | null
          id: string
          last_login_at: string | null
          last_login_ip: unknown
          last_name: string
          locked_until: string | null
          notes: string | null
          password_changed_at: string | null
          phone: string | null
          require_2fa: boolean
          salesperson_id: string | null
          site_address: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          failed_login_count?: number
          first_name: string
          fiscal_code?: string | null
          id: string
          last_login_at?: string | null
          last_login_ip?: unknown
          last_name: string
          locked_until?: string | null
          notes?: string | null
          password_changed_at?: string | null
          phone?: string | null
          require_2fa?: boolean
          salesperson_id?: string | null
          site_address?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          failed_login_count?: number
          first_name?: string
          fiscal_code?: string | null
          id?: string
          last_login_at?: string | null
          last_login_ip?: unknown
          last_name?: string
          locked_until?: string | null
          notes?: string | null
          password_changed_at?: string | null
          phone?: string | null
          require_2fa?: boolean
          salesperson_id?: string | null
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
          {
            foreignKeyName: "profiles_salesperson_id_fkey"
            columns: ["salesperson_id"]
            isOneToOne: false
            referencedRelation: "salespeople"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          article_template_id: string | null
          company_id: string
          created_at: string
          description: string
          discount_percent: number
          id: string
          line_total: number | null
          notes: string | null
          order_item_id: string | null
          purchase_order_id: string
          quantity: number
          quantity_received: number
          received_date: string | null
          sku: string | null
          sort_order: number
          unit_of_measure: string | null
          unit_price: number
          updated_at: string
          vat_amount: number | null
          vat_rate: number
        }
        Insert: {
          article_template_id?: string | null
          company_id: string
          created_at?: string
          description: string
          discount_percent?: number
          id?: string
          line_total?: number | null
          notes?: string | null
          order_item_id?: string | null
          purchase_order_id: string
          quantity?: number
          quantity_received?: number
          received_date?: string | null
          sku?: string | null
          sort_order?: number
          unit_of_measure?: string | null
          unit_price?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Update: {
          article_template_id?: string | null
          company_id?: string
          created_at?: string
          description?: string
          discount_percent?: number
          id?: string
          line_total?: number | null
          notes?: string | null
          order_item_id?: string | null
          purchase_order_id?: string
          quantity?: number
          quantity_received?: number
          received_date?: string | null
          sku?: string | null
          sort_order?: number
          unit_of_measure?: string | null
          unit_price?: number
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_article_template_id_fkey"
            columns: ["article_template_id"]
            isOneToOne: false
            referencedRelation: "article_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          actual_delivery_date: string | null
          attachment_url: string | null
          company_id: string
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          delivery_address: string | null
          expected_delivery_date: string | null
          id: string
          internal_notes: string | null
          issue_date: string
          notes: string | null
          oda_number: string
          order_id: string | null
          payment_method: string | null
          payment_terms: string | null
          sent_at: string | null
          status: string
          subtotal: number
          supplier_id: string
          supplier_reference: string | null
          total: number
          updated_at: string
          vat_total: number
        }
        Insert: {
          actual_delivery_date?: string | null
          attachment_url?: string | null
          company_id: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          expected_delivery_date?: string | null
          id?: string
          internal_notes?: string | null
          issue_date?: string
          notes?: string | null
          oda_number: string
          order_id?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          supplier_reference?: string | null
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Update: {
          actual_delivery_date?: string | null
          attachment_url?: string | null
          company_id?: string
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          expected_delivery_date?: string | null
          id?: string
          internal_notes?: string | null
          issue_date?: string
          notes?: string | null
          oda_number?: string
          order_id?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          supplier_reference?: string | null
          total?: number
          updated_at?: string
          vat_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          article_template_id: string | null
          company_id: string
          created_at: string
          description: string | null
          discount_percent: number | null
          id: string
          image_url: string | null
          item_type: string
          line_total: number | null
          name: string
          quantity: number | null
          quote_id: string
          sort_order: number | null
          unit_of_measure: string | null
          unit_price: number | null
          vat_rate: number | null
        }
        Insert: {
          article_template_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          item_type?: string
          line_total?: number | null
          name: string
          quantity?: number | null
          quote_id: string
          sort_order?: number | null
          unit_of_measure?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Update: {
          article_template_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          discount_percent?: number | null
          id?: string
          image_url?: string | null
          item_type?: string
          line_total?: number | null
          name?: string
          quantity?: number | null
          quote_id?: string
          sort_order?: number | null
          unit_of_measure?: string | null
          unit_price?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_article_template_id_fkey"
            columns: ["article_template_id"]
            isOneToOne: false
            referencedRelation: "article_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_pdf_attachments: {
        Row: {
          created_at: string
          id: string
          material_id: string
          quote_id: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          material_id: string
          quote_id: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          material_id?: string
          quote_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_pdf_attachments_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "quote_pdf_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_pdf_attachments_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_pdf_materials: {
        Row: {
          article_template_id: string | null
          category: string | null
          company_id: string
          created_at: string
          created_by: string
          file_size_bytes: number | null
          id: string
          name: string
          sort_order: number | null
          storage_path: string
          updated_at: string
        }
        Insert: {
          article_template_id?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          created_by: string
          file_size_bytes?: number | null
          id?: string
          name: string
          sort_order?: number | null
          storage_path: string
          updated_at?: string
        }
        Update: {
          article_template_id?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          created_by?: string
          file_size_bytes?: number | null
          id?: string
          name?: string
          sort_order?: number | null
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_pdf_materials_article_template_id_fkey"
            columns: ["article_template_id"]
            isOneToOne: false
            referencedRelation: "article_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_pdf_materials_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          accent_color: string | null
          company_id: string
          cover_tagline: string | null
          created_at: string | null
          font_family: string | null
          footer_text: string | null
          header_text_color: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          layout: string
          logo_position: string | null
          logo_size: string | null
          logo_url: string | null
          name: string
          primary_color: string | null
          secondary_color: string | null
          show_client_details: boolean | null
          show_company_details: boolean | null
          show_delivery_terms: boolean | null
          show_logo: boolean | null
          show_notes: boolean | null
          show_page_numbers: boolean | null
          show_payment_terms: boolean | null
          show_quote_number: boolean | null
          show_validity_date: boolean | null
          show_watermark: boolean | null
          text_color: string | null
          updated_at: string | null
          watermark_text: string | null
        }
        Insert: {
          accent_color?: string | null
          company_id: string
          cover_tagline?: string | null
          created_at?: string | null
          font_family?: string | null
          footer_text?: string | null
          header_text_color?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          layout?: string
          logo_position?: string | null
          logo_size?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          show_client_details?: boolean | null
          show_company_details?: boolean | null
          show_delivery_terms?: boolean | null
          show_logo?: boolean | null
          show_notes?: boolean | null
          show_page_numbers?: boolean | null
          show_payment_terms?: boolean | null
          show_quote_number?: boolean | null
          show_validity_date?: boolean | null
          show_watermark?: boolean | null
          text_color?: string | null
          updated_at?: string | null
          watermark_text?: string | null
        }
        Update: {
          accent_color?: string | null
          company_id?: string
          cover_tagline?: string | null
          created_at?: string | null
          font_family?: string | null
          footer_text?: string | null
          header_text_color?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          layout?: string
          logo_position?: string | null
          logo_size?: string | null
          logo_url?: string | null
          name?: string
          primary_color?: string | null
          secondary_color?: string | null
          show_client_details?: boolean | null
          show_company_details?: boolean | null
          show_delivery_terms?: boolean | null
          show_logo?: boolean | null
          show_notes?: boolean | null
          show_page_numbers?: boolean | null
          show_payment_terms?: boolean | null
          show_quote_number?: boolean | null
          show_validity_date?: boolean | null
          show_watermark?: boolean | null
          text_color?: string | null
          updated_at?: string | null
          watermark_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quote_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          assigned_to: string | null
          client_address: string | null
          client_company: string | null
          client_email: string | null
          client_fiscal_code: string | null
          client_name: string | null
          client_phone: string | null
          client_vat_number: string | null
          company_id: string
          contact_id: string | null
          created_at: string
          created_by: string
          description: string | null
          discount_amount: number | null
          discount_percent: number | null
          expires_at: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          opportunity_id: string | null
          pdf_generated_at: string | null
          pdf_storage_path: string | null
          quote_number: string
          refused_at: string | null
          refused_reason: string | null
          sent_at: string | null
          signature_token: string | null
          signed_at: string | null
          signed_by_ip: string | null
          signed_by_name: string | null
          status: string
          subtotal: number | null
          template_id: string | null
          terms_and_conditions: string | null
          title: string | null
          total: number | null
          updated_at: string
          validity_days: number | null
          vat_amount: number | null
          viewed_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          client_address?: string | null
          client_company?: string | null
          client_email?: string | null
          client_fiscal_code?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_vat_number?: string | null
          company_id: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          opportunity_id?: string | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          quote_number: string
          refused_at?: string | null
          refused_reason?: string | null
          sent_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_ip?: string | null
          signed_by_name?: string | null
          status?: string
          subtotal?: number | null
          template_id?: string | null
          terms_and_conditions?: string | null
          title?: string | null
          total?: number | null
          updated_at?: string
          validity_days?: number | null
          vat_amount?: number | null
          viewed_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          client_address?: string | null
          client_company?: string | null
          client_email?: string | null
          client_fiscal_code?: string | null
          client_name?: string | null
          client_phone?: string | null
          client_vat_number?: string | null
          company_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          discount_amount?: number | null
          discount_percent?: number | null
          expires_at?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          opportunity_id?: string | null
          pdf_generated_at?: string | null
          pdf_storage_path?: string | null
          quote_number?: string
          refused_at?: string | null
          refused_reason?: string | null
          sent_at?: string | null
          signature_token?: string | null
          signed_at?: string | null
          signed_by_ip?: string | null
          signed_by_name?: string | null
          status?: string
          subtotal?: number | null
          template_id?: string | null
          terms_and_conditions?: string | null
          title?: string | null
          total?: number | null
          updated_at?: string
          validity_days?: number | null
          vat_amount?: number | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "marketing_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_clicks: {
        Row: {
          converted: boolean | null
          converted_at: string | null
          converted_company_id: string | null
          created_at: string | null
          id: string
          ip_address: string | null
          landing_page: string | null
          referral_code: string
          referrer_id: string
          user_agent: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          converted?: boolean | null
          converted_at?: string | null
          converted_company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          landing_page?: string | null
          referral_code: string
          referrer_id: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          converted?: boolean | null
          converted_at?: string | null
          converted_company_id?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          landing_page?: string | null
          referral_code?: string
          referrer_id?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_clicks_converted_company_id_fkey"
            columns: ["converted_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_clicks_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_commission_ledger: {
        Row: {
          calculated_at: string | null
          commission_amount: number | null
          commission_rate: number | null
          commission_type: string | null
          company_id: string
          id: string
          notes: string | null
          payout_id: string | null
          period_month: number
          period_year: number
          plan_mrr: number | null
          referrer_id: string
          status: string | null
          subscription_plan_name: string | null
          tier_multiplier: number | null
        }
        Insert: {
          calculated_at?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          commission_type?: string | null
          company_id: string
          id?: string
          notes?: string | null
          payout_id?: string | null
          period_month: number
          period_year: number
          plan_mrr?: number | null
          referrer_id: string
          status?: string | null
          subscription_plan_name?: string | null
          tier_multiplier?: number | null
        }
        Update: {
          calculated_at?: string | null
          commission_amount?: number | null
          commission_rate?: number | null
          commission_type?: string | null
          company_id?: string
          id?: string
          notes?: string | null
          payout_id?: string | null
          period_month?: number
          period_year?: number
          plan_mrr?: number | null
          referrer_id?: string
          status?: string | null
          subscription_plan_name?: string | null
          tier_multiplier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_commission_ledger_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commission_ledger_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "referral_payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_commission_ledger_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
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
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          notes: string | null
          paid_at: string
          payment_method: string
          period_end: string
          period_start: string
          referrer_id: string
          rejection_reason: string | null
          requested_by_referrer: boolean | null
          status: string | null
          transaction_reference: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          period_end: string
          period_start: string
          referrer_id: string
          rejection_reason?: string | null
          requested_by_referrer?: boolean | null
          status?: string | null
          transaction_reference?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string
          payment_method?: string
          period_end?: string
          period_start?: string
          referrer_id?: string
          rejection_reason?: string | null
          requested_by_referrer?: boolean | null
          status?: string | null
          transaction_reference?: string | null
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
      referral_tiers: {
        Row: {
          color: string | null
          commission_multiplier: number | null
          created_at: string | null
          icon: string | null
          id: string
          min_active_companies: number
          name: string
          perks: Json | null
          position: number | null
          slug: string
        }
        Insert: {
          color?: string | null
          commission_multiplier?: number | null
          created_at?: string | null
          icon?: string | null
          id?: string
          min_active_companies?: number
          name: string
          perks?: Json | null
          position?: number | null
          slug: string
        }
        Update: {
          color?: string | null
          commission_multiplier?: number | null
          created_at?: string | null
          icon?: string | null
          id?: string
          min_active_companies?: number
          name?: string
          perks?: Json | null
          position?: number | null
          slug?: string
        }
        Relationships: []
      }
      referrers: {
        Row: {
          commission_type: string
          commission_value: number
          conversion_rate: number | null
          created_at: string
          email: string
          has_accepted_terms: boolean | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          partner_type: string | null
          payout_details: Json | null
          payout_method: string | null
          phone: string | null
          public_profile_enabled: boolean | null
          referral_code: string
          terms_accepted_at: string | null
          tier_id: string | null
          tier_updated_at: string | null
          total_clicks: number | null
          total_conversions: number | null
          total_earned: number
          total_paid: number
          user_id: string | null
          utm_source: string | null
        }
        Insert: {
          commission_type?: string
          commission_value?: number
          conversion_rate?: number | null
          created_at?: string
          email: string
          has_accepted_terms?: boolean | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          partner_type?: string | null
          payout_details?: Json | null
          payout_method?: string | null
          phone?: string | null
          public_profile_enabled?: boolean | null
          referral_code: string
          terms_accepted_at?: string | null
          tier_id?: string | null
          tier_updated_at?: string | null
          total_clicks?: number | null
          total_conversions?: number | null
          total_earned?: number
          total_paid?: number
          user_id?: string | null
          utm_source?: string | null
        }
        Update: {
          commission_type?: string
          commission_value?: number
          conversion_rate?: number | null
          created_at?: string
          email?: string
          has_accepted_terms?: boolean | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          partner_type?: string | null
          payout_details?: Json | null
          payout_method?: string | null
          phone?: string | null
          public_profile_enabled?: boolean | null
          referral_code?: string
          terms_accepted_at?: string | null
          tier_id?: string | null
          tier_updated_at?: string | null
          total_clicks?: number | null
          total_conversions?: number | null
          total_earned?: number
          total_paid?: number
          user_id?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrers_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "referral_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_preferences: {
        Row: {
          company_id: string
          created_at: string | null
          default_sort: string | null
          id: string
          last_ad_account: string | null
          last_date_range: Json | null
          report_key: string
          saved_filters: Json | null
          updated_at: string | null
          user_id: string
          visible_columns: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          default_sort?: string | null
          id?: string
          last_ad_account?: string | null
          last_date_range?: Json | null
          report_key?: string
          saved_filters?: Json | null
          updated_at?: string | null
          user_id: string
          visible_columns?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          default_sort?: string | null
          id?: string
          last_ad_account?: string | null
          last_date_range?: Json | null
          report_key?: string
          saved_filters?: Json | null
          updated_at?: string | null
          user_id?: string
          visible_columns?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "reporting_preferences_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          company_id: string
          created_at: string
          id: string
          period_type: string
          target_appointments: number
          target_calls: number
          target_contracts: number
          target_revenue: number
          updated_at: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          period_type?: string
          target_appointments?: number
          target_calls?: number
          target_contracts?: number
          target_revenue?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          period_type?: string
          target_appointments?: number
          target_calls?: number
          target_contracts?: number
          target_revenue?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_targets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      scadenza_alert_prefs: {
        Row: {
          alert_email: string | null
          alert_enabled: boolean | null
          alert_on_overdue: boolean | null
          alert_on_upcoming: boolean | null
          auto_generate_from_invoices: boolean | null
          auto_reconcile_payments: boolean | null
          company_id: string
          created_at: string | null
          default_alert_days: number | null
          id: string
          updated_at: string | null
        }
        Insert: {
          alert_email?: string | null
          alert_enabled?: boolean | null
          alert_on_overdue?: boolean | null
          alert_on_upcoming?: boolean | null
          auto_generate_from_invoices?: boolean | null
          auto_reconcile_payments?: boolean | null
          company_id: string
          created_at?: string | null
          default_alert_days?: number | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          alert_email?: string | null
          alert_enabled?: boolean | null
          alert_on_overdue?: boolean | null
          alert_on_upcoming?: boolean | null
          auto_generate_from_invoices?: boolean | null
          auto_reconcile_payments?: boolean | null
          company_id?: string
          created_at?: string | null
          default_alert_days?: number | null
          id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scadenza_alert_prefs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      scadenze: {
        Row: {
          alert_days_before: number | null
          alert_sent_at: string | null
          amount: number
          auto_source: string | null
          company_id: string
          contact_id: string | null
          cost_id: string | null
          created_at: string
          created_by: string | null
          description: string
          direction: string | null
          due_date: string
          id: string
          invoice_id: string | null
          is_auto_generated: boolean | null
          is_recurring: boolean
          notes: string | null
          order_id: string | null
          order_item_id: string | null
          paid_amount: number
          paid_date: string | null
          payment_method: string | null
          prima_nota_entry_id: string | null
          recurrence_rule: string | null
          status: string
          supplier_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          alert_days_before?: number | null
          alert_sent_at?: string | null
          amount: number
          auto_source?: string | null
          company_id: string
          contact_id?: string | null
          cost_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          direction?: string | null
          due_date: string
          id?: string
          invoice_id?: string | null
          is_auto_generated?: boolean | null
          is_recurring?: boolean
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_method?: string | null
          prima_nota_entry_id?: string | null
          recurrence_rule?: string | null
          status?: string
          supplier_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          alert_days_before?: number | null
          alert_sent_at?: string | null
          amount?: number
          auto_source?: string | null
          company_id?: string
          contact_id?: string | null
          cost_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string | null
          due_date?: string
          id?: string
          invoice_id?: string | null
          is_auto_generated?: boolean | null
          is_recurring?: boolean
          notes?: string | null
          order_id?: string | null
          order_item_id?: string | null
          paid_amount?: number
          paid_date?: string | null
          payment_method?: string | null
          prima_nota_entry_id?: string | null
          recurrence_rule?: string | null
          status?: string
          supplier_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scadenze_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_cost_id_fkey"
            columns: ["cost_id"]
            isOneToOne: false
            referencedRelation: "company_costs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_prima_nota_entry_id_fkey"
            columns: ["prima_nota_entry_id"]
            isOneToOne: false
            referencedRelation: "prima_nota_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scadenze_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      signature_requests: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          order_id: string
          signature_data: string | null
          signed_at: string | null
          signed_by_ip: string | null
          signer_email: string
          signer_name: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          expires_at?: string
          id?: string
          order_id: string
          signature_data?: string | null
          signed_at?: string | null
          signed_by_ip?: string | null
          signer_email: string
          signer_name?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          order_id?: string
          signature_data?: string | null
          signed_at?: string | null
          signed_by_ip?: string | null
          signer_email?: string
          signer_name?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "signature_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signature_requests_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          automation_id: string | null
          body: string | null
          company_id: string
          contact_id: string | null
          cost_eur: number | null
          created_at: string
          direction: string
          error_detail: string | null
          from_number: string | null
          id: string
          status: string
          telnyx_message_id: string | null
          to_number: string | null
          updated_at: string
        }
        Insert: {
          automation_id?: string | null
          body?: string | null
          company_id: string
          contact_id?: string | null
          cost_eur?: number | null
          created_at?: string
          direction?: string
          error_detail?: string | null
          from_number?: string | null
          id?: string
          status?: string
          telnyx_message_id?: string | null
          to_number?: string | null
          updated_at?: string
        }
        Update: {
          automation_id?: string | null
          body?: string | null
          company_id?: string
          contact_id?: string | null
          cost_eur?: number | null
          created_at?: string
          direction?: string
          error_detail?: string | null
          from_number?: string | null
          id?: string
          status?: string
          telnyx_message_id?: string | null
          to_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_logs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permissions: {
        Row: {
          can_approve_orders: boolean
          can_delete_orders: boolean
          can_edit_customers: boolean | null
          can_edit_marketing: boolean
          can_edit_marketing_contacts: boolean | null
          can_edit_marketing_opportunities: boolean | null
          can_edit_orders: boolean | null
          can_edit_settings: boolean | null
          can_edit_tickets: boolean | null
          can_edit_warehouse: boolean | null
          can_export_clients: boolean
          can_manage_payments: boolean
          can_manage_suppliers: boolean
          can_manage_warehouse_items: boolean
          can_view_all_team_calendar: boolean
          can_view_calendar: boolean | null
          can_view_cruscotto: boolean
          can_view_customers: boolean | null
          can_view_dashboard: boolean | null
          can_view_employees: boolean | null
          can_view_financial_reports: boolean
          can_view_forecast: boolean | null
          can_view_margins: boolean
          can_view_marketing: boolean
          can_view_marketing_activities: boolean | null
          can_view_marketing_ai_agent: boolean | null
          can_view_marketing_appointments: boolean | null
          can_view_marketing_automations: boolean | null
          can_view_marketing_contacts: boolean | null
          can_view_marketing_dashboard: boolean | null
          can_view_marketing_email: boolean | null
          can_view_marketing_opportunities: boolean | null
          can_view_marketing_reports: boolean | null
          can_view_marketing_whatsapp: boolean | null
          can_view_orders: boolean | null
          can_view_settings: boolean | null
          can_view_tickets: boolean | null
          can_view_users: boolean
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
          can_approve_orders?: boolean
          can_delete_orders?: boolean
          can_edit_customers?: boolean | null
          can_edit_marketing?: boolean
          can_edit_marketing_contacts?: boolean | null
          can_edit_marketing_opportunities?: boolean | null
          can_edit_orders?: boolean | null
          can_edit_settings?: boolean | null
          can_edit_tickets?: boolean | null
          can_edit_warehouse?: boolean | null
          can_export_clients?: boolean
          can_manage_payments?: boolean
          can_manage_suppliers?: boolean
          can_manage_warehouse_items?: boolean
          can_view_all_team_calendar?: boolean
          can_view_calendar?: boolean | null
          can_view_cruscotto?: boolean
          can_view_customers?: boolean | null
          can_view_dashboard?: boolean | null
          can_view_employees?: boolean | null
          can_view_financial_reports?: boolean
          can_view_forecast?: boolean | null
          can_view_margins?: boolean
          can_view_marketing?: boolean
          can_view_marketing_activities?: boolean | null
          can_view_marketing_ai_agent?: boolean | null
          can_view_marketing_appointments?: boolean | null
          can_view_marketing_automations?: boolean | null
          can_view_marketing_contacts?: boolean | null
          can_view_marketing_dashboard?: boolean | null
          can_view_marketing_email?: boolean | null
          can_view_marketing_opportunities?: boolean | null
          can_view_marketing_reports?: boolean | null
          can_view_marketing_whatsapp?: boolean | null
          can_view_orders?: boolean | null
          can_view_settings?: boolean | null
          can_view_tickets?: boolean | null
          can_view_users?: boolean
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
          can_approve_orders?: boolean
          can_delete_orders?: boolean
          can_edit_customers?: boolean | null
          can_edit_marketing?: boolean
          can_edit_marketing_contacts?: boolean | null
          can_edit_marketing_opportunities?: boolean | null
          can_edit_orders?: boolean | null
          can_edit_settings?: boolean | null
          can_edit_tickets?: boolean | null
          can_edit_warehouse?: boolean | null
          can_export_clients?: boolean
          can_manage_payments?: boolean
          can_manage_suppliers?: boolean
          can_manage_warehouse_items?: boolean
          can_view_all_team_calendar?: boolean
          can_view_calendar?: boolean | null
          can_view_cruscotto?: boolean
          can_view_customers?: boolean | null
          can_view_dashboard?: boolean | null
          can_view_employees?: boolean | null
          can_view_financial_reports?: boolean
          can_view_forecast?: boolean | null
          can_view_margins?: boolean
          can_view_marketing?: boolean
          can_view_marketing_activities?: boolean | null
          can_view_marketing_ai_agent?: boolean | null
          can_view_marketing_appointments?: boolean | null
          can_view_marketing_automations?: boolean | null
          can_view_marketing_contacts?: boolean | null
          can_view_marketing_dashboard?: boolean | null
          can_view_marketing_email?: boolean | null
          can_view_marketing_opportunities?: boolean | null
          can_view_marketing_reports?: boolean | null
          can_view_marketing_whatsapp?: boolean | null
          can_view_orders?: boolean | null
          can_view_settings?: boolean | null
          can_view_tickets?: boolean | null
          can_view_users?: boolean
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
      stripe_events_log: {
        Row: {
          company_id: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json | null
          processed_at: string
          status: string
          stripe_event_id: string
        }
        Insert: {
          company_id?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          processed_at?: string
          status?: string
          stripe_event_id: string
        }
        Update: {
          company_id?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          processed_at?: string
          status?: string
          stripe_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_events_log_company_id_fkey"
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
          sla_resolution_hours: number | null
          sla_response_hours: number | null
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
          sla_resolution_hours?: number | null
          sla_response_hours?: number | null
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
          sla_resolution_hours?: number | null
          sla_response_hours?: number | null
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
          bank_name: string | null
          city: string | null
          company_id: string
          country: string | null
          created_at: string
          credit_limit: number | null
          email: string | null
          fiscal_code: string | null
          iban: string | null
          id: string
          is_active: boolean
          is_foreign: boolean
          lead_time_days: number | null
          min_order_amount: number | null
          name: string
          notes: string | null
          payment_method: string | null
          phone: string | null
          postal_code: string | null
          product_category: string | null
          province: string | null
          rating: number | null
          updated_at: string
          vat_number: string | null
          vat_rate: number | null
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_name?: string | null
          city?: string | null
          company_id: string
          country?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          fiscal_code?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          is_foreign?: boolean
          lead_time_days?: number | null
          min_order_amount?: number | null
          name: string
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          postal_code?: string | null
          product_category?: string | null
          province?: string | null
          rating?: number | null
          updated_at?: string
          vat_number?: string | null
          vat_rate?: number | null
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_name?: string | null
          city?: string | null
          company_id?: string
          country?: string | null
          created_at?: string
          credit_limit?: number | null
          email?: string | null
          fiscal_code?: string | null
          iban?: string | null
          id?: string
          is_active?: boolean
          is_foreign?: boolean
          lead_time_days?: number | null
          min_order_amount?: number | null
          name?: string
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          postal_code?: string | null
          product_category?: string | null
          province?: string | null
          rating?: number | null
          updated_at?: string
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
      support_canned_responses: {
        Row: {
          category: string | null
          content: string
          created_at: string
          created_by: string
          id: string
          shortcut: string | null
          sort_order: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          created_by: string
          id?: string
          shortcut?: string | null
          sort_order?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          shortcut?: string | null
          sort_order?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_conversations: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          first_response_at: string | null
          id: string
          internal_notes: string | null
          priority: string
          resolved_at: string | null
          sla_resolution_breached: boolean | null
          sla_resolution_due_at: string | null
          sla_response_breached: boolean | null
          sla_response_due_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          internal_notes?: string | null
          priority?: string
          resolved_at?: string | null
          sla_resolution_breached?: boolean | null
          sla_resolution_due_at?: string | null
          sla_response_breached?: boolean | null
          sla_response_due_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          first_response_at?: string | null
          id?: string
          internal_notes?: string | null
          priority?: string
          resolved_at?: string | null
          sla_resolution_breached?: boolean | null
          sla_resolution_due_at?: string | null
          sla_response_breached?: boolean | null
          sla_response_due_at?: string | null
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
      system_health_metrics: {
        Row: {
          error_message: string | null
          function_name: string | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          metric_type: string
          recorded_at: string
          status_code: number | null
        }
        Insert: {
          error_message?: string | null
          function_name?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          metric_type: string
          recorded_at?: string
          status_code?: number | null
        }
        Update: {
          error_message?: string | null
          function_name?: string | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          metric_type?: string
          recorded_at?: string
          status_code?: number | null
        }
        Relationships: []
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
          ticket_id: string | null
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
          ticket_id?: string | null
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
          ticket_id?: string | null
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
          {
            foreignKeyName: "tasks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          company_id: string
          id: string
          joined_at: string
          role_in_team: string
          team_id: string
          user_id: string
        }
        Insert: {
          company_id: string
          id?: string
          joined_at?: string
          role_in_team?: string
          team_id: string
          user_id: string
        }
        Update: {
          company_id?: string
          id?: string
          joined_at?: string
          role_in_team?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          leader_id: string | null
          name: string
          round_robin_index: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          name: string
          round_robin_index?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          leader_id?: string | null
          name?: string
          round_robin_index?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      telnyx_settings: {
        Row: {
          api_key_encrypted: string
          connection_id: string | null
          created_at: string
          id: string
          is_active: boolean
          messaging_profile_id: string | null
          updated_at: string
          webhook_signing_secret_encrypted: string | null
        }
        Insert: {
          api_key_encrypted: string
          connection_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          messaging_profile_id?: string | null
          updated_at?: string
          webhook_signing_secret_encrypted?: string | null
        }
        Update: {
          api_key_encrypted?: string
          connection_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          messaging_profile_id?: string | null
          updated_at?: string
          webhook_signing_secret_encrypted?: string | null
        }
        Relationships: []
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
      ticket_read_status: {
        Row: {
          id: string
          last_read_at: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          id?: string
          last_read_at?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          id?: string
          last_read_at?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_read_status_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_read_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to: string | null
          category: string | null
          company_id: string
          created_at: string
          customer_id: string
          id: string
          internal_notes: string | null
          last_message_at: string | null
          order_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          company_id: string
          created_at?: string
          customer_id: string
          id?: string
          internal_notes?: string | null
          last_message_at?: string | null
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          company_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          internal_notes?: string | null
          last_message_at?: string | null
          order_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      totp_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          is_used: boolean
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          is_used?: boolean
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      totp_secrets: {
        Row: {
          created_at: string
          encrypted_secret: string
          id: string
          is_verified: boolean
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          encrypted_secret: string
          id?: string
          is_verified?: boolean
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          encrypted_secret?: string
          id?: string
          is_verified?: boolean
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
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
      user_audit_log: {
        Row: {
          action: string
          actor_id: string
          company_id: string
          created_at: string
          details: Json | null
          id: string
          ip_address: unknown
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          company_id: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          company_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: unknown
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      user_sessions: {
        Row: {
          browser: string | null
          company_id: string
          device_type: string | null
          ended_at: string | null
          id: string
          ip_address: unknown
          is_active: boolean
          last_active_at: string
          os: string | null
          revoke_reason: string | null
          revoked_by: string | null
          started_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          company_id: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_active_at?: string
          os?: string | null
          revoke_reason?: string | null
          revoked_by?: string | null
          started_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          company_id?: string
          device_type?: string | null
          ended_at?: string | null
          id?: string
          ip_address?: unknown
          is_active?: boolean
          last_active_at?: string
          os?: string | null
          revoke_reason?: string | null
          revoked_by?: string | null
          started_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      warehouse_sections: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          description: string | null
          id: string
          name: string
          position: number | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          position?: number | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_sections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
          section_id: string | null
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
          section_id?: string | null
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
          section_id?: string | null
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
            foreignKeyName: "warehouse_stock_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "warehouse_sections"
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
      whatsapp_broadcast_recipients: {
        Row: {
          broadcast_id: string
          contact_id: string
          delivered_at: string | null
          error_message: string | null
          id: string
          meta_message_id: string | null
          phone: string
          read_at: string | null
          sent_at: string | null
          status: string | null
        }
        Insert: {
          broadcast_id: string
          contact_id: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          meta_message_id?: string | null
          phone: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Update: {
          broadcast_id?: string
          contact_id?: string
          delivered_at?: string | null
          error_message?: string | null
          id?: string
          meta_message_id?: string | null
          phone?: string
          read_at?: string | null
          sent_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_broadcasts: {
        Row: {
          company_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          failed_count: number | null
          id: string
          message_text: string | null
          segment: string
          segment_config: Json | null
          sent_count: number | null
          status: string | null
          template_name: string | null
          total_contacts: number | null
        }
        Insert: {
          company_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          message_text?: string | null
          segment?: string
          segment_config?: Json | null
          sent_count?: number | null
          status?: string | null
          template_name?: string | null
          total_contacts?: number | null
        }
        Update: {
          company_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          failed_count?: number | null
          id?: string
          message_text?: string | null
          segment?: string
          segment_config?: Json | null
          sent_count?: number | null
          status?: string | null
          template_name?: string | null
          total_contacts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_broadcasts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_credits: {
        Row: {
          alert_email_sent_at: string | null
          alert_threshold_eur: number | null
          auto_recharge_amount: number | null
          auto_recharge_enabled: boolean
          auto_recharge_threshold: number | null
          balance_eur: number
          company_id: string
          id: string
          sends_blocked: boolean
          total_recharged_eur: number
          total_spent_eur: number
          updated_at: string
        }
        Insert: {
          alert_email_sent_at?: string | null
          alert_threshold_eur?: number | null
          auto_recharge_amount?: number | null
          auto_recharge_enabled?: boolean
          auto_recharge_threshold?: number | null
          balance_eur?: number
          company_id: string
          id?: string
          sends_blocked?: boolean
          total_recharged_eur?: number
          total_spent_eur?: number
          updated_at?: string
        }
        Update: {
          alert_email_sent_at?: string | null
          alert_threshold_eur?: number | null
          auto_recharge_amount?: number | null
          auto_recharge_enabled?: boolean
          auto_recharge_threshold?: number | null
          balance_eur?: number
          company_id?: string
          id?: string
          sends_blocked?: boolean
          total_recharged_eur?: number
          total_spent_eur?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_credits_log: {
        Row: {
          amount_eur: number
          balance_after: number
          balance_before: number
          broadcast_id: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          type: string
        }
        Insert: {
          amount_eur: number
          balance_after?: number
          balance_before?: number
          broadcast_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          type?: string
        }
        Update: {
          amount_eur?: number
          balance_after?: number
          balance_before?: number
          broadcast_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_credits_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
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
      monthly_billing_summary: {
        Row: {
          agents_used: number | null
          avg_cost_per_min: number | null
          company_id: string | null
          company_name: string | null
          conversations_count: number | null
          month: string | null
          total_cost_billed_eur: number | null
          total_cost_real_eur: number | null
          total_margin_eur: number | null
          total_minutes: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_credit_usage_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      order_payment_summary: {
        Row: {
          installment_count: number | null
          order_id: string | null
          total_collected: number | null
          total_invoiced: number | null
          total_pending: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_installments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_email_credits_with_log: {
        Args: {
          p_amount: number
          p_company_id: string
          p_description?: string
          p_metadata?: Json
          p_type?: string
        }
        Returns: Json
      }
      adjust_credits_atomic: {
        Args: {
          p_adjusted_by: string
          p_amount: number
          p_company_id: string
          p_reason: string
          p_service: string
        }
        Returns: Json
      }
      approve_leave_request: {
        Args: {
          p_approved: boolean
          p_rejection_note?: string
          p_request_id: string
        }
        Returns: undefined
      }
      assign_round_robin: { Args: { p_team_id: string }; Returns: string }
      attach_attribution_to_contact: {
        Args: {
          p_company_id: string
          p_contact_id: string
          p_session_id: string
        }
        Returns: undefined
      }
      auto_expire_trials: { Args: never; Returns: number }
      calculate_monthly_commissions: {
        Args: { p_month: number; p_year: number }
        Returns: number
      }
      check_and_update_login_attempt: {
        Args: { p_ip_address?: unknown; p_success: boolean; p_user_id: string }
        Returns: Json
      }
      check_overdue_and_upcoming_scadenze: {
        Args: { p_company_id: string }
        Returns: Json
      }
      check_overdue_scadenze:
        | { Args: never; Returns: number }
        | { Args: { p_company_id: string }; Returns: Json }
      check_staff_visibility: {
        Args: { _assigned_to: string; _user_id: string }
        Returns: boolean
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      create_notification: {
        Args: {
          p_action_url?: string
          p_body?: string
          p_company_id: string
          p_entity_id?: string
          p_entity_type?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_oda_from_order:
        | {
            Args: {
              p_company_id: string
              p_item_ids?: string[]
              p_order_id: string
              p_supplier_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_company_id: string
              p_order_id: string
              p_supplier_id: string
              p_user_id: string
            }
            Returns: string
          }
      create_order_atomic: {
        Args: {
          p_installments?: Json
          p_items?: Json
          p_order_data: Json
          p_salesperson?: Json
          p_user_id?: string
        }
        Returns: Json
      }
      deduct_ai_credits: {
        Args: { p_company_id: string; p_cost: number }
        Returns: Json
      }
      deduct_email_credits: {
        Args: { p_company_id: string; p_cost: number }
        Returns: Json
      }
      deduct_email_credits_with_log: {
        Args: {
          p_campaign_id?: string
          p_company_id: string
          p_cost: number
          p_description?: string
          p_metadata?: Json
        }
        Returns: Json
      }
      execute_automation: {
        Args: {
          p_company_id: string
          p_order_id: string
          p_trigger_type: string
        }
        Returns: undefined
      }
      generate_invoice_number: {
        Args: { p_company_id: string; p_year?: number }
        Returns: {
          invoice_number: string
          progressive_number: number
        }[]
      }
      generate_oda_number: { Args: { p_company_id: string }; Returns: string }
      generate_quote_number: { Args: { p_company_id: string }; Returns: string }
      get_attribution_report:
        | {
            Args: {
              p_company_id: string
              p_date_from: string
              p_date_to: string
              p_group_by?: string
            }
            Returns: {
              contacts_created: number
              conversions: number
              dimension: string
              sessions: number
              unique_visitors: number
            }[]
          }
        | {
            Args: {
              p_company_id: string
              p_date_from: string
              p_date_to: string
              p_filter_source?: string
              p_group_by?: string
            }
            Returns: {
              contacts_created: number
              conversions: number
              dimension: string
              sessions: number
              unique_visitors: number
            }[]
          }
      get_cash_flow_by_month: {
        Args: { p_company_id: string; p_months?: number }
        Returns: {
          expenses: number
          income: number
          month: string
          net: number
        }[]
      }
      get_cashflow_summary: {
        Args: { p_company_id: string; p_months_ahead?: number }
        Returns: Json
      }
      get_company_health_data: {
        Args: never
        Returns: {
          company_id: string
          has_customers: boolean
          has_staff: boolean
          last_order_date: string
          order_count: number
          orders_last_30d: number
          user_count: number
        }[]
      }
      get_company_last_access: {
        Args: never
        Returns: {
          company_id: string
          last_access: string
        }[]
      }
      get_company_order_stats: {
        Args: never
        Returns: {
          company_id: string
          last_order_date: string
          order_count: number
          total_value: number
        }[]
      }
      get_company_user_counts: {
        Args: never
        Returns: {
          company_id: string
          user_count: number
        }[]
      }
      get_cruscotto_invoice_stats: {
        Args: { p_company_id: string }
        Returns: Json
      }
      get_cruscotto_stats: {
        Args: { p_company_id: string; p_date_from: string; p_date_to: string }
        Returns: Json
      }
      get_customers_paginated: {
        Args: {
          p_company_id: string
          p_has_orders?: string
          p_limit?: number
          p_offset?: number
          p_salesperson_id?: string
          p_salesperson_none?: boolean
          p_search?: string
          p_sort_dir?: string
          p_sort_field?: string
        }
        Returns: Json
      }
      get_dashboard_kpis: {
        Args: {
          p_company_id: string
          p_date_from: string
          p_date_to: string
          p_status_id?: string
        }
        Returns: Json
      }
      get_email_stats_by_campaign: {
        Args: {
          p_campaign_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          campaign_id: string
          campaign_name: string
          campaign_type: string
          clicked: number
          delivered: number
          opened: number
          sent_at: string
        }[]
      }
      get_email_stats_by_date: {
        Args: {
          p_campaign_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          campaign_type: string
          clicked: number
          date_label: string
          delivered: number
          opened: number
          total: number
        }[]
      }
      get_email_stats_summary: {
        Args: {
          p_campaign_id?: string
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
        }
        Returns: {
          bounced: number
          clicked: number
          delivered: number
          opened: number
          spam: number
          total: number
          unsubscribed: number
        }[]
      }
      get_feature_usage_stats: { Args: never; Returns: Json }
      get_leave_summary: {
        Args: { p_company_id: string; p_year?: number }
        Returns: {
          employee_id: string
          employee_name: string
          ferie_days_remaining: number
          ferie_days_total: number
          ferie_days_used: number
          pending_requests: number
          permessi_hours_remaining: number
          permessi_hours_total: number
          permessi_hours_used: number
          rol_hours_remaining: number
          rol_hours_total: number
          rol_hours_used: number
        }[]
      }
      get_marketing_dashboard_stats: {
        Args: {
          p_assigned_user_ids?: string[]
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_pipeline_id?: string
          p_sources?: string[]
        }
        Returns: Json
      }
      get_my_company_id: { Args: never; Returns: string }
      get_plan_company_counts: {
        Args: never
        Returns: {
          company_count: number
          subscription_plan_id: string
        }[]
      }
      get_platform_email_stats: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          active_companies: number
          total_bounced: number
          total_clicked: number
          total_credits_used: number
          total_delivered: number
          total_opened: number
          total_revenue: number
          total_sent: number
          total_spam: number
          total_unsubscribed: number
        }[]
      }
      get_prima_nota_saldo: {
        Args: { p_company_id: string; p_from_date?: string; p_to_date?: string }
        Returns: Json
      }
      get_scadenzario: {
        Args: { p_company_id: string; p_from_date?: string; p_to_date?: string }
        Returns: {
          client_name: string
          days_until_due: number
          due_date: string
          invoice_id: string
          invoice_number: string
          paid_amount: number
          remaining: number
          status: string
          total: number
          urgency: string
        }[]
      }
      get_scadenzario_summary: { Args: { p_company_id: string }; Returns: Json }
      get_top_companies_by_email: {
        Args: { p_limit?: number }
        Returns: {
          balance: number
          company_id: string
          company_name: string
          total_sent: number
          total_spent: number
        }[]
      }
      get_total_orders_value: {
        Args: never
        Returns: {
          total_count: number
          total_value: number
        }[]
      }
      get_treasury_summary: {
        Args: { p_company_id: string }
        Returns: {
          accounts_count: number
          connections_count: number
          last_sync_at: string
          monthly_expenses: number
          monthly_income: number
          monthly_net: number
          total_balance: number
          total_credit_balance: number
          total_debit_balance: number
        }[]
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
      increment_referrer_clicks: {
        Args: { p_referrer_id: string }
        Returns: undefined
      }
      is_super_admin: { Args: { p_user_id?: string }; Returns: boolean }
      mark_all_notifications_read: {
        Args: { p_company_id: string }
        Returns: undefined
      }
      mark_scadenza_paid:
        | {
            Args: {
              p_amount: number
              p_notes?: string
              p_payment_date?: string
              p_payment_method?: string
              p_scadenza_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_account_label?: string
              p_amount: number
              p_notes?: string
              p_payment_date?: string
              p_payment_method?: string
              p_scadenza_id: string
            }
            Returns: Json
          }
      recalculate_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      trigger_form_automations: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      update_referrer_tier: {
        Args: { p_referrer_id: string }
        Returns: undefined
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
        | "call_center"
        | "referrer"
      company_sector:
        | "serramenti"
        | "infissi"
        | "bagni"
        | "tetti"
        | "fotovoltaico"
        | "pittura"
        | "ristrutturazioni"
        | "altro"
      ticket_priority: "bassa" | "normale" | "alta" | "urgente"
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
        "call_center",
        "referrer",
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
      ticket_priority: ["bassa", "normale", "alta", "urgente"],
      ticket_status: ["aperto", "in_lavorazione", "risolto"],
    },
  },
} as const
