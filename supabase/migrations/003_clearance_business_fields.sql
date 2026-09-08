-- ============================================================
-- 003_clearance_business_fields.sql: Clearance Business Extensions
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Recover organization tables for projects created from early schema revisions.
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  logo_url TEXT,
  vat_number TEXT,
  cr_number TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
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

DROP POLICY IF EXISTS "Org members can view their org" ON public.organizations;
CREATE POLICY "Org members can view their org"
  ON public.organizations FOR SELECT
  USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Org owner can update org" ON public.organizations;
CREATE POLICY "Org owner can update org"
  ON public.organizations FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members can view their org members" ON public.org_members;
CREATE POLICY "Members can view their org members"
  ON public.org_members FOR SELECT
  USING (public.is_org_member(org_id));

DROP POLICY IF EXISTS "Org admins can manage members" ON public.org_members;
CREATE POLICY "Org admins can manage members"
  ON public.org_members FOR ALL
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

-- 1. Alter profiles table with clearance client fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT 'individual' 
    CHECK (business_type IN ('customs_broker', 'importer_exporter', 'freight_forwarder', 'individual')),
  ADD COLUMN IF NOT EXISTS company_name_ar TEXT,
  ADD COLUMN IF NOT EXISTS cr_number TEXT,
  ADD COLUMN IF NOT EXISTS broker_license_no TEXT,
  ADD COLUMN IF NOT EXISTS fasah_id TEXT,
  ADD COLUMN IF NOT EXISTS primary_port TEXT,
  ADD COLUMN IF NOT EXISTS industry_sector TEXT,
  ADD COLUMN IF NOT EXISTS transport_license_no TEXT,
  ADD COLUMN IF NOT EXISTS monthly_volume TEXT;

-- 2. Alter organizations table with additional commercial attributes
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS company_name_ar TEXT,
  ADD COLUMN IF NOT EXISTS broker_license_no TEXT,
  ADD COLUMN IF NOT EXISTS fasah_id TEXT,
  ADD COLUMN IF NOT EXISTS primary_port TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT;

-- 3. Update handle_new_user trigger to populate extended metadata
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

  -- Create default subscription
  INSERT INTO public.subscriptions (user_id, plan, status, monthly_limit)
  VALUES (
    NEW.id,
    CASE 
      WHEN NEW.raw_user_meta_data->>'business_type' IN ('customs_broker', 'freight_forwarder') THEN 'enterprise'
      WHEN NEW.raw_user_meta_data->>'business_type' = 'importer_exporter' THEN 'pro'
      ELSE 'free'
    END,
    'active',
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
