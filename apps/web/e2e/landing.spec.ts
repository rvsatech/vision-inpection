import { expect, test } from '@playwright/test';

test('landing apresenta serviços, sobrevoo e planos', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('inspeção manual');
  await expect(page.getByRole('heading', { name: 'Três inspeções que rodam sozinhas' })).toBeVisible();
  await page.locator('#sobrevoo').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Um sobrevoo pela planta' })).toBeVisible();
  await page.locator('#planos').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Profissional' })).toBeVisible();
});
