import { validation } from '../../../shared/domain/domain-error';

export type ImageContentType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Detecta o tipo real pelo "magic number" — o Content-Type enviado pelo cliente
 * e a extensão do arquivo não são confiáveis.
 */
export function sniffImageType(buf: Buffer): ImageContentType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const EXTENSIONS: Record<ImageContentType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export function assertValidImage(buf: Buffer | undefined, maxMb: number): ImageContentType {
  if (!buf || buf.length === 0) throw validation('Envie uma imagem.');
  if (buf.length > maxMb * 1024 * 1024) throw validation(`Imagem maior que ${maxMb} MB.`);
  const type = sniffImageType(buf);
  if (!type) throw validation('Formato não suportado. Use JPEG, PNG ou WebP.');
  return type;
}
