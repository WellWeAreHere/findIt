export const metadata = {
  title: 'FindIt - Campus Lost & Found',
  description: 'Report, search and recover lost items across campus.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
