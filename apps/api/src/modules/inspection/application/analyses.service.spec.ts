import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { EntitlementsPort } from '../../../shared/application/entitlements';
import { DomainError } from '../../../shared/domain/domain-error';
import type { Analysis } from '../domain/analysis';
import type { AnalysisQueue, AnalysisRepository, AnalysisRequestedEvent, ImageStorage } from '../domain/ports';
import { AnalysesService } from './analyses.service';

const schema = JSON.parse(readFileSync(join(__dirname, '../../../../../../packages/contracts/schemas/vision.analysis.requested.v1.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const actor = { userId: '0d5e8f8a-1b7c-4f0e-8a51-3c9d2e7b6a40', tenantId: 'a3c9e2d1-5f4b-4e6a-9c8d-7b1a0f2e3d45', role: 'OPERATOR' as const };
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

function setup(entitlements: Partial<EntitlementsPort> = {}, queueFails = false) {
  const saved: Analysis[] = [];
  const published: AnalysisRequestedEvent[] = [];
  const repo: AnalysisRepository = {
    findById: async () => null,
    findByIdUnscoped: async () => null,
    findStale: async () => [],
    findWithImagesOlderThan: async () => [],
    save: async (a) => void saved.push(a),
  };
  const storage: ImageStorage = { driver: 'local', put: async (key) => ({ storage: 'local', key }), signedUrl: async () => undefined, read: async () => jpeg, delete: async () => undefined };
  const queue: AnalysisQueue = {
    publishRequested: async (e) => {
      if (queueFails) throw new Error('redis down');
      published.push(e);
      return '1-0';
    },
  };
  const ent: EntitlementsPort = { assertCanAddUser: async () => undefined, assertCanRunAnalysis: async () => undefined, ...entitlements };
  const svc = new AnalysesService(repo, storage, queue, { add: async () => undefined }, ent, { record: async () => undefined }, { now: () => new Date('2026-10-11T12:00:00Z') }, { ANALYSIS_MAX_FILE_MB: 10 });
  return { svc, saved, published };
}

describe('AnalysesService.request', () => {
  it('persiste como QUEUED e publica evento válido segundo o contrato', async () => {
    const { svc, saved, published } = setup();
    const res = await svc.request(actor, 'PPE_COMPLIANCE', { buffer: jpeg, originalname: 'linha-3.jpg', size: jpeg.length }, { confidenceThreshold: 0.4 });
    expect(res.status).toBe('QUEUED');
    expect(saved).toHaveLength(1);
    expect(published).toHaveLength(1);
    const ok = validate(published[0]);
    expect(validate.errors ?? []).toEqual([]);
    expect(ok).toBe(true);
    expect(published[0].data.image.key).toBe(`${actor.tenantId}/${res.id}.jpg`);
  });

  it('respeita limites do plano antes de armazenar', async () => {
    const { svc, saved } = setup({ assertCanRunAnalysis: async () => { throw new DomainError('LIMIT_EXCEEDED', 'limite'); } });
    await expect(svc.request(actor, 'QUALITY_DEFECT', { buffer: jpeg, originalname: 'a.jpg', size: 1 })).rejects.toMatchObject({ code: 'LIMIT_EXCEEDED' });
    expect(saved).toHaveLength(0);
  });

  it('falha na fila não perde a análise (fica QUEUED para o job de reprocessamento)', async () => {
    const { svc, saved } = setup({}, true);
    const res = await svc.request(actor, 'OBJECT_COUNT', { buffer: jpeg, originalname: 'a.jpg', size: 1 });
    expect(res.status).toBe('QUEUED');
    expect(saved).toHaveLength(1);
  });
});

describe('Contrato vision.analysis.requested.v1', () => {
  it('o exemplo publicado é válido', () => {
    const example = JSON.parse(readFileSync(join(__dirname, '../../../../../../packages/contracts/examples/vision.analysis.requested.v1.json'), 'utf8'));
    expect(validate(example)).toBe(true);
  });
});
