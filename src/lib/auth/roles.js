// Role helpers with no server-only imports (safe for scripts and services).
export const isAdmin = (user) => user?.role === 'ADMIN';
export const isStudent = (user) => user?.role === 'STUDENT';
