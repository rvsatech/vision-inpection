import { Module } from '@nestjs/common';
import { TenancyService } from './application/tenancy.service';
import { TenancyController } from './interfaces/http/tenancy.controllers';

@Module({ controllers: [TenancyController], providers: [TenancyService] })
export class TenancyModule {}
