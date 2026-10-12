import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { Logger } from '@nestjs/common';
import { DomainError } from '../../../shared/domain/domain-error';
import type { ImageStorage, StoredImage } from '../domain/ports';

/**
 * Armazenamento em disco. Em desenvolvimento a pasta é um volume compartilhado
 * entre API e serviço de visão (docker-compose), então só a "key" trafega na fila.
 */
export class LocalImageStorage implements ImageStorage {
  readonly driver = 'local' as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async put(key: string, data: Buffer): Promise<StoredImage> {
    const path = this.safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { storage: 'local', key };
  }

  async signedUrl() {
    return undefined;
  }

  read(key: string) {
    return readFile(this.safePath(key));
  }

  async delete(key: string) {
    await rm(this.safePath(key), { force: true });
  }

  /** Impede path traversal (ex.: "../../etc/passwd"). */
  private safePath(key: string) {
    const p = resolve(this.root, key);
    if (!p.startsWith(this.root + sep)) throw new DomainError('VALIDATION', 'Chave de arquivo inválida.');
    return p;
  }
}

/**
 * Supabase Storage via API REST (sem SDK). Usado em produção no plano gratuito:
 * a fila leva uma URL assinada e temporária para o serviço de visão baixar a imagem.
 */
export class SupabaseImageStorage implements ImageStorage {
  readonly driver = 'supabase' as const;
  private readonly logger = new Logger('SupabaseStorage');

  constructor(
    private readonly url: string,
    private readonly serviceKey: string,
    private readonly bucket: string,
  ) {}

  async put(key: string, data: Buffer, contentType: string): Promise<StoredImage> {
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${encodeURI(key)}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': contentType, 'x-upsert': 'true' },
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new DomainError('UNAVAILABLE', `Falha ao enviar imagem (${res.status}).`);
    return { storage: 'supabase', key };
  }

  async signedUrl(key: string, expiresIn: number) {
    const res = await fetch(`${this.url}/storage/v1/object/sign/${this.bucket}/${encodeURI(key)}`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) throw new DomainError('UNAVAILABLE', `Falha ao assinar URL (${res.status}).`);
    const body = (await res.json()) as { signedURL: string };
    return `${this.url}/storage/v1${body.signedURL}`;
  }

  async read(key: string) {
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${encodeURI(key)}`, { headers: this.headers() });
    if (!res.ok) throw new DomainError('NOT_FOUND', 'Imagem não encontrada.');
    return Buffer.from(await res.arrayBuffer());
  }

  async delete(key: string) {
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: 'DELETE',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [key] }),
    });
    if (!res.ok) this.logger.warn(`Falha ao remover ${key} (${res.status})`);
  }

  private headers() {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey };
  }
}
