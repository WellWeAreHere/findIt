import './globals.css';
import { SessionProvider } from '@/components/SessionProvider';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: { default: 'FindIt - Campus Lost & Found', template: '%s · FindIt' },
  description: 'Report lost and found items on campus, discover potential matches and claim what is yours.',
};

export const viewport = { themeColor: '#2546ea' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <SessionProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
        </SessionProvider>
      </body>
    </html>
  );
}
