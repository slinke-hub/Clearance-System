import type { Metadata } from 'next';
import './globals.css';
import { I18nProvider } from '@/lib/i18n/context';
import { Toaster } from 'sonner';

export const metadata: Metadata = {
  title: 'ClearanceIQ — KSA Customs Compliance',
  description:
    'AI-powered Saudi Arabia ZATCA customs classification system. Parse commercial invoices and get instant HS-Code classifications compliant with KSA customs regulations.',
  keywords: ['ZATCA', 'KSA customs', 'HS code', 'Saudi Arabia', 'customs clearance', 'import export'],
  authors: [{ name: 'ClearanceIQ' }],
  openGraph: {
    title: 'ClearanceIQ — KSA Customs Compliance',
    description: 'AI-powered ZATCA HS-Code classification for Saudi Arabia customs',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className="dark" data-scroll-behavior="smooth">
      <body className="min-h-screen bg-[#0D1117] text-white antialiased">
        <I18nProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#1E2438',
                border: '1px solid #2D3450',
                color: '#E8EBF0',
              },
            }}
          />
        </I18nProvider>
      </body>
    </html>
  );
}
