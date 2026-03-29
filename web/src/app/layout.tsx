import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Purroxy',
  description: 'Record what you do on any website. Securely automate it forever.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="purroxy-light">
      <body className="bg-base-100 text-base-content antialiased">{children}</body>
    </html>
  );
}
