// Ownership claims. Validation of who may claim what lives in the database
// (trg_claims_bi); approval/rejection are the transactional stored
// procedures sp_approve_claim / sp_reject_claim.
import { transaction, withConnection } from '../db/mysql.js';
import * as claims from '../repositories/claims.js';
import * as reports from '../repositories/reports.js';
import * as activity from '../repositories/mongo/activity.js';
import { notifyMany } from './notificationService.js';
import { conflict, notFound } from '../errors.js';

export async function submit(student, { report_id, lost_report_id, claim_description }) {
  const report = await reports.findCard(report_id);
  if (!report) throw notFound('Item not found');

  const claimId = await transaction(async (conn) => {
    // The trigger checks: FOUND + OPEN report, not the finder, active
    // student, linked report is the claimant's own LOST report.
    const id = await claims.insert(conn, { report_id, claimant_id: student.user_id, lost_report_id, claim_description });
    await notifyMany(conn, [{
      user_id: report.user_id, related_report_id: report_id, notification_type: 'CLAIM_RECEIVED',
      message: `Someone has claimed the ${report.item_name} you found. An admin will verify it.`,
    }]);
    return id;
  }, { userId: student.user_id });

  activity.logQuietly(report_id, 'CLAIM_SUBMITTED', student.user_id, { claim_id: claimId });
  return { claim_id: claimId, status: 'PENDING' };
}

export async function withdraw(student, claimId) {
  const claim = await claims.findById(claimId);
  if (!claim || claim.claimant_id !== student.user_id) throw notFound('Claim not found');
  const changed = await withConnection((conn) => claims.withdraw(conn, claimId, student.user_id), { userId: student.user_id });
  if (!changed) throw conflict('Only pending claims can be withdrawn');
  activity.logQuietly(claim.report_id, 'CLAIM_DECIDED', student.user_id, { claim_id: claimId, status: 'WITHDRAWN' });
}

export async function approve(admin, claimId, note) {
  const claim = await claims.findById(claimId);
  if (!claim) throw notFound('Claim not found');
  await claims.approve(claimId, admin.user_id, note);
  activity.logQuietly(claim.report_id, 'CLAIM_DECIDED', admin.user_id, { claim_id: claimId, status: 'APPROVED' });
  return claims.findById(claimId);
}

export async function reject(admin, claimId, note) {
  const claim = await claims.findById(claimId);
  if (!claim) throw notFound('Claim not found');
  await claims.reject(claimId, admin.user_id, note);
  activity.logQuietly(claim.report_id, 'CLAIM_DECIDED', admin.user_id, { claim_id: claimId, status: 'REJECTED' });
  return claims.findById(claimId);
}

export const mine = (userId) => claims.forClaimant(userId);
export const onMyFoundItems = (userId) => claims.onFinderReports(userId);
export const pendingQueue = () => claims.pendingQueue();
export const recentDecisions = () => claims.decided();
