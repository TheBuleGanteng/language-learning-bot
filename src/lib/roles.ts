export type UserRole = 'regular' | 'admin' | 'superuser';

/** Admins and superusers may share/unshare content. */
export function canShare(role: UserRole): boolean {
  return role === 'admin' || role === 'superuser';
}

/** Only superusers may view the user list and change roles. */
export function canManageRoles(role: UserRole): boolean {
  return role === 'superuser';
}

/** True when the given user is the creator of a piece of content. */
export function isCreator(createdBy: string | null, userId: string): boolean {
  return createdBy === userId;
}
