/**
 * RBAC simples: papéis fixos com conjunto de permissões.
 * As regras ficam no domínio para serem testadas sem HTTP.
 */
export const ROLES = ['PLATFORM_ADMIN', 'OWNER', 'ADMIN', 'OPERATOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export type Permission =
  | 'users:read'
  | 'users:write'
  | 'company:read'
  | 'company:write'
  | 'billing:read'
  | 'billing:manage'
  | 'analyses:read'
  | 'analyses:create'
  | 'audit:read'
  | 'platform:manage';

const TENANT_READ: Permission[] = ['company:read', 'analyses:read', 'billing:read'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PLATFORM_ADMIN: [
    ...TENANT_READ,
    'users:read',
    'users:write',
    'company:write',
    'billing:manage',
    'analyses:create',
    'audit:read',
    'platform:manage',
  ],
  OWNER: [...TENANT_READ, 'users:read', 'users:write', 'company:write', 'billing:manage', 'analyses:create', 'audit:read'],
  ADMIN: [...TENANT_READ, 'users:read', 'users:write', 'company:write', 'analyses:create', 'audit:read'],
  OPERATOR: [...TENANT_READ, 'analyses:create'],
  VIEWER: [...TENANT_READ],
};

export const ROLE_LABELS: Record<Role, string> = {
  PLATFORM_ADMIN: 'Administrador da plataforma',
  OWNER: 'Proprietário',
  ADMIN: 'Administrador',
  OPERATOR: 'Operador / Inspetor',
  VIEWER: 'Leitura',
};

/** Hierarquia usada para decidir quem pode gerenciar quem. */
const RANK: Record<Role, number> = { PLATFORM_ADMIN: 100, OWNER: 40, ADMIN: 30, OPERATOR: 20, VIEWER: 10 };

export const hasPermission = (role: Role, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);

/**
 * Um usuário só pode atribuir papéis abaixo do seu — exceto o OWNER,
 * que pode promover outros a OWNER. Ninguém atribui PLATFORM_ADMIN pela API de tenant.
 */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (target === 'PLATFORM_ADMIN') return false;
  if (actor === 'PLATFORM_ADMIN') return true;
  if (actor === 'OWNER') return true;
  return RANK[actor] > RANK[target];
}

/** Pode alterar/desativar um usuário que atualmente tem o papel `current`? */
export function canManageUser(actor: Role, current: Role): boolean {
  if (actor === 'PLATFORM_ADMIN') return current !== 'PLATFORM_ADMIN';
  if (actor === 'OWNER') return current !== 'PLATFORM_ADMIN';
  return RANK[actor] > RANK[current];
}
