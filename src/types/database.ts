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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          key?: string
          value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      audience_members: {
        Row: {
          added_at: string
          audience_id: string
          member_id: string | null
          subscriber_id: string | null
        }
        Insert: {
          added_at?: string
          audience_id: string
          member_id?: string | null
          subscriber_id?: string | null
        }
        Update: {
          added_at?: string
          audience_id?: string
          member_id?: string | null
          subscriber_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audience_members_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_members_subscriber_id_fkey"
            columns: ["subscriber_id"]
            isOneToOne: false
            referencedRelation: "mailing_list"
            referencedColumns: ["id"]
          },
        ]
      }
      audiences: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      automation_log: {
        Row: {
          created_at: string
          detail: string | null
          flow: string
          id: string
          recipient_email: string | null
          ref_id: string
          status: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          flow: string
          id?: string
          recipient_email?: string | null
          ref_id: string
          status?: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          flow?: string
          id?: string
          recipient_email?: string | null
          ref_id?: string
          status?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          accommodation_booked: boolean
          amount_pence: number
          attendance: string | null
          charge_error: string | null
          checked_in: boolean
          checked_in_at: string | null
          created_at: string
          dietary_requirements: string | null
          event_id: string
          guest_company: string | null
          guest_email: string | null
          guest_name: string | null
          guests_invited: number
          id: string
          is_guest: boolean
          member_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          special_requests: string | null
          sponsor_package: string | null
          sponsorship_id: string | null
          status: Database["public"]["Enums"]["booking_status"]
          stripe_customer_id: string | null
          stripe_payment_intent_id: string | null
          stripe_payment_method_id: string | null
          stripe_setup_intent_id: string | null
          table_assignment: string | null
          updated_at: string
        }
        Insert: {
          accommodation_booked?: boolean
          amount_pence?: number
          attendance?: string | null
          charge_error?: string | null
          checked_in?: boolean
          checked_in_at?: string | null
          created_at?: string
          dietary_requirements?: string | null
          event_id: string
          guest_company?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guests_invited?: number
          id?: string
          is_guest?: boolean
          member_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          special_requests?: string | null
          sponsor_package?: string | null
          sponsorship_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          table_assignment?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_booked?: boolean
          amount_pence?: number
          attendance?: string | null
          charge_error?: string | null
          checked_in?: boolean
          checked_in_at?: string | null
          created_at?: string
          dietary_requirements?: string | null
          event_id?: string
          guest_company?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guests_invited?: number
          id?: string
          is_guest?: boolean
          member_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          special_requests?: string | null
          sponsor_package?: string | null
          sponsorship_id?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          table_assignment?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      communications: {
        Row: {
          body_preview: string | null
          channel: string
          clicked_at: string | null
          created_at: string
          id: string
          member_id: string
          opened_at: string | null
          resend_message_id: string | null
          sent_at: string | null
          status: string
          subject: string | null
          template_name: string | null
          updated_at: string
        }
        Insert: {
          body_preview?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          id?: string
          member_id: string
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Update: {
          body_preview?: string | null
          channel?: string
          clicked_at?: string | null
          created_at?: string
          id?: string
          member_id?: string
          opened_at?: string | null
          resend_message_id?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          template_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "communications_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      concierge_requests: {
        Row: {
          assigned_to: string | null
          budget_pence: number | null
          commission_pence: number | null
          commission_paid_at: string | null
          commission_status: string
          created_at: string
          dates: string | null
          delivered_at: string | null
          description: string | null
          event_name: string | null
          feedback_note: string | null
          feedback_rating: number | null
          fulfilled_by: string | null
          guests: number | null
          id: string
          location: string | null
          member_id: string
          notes: string | null
          priority: string | null
          quoted_amount_pence: number | null
          request_type: string
          sale_price_pence: number | null
          status: string
          supplier_cost_pence: number | null
          supplier_name: string | null
          updated_at: string
          xero_invoice_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          budget_pence?: number | null
          commission_pence?: number | null
          commission_paid_at?: string | null
          commission_status?: string
          created_at?: string
          dates?: string | null
          delivered_at?: string | null
          description?: string | null
          event_name?: string | null
          feedback_note?: string | null
          feedback_rating?: number | null
          fulfilled_by?: string | null
          guests?: number | null
          id?: string
          location?: string | null
          member_id: string
          notes?: string | null
          priority?: string | null
          quoted_amount_pence?: number | null
          request_type: string
          sale_price_pence?: number | null
          status?: string
          supplier_cost_pence?: number | null
          supplier_name?: string | null
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          budget_pence?: number | null
          commission_pence?: number | null
          commission_paid_at?: string | null
          commission_status?: string
          created_at?: string
          dates?: string | null
          delivered_at?: string | null
          description?: string | null
          event_name?: string | null
          feedback_note?: string | null
          feedback_rating?: number | null
          fulfilled_by?: string | null
          guests?: number | null
          id?: string
          location?: string | null
          member_id?: string
          notes?: string | null
          priority?: string | null
          quoted_amount_pence?: number | null
          request_type?: string
          sale_price_pence?: number | null
          status?: string
          supplier_cost_pence?: number | null
          supplier_name?: string | null
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "concierge_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_requests_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concierge_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_experiences: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          link_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          link_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          file_url: string
          id: string
          is_active: boolean
          page_slug: string | null
          slug: string
          title: string
        }
        Insert: {
          created_at?: string
          file_url: string
          id?: string
          is_active?: boolean
          page_slug?: string | null
          slug: string
          title: string
        }
        Update: {
          created_at?: string
          file_url?: string
          id?: string
          is_active?: boolean
          page_slug?: string | null
          slug?: string
          title?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          audience_id: string | null
          audience_label: string | null
          body_html: string
          created_at: string
          created_by: string | null
          error_message: string | null
          failed_count: number
          id: string
          name: string
          recipient_count: number
          scheduled_at: string | null
          sent_at: string | null
          sent_count: number
          status: string
          subject: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          audience_id?: string | null
          audience_label?: string | null
          body_html: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          id?: string
          name: string
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          audience_id?: string | null
          audience_label?: string | null
          body_html?: string
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          failed_count?: number
          id?: string
          name?: string
          recipient_count?: number
          scheduled_at?: string | null
          sent_at?: string | null
          sent_count?: number
          status?: string
          subject?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaigns_audience_id_fkey"
            columns: ["audience_id"]
            isOneToOne: false
            referencedRelation: "audiences"
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
      email_log: {
        Row: {
          category: string | null
          created_at: string
          error: string | null
          html: string | null
          id: string
          member_id: string | null
          resend_message_id: string | null
          status: string
          subject: string | null
          to_email: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          error?: string | null
          html?: string | null
          id?: string
          member_id?: string | null
          resend_message_id?: string | null
          status?: string
          subject?: string | null
          to_email: string
        }
        Update: {
          category?: string | null
          created_at?: string
          error?: string | null
          html?: string | null
          id?: string
          member_id?: string | null
          resend_message_id?: string | null
          status?: string
          subject?: string | null
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          admin_read_at: string | null
          created_at: string
          display_name: string | null
          last_direction: string | null
          last_message_at: string | null
          last_message_preview: string | null
          member_id: string | null
          phone: string
          unread_count: number
          updated_at: string
        }
        Insert: {
          admin_read_at?: string | null
          created_at?: string
          display_name?: string | null
          last_direction?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          member_id?: string | null
          phone: string
          unread_count?: number
          updated_at?: string
        }
        Update: {
          admin_read_at?: string | null
          created_at?: string
          display_name?: string | null
          last_direction?: string | null
          last_message_at?: string | null
          last_message_preview?: string | null
          member_id?: string | null
          phone?: string
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_messages: {
        Row: {
          body_text: string | null
          counterpart_email: string | null
          created_at: string
          direction: string
          from_email: string | null
          gmail_message_id: string
          gmail_thread_id: string
          id: string
          internal_date: string
          member_id: string | null
          snippet: string | null
          subject: string | null
          to_emails: string[]
        }
        Insert: {
          body_text?: string | null
          counterpart_email?: string | null
          created_at?: string
          direction: string
          from_email?: string | null
          gmail_message_id: string
          gmail_thread_id: string
          id?: string
          internal_date: string
          member_id?: string | null
          snippet?: string | null
          subject?: string | null
          to_emails?: string[]
        }
        Update: {
          body_text?: string | null
          counterpart_email?: string | null
          created_at?: string
          direction?: string
          from_email?: string | null
          gmail_message_id?: string
          gmail_thread_id?: string
          id?: string
          internal_date?: string
          member_id?: string | null
          snippet?: string | null
          subject?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "gmail_messages_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      gmail_extractions: {
        Row: {
          created_at: string
          gmail_message_id: string
          id: string
          kind: string
          payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          gmail_message_id: string
          id?: string
          kind: string
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          gmail_message_id?: string
          id?: string
          kind?: string
          payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "gmail_extractions_gmail_message_id_fkey"
            columns: ["gmail_message_id"]
            isOneToOne: false
            referencedRelation: "gmail_messages"
            referencedColumns: ["gmail_message_id"]
          },
          {
            foreignKeyName: "gmail_extractions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_log: {
        Row: {
          body: string | null
          category: string | null
          created_at: string
          direction: string
          error: string | null
          id: string
          member_id: string | null
          status: string
          template_name: string | null
          to_phone: string
          whatsapp_message_id: string | null
        }
        Insert: {
          body?: string | null
          category?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          member_id?: string | null
          status?: string
          template_name?: string | null
          to_phone: string
          whatsapp_message_id?: string | null
        }
        Update: {
          body?: string | null
          category?: string | null
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          member_id?: string | null
          status?: string
          template_name?: string | null
          to_phone?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_ai_chats: {
        Row: {
          contract_id: string | null
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contract_id?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contract_id?: string | null
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_ai_messages: {
        Row: {
          blocks_snapshot: Json | null
          chat_id: string
          content: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          blocks_snapshot?: Json | null
          chat_id: string
          content?: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          blocks_snapshot?: Json | null
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: []
      }
      contract_templates: {
        Row: {
          attachments: Json | null
          body_html: string
          body_json: Json | null
          created_at: string
          created_by_id: string | null
          doc_type: string
          id: string
          is_draft: boolean
          name: string
          theme: Json | null
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          body_html?: string
          body_json?: Json | null
          created_at?: string
          created_by_id?: string | null
          doc_type?: string
          id?: string
          is_draft?: boolean
          name?: string
          theme?: Json | null
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          body_html?: string
          body_json?: Json | null
          created_at?: string
          created_by_id?: string | null
          doc_type?: string
          id?: string
          is_draft?: boolean
          name?: string
          theme?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          attachments: Json | null
          body_html: string
          body_json: Json | null
          category: string
          created_at: string
          created_by_id: string | null
          fixed_from_email: string | null
          fixed_from_name: string | null
          from_name_type: string
          id: string
          is_draft: boolean
          name: string
          preheader: string | null
          subject: string
          theme: Json | null
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          body_html: string
          body_json?: Json | null
          category?: string
          created_at?: string
          created_by_id?: string | null
          fixed_from_email?: string | null
          fixed_from_name?: string | null
          from_name_type?: string
          id?: string
          is_draft?: boolean
          name: string
          preheader?: string | null
          subject: string
          theme?: Json | null
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          body_html?: string
          body_json?: Json | null
          category?: string
          created_at?: string
          created_by_id?: string | null
          fixed_from_email?: string | null
          fixed_from_name?: string | null
          from_name_type?: string
          id?: string
          is_draft?: boolean
          name?: string
          preheader?: string | null
          subject?: string
          theme?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_created_by_id_fkey"
            columns: ["created_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enquiries: {
        Row: {
          acknowledged_at: string | null
          admin_notes: string | null
          assigned_to: string | null
          company: string | null
          company_domain: string | null
          company_employee_count: number | null
          company_industry: string | null
          company_linkedin_url: string | null
          company_revenue: number | null
          company_revenue_printed: string | null
          company_website: string | null
          created_at: string
          email: string
          enriched_at: string | null
          enrichment_raw: Json | null
          enrichment_source: string | null
          enrichment_status: string | null
          first_name: string
          id: string
          intent: string[] | null
          last_name: string
          lead_score: number | null
          message: string
          person_linkedin_url: string | null
          person_seniority: string | null
          person_title: string | null
          phone: string | null
          position: string | null
          related_task_id: string | null
          replied_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score_reasons: Json | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          admin_notes?: string | null
          assigned_to?: string | null
          company?: string | null
          company_domain?: string | null
          company_employee_count?: number | null
          company_industry?: string | null
          company_linkedin_url?: string | null
          company_revenue?: number | null
          company_revenue_printed?: string | null
          company_website?: string | null
          created_at?: string
          email: string
          enriched_at?: string | null
          enrichment_raw?: Json | null
          enrichment_source?: string | null
          enrichment_status?: string | null
          first_name: string
          id?: string
          intent?: string[] | null
          last_name: string
          lead_score?: number | null
          message: string
          person_linkedin_url?: string | null
          person_seniority?: string | null
          person_title?: string | null
          phone?: string | null
          position?: string | null
          related_task_id?: string | null
          replied_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_reasons?: Json | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          admin_notes?: string | null
          assigned_to?: string | null
          company?: string | null
          company_domain?: string | null
          company_employee_count?: number | null
          company_industry?: string | null
          company_linkedin_url?: string | null
          company_revenue?: number | null
          company_revenue_printed?: string | null
          company_website?: string | null
          created_at?: string
          email?: string
          enriched_at?: string | null
          enrichment_raw?: Json | null
          enrichment_source?: string | null
          enrichment_status?: string | null
          first_name?: string
          id?: string
          intent?: string[] | null
          last_name?: string
          lead_score?: number | null
          message?: string
          person_linkedin_url?: string | null
          person_seniority?: string | null
          person_title?: string | null
          phone?: string | null
          position?: string | null
          related_task_id?: string | null
          replied_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_reasons?: Json | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          accommodation_available: boolean
          accommodation_price_pence: number | null
          agenda: Json | null
          auto_confirm: boolean
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          doors_open: string | null
          end_date: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          gallery_urls: string[] | null
          guest_list_visible: boolean
          guest_price_pence: number
          guest_ticket_capacity: number | null
          id: string
          member_price_pence: number
          slug: string
          speakers: Json | null
          sponsor_price_pence: number
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          title: string
          travel_included: boolean
          updated_at: string
          venue_address: string | null
          venue_city: string | null
          venue_name: string | null
          venue_postcode: string | null
          venue_url: string | null
        }
        Insert: {
          accommodation_available?: boolean
          accommodation_price_pence?: number | null
          agenda?: Json | null
          auto_confirm?: boolean
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          doors_open?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          gallery_urls?: string[] | null
          guest_list_visible?: boolean
          guest_price_pence?: number
          guest_ticket_capacity?: number | null
          id?: string
          member_price_pence?: number
          slug: string
          speakers?: Json | null
          sponsor_price_pence?: number
          start_date: string
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          travel_included?: boolean
          updated_at?: string
          venue_address?: string | null
          venue_city?: string | null
          venue_name?: string | null
          venue_postcode?: string | null
          venue_url?: string | null
        }
        Update: {
          accommodation_available?: boolean
          accommodation_price_pence?: number | null
          agenda?: Json | null
          auto_confirm?: boolean
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          doors_open?: string | null
          end_date?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          gallery_urls?: string[] | null
          guest_list_visible?: boolean
          guest_price_pence?: number
          guest_ticket_capacity?: number | null
          id?: string
          member_price_pence?: number
          slug?: string
          speakers?: Json | null
          sponsor_price_pence?: number
          start_date?: string
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          travel_included?: boolean
          updated_at?: string
          venue_address?: string | null
          venue_city?: string | null
          venue_name?: string | null
          venue_postcode?: string | null
          venue_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_expenses: {
        Row: {
          amount_pence: number
          category: string | null
          created_at: string
          event_id: string
          id: string
          label: string
          updated_at: string
        }
        Insert: {
          amount_pence?: number
          category?: string | null
          created_at?: string
          event_id: string
          id?: string
          label: string
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          category?: string | null
          created_at?: string
          event_id?: string
          id?: string
          label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_expenses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_comms_sent: {
        Row: {
          booking_id: string | null
          event_id: string
          id: string
          kind: string
          sent_at: string
        }
        Insert: {
          booking_id?: string | null
          event_id: string
          id?: string
          kind: string
          sent_at?: string
        }
        Update: {
          booking_id?: string | null
          event_id?: string
          id?: string
          kind?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_comms_sent_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_comms_sent_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      member_comms_sent: {
        Row: {
          id: string
          member_id: string
          kind: string
          sent_at: string
        }
        Insert: {
          id?: string
          member_id: string
          kind: string
          sent_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          kind?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_comms_sent_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      event_invitations: {
        Row: {
          booking_id: string | null
          created_at: string
          created_by: string | null
          event_id: string
          id: string
          invitee_company: string | null
          invitee_email: string | null
          invitee_name: string | null
          invited_at: string
          member_id: string | null
          notes: string | null
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id: string
          id?: string
          invitee_company?: string | null
          invitee_email?: string | null
          invitee_name?: string | null
          invited_at?: string
          member_id?: string | null
          notes?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string
          id?: string
          invitee_company?: string | null
          invitee_email?: string | null
          invitee_name?: string | null
          invited_at?: string
          member_id?: string | null
          notes?: string | null
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      galleries: {
        Row: {
          category: string | null
          cover_image_url: string | null
          created_at: string
          event_date: string | null
          id: string
          is_published: boolean
          location: string | null
          slug: string
          title: string
          updated_at: string
          venue_name: string | null
        }
        Insert: {
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          slug: string
          title: string
          updated_at?: string
          venue_name?: string | null
        }
        Update: {
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          event_date?: string | null
          id?: string
          is_published?: boolean
          location?: string | null
          slug?: string
          title?: string
          updated_at?: string
          venue_name?: string | null
        }
        Relationships: []
      }
      gallery_photos: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          gallery_id: string
          id: string
          image_url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          gallery_id: string
          id?: string
          image_url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          gallery_id?: string
          id?: string
          image_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_photos_gallery_id_fkey"
            columns: ["gallery_id"]
            isOneToOne: false
            referencedRelation: "galleries"
            referencedColumns: ["id"]
          },
        ]
      }
      hero_slides: {
        Row: {
          alt_text: string | null
          created_at: string
          cta_primary_href: string | null
          cta_primary_label: string | null
          cta_secondary_href: string | null
          cta_secondary_label: string | null
          display_order: number
          eyebrow: string | null
          headline: string | null
          id: string
          image_url: string | null
          is_active: boolean
          lede: string | null
          media_type: string
          overlay_text: string | null
          page_slug: string
          updated_at: string
          video_poster_url: string | null
          video_url: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          cta_primary_href?: string | null
          cta_primary_label?: string | null
          cta_secondary_href?: string | null
          cta_secondary_label?: string | null
          display_order?: number
          eyebrow?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          lede?: string | null
          media_type?: string
          overlay_text?: string | null
          page_slug?: string
          updated_at?: string
          video_poster_url?: string | null
          video_url?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          cta_primary_href?: string | null
          cta_primary_label?: string | null
          cta_secondary_href?: string | null
          cta_secondary_label?: string | null
          display_order?: number
          eyebrow?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          lede?: string | null
          media_type?: string
          overlay_text?: string | null
          page_slug?: string
          updated_at?: string
          video_poster_url?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          post_url: string | null
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          post_url?: string | null
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          post_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      instagram_settings: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          follower_count: number | null
          handle: string | null
          id: string
          is_active: boolean
          profile_url: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number | null
          handle?: string | null
          id?: string
          is_active?: boolean
          profile_url?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number | null
          handle?: string | null
          id?: string
          is_active?: boolean
          profile_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      introductions: {
        Row: {
          accepted_at: string | null
          approved_at: string | null
          approved_by: string | null
          business_converted: boolean
          created_at: string
          estimated_value_pence: number | null
          event_id: string | null
          followed_up_at: string | null
          id: string
          match_reason: string | null
          match_score: number | null
          matching_tags: string[] | null
          member_a_id: string
          member_a_responded_at: string | null
          member_a_response: Database["public"]["Enums"]["intro_response"]
          member_a_response_note: string | null
          member_b_id: string
          member_b_responded_at: string | null
          member_b_response: Database["public"]["Enums"]["intro_response"]
          member_b_response_note: string | null
          email_a_subject: string | null
          email_a_body: string | null
          email_b_subject: string | null
          email_b_body: string | null
          email_a_scheduled_at: string | null
          email_b_scheduled_at: string | null
          email_a_sent_at: string | null
          email_b_sent_at: string | null
          scheduled_send_at: string | null
          outcome: string | null
          requested_by: string | null
          request_reason: string | null
          desired_outcome: string | null
          sent_at: string | null
          meeting_held_at: string | null
          proposal_sent_at: string | null
          deal_status: string | null
          deal_closed_at: string | null
          revenue_pence: number | null
          commission_pence: number | null
          commission_status: string
          commission_paid_at: string | null
          testimonial_obtained: boolean
          testimonial_note: string | null
          status: Database["public"]["Enums"]["intro_status"]
          suggested_at: string
          updated_at: string
          xero_invoice_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_converted?: boolean
          created_at?: string
          estimated_value_pence?: number | null
          event_id?: string | null
          followed_up_at?: string | null
          id?: string
          match_reason?: string | null
          match_score?: number | null
          matching_tags?: string[] | null
          member_a_id: string
          member_a_responded_at?: string | null
          member_a_response?: Database["public"]["Enums"]["intro_response"]
          member_a_response_note?: string | null
          member_b_id: string
          member_b_responded_at?: string | null
          member_b_response?: Database["public"]["Enums"]["intro_response"]
          member_b_response_note?: string | null
          email_a_subject?: string | null
          email_a_body?: string | null
          email_b_subject?: string | null
          email_b_body?: string | null
          email_a_scheduled_at?: string | null
          email_b_scheduled_at?: string | null
          email_a_sent_at?: string | null
          email_b_sent_at?: string | null
          scheduled_send_at?: string | null
          outcome?: string | null
          requested_by?: string | null
          request_reason?: string | null
          desired_outcome?: string | null
          sent_at?: string | null
          meeting_held_at?: string | null
          proposal_sent_at?: string | null
          deal_status?: string | null
          deal_closed_at?: string | null
          revenue_pence?: number | null
          commission_pence?: number | null
          commission_status?: string
          commission_paid_at?: string | null
          testimonial_obtained?: boolean
          testimonial_note?: string | null
          status?: Database["public"]["Enums"]["intro_status"]
          suggested_at?: string
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_converted?: boolean
          created_at?: string
          estimated_value_pence?: number | null
          event_id?: string | null
          followed_up_at?: string | null
          id?: string
          match_reason?: string | null
          match_score?: number | null
          matching_tags?: string[] | null
          member_a_id?: string
          member_a_responded_at?: string | null
          member_a_response?: Database["public"]["Enums"]["intro_response"]
          member_a_response_note?: string | null
          member_b_id?: string
          member_b_responded_at?: string | null
          member_b_response?: Database["public"]["Enums"]["intro_response"]
          member_b_response_note?: string | null
          email_a_subject?: string | null
          email_a_body?: string | null
          email_b_subject?: string | null
          email_b_body?: string | null
          email_a_scheduled_at?: string | null
          email_b_scheduled_at?: string | null
          email_a_sent_at?: string | null
          email_b_sent_at?: string | null
          scheduled_send_at?: string | null
          outcome?: string | null
          requested_by?: string | null
          request_reason?: string | null
          desired_outcome?: string | null
          sent_at?: string | null
          meeting_held_at?: string | null
          proposal_sent_at?: string | null
          deal_status?: string | null
          deal_closed_at?: string | null
          revenue_pence?: number | null
          commission_pence?: number | null
          commission_status?: string
          commission_paid_at?: string | null
          testimonial_obtained?: boolean
          testimonial_note?: string | null
          status?: Database["public"]["Enums"]["intro_status"]
          suggested_at?: string
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "introductions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_member_a_id_fkey"
            columns: ["member_a_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_member_b_id_fkey"
            columns: ["member_b_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introductions_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      mailing_list: {
        Row: {
          email: string
          first_name: string
          id: string
          last_name: string
          notes: string | null
          source: string
          subscribed_at: string
          unsubscribe_token: string
          unsubscribed_at: string | null
        }
        Insert: {
          email: string
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          source?: string
          subscribed_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Update: {
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          source?: string
          subscribed_at?: string
          unsubscribe_token?: string
          unsubscribed_at?: string | null
        }
        Relationships: []
      }
      member_documents: {
        Row: {
          content_type: string | null
          created_at: string
          doc_type: string
          file_name: string
          file_path: string
          id: string
          member_id: string
          size_bytes: number | null
          title: string | null
          uploaded_by: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          doc_type?: string
          file_name: string
          file_path: string
          id?: string
          member_id: string
          size_bytes?: number | null
          title?: string | null
          uploaded_by?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          id?: string
          member_id?: string
          size_bytes?: number | null
          title?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      member_tags: {
        Row: {
          member_id: string
          tag_id: string
        }
        Insert: {
          member_id: string
          tag_id: string
        }
        Update: {
          member_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_tags_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          accounts_contact_email: string | null
          accounts_contact_name: string | null
          accounts_contact_phone: string | null
          achievements: string | null
          agreement_commission_pct: number | null
          ai_intelligence: Json | null
          allergies: string | null
          annual_turnover: string | null
          assistant_contact: string | null
          assistant_name: string | null
          awards: string | null
          birthday: string | null
          budgets: string | null
          business_objectives: string | null
          card_on_file: boolean
          career_history: string | null
          charitable_interests: string | null
          churn_risk_score: number | null
          company_address: string | null
          company_description: string | null
          company_linkedin_url: string | null
          company_logo_url: string | null
          company_name: string | null
          company_website: string | null
          contract_signed: boolean
          contract_url: string | null
          created_at: string
          deleted_at: string | null
          dietary_requirements: string | null
          direct_debit_active: boolean
          dream_introductions: string | null
          drink_preferences: string | null
          employee_count: string | null
          engagement_score: number | null
          estimated_profit: string | null
          event_preferences: string[] | null
          favourite_brands: string | null
          favourite_restaurants: string | null
          fd_contact: string | null
          gocardless_mandate_id: string | null
          hobbies: string | null
          id: string
          important_dates: string | null
          interest_flags: string[] | null
          intro_target_criteria: string | null
          intro_target_types: string | null
          introducer_agreement_url: string | null
          intros_used_this_month: number
          invoice_address: string | null
          invoice_chaser_contact: string | null
          is_primary_rep: boolean
          lifetime_value_pence: number | null
          ltv_forecast_pence: number | null
          media_features: string | null
          member_satisfaction_score: number | null
          member_testimonial: string | null
          membership_agreement_url: string | null
          membership_end_date: string | null
          membership_manager: string | null
          membership_start_date: string | null
          membership_status: Database["public"]["Enums"]["membership_status"]
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          membership_type: Database["public"]["Enums"]["membership_type"]
          membership_value_pence: number | null
          member_number: number | null
          monthly_intro_quota: number
          nda_url: string | null
          notes: string | null
          nps_score: number | null
          offices: string | null
          parent_member_id: string | null
          partner_name: string | null
          payment_frequency: string | null
          profile_id: string
          referred_by: string | null
          relationship_capital_score: number | null
          relationship_health_score: number | null
          renewal_date: string | null
          rep_role: string | null
          sector: string | null
          showcase_enabled: boolean
          source: string | null
          sponsor_aligned: boolean
          sporting_interests: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          sub_sector: string | null
          success_stories: string | null
          travel_profile: string | null
          updated_at: string
          upgrade_potential: number | null
          what_they_can_offer: string | null
          xero_contact_id: string | null
          xero_spend_pence: number | null
          xero_spend_synced_at: string | null
          enrichment_status: string | null
          enriched_at: string | null
          enrichment_source: string | null
          enrichment_raw: Json | null
        }
        Insert: {
          accounts_contact_email?: string | null
          accounts_contact_name?: string | null
          accounts_contact_phone?: string | null
          achievements?: string | null
          agreement_commission_pct?: number | null
          ai_intelligence?: Json | null
          allergies?: string | null
          annual_turnover?: string | null
          assistant_contact?: string | null
          assistant_name?: string | null
          awards?: string | null
          birthday?: string | null
          budgets?: string | null
          business_objectives?: string | null
          card_on_file?: boolean
          career_history?: string | null
          charitable_interests?: string | null
          churn_risk_score?: number | null
          company_address?: string | null
          company_description?: string | null
          company_linkedin_url?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_website?: string | null
          contract_signed?: boolean
          contract_url?: string | null
          created_at?: string
          deleted_at?: string | null
          dietary_requirements?: string | null
          direct_debit_active?: boolean
          dream_introductions?: string | null
          drink_preferences?: string | null
          employee_count?: string | null
          engagement_score?: number | null
          estimated_profit?: string | null
          event_preferences?: string[] | null
          favourite_brands?: string | null
          favourite_restaurants?: string | null
          fd_contact?: string | null
          gocardless_mandate_id?: string | null
          hobbies?: string | null
          id?: string
          important_dates?: string | null
          interest_flags?: string[] | null
          intro_target_criteria?: string | null
          intro_target_types?: string | null
          introducer_agreement_url?: string | null
          intros_used_this_month?: number
          invoice_address?: string | null
          invoice_chaser_contact?: string | null
          is_primary_rep?: boolean
          lifetime_value_pence?: number | null
          ltv_forecast_pence?: number | null
          media_features?: string | null
          member_satisfaction_score?: number | null
          member_testimonial?: string | null
          membership_agreement_url?: string | null
          membership_end_date?: string | null
          membership_manager?: string | null
          membership_start_date?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          membership_type?: Database["public"]["Enums"]["membership_type"]
          membership_value_pence?: number | null
          member_number?: number | null
          monthly_intro_quota?: number
          nda_url?: string | null
          notes?: string | null
          nps_score?: number | null
          offices?: string | null
          parent_member_id?: string | null
          partner_name?: string | null
          payment_frequency?: string | null
          profile_id: string
          referred_by?: string | null
          relationship_capital_score?: number | null
          relationship_health_score?: number | null
          renewal_date?: string | null
          rep_role?: string | null
          sector?: string | null
          showcase_enabled?: boolean
          source?: string | null
          sponsor_aligned?: boolean
          sporting_interests?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          sub_sector?: string | null
          success_stories?: string | null
          travel_profile?: string | null
          updated_at?: string
          upgrade_potential?: number | null
          what_they_can_offer?: string | null
          xero_contact_id?: string | null
          xero_spend_pence?: number | null
          xero_spend_synced_at?: string | null
          enrichment_status?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          enrichment_raw?: Json | null
        }
        Update: {
          accounts_contact_email?: string | null
          accounts_contact_name?: string | null
          accounts_contact_phone?: string | null
          achievements?: string | null
          agreement_commission_pct?: number | null
          ai_intelligence?: Json | null
          allergies?: string | null
          annual_turnover?: string | null
          assistant_contact?: string | null
          assistant_name?: string | null
          awards?: string | null
          birthday?: string | null
          budgets?: string | null
          business_objectives?: string | null
          card_on_file?: boolean
          career_history?: string | null
          charitable_interests?: string | null
          churn_risk_score?: number | null
          company_address?: string | null
          company_description?: string | null
          company_linkedin_url?: string | null
          company_logo_url?: string | null
          company_name?: string | null
          company_website?: string | null
          contract_signed?: boolean
          contract_url?: string | null
          created_at?: string
          deleted_at?: string | null
          dietary_requirements?: string | null
          direct_debit_active?: boolean
          dream_introductions?: string | null
          drink_preferences?: string | null
          employee_count?: string | null
          engagement_score?: number | null
          estimated_profit?: string | null
          event_preferences?: string[] | null
          favourite_brands?: string | null
          favourite_restaurants?: string | null
          fd_contact?: string | null
          gocardless_mandate_id?: string | null
          hobbies?: string | null
          id?: string
          important_dates?: string | null
          interest_flags?: string[] | null
          intro_target_criteria?: string | null
          intro_target_types?: string | null
          introducer_agreement_url?: string | null
          intros_used_this_month?: number
          invoice_address?: string | null
          invoice_chaser_contact?: string | null
          is_primary_rep?: boolean
          lifetime_value_pence?: number | null
          ltv_forecast_pence?: number | null
          media_features?: string | null
          member_satisfaction_score?: number | null
          member_testimonial?: string | null
          membership_agreement_url?: string | null
          membership_end_date?: string | null
          membership_manager?: string | null
          membership_start_date?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          membership_type?: Database["public"]["Enums"]["membership_type"]
          membership_value_pence?: number | null
          member_number?: number | null
          monthly_intro_quota?: number
          nda_url?: string | null
          notes?: string | null
          nps_score?: number | null
          offices?: string | null
          parent_member_id?: string | null
          partner_name?: string | null
          payment_frequency?: string | null
          profile_id?: string
          referred_by?: string | null
          relationship_capital_score?: number | null
          relationship_health_score?: number | null
          renewal_date?: string | null
          rep_role?: string | null
          sector?: string | null
          showcase_enabled?: boolean
          source?: string | null
          sponsor_aligned?: boolean
          sporting_interests?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          sub_sector?: string | null
          success_stories?: string | null
          travel_profile?: string | null
          updated_at?: string
          upgrade_potential?: number | null
          what_they_can_offer?: string | null
          xero_contact_id?: string | null
          xero_spend_pence?: number | null
          xero_spend_synced_at?: string | null
          enrichment_status?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          enrichment_raw?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "members_parent_member_id_fkey"
            columns: ["parent_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_applications: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          amount_paid_pence: number | null
          annual_turnover: string | null
          applicant_stage: string | null
          bio: string | null
          charge_error: string | null
          city: string | null
          company: string | null
          created_at: string
          email: string
          employees: string | null
          first_name: string
          id: string
          identifies_as: string | null
          industry: string | null
          instagram_url: string | null
          interests: string[] | null
          personal_interests: string[] | null
          last_name: string
          linkedin_url: string | null
          looking_for: string | null
          nationality: string | null
          notes: string | null
          paid_at: string | null
          payment_preference: string | null
          pending_email_sent_at: string | null
          phone: string | null
          photo_url: string | null
          position: string | null
          postcode: string | null
          preferred_location: string | null
          preferred_tier: string | null
          pronouns: string | null
          quoted_amount_pence: number | null
          referral_name: string | null
          referral_source: string | null
          refund_amount_pence: number | null
          refund_id: string | null
          refunded_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stripe_customer_id: string | null
          stripe_payment_method_id: string | null
          stripe_setup_intent_id: string | null
          stripe_subscription_id: string | null
          tiktok_url: string | null
          track: string
          updated_at: string
          website_url: string | null
          what_they_can_offer: string | null
          work_email: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          amount_paid_pence?: number | null
          annual_turnover?: string | null
          applicant_stage?: string | null
          bio?: string | null
          charge_error?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          email: string
          employees?: string | null
          first_name: string
          id?: string
          identifies_as?: string | null
          industry?: string | null
          instagram_url?: string | null
          interests?: string[] | null
          personal_interests?: string[] | null
          last_name: string
          linkedin_url?: string | null
          looking_for?: string | null
          nationality?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_preference?: string | null
          pending_email_sent_at?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          postcode?: string | null
          preferred_location?: string | null
          preferred_tier?: string | null
          pronouns?: string | null
          quoted_amount_pence?: number | null
          referral_name?: string | null
          referral_source?: string | null
          refund_amount_pence?: number | null
          refund_id?: string | null
          refunded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_subscription_id?: string | null
          tiktok_url?: string | null
          track?: string
          updated_at?: string
          website_url?: string | null
          what_they_can_offer?: string | null
          work_email?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          amount_paid_pence?: number | null
          annual_turnover?: string | null
          applicant_stage?: string | null
          bio?: string | null
          charge_error?: string | null
          city?: string | null
          company?: string | null
          created_at?: string
          email?: string
          employees?: string | null
          first_name?: string
          id?: string
          identifies_as?: string | null
          industry?: string | null
          instagram_url?: string | null
          interests?: string[] | null
          personal_interests?: string[] | null
          last_name?: string
          linkedin_url?: string | null
          looking_for?: string | null
          nationality?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_preference?: string | null
          pending_email_sent_at?: string | null
          phone?: string | null
          photo_url?: string | null
          position?: string | null
          postcode?: string | null
          preferred_location?: string | null
          preferred_tier?: string | null
          pronouns?: string | null
          quoted_amount_pence?: number | null
          referral_name?: string | null
          referral_source?: string | null
          refund_amount_pence?: number | null
          refund_id?: string | null
          refunded_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_method_id?: string | null
          stripe_setup_intent_id?: string | null
          stripe_subscription_id?: string | null
          tiktok_url?: string | null
          track?: string
          updated_at?: string
          website_url?: string | null
          what_they_can_offer?: string | null
          work_email?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      membership_comparison: {
        Row: {
          business: boolean
          corporate: boolean
          created_at: string | null
          display_order: number
          id: string
          individual: boolean
          is_active: boolean
          label: string
          updated_at: string | null
        }
        Insert: {
          business?: boolean
          corporate?: boolean
          created_at?: string | null
          display_order?: number
          id?: string
          individual?: boolean
          is_active?: boolean
          label: string
          updated_at?: string | null
        }
        Update: {
          business?: boolean
          corporate?: boolean
          created_at?: string | null
          display_order?: number
          id?: string
          individual?: boolean
          is_active?: boolean
          label?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      membership_benefits: {
        Row: {
          body: string
          created_at: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          numeral: string
          position: number
          title: string
          updated_at: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          numeral: string
          position: number
          title: string
          updated_at?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          numeral?: string
          position?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      membership_plans: {
        Row: {
          annual_price_pence: number
          contract_terms: string | null
          created_at: string
          display_order: number
          features: string[]
          id: string
          image_url: string | null
          is_active: boolean
          is_featured: boolean
          intro_quota: number
          lede: string | null
          monthly_price_pence: number
          name: string
          slug: string
          tier_classification: string | null
          updated_at: string
        }
        Insert: {
          annual_price_pence?: number
          contract_terms?: string | null
          created_at?: string
          display_order?: number
          features?: string[]
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          intro_quota?: number
          lede?: string | null
          monthly_price_pence?: number
          name: string
          slug: string
          tier_classification?: string | null
          updated_at?: string
        }
        Update: {
          annual_price_pence?: number
          contract_terms?: string | null
          created_at?: string
          display_order?: number
          features?: string[]
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_featured?: boolean
          intro_quota?: number
          lede?: string | null
          monthly_price_pence?: number
          name?: string
          slug?: string
          tier_classification?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      partner_logos: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_visible: boolean
          name: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_visible?: boolean
          name: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_visible?: boolean
          name?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount_pence: number
          created_at: string
          currency: string
          description: string | null
          due_date: string | null
          gocardless_payment_id: string | null
          id: string
          member_id: string
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_type: string
          reference_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_checkout_session_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
          xero_invoice_id: string | null
        }
        Insert: {
          amount_pence: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          gocardless_payment_id?: string | null
          id?: string
          member_id: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_type: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Update: {
          amount_pence?: number
          created_at?: string
          currency?: string
          description?: string | null
          due_date?: string | null
          gocardless_payment_id?: string | null
          id?: string
          member_id?: string
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_type?: string
          reference_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_checkout_session_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          linkedin_url: string | null
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id: string
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          linkedin_url?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      reward_partners: {
        Row: {
          id: string
          name: string
          category: string
          description: string | null
          logo_url: string | null
          website_url: string | null
          contact_name: string | null
          contact_email: string | null
          contact_phone: string | null
          is_active: boolean
          is_public: boolean
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          category?: string
          description?: string | null
          logo_url?: string | null
          website_url?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          is_active?: boolean
          is_public?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          category?: string
          description?: string | null
          logo_url?: string | null
          website_url?: string | null
          contact_name?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          is_active?: boolean
          is_public?: boolean
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reward_offers: {
        Row: {
          id: string
          partner_id: string
          title: string
          summary: string | null
          details: string | null
          member_benefit: string | null
          redemption_process: string | null
          booking_url: string | null
          discount_code: string | null
          is_active: boolean
          valid_until: string | null
          display_order: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          partner_id: string
          title: string
          summary?: string | null
          details?: string | null
          member_benefit?: string | null
          redemption_process?: string | null
          booking_url?: string | null
          discount_code?: string | null
          is_active?: boolean
          valid_until?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          partner_id?: string
          title?: string
          summary?: string | null
          details?: string | null
          member_benefit?: string | null
          redemption_process?: string | null
          booking_url?: string | null
          discount_code?: string | null
          is_active?: boolean
          valid_until?: string | null
          display_order?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_offers_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "reward_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_claims: {
        Row: {
          id: string
          member_id: string
          offer_id: string
          status: string
          claimed_at: string
          redeemed_at: string | null
          value_pence: number | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          member_id: string
          offer_id: string
          status?: string
          claimed_at?: string
          redeemed_at?: string | null
          value_pence?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          member_id?: string
          offer_id?: string
          status?: string
          claimed_at?: string
          redeemed_at?: string | null
          value_pence?: number | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_claims_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_claims_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "reward_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_referrals: {
        Row: {
          id: string
          member_id: string
          description: string | null
          referred_name: string | null
          revenue_pence: number | null
          commission_pence: number | null
          status: string
          created_at: string
          updated_at: string
          xero_bill_id: string | null
        }
        Insert: {
          id?: string
          member_id: string
          description?: string | null
          referred_name?: string | null
          revenue_pence?: number | null
          commission_pence?: number | null
          status?: string
          created_at?: string
          updated_at?: string
          xero_bill_id?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          description?: string | null
          referred_name?: string | null
          revenue_pence?: number | null
          commission_pence?: number | null
          status?: string
          created_at?: string
          updated_at?: string
          xero_bill_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_referrals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          body: string
          company: string | null
          created_at: string
          email: string
          event_id: string | null
          first_name: string
          id: string
          is_active: boolean
          last_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          body: string
          company?: string | null
          created_at?: string
          email: string
          event_id?: string | null
          first_name: string
          id?: string
          is_active?: boolean
          last_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          body?: string
          company?: string | null
          created_at?: string
          email?: string
          event_id?: string | null
          first_name?: string
          id?: string
          is_active?: boolean
          last_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_deliverables: {
        Row: {
          category: string | null
          created_at: string
          due_date: string | null
          file_name: string | null
          file_path: string | null
          file_size: number | null
          id: string
          label: string
          notes: string | null
          sponsor_note: string | null
          sponsorship_id: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          due_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          label: string
          notes?: string | null
          sponsor_note?: string | null
          sponsorship_id: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          due_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_size?: number | null
          id?: string
          label?: string
          notes?: string | null
          sponsor_note?: string | null
          sponsorship_id?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_deliverables_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsor_comms_sent: {
        Row: {
          id: string
          kind: string
          sent_at: string
          sponsorship_id: string
        }
        Insert: {
          id?: string
          kind: string
          sent_at?: string
          sponsorship_id: string
        }
        Update: {
          id?: string
          kind?: string
          sent_at?: string
          sponsorship_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsor_comms_sent_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsorships: {
        Row: {
          amount_pence: number
          benefits: Json | null
          booking_token: string
          brand_alignment: string | null
          created_at: string
          event_id: string
          event_price_pence: number | null
          id: string
          invite_sent_at: string | null
          member_id: string | null
          package_name: string
          proposal_html: string | null
          roi_reach: number | null
          roi_report_html: string | null
          showcase_slot: string | null
          sponsor_company: string | null
          sponsor_email: string | null
          sponsor_name: string | null
          status: string
          updated_at: string
          xero_invoice_id: string | null
        }
        Insert: {
          amount_pence: number
          benefits?: Json | null
          booking_token?: string
          brand_alignment?: string | null
          created_at?: string
          event_id: string
          event_price_pence?: number | null
          id?: string
          invite_sent_at?: string | null
          member_id?: string | null
          package_name: string
          proposal_html?: string | null
          roi_reach?: number | null
          roi_report_html?: string | null
          showcase_slot?: string | null
          sponsor_company?: string | null
          sponsor_email?: string | null
          sponsor_name?: string | null
          status?: string
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Update: {
          amount_pence?: number
          benefits?: Json | null
          booking_token?: string
          brand_alignment?: string | null
          created_at?: string
          event_id?: string
          event_price_pence?: number | null
          id?: string
          invite_sent_at?: string | null
          member_id?: string | null
          package_name?: string
          proposal_html?: string | null
          roi_reach?: number | null
          roi_report_html?: string | null
          showcase_slot?: string | null
          sponsor_company?: string | null
          sponsor_email?: string | null
          sponsor_name?: string | null
          status?: string
          updated_at?: string
          xero_invoice_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sponsorships_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsorships_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          category: Database["public"]["Enums"]["tag_category"]
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          category: Database["public"]["Enums"]["tag_category"]
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["tag_category"]
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      signature_requests: {
        Row: {
          completed_at: string | null
          contract_template_id: string | null
          created_at: string
          declined_reason: string | null
          doc_type: string
          envelope_id: string | null
          error: string | null
          id: string
          last_checked_at: string | null
          member_id: string
          message: string | null
          sent_at: string | null
          sent_by: string | null
          signed_document_id: string | null
          signer_email: string
          signer_name: string
          source_file_name: string | null
          status: string
          subject: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          contract_template_id?: string | null
          created_at?: string
          declined_reason?: string | null
          doc_type?: string
          envelope_id?: string | null
          error?: string | null
          id?: string
          last_checked_at?: string | null
          member_id: string
          message?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signed_document_id?: string | null
          signer_email: string
          signer_name: string
          source_file_name?: string | null
          status?: string
          subject?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          contract_template_id?: string | null
          created_at?: string
          declined_reason?: string | null
          doc_type?: string
          envelope_id?: string | null
          error?: string | null
          id?: string
          last_checked_at?: string | null
          member_id?: string
          message?: string | null
          sent_at?: string | null
          sent_by?: string | null
          signed_document_id?: string | null
          signer_email?: string
          signer_name?: string
          source_file_name?: string | null
          status?: string
          subject?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          category: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          priority: string
          related_enquiry_id: string | null
          related_event_id: string | null
          related_member_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          related_enquiry_id?: string | null
          related_event_id?: string | null
          related_member_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          related_enquiry_id?: string | null
          related_event_id?: string | null
          related_member_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      template_ai_chats: {
        Row: {
          created_at: string
          id: string
          template_id: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          template_id?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          template_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_ai_chats_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_ai_chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      template_ai_messages: {
        Row: {
          blocks_snapshot: Json | null
          chat_id: string
          content: string
          created_at: string
          id: string
          preheader_snapshot: string | null
          role: string
          subject_snapshot: string | null
        }
        Insert: {
          blocks_snapshot?: Json | null
          chat_id: string
          content: string
          created_at?: string
          id?: string
          preheader_snapshot?: string | null
          role: string
          subject_snapshot?: string | null
        }
        Update: {
          blocks_snapshot?: Json | null
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          preheader_snapshot?: string | null
          role?: string
          subject_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "template_ai_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "template_ai_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      testimonials: {
        Row: {
          company_name: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          person_name: string
          person_title: string | null
          quote_text: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          person_name: string
          person_title?: string | null
          quote_text: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          person_name?: string
          person_title?: string | null
          quote_text?: string
          updated_at?: string
        }
        Relationships: []
      }
      video_gallery: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          page_slug: string
          title: string
          youtube_url: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          page_slug?: string
          title: string
          youtube_url: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          page_slug?: string
          title?: string
          youtube_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      booking_status: "confirmed" | "pending" | "cancelled" | "refunded"
      event_status: "draft" | "published" | "live" | "completed" | "cancelled"
      event_type: "member_event" | "curated_luxury" | "retreat"
      intro_response: "pending" | "accepted" | "declined"
      intro_status:
        | "suggested"
        | "approved"
        | "sent"
        | "scheduled"
        | "accepted"
        | "completed"
        | "declined"
      membership_status:
        | "active"
        | "pending"
        | "expired"
        | "cancelled"
        | "paused"
      membership_tier: "tier_1" | "tier_2" | "tier_3"
      membership_type: "individual" | "business"
      payment_method: "stripe" | "gocardless" | "invoice" | "manual"
      payment_status: "paid" | "pending" | "overdue" | "refunded" | "failed"
      tag_category: "industry" | "interest" | "need" | "service"
      user_role: "admin" | "member"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      booking_status: ["confirmed", "pending", "cancelled", "refunded"],
      event_status: ["draft", "published", "live", "completed", "cancelled"],
      event_type: ["member_event", "curated_luxury", "retreat"],
      intro_status: [
        "suggested",
        "approved",
        "sent",
        "accepted",
        "completed",
        "declined",
      ],
      membership_status: [
        "active",
        "pending",
        "expired",
        "cancelled",
        "paused",
      ],
      membership_tier: ["tier_1", "tier_2", "tier_3"],
      membership_type: ["individual", "business"],
      payment_method: ["stripe", "gocardless", "invoice", "manual"],
      payment_status: ["paid", "pending", "overdue", "refunded", "failed"],
      tag_category: ["industry", "interest", "need", "service"],
      user_role: ["admin", "member"],
    },
  },
} as const
