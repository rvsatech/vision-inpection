import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans-condensed/500.css';
import '@fontsource/ibm-plex-sans-condensed/600.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/auth';

export const metadata: Metadata = {
  title: { default: 'Vision Inspect — inspeção visual industrial', template: '%s · Vision Inspect' },
  description:
    'Visão computacional para pequenas indústrias: inspeção de qualidade, conformidade de EPI e contagem de objetos a partir de câmeras e fotos da linha.',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#0f4c5c', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
