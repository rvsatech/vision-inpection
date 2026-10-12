import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { ROLES, Role } from '../../../domain/role';

const ASSIGNABLE = ROLES.filter((r) => r !== 'PLATFORM_ADMIN');

export class CreateUserDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsIn(ASSIGNABLE)
  role: Role;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(ASSIGNABLE)
  role?: Role;
}

export class ListUsersQuery {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(ROLES) role?: Role;
  @IsOptional() @IsIn(['ACTIVE', 'INACTIVE']) status?: 'ACTIVE' | 'INACTIVE';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) pageSize?: number;
}
