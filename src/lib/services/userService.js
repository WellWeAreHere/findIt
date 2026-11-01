import * as users from '../repositories/users.js';
import * as reportsRepo from '../repositories/reports.js';
import * as claimsRepo from '../repositories/claims.js';
import * as matchesRepo from '../repositories/matches.js';
import { inbox } from './notificationService.js';
import { badRequest, notFound } from '../errors.js';

export const list = (search) => users.listWithActivity({ search });

export async function update(admin, userId, changes) {
  if (userId === admin.user_id && (changes.is_active === false || changes.role === 'STUDENT')) {
    throw badRequest('You cannot deactivate or demote your own account');
  }
  const target = await users.findById(userId);
  if (!target) throw notFound('User not found');
  if (changes.role === 'STUDENT' && !target.srn) throw badRequest('This user has no SRN, so they cannot become a student');
  await users.update(userId, changes);
  return users.findById(userId);
}

// Everything the student dashboard needs, in parallel.
export async function dashboard(user) {
  const [myReports, matches, myClaims, incomingClaims, notifications] = await Promise.all([
    reportsRepo.forUser(user.user_id),          // CALL sp_reports_by_user
    matchesRepo.forUser(user.user_id),
    claimsRepo.forClaimant(user.user_id),
    claimsRepo.onFinderReports(user.user_id),
    inbox(user.user_id, { limit: 10 }),
  ]);
  return {
    lost: myReports.filter((r) => r.report_type === 'LOST'),
    found: myReports.filter((r) => r.report_type === 'FOUND'),
    matches,
    claims: myClaims,
    incomingClaims,
    notifications,
  };
}
