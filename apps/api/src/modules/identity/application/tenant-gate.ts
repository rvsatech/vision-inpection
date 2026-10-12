import type { User } from '../domain/user';

/** O que o contexto de identidade precisa saber sobre tenants e lookup sem escopo. */
export interface TenantGate {
  isActive(tenantId: string): Promise<boolean>;
  findUserById(userId: string): Promise<User | null>;
}
export const TENANT_GATE = Symbol('TENANT_GATE');
