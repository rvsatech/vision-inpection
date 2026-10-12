import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import type { Actor } from '../../../../shared/domain/auth-context';
import { CurrentActor, RequirePermissions } from '../../../../shared/interfaces/http/decorators';
import { UsersService } from '../../application/users.service';
import { CreateUserDto, ListUsersQuery, UpdateUserDto } from './dto/users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list(@CurrentActor() actor: Actor, @Query() q: ListUsersQuery) {
    return this.users.list(actor, q);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(actor, id);
  }

  @Post()
  @RequirePermissions('users:write')
  create(@CurrentActor() actor: Actor, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Patch(':id')
  @RequirePermissions('users:write')
  update(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('users:write')
  deactivate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.deactivate(actor, id);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermissions('users:write')
  reactivate(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.reactivate(actor, id);
  }
}
