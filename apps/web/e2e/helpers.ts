import { expect, Page } from '@playwright/test';

export const DEMO_OWNER = { email: 'carla@horizonte.ind.br', password: 'Horizonte@2026' };
export const DEMO_OPERATOR = { email: 'juliana@horizonte.ind.br', password: 'Horizonte@2026' };

export async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Senha').fill(who.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page).toHaveURL(/\/app$/);
}
