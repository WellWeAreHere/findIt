// Temporary home page for Part 2 (backend). Replaced by the real landing
// page in Part 3.
export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 32 }}>
      <h1>FindIt API</h1>
      <p>The backend is running. Try <a href="/api/reports/recent">/api/reports/recent</a> or <a href="/api/catalog">/api/catalog</a>.</p>
    </main>
  );
}
