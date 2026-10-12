import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DEMO_OPERATOR, DEMO_OWNER, login } from './helpers';

const SAMPLES = path.resolve(__dirname, '../../../services/vision/samples');

test('login leva ao painel com indicadores', async ({ page }) => {
  await login(page, DEMO_OWNER);
  await expect(page.getByRole('region', { name: 'Indicadores do mês' })).toContainText('Conformidade');
  await expect(page.getByRole('heading', { name: 'Análises recentes' })).toBeVisible();
});

test('credencial inválida mostra erro claro', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail').fill(DEMO_OWNER.email);
  await page.getByLabel('Senha').fill('senha-errada-123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.locator('.alert-error')).toContainText('E-mail ou senha inválidos');
});

test('proprietária cria usuário e altera o papel', async ({ page }) => {
  await login(page, DEMO_OWNER);
  await page.getByRole('link', { name: 'Usuários' }).click();
  await page.getByRole('button', { name: 'Adicionar usuário' }).click();
  const email = `e2e-${Date.now()}@horizonte.ind.br`;
  await page.getByLabel('Nome').fill('Usuário E2E');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Senha inicial').fill('Senha@12345');
  await page.getByRole('dialog').getByRole('button', { name: 'Adicionar usuário' }).click();
  await expect(page.getByRole('status')).toContainText('Usuário E2E foi adicionado');

  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('combobox').selectOption('VIEWER');
  await expect(page.getByRole('status')).toContainText('Papel de Usuário E2E atualizado');
  await row.getByRole('button', { name: 'Desativar' }).click();
  await expect(row.getByText('Inativo')).toBeVisible();
});

test('operadora envia imagem e vê o resultado da fila assíncrona', async ({ page }) => {
  await login(page, DEMO_OPERATOR);
  await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0); // RBAC no menu
  await page.goto('/app/analyses?new=1');
  await page.getByText('Conformidade de EPI').first().click();
  await page.getByLabel('Imagem para análise').setInputFiles(path.join(SAMPLES, 'ppe_00.jpg'));
  await page.getByRole('button', { name: 'Enviar para análise' }).click();
  await expect(page).toHaveURL(/\/app\/analyses\/[0-9a-f-]{36}$/);
  // Worker Go consome a fila, chama o serviço Python e devolve o resultado
  await expect(page.getByText('Não conforme')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('sem capacete');
  await expect(page.getByRole('heading', { name: /Achados/ })).toBeVisible();
});

test('checkout de teste redireciona para o Stripe', async ({ page }) => {
  test.skip(!process.env.E2E_STRIPE, 'Defina E2E_STRIPE=1 com chaves de teste do Stripe configuradas na API');
  await login(page, DEMO_OWNER);
  await page.goto('/app/billing');
  await page.getByRole('row').filter({ hasText: 'Profissional' }).getByRole('button', { name: 'Assinar' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 30_000 });
});
