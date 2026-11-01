import bcrypt from 'bcryptjs';

const COST = 10;

export const hashPassword = (plain) => bcrypt.hash(plain, COST);

export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash);

// Compared against when the email is unknown, so a login attempt takes the
// same time whether or not the account exists.
export const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', COST);
