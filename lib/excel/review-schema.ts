import { z } from 'zod';
const text = z.string().max(4000);
export const reviewSchema = z.object({ runId: z.string().uuid(), mapping: z.record(z.string(), text),
  items: z.array(z.object({ rowIndex: z.number().int().nonnegative(), itemName: text.trim().min(1), itemDescription: text,
    itemCode: text, unit: text, contract: text, quantity: text, unitPrice: text, totalPrice: text, currency: text })).min(1).max(2000),
});
