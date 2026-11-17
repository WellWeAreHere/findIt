// Ownership claims. Validation of who may claim what lives in the database
// (trg_claims_bi); approval/rejection are the transactional stored
// procedures sp_approve_claim / sp_reject_claim.
import { transaction, withConnection } from '../db/mysql.js';
import * as claims from '../repositories/claims.js';
import * as reports from '../repositories/reports.js';
import * as activity from '../repositories/mongo/activity.js';
import { notifyMany } from './notificationService.js';
import { conflict, forbidden, notFound } from '../errors.js';

export async function submit(student, { report_id, lost_report_id, claim_description }) {
  const report = await reports.findCard(report_id);
  if (!report) throw notFound('Item not found');

  const claimId = await transaction(async (conn) => {
    const [locked] = await conn.execute('SELECT status FROM reports WHERE report_id = ? FOR UPDATE', [report_id]);
    if (!locked.length || locked[0].status !== 'OPEN') throw conflict('This item is no longer open for claims');
    const [approved] = await conn.execute("SELECT claim_id FROM claims WHERE report_id = ? AND status = 'APPROVED'", [report_id]);
    if (approved.length) throw conflict('A claim for this item has already been approved');
    // The trigger checks: FOUND + OPEN report, not the finder, active
    // student, linked report is the claimant's own LOST report.
    const id = await claims.insert(conn, { report_id, claimant_id: student.user_id, lost_report_id, claim_description });
    await notifyMany(conn, [{
      user_id: report.user_id, related_report_id: report_id, notification_type: 'CLAIM_RECEIVED',
      message: `Someone has claimed the ${report.item_name} you found. Review it in your claims.`,
    }]);
    return id;
  }, { userId: student.user_id });

  activity.logQuietly(report_id, 'CLAIM_SUBMITTED', student.user_id, { claim_id: claimId });
  return { claim_id: claimId, status: 'PENDING' };
}

export async function decideByFinder(finder, claimId, decision) {
  const claim = await claims.findById(claimId);
  if (!claim) throw notFound('Claim not found');
  if (claim.finder_id !== finder.user_id) throw forbidden('Only the finder can decide this claim');
  await transaction(async (conn) => {
    const [reportsLocked] = await conn.execute('SELECT status FROM reports WHERE report_id = ? AND user_id = ? FOR UPDATE', [claim.report_id, finder.user_id]);
    if (!reportsLocked.length) throw forbidden('Only the finder can decide this claim');
    const [rows] = await conn.execute('SELECT status, claimant_id FROM claims WHERE claim_id = ? FOR UPDATE', [claimId]);
    if (!rows.length || rows[0].status !== 'PENDING') throw conflict('Only pending claims can be decided');
    if (decision === 'approve' && reportsLocked[0].status !== 'OPEN') throw conflict('This item is no longer open for claims');
    if (decision === 'approve') {
      const [others] = await conn.execute("SELECT claim_id, claimant_id FROM claims WHERE report_id = ? AND status = 'PENDING' AND claim_id <> ? FOR UPDATE", [claim.report_id, claimId]);
      await conn.execute("UPDATE claims SET status = 'REJECTED', reviewed_by = ?, reviewed_at = NOW(), review_note = 'Another claim was approved' WHERE report_id = ? AND status = 'PENDING' AND claim_id <> ?", [finder.user_id, claim.report_id, claimId]);
      await notifyMany(conn, others.map((c) => ({ user_id: c.claimant_id, related_report_id: claim.report_id, notification_type: 'CLAIM_REJECTED', message: 'Your claim was not approved because another claim was accepted.' })));
    }
    const status = decision === 'approve' ? 'APPROVED' : 'REJECTED';
    await conn.execute('UPDATE claims SET status = ?, reviewed_by = ?, reviewed_at = NOW() WHERE claim_id = ?', [status, finder.user_id, claimId]);
    await notifyMany(conn, [{ user_id: rows[0].claimant_id, related_report_id: claim.report_id, notification_type: decision === 'approve' ? 'CLAIM_APPROVED' : 'CLAIM_REJECTED', message: decision === 'approve' ? `The finder approved your claim. Find their email in My claims.` : 'The finder did not approve your claim.' }]);
  }, { userId: finder.user_id });
  activity.logQuietly(claim.report_id, 'CLAIM_DECIDED', finder.user_id, { claim_id: claimId, status: decision === 'approve' ? 'APPROVED' : 'REJECTED' });
}

export async function withdraw(student, claimId) {
  const claim = await claims.findById(claimId);
  if (!claim || claim.claimant_id !== student.user_id) throw notFound('Claim not found');
  const changed = await withConnection((conn) => claims.withdraw(conn, claimId, student.user_id), { userId: student.user_id });
  if (!changed) throw conflict('Only pending claims can be withdrawn');
  activity.logQuietly(claim.report_id, 'CLAIM_DECIDED', student.user_id, { claim_id: claimId, status: 'WITHDRAWN' });
}

export async function approve(admin, claimId, note) {
  throw forbidden('Claims are decided by the person who reported the item found');
}

export async function reject(admin, claimId, note) {
  throw forbidden('Claims are decided by the person who reported the item found');
}

export const mine = (userId) => claims.forClaimant(userId);
export const onMyFoundItems = (userId) => claims.onFinderReports(userId);
export const pendingQueue = () => claims.pendingQueue();
export const recentDecisions = () => claims.decided();
