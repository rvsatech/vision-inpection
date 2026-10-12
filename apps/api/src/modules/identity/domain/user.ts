import { DomainError, forbidden, validation } from '../../../shared/domain/domain-error';
import { canAssignRole, canManageUser, Role } from './role';

export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface UserProps {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: Role;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export class User {
  private constructor(private props: UserProps) {}

  static create(input: Omit<UserProps, 'status' | 'lastLoginAt' | 'createdAt'>, now: Date): User {
    const email = normalizeEmail(input.email);
    if (!EMAIL_RE.test(email)) throw validation('E-mail inválido.');
    const name = input.name.trim();
    if (name.length < 2) throw validation('Nome muito curto.');
    return new User({ ...input, email, name, status: 'ACTIVE', lastLoginAt: null, createdAt: now });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  get id() { return this.props.id; }
  get tenantId() { return this.props.tenantId; }
  get email() { return this.props.email; }
  get name() { return this.props.name; }
  get role() { return this.props.role; }
  get status() { return this.props.status; }
  get passwordHash() { return this.props.passwordHash; }
  get isActive() { return this.props.status === 'ACTIVE'; }

  toSnapshot(): Readonly<UserProps> {
    return { ...this.props };
  }

  rename(name: string) {
    const n = name.trim();
    if (n.length < 2) throw validation('Nome muito curto.');
    this.props.name = n;
  }

  changeRole(actor: { id: string; role: Role }, newRole: Role) {
    if (actor.id === this.id) throw forbidden('Você não pode alterar o seu próprio papel.');
    if (!canManageUser(actor.role, this.role)) throw forbidden('Você não pode gerenciar este usuário.');
    if (!canAssignRole(actor.role, newRole)) throw forbidden('Você não pode atribuir este papel.');
    this.props.role = newRole;
  }

  deactivate(actor: { id: string; role: Role }) {
    if (actor.id === this.id) throw forbidden('Você não pode desativar a própria conta.');
    if (!canManageUser(actor.role, this.role)) throw forbidden('Você não pode gerenciar este usuário.');
    if (!this.isActive) throw new DomainError('INVALID_STATE', 'Usuário já está inativo.');
    this.props.status = 'INACTIVE';
  }

  reactivate(actor: { id: string; role: Role }) {
    if (!canManageUser(actor.role, this.role)) throw forbidden('Você não pode gerenciar este usuário.');
    if (this.isActive) throw new DomainError('INVALID_STATE', 'Usuário já está ativo.');
    this.props.status = 'ACTIVE';
  }

  changePassword(hash: string) {
    this.props.passwordHash = hash;
  }

  recordLogin(now: Date) {
    this.props.lastLoginAt = now;
  }
}
