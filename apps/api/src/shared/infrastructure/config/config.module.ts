import { Global, Module } from '@nestjs/common';
import { CLOCK, systemClock } from '../../domain/clock';
import { APP_ENV, loadEnv } from './env';

@Global()
@Module({
  providers: [
    { provide: APP_ENV, useFactory: () => loadEnv() },
    { provide: CLOCK, useValue: systemClock },
  ],
  exports: [APP_ENV, CLOCK],
})
export class AppConfigModule {}
