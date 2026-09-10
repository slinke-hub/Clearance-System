ALTER TABLE public.invoice_runs ADD COLUMN IF NOT EXISTS invoice_metadata JSONB NOT NULL DEFAULT '{"charges": []}';
ALTER TABLE public.invoice_runs ADD COLUMN IF NOT EXISTS source_rows JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.invoice_runs ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS item_code TEXT;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS unit TEXT;
ALTER TABLE public.invoice_line_items ADD COLUMN IF NOT EXISTS contract TEXT;

-- Save reviewed rows together so exports never mix old and new mappings.
CREATE OR REPLACE FUNCTION public.save_invoice_review(target_run UUID, reviewed_items JSONB, mapping JSONB)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  PERFORM 1 FROM invoice_runs WHERE id = target_run AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  DELETE FROM invoice_line_items WHERE run_id = target_run;
  INSERT INTO invoice_line_items (id, run_id, row_index, item_name, item_description, item_code, unit, contract, quantity, unit_price, total_price, currency, raw_data)
  SELECT id, target_run, row_index, item_name, item_description, item_code, unit, contract, quantity, unit_price, total_price, currency, raw_data
  FROM jsonb_to_recordset(reviewed_items) AS x(id UUID, row_index INTEGER, item_name TEXT, item_description TEXT, item_code TEXT, unit TEXT, contract TEXT, quantity TEXT, unit_price TEXT, total_price TEXT, currency TEXT, raw_data JSONB);
  UPDATE invoice_runs SET column_mapping = mapping, total_items = jsonb_array_length(reviewed_items), processed_items = 0, status = 'pending', reviewed_at = NOW(), updated_at = NOW() WHERE id = target_run;
END;
$$;
REVOKE ALL ON FUNCTION public.save_invoice_review(UUID, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_invoice_review(UUID, JSONB, JSONB) TO authenticated;

CREATE POLICY "Users can insert own classification results" ON public.classification_results
FOR INSERT TO authenticated WITH CHECK (EXISTS (
  SELECT 1 FROM public.invoice_line_items li JOIN public.invoice_runs r ON r.id = li.run_id
  WHERE li.id = line_item_id AND r.id = classification_results.run_id AND r.user_id = auth.uid()
));
CREATE POLICY "Users can update own classification results" ON public.classification_results
FOR UPDATE TO authenticated USING (EXISTS (
  SELECT 1 FROM public.invoice_runs r WHERE r.id = classification_results.run_id AND r.user_id = auth.uid()
)) WITH CHECK (EXISTS (
  SELECT 1 FROM public.invoice_line_items li JOIN public.invoice_runs r ON r.id = li.run_id
  WHERE li.id = line_item_id AND r.id = classification_results.run_id AND r.user_id = auth.uid()
));
