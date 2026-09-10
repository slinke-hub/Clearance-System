BEGIN;

-- Provision the plans already defined by the registration flow. This dedicated
-- trigger also works on databases that do not have the original profile trigger.
CREATE OR REPLACE FUNCTION public.provision_registration_subscription()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
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
  ) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_registration_subscription() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_subscription_created ON auth.users;
CREATE TRIGGER on_auth_user_subscription_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.provision_registration_subscription();

-- Repair missing records without changing existing plans, status or usage.
INSERT INTO public.subscriptions (user_id, plan, status, monthly_limit)
SELECT u.id,
  CASE
    WHEN u.raw_user_meta_data->>'business_type' IN ('customs_broker', 'freight_forwarder') THEN 'enterprise'
    WHEN u.raw_user_meta_data->>'business_type' = 'importer_exporter' THEN 'pro'
    ELSE 'free'
  END,
  'active',
  CASE
    WHEN u.raw_user_meta_data->>'business_type' IN ('customs_broker', 'freight_forwarder') THEN 999999
    WHEN u.raw_user_meta_data->>'business_type' = 'importer_exporter' THEN 50
    ELSE 5
  END
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
