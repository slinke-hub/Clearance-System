-- ============================================================
-- 002_admin_user.sql: Confirm & Promote Admin (privatepple@gmail.com)
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. Confirm email in auth.users so Supabase allows instant login
UPDATE auth.users
SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
WHERE email = 'privatepple@gmail.com';

-- 2. Ensure user exists in public.profiles and is assigned 'admin' role
INSERT INTO public.profiles (
  id,
  email,
  full_name,
  user_type,
  role,
  language_pref
)
SELECT
  id,
  email,
  'Admin User',
  'enterprise',
  'admin',
  'en'
FROM auth.users
WHERE email = 'privatepple@gmail.com'
ON CONFLICT (id) DO UPDATE
SET role = 'admin',
    user_type = 'enterprise',
    updated_at = NOW();

-- 3. Ensure enterprise subscription with unlimited invoices
INSERT INTO public.subscriptions (
  user_id,
  plan,
  status,
  monthly_limit
)
SELECT
  id,
  'enterprise',
  'active',
  999999
FROM auth.users
WHERE email = 'privatepple@gmail.com'
ON CONFLICT (user_id) DO UPDATE
SET plan = 'enterprise',
    status = 'active',
    monthly_limit = 999999,
    updated_at = NOW();
