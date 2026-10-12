import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import type { Actor } from '../../../../shared/domain/auth-context';
import { CurrentActor, Internal, Public, RequirePermissions } from '../../../../shared/interfaces/http/decorators';
import { BillingAdminQuery } from '../../application/billing-admin.query';
import { BillingEventsService } from '../../application/billing-events.service';
import { BillingService } from '../../application/billing.service';
import { SubscriptionJobsService } from '../../application/subscription-jobs.service';

class CheckoutDto {
  @IsString() planCode: string;
}

class PagingQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}

class BillingEventDataDto {
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() planCode?: string;
  @IsOptional() @IsString() priceId?: string;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() subscriptionId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsISO8601() currentPeriodStart?: string;
  @IsOptional() @IsISO8601() currentPeriodEnd?: string;
  @IsOptional() @IsBoolean() cancelAtPeriodEnd?: boolean;
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currency?: string;
}

class BillingEventDto {
  @IsString() eventId: string;
  @IsIn(['checkout.completed', 'invoice.paid', 'invoice.payment_failed', 'subscription.updated', 'subscription.canceled'])
  type: 'checkout.completed' | 'invoice.paid' | 'invoice.payment_failed' | 'subscription.updated' | 'subscription.canceled';
  @IsISO8601() occurredAt: string;
  @IsOptional() @IsBoolean() livemode?: boolean;
  @IsObject() @ValidateNested() @Type(() => BillingEventDataDto) data: BillingEventDataDto;
}

@Controller('plans')
export class PlansController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get()
  list() {
    return this.billing.listPlans();
  }
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('subscription')
  @RequirePermissions('billing:read')
  overview(@CurrentActor() actor: Actor) {
    return this.billing.overview(actor.tenantId);
  }

  @Post('checkout')
  @RequirePermissions('billing:manage')
  checkout(@CurrentActor() actor: Actor, @Body() dto: CheckoutDto) {
    return this.billing.startCheckout(actor, dto.planCode);
  }

  @Post('portal')
  @RequirePermissions('billing:manage')
  portal(@CurrentActor() actor: Actor) {
    return this.billing.openPortal(actor);
  }
}

@Controller('admin/billing')
export class AdminBillingController {
  constructor(private readonly query: BillingAdminQuery) {}

  @Get('subscriptions')
  @RequirePermissions('platform:manage')
  subscriptions(@Query() q: PagingQuery) {
    return this.query.subscriptions(q);
  }

  @Get('events')
  @RequirePermissions('platform:manage')
  events(@Query() q: PagingQuery) {
    return this.query.events(q);
  }
}

/** Endpoints service-to-service consumidos pelo worker Go. */
@Controller('internal')
export class InternalBillingController {
  constructor(
    private readonly events: BillingEventsService,
    private readonly jobs: SubscriptionJobsService,
  ) {}

  @Internal()
  @Post('billing/events')
  @HttpCode(200)
  async apply(@Body() dto: BillingEventDto) {
    return { result: await this.events.apply(dto) };
  }

  @Internal()
  @Post('jobs/expire-subscriptions')
  @HttpCode(200)
  expire() {
    return this.jobs.expireDue();
  }
}
