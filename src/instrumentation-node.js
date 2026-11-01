// Node.js-only startup: retry any MongoDB writes left in the outbox and
// keep reconciling every few minutes.
import { startBackgroundReconciler } from './lib/services/syncService.js';

startBackgroundReconciler();
