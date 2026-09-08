import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { classifyItemsBatch, type ClassifyItemInput } from '@/lib/ai/nvidia-nim-classifier';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Check subscription limits
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!subscription || subscription.status !== 'active') {
      return NextResponse.json({ error: 'No active subscription' }, { status: 403 });
    }

    if (
      subscription.plan !== 'enterprise' &&
      subscription.invoices_used >= subscription.monthly_limit
    ) {
      return NextResponse.json(
        { error: 'Monthly invoice limit reached. Please upgrade your plan.' },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { runId, items } = body as {
      runId: string;
      items: ClassifyItemInput[];
    };

    if (!runId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing runId or items' }, { status: 400 });
    }

    // Verify the run belongs to this user
    const { data: run } = await supabase
      .from('invoice_runs')
      .select('id, user_id')
      .eq('id', runId)
      .eq('user_id', user.id)
      .single();

    if (!run) return NextResponse.json({ error: 'Invoice run not found' }, { status: 404 });

    // Update run status to processing
    await supabase
      .from('invoice_runs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', runId);

    // Run batch classification
    const model = process.env.NVIDIA_NIM_MODEL || 'nvidia/llama-3.1-nemotron-70b-instruct';
    const classifications = await classifyItemsBatch(items, 5);

    // Fetch line items for this run to get their IDs
    const { data: lineItems } = await supabase
      .from('invoice_line_items')
      .select('id, row_index')
      .eq('run_id', runId)
      .order('row_index');

    // Insert classification results
    if (lineItems && lineItems.length > 0) {
      const classificationInserts = lineItems.map((li, idx) => {
        const c = classifications[idx];
        return {
          line_item_id: li.id,
          run_id: runId,
          hs_code: c?.hsCode,
          cdf: c?.cdf,
          regulation_status: c?.regulationStatus,
          standardized_name: c?.standardizedZatcaName,
          confidence_score: c?.confidenceScore,
          ai_model: model,
          raw_ai_response: c as unknown as Record<string, unknown>,
        };
      });

      await supabase
        .from('classification_results')
        .upsert(classificationInserts, { onConflict: 'line_item_id' });
    }

    // Update run to completed
    await supabase
      .from('invoice_runs')
      .update({
        status: 'completed',
        processed_items: classifications.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', runId);

    // Increment invoice usage count
    await supabase
      .from('subscriptions')
      .update({
        invoices_used: subscription.invoices_used + 1,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    // Write audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'invoice_classified',
      entity_type: 'invoice_run',
      entity_id: runId,
      metadata: { items: items.length, model },
    });

    return NextResponse.json({
      success: true,
      classifications,
      total: classifications.length,
    });
  } catch (err: unknown) {
    console.error('Classification error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Classification failed' },
      { status: 500 }
    );
  }
}
