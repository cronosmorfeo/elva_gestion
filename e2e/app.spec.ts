import { expect, test } from '@playwright/test';

test('opens the login page at the root url', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/tabs\/login$/);
  await expect(page.getByRole('heading', { name: 'ELVA Gestión' })).toBeVisible();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.getByLabel('Contraseña')).toBeVisible();
});

// Without a session, the guards send every protected page back to the login.
for (const path of ['/tabs/inicio', '/tabs/vacaciones', '/tabs/dashboard', '/tabs/tab3']) {
  test(`sends ${path} to the login without a session`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/tabs\/login$/);
  });
}
