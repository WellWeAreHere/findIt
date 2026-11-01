// report_activity: append-only event history per report.
import { Int32 } from 'mongodb';
import { collection } from '../../db/mongo.js';

const col = () => collection('report_activity');

export async function log(reportId, event, actorId = null, data = undefined) {
  await (await col()).insertOne({
    report_id: new Int32(reportId),
    event,
    actor_id: actorId === null ? null : new Int32(actorId),
    at: new Date(),
    ...(data && { data }),
  });
}

// Activity is a nice-to-have: never fail the user's request because of it.
export function logQuietly(...args) {
  return log(...args).catch((err) => console.warn('[activity] not recorded:', err.message));
}

export async function forReport(reportId, limit = 20) {
  return (await col()).find({ report_id: reportId }, { projection: { _id: 0 } })
    .sort({ at: -1 }).limit(limit).toArray();
}

export async function recent(limit = 15) {
  return (await col()).find({ event: { $ne: 'VIEWED' } }, { projection: { _id: 0 } })
    .sort({ at: -1 }).limit(limit).toArray();
}
