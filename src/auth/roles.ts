export const userRoles = ['admin', 'moderator', 'user'] as const;

export type UserRole = (typeof userRoles)[number];

export const roleGroups = {
  adminOnly: ['admin'],
  moderation: ['admin', 'moderator'],
  authenticated: ['admin', 'moderator', 'user'],
} as const satisfies Record<string, readonly UserRole[]>;

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && userRoles.includes(role as UserRole);
}

export function hasAnyRole(
  actualRole: unknown,
  allowedRoles: readonly UserRole[],
) {
  return isUserRole(actualRole) && allowedRoles.includes(actualRole);
}

export function canAccessAdmin(role: unknown) {
  return hasAnyRole(role, roleGroups.adminOnly);
}

export function canAccessModeration(role: unknown) {
  return hasAnyRole(role, roleGroups.moderation);
}
