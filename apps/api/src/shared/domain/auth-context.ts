import type { Role } from '../../modules/identity/domain/role';

/** Quem está executando a ação. Propagado das interfaces até os casos de uso. */
export interface Actor {
  userId: string;
  tenantId: string;
  role: Role;
  ip?: string;
}
