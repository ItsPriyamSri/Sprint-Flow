import type { Metadata } from 'next';
import { Providers } from '@/providers/Providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'SprintFlow',
  description: 'Turn your Excel workbook into a live Scrum board.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
