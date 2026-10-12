export interface Clock {
  now(): Date;
}

export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = { now: () => new Date() };

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

/** Início do mês corrente em UTC — janela usada para limites mensais de plano. */
export const startOfMonthUtc = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
