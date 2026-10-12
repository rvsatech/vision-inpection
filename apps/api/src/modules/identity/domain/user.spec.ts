import { DomainError } from '../../../shared/domain/domain-error';
import { assertStrongPassword } from './password-policy';
import { User } from './user';

const now = new Date('2026-10-01T12:00:00Z');
const make = (role: 'OWNER' | 'ADMIN' | 'OPERATOR' | 'VIEWER' = 'OPERATOR', id = 'u1') =>
  User.create({ id, tenantId: 't1', email: ' Ana@Empresa.com.BR ', name: ' Ana ', role, passwordHash: 'h' }, now);

describe('User', () => {
  it('normaliza e-mail e nome', () => {
    const u = make();
    expect(u.email).toBe('ana@empresa.com.br');
    expect(u.name).toBe('Ana');
    expect(u.isActive).toBe(true);
  });

  it('rejeita e-mail inválido', () => {
    expect(() => User.create({ id: 'x', tenantId: 't', email: 'nope', name: 'Ana', role: 'VIEWER', passwordHash: 'h' }, now)).toThrow(DomainError);
  });

  it('não permite alterar o próprio papel', () => {
    const u = make('ADMIN');
    expect(() => u.changeRole({ id: 'u1', role: 'ADMIN' }, 'OWNER')).toThrow(/próprio papel/);
  });

  it('admin promove operador a leitura, mas não a admin', () => {
    const u = make('OPERATOR');
    u.changeRole({ id: 'admin', role: 'ADMIN' }, 'VIEWER');
    expect(u.role).toBe('VIEWER');
    expect(() => u.changeRole({ id: 'admin', role: 'ADMIN' }, 'ADMIN')).toThrow(/atribuir/);
  });

  it('desativa e reativa respeitando hierarquia', () => {
    const u = make('OPERATOR');
    expect(() => u.deactivate({ id: 'x', role: 'VIEWER' })).toThrow(/gerenciar/);
    u.deactivate({ id: 'x', role: 'ADMIN' });
    expect(u.isActive).toBe(false);
    expect(() => u.deactivate({ id: 'x', role: 'ADMIN' })).toThrow(/inativo/);
    u.reactivate({ id: 'x', role: 'ADMIN' });
    expect(u.isActive).toBe(true);
  });

  it('não permite desativar a si mesmo', () => {
    expect(() => make('OWNER').deactivate({ id: 'u1', role: 'OWNER' })).toThrow(/própria conta/);
  });
});

describe('Política de senha', () => {
  it.each(['curta1', 'semnumeroaqui', '1234567890', ' Espaco12345'])('rejeita "%s"', (p) => {
    expect(() => assertStrongPassword(p)).toThrow(DomainError);
  });
  it('aceita senha forte', () => {
    expect(() => assertStrongPassword('Horizonte@2026')).not.toThrow();
  });
});
