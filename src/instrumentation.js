// Runs once when the Next.js server starts. The runtime check must wrap
// the import so the edge bundle never includes the database drivers.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation-node.js');
  }
}
