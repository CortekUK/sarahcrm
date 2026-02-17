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
      bookings: {
        Row: {
          accommodation_booked: boolean
          amount_pence: number
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
          member_id: string
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          special_requests: string | null
          sponsor_package: string | null
          status: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id: string | null
          table_assignment: string | null
          updated_at: string
        }
        Insert: {
          accommodation_booked?: boolean
          amount_pence?: number
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
          member_id: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          special_requests?: string | null
          sponsor_package?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id?: string | null
          table_assignment?: string | null
          updated_at?: string
        }
        Update: {
          accommodation_booked?: boolean
          amount_pence?: number
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
          member_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          special_requests?: string | null
          sponsor_package?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          stripe_payment_intent_id?: string | null
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
          budget_pence: number | null
          created_at: string
          dates: string | null
          description: string | null
          event_name: string | null
          fulfilled_by: string | null
          guests: number | null
          id: string
          location: string | null
          member_id: string
          notes: string | null
          quoted_amount_pence: number | null
          request_type: string
          status: string
          updated_at: string
        }
        Insert: {
          budget_pence?: number | null
          created_at?: string
          dates?: string | null
          description?: string | null
          event_name?: string | null
          fulfilled_by?: string | null
          guests?: number | null
          id?: string
          location?: string | null
          member_id: string
          notes?: string | null
          quoted_amount_pence?: number | null
          request_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          budget_pence?: number | null
          created_at?: string
          dates?: string | null
          description?: string | null
          event_name?: string | null
          fulfilled_by?: string | null
          guests?: number | null
          id?: string
          location?: string | null
          member_id?: string
          notes?: string | null
          quoted_amount_pence?: number | null
          request_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
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
          member_b_id: string
          outcome: string | null
          requested_by: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["intro_status"]
          suggested_at: string
          updated_at: string
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
          member_b_id: string
          outcome?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["intro_status"]
          suggested_at?: string
          updated_at?: string
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
          member_b_id?: string
          outcome?: string | null
          requested_by?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["intro_status"]
          suggested_at?: string
          updated_at?: string
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
          company_description: string | null
          company_name: string | null
          company_website: string | null
          created_at: string
          deleted_at: string | null
          gocardless_mandate_id: string | null
          id: string
          intros_used_this_month: number
          membership_end_date: string | null
          membership_start_date: string | null
          membership_status: Database["public"]["Enums"]["membership_status"]
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          membership_type: Database["public"]["Enums"]["membership_type"]
          monthly_intro_quota: number
          notes: string | null
          profile_id: string
          referred_by: string | null
          renewal_date: string | null
          showcase_enabled: boolean
          source: string | null
          sponsor_aligned: boolean
          stripe_customer_id: string | null
          updated_at: string
          xero_contact_id: string | null
        }
        Insert: {
          company_description?: string | null
          company_name?: string | null
          company_website?: string | null
          created_at?: string
          deleted_at?: string | null
          gocardless_mandate_id?: string | null
          id?: string
          intros_used_this_month?: number
          membership_end_date?: string | null
          membership_start_date?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          membership_type?: Database["public"]["Enums"]["membership_type"]
          monthly_intro_quota?: number
          notes?: string | null
          profile_id: string
          referred_by?: string | null
          renewal_date?: string | null
          showcase_enabled?: boolean
          source?: string | null
          sponsor_aligned?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Update: {
          company_description?: string | null
          company_name?: string | null
          company_website?: string | null
          created_at?: string
          deleted_at?: string | null
          gocardless_mandate_id?: string | null
          id?: string
          intros_used_this_month?: number
          membership_end_date?: string | null
          membership_start_date?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          membership_type?: Database["public"]["Enums"]["membership_type"]
          monthly_intro_quota?: number
          notes?: string | null
          profile_id?: string
          referred_by?: string | null
          renewal_date?: string | null
          showcase_enabled?: boolean
          source?: string | null
          sponsor_aligned?: boolean
          stripe_customer_id?: string | null
          updated_at?: string
          xero_contact_id?: string | null
        }
        Relationships: [
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
      sponsorships: {
        Row: {
          amount_pence: number
          benefits: Json | null
          brand_alignment: string | null
          created_at: string
          event_id: string
          id: string
          member_id: string
          package_name: string
          showcase_slot: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_pence: number
          benefits?: Json | null
          brand_alignment?: string | null
          created_at?: string
          event_id: string
          id?: string
          member_id: string
          package_name: string
          showcase_slot?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount_pence?: number
          benefits?: Json | null
          brand_alignment?: string | null
          created_at?: string
          event_id?: string
          id?: string
          member_id?: string
          package_name?: string
          showcase_slot?: string | null
          status?: string
          updated_at?: string
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
      intro_status:
        | "suggested"
        | "approved"
        | "sent"
        | "accepted"
        | "completed"
        | "declined"
      membership_status: "active" | "pending" | "expired" | "cancelled"
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
      membership_status: ["active", "pending", "expired", "cancelled"],
      membership_tier: ["tier_1", "tier_2", "tier_3"],
      membership_type: ["individual", "business"],
      payment_method: ["stripe", "gocardless", "invoice", "manual"],
      payment_status: ["paid", "pending", "overdue", "refunded", "failed"],
      tag_category: ["industry", "interest", "need", "service"],
      user_role: ["admin", "member"],
    },
  },
} as const
