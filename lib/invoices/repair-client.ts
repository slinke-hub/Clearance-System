export async function repairInvoiceEvidence(runId: string, rowIndexes: number[], request: typeof fetch = fetch) {
  const rows = [...new Set(rowIndexes)];
  let repaired = 0;
  for (let offset = 0; offset < rows.length; offset += 4) {
    const response = await request(`/api/invoices/${encodeURIComponent(runId)}/repair-evidence`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIndexes: rows.slice(offset, offset + 4) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not refresh the ZATCA evidence. Please retry.');
    repaired += typeof body.repaired === 'number' ? body.repaired : 0;
  }
  return repaired;
}
