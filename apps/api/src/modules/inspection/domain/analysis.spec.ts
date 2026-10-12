import { Analysis, InferenceResult } from './analysis';
import { assertValidImage, sniffImageType } from './image-validation';

const now = new Date('2026-10-01T10:00:00Z');
const make = () =>
  Analysis.request(
    { id: 'a1', tenantId: 't1', requestedById: 'u1', service: 'OBJECT_COUNT', imageStorage: 'local', imageKey: 't1/a1.jpg', contentType: 'image/jpeg', sizeBytes: 10, originalName: 'x.jpg' },
    now,
  );
const result = (over: Partial<InferenceResult> = {}): InferenceResult => ({
  analysisId: 'a1',
  service: 'OBJECT_COUNT',
  mode: 'heuristic',
  modelVersion: 'count-1',
  latencyMs: 12,
  image: { width: 10, height: 10 },
  summary: { verdict: 'INFO', headline: '12 caixas', metrics: { count: 12 } },
  detections: [],
  ...over,
});

describe('Analysis', () => {
  it('segue QUEUED → PROCESSING → COMPLETED', () => {
    const a = make();
    expect(a.status).toBe('QUEUED');
    expect(a.start(1, now)).toBe(true);
    expect(a.status).toBe('PROCESSING');
    expect(a.complete(result(), 1, now)).toBe(true);
    expect(a.toSnapshot()).toMatchObject({ status: 'COMPLETED', verdict: 'INFO', headline: '12 caixas', attempts: 1 });
  });

  it('é idempotente após estado final (entrega duplicada)', () => {
    const a = make();
    a.complete(result(), 1, now);
    expect(a.complete(result(), 2, now)).toBe(false);
    expect(a.fail('timeout', 2, now)).toBe(false);
    expect(a.start(3, now)).toBe(false);
    expect(a.status).toBe('COMPLETED');
  });

  it('rejeita resultado de outra análise', () => {
    expect(() => make().complete(result({ analysisId: 'outra' }), 1, now)).toThrow(/não corresponde/);
  });

  it('falha pode ser reprocessada; concluída não', () => {
    const a = make();
    a.fail('modelo indisponível', 3, now);
    a.requeue(now);
    expect(a.status).toBe('QUEUED');
    a.complete(result(), 4, now);
    expect(() => a.requeue(now)).toThrow();
  });
});

describe('Validação de imagem por magic bytes', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);

  it('reconhece JPEG, PNG e WebP', () => {
    expect(sniffImageType(jpeg)).toBe('image/jpeg');
    expect(sniffImageType(png)).toBe('image/png');
    expect(sniffImageType(webp)).toBe('image/webp');
  });

  it('rejeita arquivo disfarçado e tamanho excedido', () => {
    expect(() => assertValidImage(Buffer.from('<?php echo 1; ?>'), 10)).toThrow(/Formato/);
    expect(() => assertValidImage(Buffer.concat([jpeg, Buffer.alloc(2 * 1024 * 1024)]), 1)).toThrow(/maior que 1 MB/);
    expect(() => assertValidImage(undefined, 10)).toThrow(/Envie/);
  });
});
