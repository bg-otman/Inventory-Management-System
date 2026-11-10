import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Inventory — Stock et comptes',
  description: 'Une vue claire de votre stock, de vos factures et de vos soldes.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
