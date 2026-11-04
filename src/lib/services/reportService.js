// Report lifecycle: create, edit, close, delete, browse, detail, images.
import { transaction } from '../db/mysql.js';
import * as reports from '../repositories/reports.js';
import * as claims from '../repositories/claims.js';
import * as outbox from '../repositories/outbox.js';
import * as itemDetails from '../repositories/mongo/itemDetails.js';
import * as activity from '../repositories/mongo/activity.js';
import { resolveItem, resolveLocation, sanitizeCharacteristics } from './catalogService.js';
import { buildPayload, pushReport } from './syncService.js';
import * as matchingService from './matchingService.js';
import { deleteImage, saveImage } from './uploadService.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { isAdmin } from '../auth/roles.js';

function assertNotFuture(date) {
  const today = new Date().toISOString().slice(0, 10);
  if (date > today) throw badRequest('The date cannot be in the future', { report_date: 'Date cannot be in the future' });
}

async function syncAndMatch(reportId) {
  const synced = await pushReport(reportId);
  let matching = { stored: 0 };
  if (synced) {
    matching = await matchingService.runForReport(reportId)
      .catch((err) => { console.warn(`[matching] report ${reportId}:`, err.message); return { stored: 0 }; });
  }
  return { synced, matchesFound: matching.stored };
}

export async function create(user, input) {
  assertNotFuture(input.report_date);
  const item = await resolveItem(input.item_id);
  const location = await resolveLocation(input.location_id);
  if (input.custody_location_id) await resolveLocation(input.custody_location_id, 'custody_location_id');
  const characteristics = await sanitizeCharacteristics(item.category_id, input.characteristics);

  // One MySQL transaction: the report (authoritative) + the outbox entry
  // describing the MongoDB document it needs.
  const reportId = await transaction(async (conn) => {
    const id = await reports.insert(conn, { ...input, user_id: user.user_id });
    await outbox.enqueue(conn, id, 'UPSERT', buildPayload({
      reportId: id, report: input, item, location, description: input.description, characteristics,
    }));
    return id;
  }, { userId: user.user_id });

  const result = await syncAndMatch(reportId);
  activity.logQuietly(reportId, 'CREATED', user.user_id);
  return { report_id: reportId, ...result };
}

async function loadOwned(user, reportId, { allowAdmin = true } = {}) {
  const card = await reports.findCard(reportId);
  if (!card) throw notFound('Report not found');
  if (card.user_id !== user.user_id && !(allowAdmin && isAdmin(user))) throw forbidden('You can only change your own reports');
  return card;
}

export async function update(user, reportId, input) {
  const card = await loadOwned(user, reportId, { allowAdmin: false });
  if (card.status !== 'OPEN') throw conflict('Only open reports can be edited');

  const date = input.report_date ?? card.report_date;
  assertNotFuture(date);
  const item = await resolveItem(input.item_id ?? card.item_id);
  const location = await resolveLocation(input.location_id ?? card.location_id);
  const custody = input.custody_location_id === undefined ? card.custody_location_id : input.custody_location_id;
  if (custody) {
    if (card.report_type !== 'FOUND') throw badRequest('Only found items have a custody location');
    await resolveLocation(custody, 'custody_location_id');
  }

  const current = await itemDetails.findOne(reportId);
  const description = input.description ?? current?.description;
  if (!description) throw conflict('Report details are still syncing. Try again in a moment.');
  const characteristics = input.characteristics !== undefined || input.item_id !== undefined
    ? await sanitizeCharacteristics(item.category_id, input.characteristics ?? current?.characteristics ?? {})
    : current.characteristics;

  await transaction(async (conn) => {
    const locked = await reports.lockForUpdate(conn, reportId);
    if (locked.status !== 'OPEN') throw conflict('Only open reports can be edited');
    await reports.update(conn, reportId, { ...input, custody_location_id: custody });
    await outbox.enqueue(conn, reportId, 'UPSERT', buildPayload({
      reportId,
      report: { report_type: card.report_type, report_date: date },
      item, location, description, characteristics,
      createdAt: current?.created_at ? new Date(current.created_at).toISOString() : undefined,
    }));
  }, { userId: user.user_id });

  const result = await syncAndMatch(reportId);
  activity.logQuietly(reportId, 'EDITED', user.user_id, { fields: Object.keys(input) });
  return { report_id: reportId, ...result };
}

export async function close(user, reportId) {
  const card = await loadOwned(user, reportId);
  if (card.status !== 'OPEN') throw conflict('This report is already closed or resolved');
  await transaction(async (conn) => {
    const locked = await reports.lockForUpdate(conn, reportId);
    if (locked.status !== 'OPEN') throw conflict('This report is already closed or resolved');
    await reports.setStatus(conn, reportId, 'CLOSED');
  }, { userId: user.user_id });
  activity.logQuietly(reportId, 'STATUS_CHANGED', user.user_id, { status: 'CLOSED' });
}

export async function remove(user, reportId) {
  await loadOwned(user, reportId);
  if (await reports.countClaims(reportId)) {
    throw conflict('This report has claims and is part of the record. Close it instead of deleting it.');
  }
  const doc = await itemDetails.findOne(reportId).catch(() => null);
  await transaction(async (conn) => {
    await reports.remove(conn, reportId); // matches cascade
    await outbox.enqueue(conn, reportId, 'DELETE');
  }, { userId: user.user_id });
  await pushReport(reportId);
  for (const image of doc?.images ?? []) await deleteImage(image.file);
}

// ------------------------------------------------------------ reading

// Internal sync bookkeeping is not shown in public listings.
const publicCard = ({ mongo_sync_status, ...card }) => card;

async function attachDetails(cards) {
  const docs = await itemDetails.findMany(cards.map((c) => c.report_id), {
    _id: 0, report_id: 1, characteristics: 1, images: { $slice: 1 },
  }).catch(() => []);
  const byId = new Map(docs.map((d) => [d.report_id, d]));
  return cards.map((c) => ({
    ...publicCard(c),
    characteristics: byId.get(c.report_id)?.characteristics ?? {},
    thumbnail: byId.get(c.report_id)?.images?.[0]?.file ?? null,
  }));
}

// Keyword search uses the MongoDB text index for relevance; all
// structured filters are applied in MySQL, which owns status and dates.
export async function browse(filters) {
  if (filters.q) {
    const hits = await itemDetails.textSearch(filters.q, { reportType: filters.type, limit: 300 });
    if (!hits.length) return { items: [], total: 0, page: filters.page, pageSize: filters.pageSize };
    const rank = new Map(hits.map((h, i) => [h.report_id, i]));
    const allowed = await reports.filterIds({ ...filters, ids: hits.map((h) => h.report_id) });
    const ordered = filters.sort === 'relevance' || !filters.sort || filters.sort === 'newest'
      ? allowed.sort((a, b) => rank.get(a) - rank.get(b))
      : allowed;
    const pageIds = ordered.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize);
    const cards = await reports.cardsByIds(pageIds);
    const byId = new Map(cards.map((c) => [c.report_id, c]));
    const pageCards = pageIds.map((id) => byId.get(id));
    if (filters.sort === 'oldest') pageCards.sort((a, b) => a.report_date.localeCompare(b.report_date));
    return { items: await attachDetails(pageCards), total: allowed.length, page: filters.page, pageSize: filters.pageSize };
  }
  const { rows, total } = await reports.browse(filters);
  return { items: await attachDetails(rows), total, page: filters.page, pageSize: filters.pageSize };
}

export async function recent(limit = 8) {
  return attachDetails(await reports.recent(limit));
}


export async function detail(viewer, reportId) {
  const card = await reports.findCard(reportId);
  if (!card) throw notFound('Report not found');
  const [doc, history] = await Promise.all([
    itemDetails.findOne(reportId).catch(() => null),
    activity.forReport(reportId, 15).catch(() => []),
  ]);
  const isOwner = viewer?.user_id === card.user_id;
  const canSeeMatches = isOwner || isAdmin(viewer);
  const [matchList, claimList, linkedClaims] = await Promise.all([
    canSeeMatches ? matchingService.forReport(reportId) : null,
    canSeeMatches ? claims.forReport(reportId) : null,
    isOwner || isAdmin(viewer) ? reports.countClaims(reportId) : null,
  ]);

  let claimContext = null;
  if (viewer && viewer.role === 'STUDENT' && !isOwner && card.report_type === 'FOUND' && card.status === 'OPEN') {
    const mine = await claims.forClaimant(viewer.user_id);
    claimContext = {
      canClaim: !mine.some((c) => c.report_id === reportId),
      existingClaim: mine.find((c) => c.report_id === reportId) ?? null,
      myOpenLostReports: await reports.openLostForUser(viewer.user_id),
    };
  }

  if (viewer && !isOwner) activity.logQuietly(reportId, 'VIEWED', viewer.user_id);

  return {
    report: canSeeMatches ? card : publicCard(card),
    details: doc ? {
      description: doc.description, characteristics: doc.characteristics,
      search_tags: doc.search_tags, images: doc.images ?? [],
    } : null,
    detailsSyncing: !doc,
    activity: history.filter((h) => h.event !== 'VIEWED'),
    matches: matchList,
    matchCount: canSeeMatches ? matchList.length : undefined,
    claims: claimList,
    isOwner,
    canDelete: linkedClaims === 0,
    claimContext,
  };
}

export async function myReports(userId) {
  return reports.forUser(userId); // sp_reports_by_user
}

// ------------------------------------------------------------ images

export async function addImage(user, reportId, file) {
  const card = await loadOwned(user, reportId, { allowAdmin: false });
  if (card.status !== 'OPEN') throw conflict('Images can only be added to open reports');
  const image = await saveImage(file);
  try {
    const added = await itemDetails.addImage(reportId, image);
    if (!added) throw conflict('A report can have at most 3 images');
  } catch (err) {
    await deleteImage(image.file);
    throw err;
  }
  activity.logQuietly(reportId, 'IMAGE_ADDED', user.user_id, { file: image.file });
  return image;
}

export async function removeImage(user, reportId, fileName) {
  await loadOwned(user, reportId);
  if (!(await itemDetails.removeImage(reportId, fileName))) throw notFound('Image not found');
  await deleteImage(fileName);
}
