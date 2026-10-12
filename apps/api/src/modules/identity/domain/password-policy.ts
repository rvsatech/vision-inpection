import { validation } from '../../../shared/domain/domain-error';

/** Política mínima: 10+ caracteres, ao menos uma letra e um número, sem espaços nas pontas. */
export function assertStrongPassword(password: string): void {
  const problems: string[] = [];
  if (password.length < 10) problems.push('mínimo de 10 caracteres');
  if (password.length > 128) problems.push('máximo de 128 caracteres');
  if (!/[A-Za-z]/.test(password)) problems.push('ao menos uma letra');
  if (!/\d/.test(password)) problems.push('ao menos um número');
  if (password.trim() !== password) problems.push('sem espaços no início/fim');
  if (problems.length) throw validation(`Senha fraca: ${problems.join(', ')}.`, { problems });
}
