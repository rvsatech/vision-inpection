import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import type { PasswordHasher } from '../domain/ports';

@Injectable()
export class BcryptPasswordHasher implements PasswordHasher {
  constructor(private readonly rounds = Number(process.env.BCRYPT_ROUNDS ?? 12)) {}

  hash(plain: string) {
    return bcrypt.hash(plain, this.rounds);
  }

  async verify(plain: string, hash: string) {
    try {
      return await bcrypt.compare(plain, hash);
    } catch {
      return false;
    }
  }
}
