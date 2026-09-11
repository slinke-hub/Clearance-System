import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/session';
import { loadInvoice } from '@/lib/invoices';
import { invoiceReport } from '@/lib/invoices/report';
import { InvoiceResults } from '@/components/invoices/InvoiceResults';

export default async function InvoiceResultsPage({ params, searchParams }: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const { runId } = await params;
  if (!z.string().uuid().safeParse(runId).success) notFound();
  const invoice = await loadInvoice(runId, user.id);
  if (!invoice) notFound();
  const { item } = await searchParams;
  return <InvoiceResults report={invoiceReport(invoice.run, invoice.items)} initialItem={item} />;
}
