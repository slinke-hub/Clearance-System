-- ============================================================
-- KSA Customs Clearance System — Supabase Database Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (extends auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  email         TEXT NOT NULL,
  user_type     TEXT NOT NULL DEFAULT 'individual' CHECK (user_type IN ('individual', 'enterprise')),
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin', 'superadmin')),
  language_pref TEXT NOT NULL DEFAULT 'en' CHECK (language_pref IN ('en', 'ar')),
  avatar_url    TEXT,
  phone         TEXT,
  company_name  TEXT,
  company_name_ar TEXT,
  cr_number     TEXT,
  vat_number    TEXT,
  business_type TEXT DEFAULT 'individual' CHECK (business_type IN ('customs_broker', 'importer_exporter', 'freight_forwarder', 'individual')),
  broker_license_no TEXT,
  fasah_id      TEXT,
  primary_port  TEXT,
  industry_sector TEXT,
  transport_license_no TEXT,
  monthly_volume TEXT,
  org_id        UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ));

CREATE POLICY "Admins can update all profiles"
  ON public.profiles FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ));

-- ============================================================
-- 2. ORGANIZATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  owner_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  logo_url    TEXT,
  company_name_ar TEXT,
  vat_number  TEXT,
  cr_number   TEXT,
  broker_license_no TEXT,
  fasah_id    TEXT,
  primary_port TEXT,
  business_type TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. ORG MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.org_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_org_member(target_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = target_org_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(target_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = target_org_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;

CREATE POLICY "Org members can view their org"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

CREATE POLICY "Org owner can update org"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Members can view their org members"
  ON public.org_members FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Org admins can manage members"
  ON public.org_members FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- ============================================================
-- 4. SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan            TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
  monthly_limit   INTEGER NOT NULL DEFAULT 5,
  invoices_used   INTEGER NOT NULL DEFAULT 0,
  period_start    TIMESTAMPTZ NOT NULL DEFAULT DATE_TRUNC('month', NOW()),
  period_end      TIMESTAMPTZ NOT NULL DEFAULT (DATE_TRUNC('month', NOW()) + INTERVAL '1 month'),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all subscriptions"
  ON public.subscriptions FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ));

-- ============================================================
-- 5. INVOICE RUNS (one per uploaded Excel file)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_runs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  file_name       TEXT NOT NULL,
  file_url        TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  total_items     INTEGER NOT NULL DEFAULT 0,
  processed_items INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  column_mapping  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoice_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own invoice runs"
  ON public.invoice_runs FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all invoice runs"
  ON public.invoice_runs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ));

-- ============================================================
-- 6. INVOICE LINE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoice_line_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id          UUID NOT NULL REFERENCES public.invoice_runs(id) ON DELETE CASCADE,
  row_index       INTEGER NOT NULL,
  item_name       TEXT,
  item_description TEXT,
  quantity        TEXT,
  unit_price      TEXT,
  total_price     TEXT,
  currency        TEXT,
  raw_data        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.invoice_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own line items"
  ON public.invoice_line_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.invoice_runs ir
    WHERE ir.id = run_id AND ir.user_id = auth.uid()
  ));

-- ============================================================
-- 7. CLASSIFICATION RESULTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.classification_results (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_item_id          UUID NOT NULL REFERENCES public.invoice_line_items(id) ON DELETE CASCADE UNIQUE,
  run_id                UUID NOT NULL REFERENCES public.invoice_runs(id) ON DELETE CASCADE,
  hs_code               TEXT,
  cdf                   TEXT,
  regulation_status     TEXT CHECK (regulation_status IN ('REGULATED', 'NON-REGULATED', 'UNKNOWN')),
  standardized_name     TEXT,
  confidence_score      NUMERIC(4,3),
  ai_model              TEXT,
  raw_ai_response       JSONB,
  classified_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.classification_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own classification results"
  ON public.classification_results FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.invoice_runs ir
    WHERE ir.id = run_id AND ir.user_id = auth.uid()
  ));

-- ============================================================
-- 8. AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   UUID,
  metadata    JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs"
  ON public.audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('admin', 'superadmin')
  ));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT WITH CHECK (true);

-- ============================================================
-- 9. TRIGGER: Auto-create profile + subscription on signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    user_type,
    business_type,
    company_name,
    company_name_ar,
    cr_number,
    vat_number,
    phone,
    broker_license_no,
    fasah_id,
    primary_port,
    industry_sector,
    transport_license_no,
    monthly_volume,
    role
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'individual'),
    COALESCE(NEW.raw_user_meta_data->>'business_type', 'individual'),
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'company_name_ar',
    NEW.raw_user_meta_data->>'cr_number',
    NEW.raw_user_meta_data->>'vat_number',
    NEW.raw_user_meta_data->>'phone',
    NEW.raw_user_meta_data->>'broker_license_no',
    NEW.raw_user_meta_data->>'fasah_id',
    NEW.raw_user_meta_data->>'primary_port',
    NEW.raw_user_meta_data->>'industry_sector',
    NEW.raw_user_meta_data->>'transport_license_no',
    NEW.raw_user_meta_data->>'monthly_volume',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      user_type = EXCLUDED.user_type,
      business_type = EXCLUDED.business_type,
      company_name = EXCLUDED.company_name,
      company_name_ar = EXCLUDED.company_name_ar,
      cr_number = EXCLUDED.cr_number,
      vat_number = EXCLUDED.vat_number,
      phone = EXCLUDED.phone,
      broker_license_no = EXCLUDED.broker_license_no,
      fasah_id = EXCLUDED.fasah_id,
      primary_port = EXCLUDED.primary_port,
      industry_sector = EXCLUDED.industry_sector,
      transport_license_no = EXCLUDED.transport_license_no,
      monthly_volume = EXCLUDED.monthly_volume,
      updated_at = NOW();

  INSERT INTO public.subscriptions (user_id, plan, monthly_limit)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.raw_user_meta_data->>'business_type' IN ('customs_broker', 'freight_forwarder') THEN 'enterprise'
      WHEN NEW.raw_user_meta_data->>'business_type' = 'importer_exporter' THEN 'pro'
      ELSE 'free'
    END,
    CASE
      WHEN NEW.raw_user_meta_data->>'business_type' IN ('customs_broker', 'freight_forwarder') THEN 999999
      WHEN NEW.raw_user_meta_data->>'business_type' = 'importer_exporter' THEN 50
      ELSE 5
    END
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 10. INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoice_runs_user ON public.invoice_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_invoice_runs_status ON public.invoice_runs(status);
CREATE INDEX IF NOT EXISTS idx_line_items_run ON public.invoice_line_items(run_id);
CREATE INDEX IF NOT EXISTS idx_classification_run ON public.classification_results(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
