import { Module } from '@nestjs/common';
import { APP_ENV, AppEnv } from '../../shared/infrastructure/config/env';
import { AnalysesService } from './application/analyses.service';
import { AnalysisCallbacksService } from './application/analysis-callbacks.service';
import { InspectionJobsService } from './application/inspection-jobs.service';
import { InspectionQueries } from './application/inspection.queries';
import { ANALYSIS_QUEUE, ANALYSIS_REPOSITORY, IMAGE_STORAGE, TENANT_STORAGE_COUNTER } from './domain/ports';
import { LocalImageStorage, SupabaseImageStorage } from './infrastructure/image-storage';
import { PrismaAnalysisRepository, PrismaTenantStorageCounter } from './infrastructure/prisma-analysis.repository';
import { RedisAnalysisQueue } from './infrastructure/redis-analysis.queue';
import { AnalysesController, InternalAnalysesController } from './interfaces/http/inspection.controllers';

@Module({
  controllers: [AnalysesController, InternalAnalysesController],
  providers: [
    AnalysesService,
    AnalysisCallbacksService,
    InspectionJobsService,
    InspectionQueries,
    { provide: ANALYSIS_REPOSITORY, useClass: PrismaAnalysisRepository },
    { provide: TENANT_STORAGE_COUNTER, useClass: PrismaTenantStorageCounter },
    { provide: ANALYSIS_QUEUE, useClass: RedisAnalysisQueue },
    {
      provide: IMAGE_STORAGE,
      inject: [APP_ENV],
      useFactory: (env: AppEnv) => {
        if (env.STORAGE_DRIVER === 'supabase') {
          if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('STORAGE_DRIVER=supabase exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY');
          return new SupabaseImageStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.SUPABASE_BUCKET);
        }
        return new LocalImageStorage(env.STORAGE_DIR);
      },
    },
  ],
})
export class InspectionModule {}
