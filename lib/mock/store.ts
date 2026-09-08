import type { ClassificationResult } from '@/types';

type MockClassification = Partial<
  Pick<
    ClassificationResult,
    | 'hs_code'
    | 'cdf'
    | 'regulation_status'
    | 'standardized_name'
    | 'confidence_score'
    | 'classified_at'
  >
>;

export interface MockRun {
  id: string;
  user_id: string;
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_items: number;
  processed_items: number;
  column_mapping: Record<string, string>;
  created_at: string;
}

export interface MockLineItem {
  id: string;
  run_id: string;
  row_index: number;
  item_name?: string | null;
  item_description?: string | null;
  quantity?: string | null;
  unit_price?: string | null;
  total_price?: string | null;
  currency?: string | null;
  classification?: MockClassification;
}

// In-memory store for development/demo mode
class MemoryStore {
  private runs = new Map<string, MockRun>();
  private lineItems = new Map<string, MockLineItem[]>();

  saveRun(run: MockRun) {
    this.runs.set(run.id, run);
  }

  getRun(id: string): MockRun | undefined {
    return this.runs.get(id);
  }

  saveLineItems(runId: string, items: MockLineItem[]) {
    this.lineItems.set(runId, items);
  }

  getLineItems(runId: string): MockLineItem[] {
    return this.lineItems.get(runId) || [];
  }

  updateClassification(runId: string, rowIndex: number, classification: MockClassification) {
    const items = this.lineItems.get(runId);
    if (items) {
      const item = items.find((i) => i.row_index === rowIndex);
      if (item) {
        item.classification = classification;
      }
    }
  }
}

export const mockStore = new MemoryStore();
