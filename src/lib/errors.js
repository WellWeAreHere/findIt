// Application error with an HTTP status, and translation of database
// errors (constraint violations, trigger SIGNALs) into safe messages.

export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new AppError(400, msg, details);
export const unauthorized = (msg = 'Please log in') => new AppError(401, msg);
export const forbidden = (msg = 'You do not have permission to do this') => new AppError(403, msg);
export const notFound = (msg = 'Not found') => new AppError(404, msg);
export const conflict = (msg) => new AppError(409, msg);

const DUPLICATE_MESSAGES = {
  uq_users_email: 'An account with this email already exists',
  uq_users_srn: 'An account with this SRN already exists',
  uq_claims_one_per_user: 'You have already claimed this item',
  uq_claims_one_approved: 'Another claim for this item has already been approved',
  uq_items_category_name: 'This item type already exists in the category',
  uq_locations_place: 'This location already exists',
  uq_buildings_name: 'A building with this name already exists',
  uq_categories_name: 'A category with this name already exists',
};

const CHECK_MESSAGES = {
  chk_users_email: 'Enter a valid email address',
  chk_users_phone: 'Enter a valid phone number',
  chk_reports_description: 'The summary must be at least 10 characters',
  chk_reports_custody: 'Only found items can have a custody location',
  chk_claims_description: 'Describe your proof of ownership in at least 20 characters',
  chk_locations_floor: 'Floor must be between -2 and 15',
};

// Converts a mysql2 / MongoDB error into an AppError when we understand it.
export function fromDatabaseError(err) {
  if (err instanceof AppError) return err;

  // SIGNAL SQLSTATE '45000' from our triggers and procedures: the message
  // is written for end users.
  if (err.sqlState === '45000') return new AppError(409, err.sqlMessage ?? err.message);

  switch (err.code) {
    case 'ER_DUP_ENTRY': {
      const key = Object.keys(DUPLICATE_MESSAGES).find((k) => err.message.includes(k));
      return conflict(key ? DUPLICATE_MESSAGES[key] : 'This record already exists');
    }
    case 'ER_CHECK_CONSTRAINT_VIOLATED': {
      const key = Object.keys(CHECK_MESSAGES).find((k) => err.message.includes(k));
      return badRequest(key ? CHECK_MESSAGES[key] : 'Some values are not allowed');
    }
    case 'ER_ROW_IS_REFERENCED_2':
      return conflict('This record is in use and cannot be deleted');
    case 'ER_NO_REFERENCED_ROW_2':
      return badRequest('A referenced record does not exist');
    case 'ER_DATA_TOO_LONG':
      return badRequest('A value is too long');
    default:
      break;
  }

  if (err.name === 'MongoServerError' && err.code === 121) return badRequest('Item details failed validation');
  if (err.name === 'MongoServerError' && err.code === 11000) return conflict('Item details already exist');
  return null;
}
