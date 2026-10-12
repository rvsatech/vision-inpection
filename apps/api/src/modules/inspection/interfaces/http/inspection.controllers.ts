import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Response } from 'express';
import type { Actor } from '../../../../shared/domain/auth-context';
import { Clock, CLOCK } from '../../../../shared/domain/clock';
import { CurrentActor, Internal, RequirePermissions } from '../../../../shared/interfaces/http/decorators';
import { AnalysesService, UploadedImage } from '../../application/analyses.service';
import { AnalysisCallbacksService } from '../../application/analysis-callbacks.service';
import { InspectionJobsService } from '../../application/inspection-jobs.service';
import { InspectionQueries } from '../../application/inspection.queries';
import type { InferenceResult } from '../../domain/analysis';
import { VISION_SERVICES, VisionServiceCode } from '../../domain/vision-service';

class CreateAnalysisDto {
  @IsIn(VISION_SERVICES) service: VisionServiceCode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.05) @Max(0.95) confidenceThreshold?: number;
}

class ListAnalysesQuery {
  @IsOptional() @IsIn(VISION_SERVICES) service?: VisionServiceCode;
  @IsOptional() @IsIn(['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED']) status?: string;
  @IsOptional() @IsIn(['PASS', 'FAIL', 'INFO']) verdict?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class StartedDto {
  @IsInt() @Min(1) attempt: number;
  @IsString() workerId: string;
}
class CompletedDto {
  @IsInt() @Min(1) attempt: number;
  @IsObject() result: InferenceResult;
}
class FailedDto {
  @IsInt() @Min(1) attempt: number;
  @IsString() reason: string;
}

const MAX_UPLOAD = 15 * 1024 * 1024; // teto do multer; a regra fina fica no domínio

@Controller()
export class AnalysesController {
  constructor(
    private readonly analyses: AnalysesService,
    private readonly queries: InspectionQueries,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('vision-services')
  @RequirePermissions('analyses:read')
  catalog() {
    return this.queries.catalog();
  }

  @Get('dashboard')
  @RequirePermissions('analyses:read')
  dashboard(@CurrentActor() actor: Actor) {
    return this.queries.dashboard(actor.tenantId, this.clock.now());
  }

  @Get('analyses')
  @RequirePermissions('analyses:read')
  list(@CurrentActor() actor: Actor, @Query() q: ListAnalysesQuery) {
    return this.queries.list(actor.tenantId, q);
  }

  @Get('analyses/:id')
  @RequirePermissions('analyses:read')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.queries.get(actor.tenantId, id);
  }

  @Get('analyses/:id/image')
  @RequirePermissions('analyses:read')
  async image(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const img = await this.analyses.image(actor, id);
    res.setHeader('Content-Type', img.contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(img.buffer);
  }

  @Post('analyses')
  @HttpCode(202)
  @RequirePermissions('analyses:create')
  @UseInterceptors(FileInterceptor('image', { limits: { fileSize: MAX_UPLOAD, files: 1 } }))
  create(@CurrentActor() actor: Actor, @Body() dto: CreateAnalysisDto, @UploadedFile() file?: UploadedImage) {
    return this.analyses.request(actor, dto.service, file, { confidenceThreshold: dto.confidenceThreshold });
  }

  @Post('analyses/:id/retry')
  @HttpCode(202)
  @RequirePermissions('analyses:create')
  retry(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.analyses.retry(actor, id);
  }
}

/** Callbacks e jobs chamados pelo worker Go (X-Internal-Token). */
@Controller('internal')
export class InternalAnalysesController {
  constructor(
    private readonly callbacks: AnalysisCallbacksService,
    private readonly jobs: InspectionJobsService,
  ) {}

  @Internal()
  @Post('analyses/:id/started')
  @HttpCode(200)
  started(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StartedDto) {
    return this.callbacks.started(id, dto.attempt);
  }

  @Internal()
  @Post('analyses/:id/completed')
  @HttpCode(200)
  completed(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompletedDto) {
    return this.callbacks.completed(id, dto.attempt, dto.result);
  }

  @Internal()
  @Post('analyses/:id/failed')
  @HttpCode(200)
  failed(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FailedDto) {
    return this.callbacks.failed(id, dto.attempt, dto.reason);
  }

  @Internal()
  @Post('jobs/requeue-stale-analyses')
  @HttpCode(200)
  requeue() {
    return this.jobs.requeueStale();
  }

  @Internal()
  @Post('jobs/cleanup-files')
  @HttpCode(200)
  cleanup() {
    return this.jobs.cleanupFiles();
  }
}

