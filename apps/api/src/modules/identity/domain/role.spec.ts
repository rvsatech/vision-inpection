import { canAssignRole, canManageUser, hasPermission } from './role';

describe('RBAC', () => {
  it('concede permissões por papel', () => {
    expect(hasPermission('VIEWER', 'analyses:read')).toBe(true);
    expect(hasPermission('VIEWER', 'analyses:create')).toBe(false);
    expect(hasPermission('OPERATOR', 'analyses:create')).toBe(true);
    expect(hasPermission('OPERATOR', 'users:write')).toBe(false);
    expect(hasPermission('ADMIN', 'billing:manage')).toBe(false);
    expect(hasPermission('OWNER', 'billing:manage')).toBe(true);
    expect(hasPermission('OWNER', 'platform:manage')).toBe(false);
    expect(hasPermission('PLATFORM_ADMIN', 'platform:manage')).toBe(true);
  });

  it.each([
    ['OWNER', 'OWNER', true],
    ['OWNER', 'ADMIN', true],
    ['ADMIN', 'OPERATOR', true],
    ['ADMIN', 'ADMIN', false],
    ['ADMIN', 'OWNER', false],
    ['OPERATOR', 'VIEWER', true],
    ['OWNER', 'PLATFORM_ADMIN', false],
  ] as const)('%s pode atribuir %s? → %s', (actor, target, expected) => {
    expect(canAssignRole(actor, target)).toBe(expected);
  });

  it('admin não gerencia proprietário nem outro admin', () => {
    expect(canManageUser('ADMIN', 'OWNER')).toBe(false);
    expect(canManageUser('ADMIN', 'ADMIN')).toBe(false);
    expect(canManageUser('ADMIN', 'OPERATOR')).toBe(true);
    expect(canManageUser('OWNER', 'OWNER')).toBe(true);
  });
});
