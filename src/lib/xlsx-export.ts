/**
 * Excel download helpers.
 * Uses SheetJS (xlsx) for reliable .xlsx binary generation.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx') as typeof import('xlsx');

/**
 * Build a .xlsx Blob.
 * Row 1 = header; subsequent rows = data.
 * (Cell-level style support requires SheetJS Pro; community edition produces
 * a valid, warning-free .xlsx without per-cell colour/bold.)
 */
export function styledXlsx(headers: string[], rows: string[][]): Blob {
  const data = [headers, ...rows.filter((r) => r.some((c) => c !== ''))];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf: ArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Safe client-side file download trigger. */
export function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 5000);
}
