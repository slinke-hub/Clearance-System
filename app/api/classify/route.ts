import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/session';
import {
  classifyItemsBatch,
  isNvidiaNimConfigured,
  type ClassifyItemInput,
} from '@/lib/ai/nvidia-nim-classifier';
import { mockStore } from '@/lib/mock/store';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { runId, items } = body as {
      runId: string;
      items: ClassifyItemInput[];
    };

    if (!runId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Missing runId or items' }, { status: 400 });
    }

    if (!isNvidiaNimConfigured()) {
      return NextResponse.json(
        { error: 'AI classification is not configured for this deployment.' },
        { status: 503 }
      );
    }

    // Check subscription limits if not admin/enterprise
    if (user.role !== 'admin' && user.plan !== 'enterprise') {
      try {
        const supabase = await createClient();
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (
          subscription &&
          subscription.status === 'active' &&
          subscription.invoices_used >= subscription.monthly_limit
        ) {
          return NextResponse.json(
            { error: 'Monthly invoice limit reached. Please upgrade your plan.' },
            { status: 429 }
          );
        }
      } catch {}
    }

    // Run batch classification
    const model = process.env.NVIDIA_NIM_MODEL || 'moonshotai/kimi-k3';
    const classifications = await classifyItemsBatch(items, 5);

    // Update mockStore for resilient offline/dev access
    classifications.forEach((c, idx) => {
      mockStore.updateClassification(runId, items[idx].rowIndex ?? idx, {
        hs_code: c?.hsCode,
        cdf: c?.cdf,
        regulation_status: c?.regulationStatus,
        standardized_name: c?.standardizedZatcaName,
        confidence_score: c?.confidenceScore ?? null,
        classified_at: new Date().toISOString(),
      });
    });

    const mockRun = mockStore.getRun(runId);
    if (mockRun) {
      mockRun.status = 'completed';
      mockRun.processed_items = classifications.length;
    }

    // Also persist to Supabase if connected
    try {
      const supabase = await createClient();
      const { data: lineItems } = await supabase
        .from('invoice_line_items')
        .select('id, row_index')
        .eq('run_id', runId)
        .order('row_index');

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

      await supabase
        .from('invoice_runs')
        .update({
          status: 'completed',
          processed_items: classifications.length,
          updated_at: new Date().toISOString(),
        })
        .eq('id', runId);

      await supabase.from('audit_logs').insert({
        user_id: user.id,
        action: 'invoice_classified',
        entity_type: 'invoice_run',
        entity_id: runId,
        metadata: { items: items.length, model },
      });
    } catch {
      // Supabase offline/mock mode — mockStore handled it
    }

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
