import { AppState, Doc } from './types';
export function printInvoice(_s: AppState, d: Doc) {
  window.open(
    '/api/v1/invoices/' + encodeURIComponent(d.id) + '/print',
    '_blank',
    'noopener,noreferrer',
  );
}
export function printReceipt(id: string) {
  window.open(
    '/api/v1/receipts/' + encodeURIComponent(id) + '/print',
    '_blank',
    'noopener,noreferrer',
  );
}
