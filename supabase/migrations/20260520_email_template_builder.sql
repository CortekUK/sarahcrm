-- ============================================================================
-- Email Template Builder + AI chat history
-- ============================================================================
-- Adds the visual email-template editor backend:
--   * email_templates       — the templates themselves (block JSON + rendered HTML)
--   * template_ai_chats     — one row per AI conversation (history sidebar)
--   * template_ai_messages  — turns within a chat, with optional canvas snapshot
--
-- Mirrors the IFG-CRM schema but scoped to The Club's `admin` role rather than
-- IFG's `super_admin`. Branding / merge-tag differences are handled at the
-- application layer; the DB shape is intentionally generic.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- email_templates
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT DEFAULT '',
  -- Rendered HTML (what actually ships in the send). The block JSON below is
  -- the editable source of truth; this column is regenerated from it on save.
  body_html TEXT NOT NULL,
  -- The editor's block tree. `null` is allowed only for templates imported
  -- from raw HTML (no structured blocks to edit visually).
  body_json JSONB,
  -- Per-template chrome (header strip, footer strip, page bg). Optional —
  -- when null, the renderer uses defaults.
  theme JSONB,
  category TEXT NOT NULL DEFAULT 'campaign'
    CHECK (category IN ('automation', 'campaign', 'transactional')),
  from_name_type TEXT NOT NULL DEFAULT 'sender'
    CHECK (from_name_type IN ('sender', 'fixed')),
  fixed_from_name TEXT,
  fixed_from_email TEXT,
  attachments JSONB DEFAULT '[]',
  -- TRUE only when the user explicitly hits "Save Draft". Drives the Draft
  -- badge in the templates list.
  is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_updated
  ON public.email_templates(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_templates_category
  ON public.email_templates(category);

-- Auto-bump updated_at on row updates so the templates list orders by
-- "most recently edited" without the app having to remember to set it.
CREATE OR REPLACE FUNCTION public.email_templates_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_templates_touch_updated_at_trigger
  ON public.email_templates;
CREATE TRIGGER email_templates_touch_updated_at_trigger
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.email_templates_touch_updated_at();

-- RLS — admins manage everything; non-admins can't see templates.
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_templates_admin_all ON public.email_templates;
CREATE POLICY email_templates_admin_all
  ON public.email_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- template_ai_chats — one conversation, lives in the sidebar history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_ai_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT,
  -- Optional pin to the email_templates row the user is editing. Lets us
  -- auto-resume the conversation when they reopen the same template.
  template_id UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_ai_chats_user
  ON public.template_ai_chats(user_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- template_ai_messages — turns within a chat
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.template_ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES public.template_ai_chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  -- Assistant turns may carry a snapshot of the resulting blocks + subject so
  -- the canvas can be restored when the user resumes the conversation. User
  -- turns leave these null.
  blocks_snapshot JSONB,
  subject_snapshot TEXT,
  preheader_snapshot TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_template_ai_messages_chat
  ON public.template_ai_messages(chat_id, created_at);

-- Bump parent chat updated_at on every new message so the history list orders
-- by "most recent activity" without an extra query.
CREATE OR REPLACE FUNCTION public.template_ai_messages_touch_chat()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.template_ai_chats
  SET updated_at = NOW()
  WHERE id = NEW.chat_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS template_ai_messages_touch_chat_trigger
  ON public.template_ai_messages;
CREATE TRIGGER template_ai_messages_touch_chat_trigger
  AFTER INSERT ON public.template_ai_messages
  FOR EACH ROW EXECUTE FUNCTION public.template_ai_messages_touch_chat();

-- RLS — admins can only see their own chats. The route uses the
-- service-role client so it bypasses RLS, but these policies guard the
-- direct anon-key path in case a UI ever queries these tables directly.
ALTER TABLE public.template_ai_chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS template_ai_chats_owner ON public.template_ai_chats;
CREATE POLICY template_ai_chats_owner
  ON public.template_ai_chats
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS template_ai_messages_owner ON public.template_ai_messages;
CREATE POLICY template_ai_messages_owner
  ON public.template_ai_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.template_ai_chats c
      WHERE c.id = template_ai_messages.chat_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.template_ai_chats c
      WHERE c.id = template_ai_messages.chat_id
        AND c.user_id = auth.uid()
    )
  );

COMMENT ON COLUMN public.email_templates.theme IS
  'Optional per-template theme overrides for header/footer/page chrome (TemplateTheme shape). NULL = use defaults.';
COMMENT ON COLUMN public.email_templates.is_draft IS
  'TRUE only when the user explicitly hits Save Draft. Drives the Draft badge on the templates list.';
