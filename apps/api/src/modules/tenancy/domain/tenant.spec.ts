import { isValidCnpj, normalizeDocument, slugify } from './tenant';

describe('Tenant', () => {
  it('gera slug sem acentos', () => {
    expect(slugify('Metalúrgica Horizonte Ltda.')).toBe('metalurgica-horizonte-ltda');
  });
  it('valida CNPJ', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false);
    expect(isValidCnpj('00000000000000')).toBe(false);
  });
  it('formata CNPJ', () => {
    expect(normalizeDocument('11222333000181')).toBe('11.222.333/0001-81');
    expect(normalizeDocument(undefined)).toBeNull();
  });
});
