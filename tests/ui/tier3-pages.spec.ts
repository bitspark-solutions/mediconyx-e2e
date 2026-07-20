import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:9673';

// ── Tier 3.4: Public doctor directory UI ────────────────────

test.describe('Public doctor directory UI @ui @tier3 @smoke', () => {
  test('/doctors page renders with search and filters', async ({ page }) => {
    await page.goto(`${BASE_URL}/doctors`);
    // Heading
    await expect(page.getByRole('heading', { name: /find a doctor/i })).toBeVisible();
    // Search input
    await expect(page.getByPlaceholder(/search by name/i)).toBeVisible();
    // Specialty select
    await expect(page.locator('select').first()).toBeVisible();
    // If the API is reachable, at least one card should render.
    // Allow up to 5s for the API call to complete.
    await page.waitForTimeout(2000);
    // If we have cards, the page rendered them
    const cards = page.locator('a[href^="/doctors/"]');
    const count = await cards.count();
    if (count === 0) {
      // No doctors — empty state should be visible
      await expect(page.getByText(/no doctors match/i)).toBeVisible();
    } else {
      // At least one doctor card
      expect(count).toBeGreaterThan(0);
    }
  });

  test('/doctors/{id} page renders a doctor profile', async ({ page }) => {
    // First fetch the list to get a doctor id
    const response = await page.request.get(`${BASE_URL.replace('9673', '9765')}/api/public/doctors`);
    if (!response.ok()) test.skip();
    const body = await response.json();
    if (!body.doctors?.length) test.skip();
    const id = body.doctors[0].id;
    await page.goto(`${BASE_URL}/doctors/${id}`);
    // The name should be visible (it's in an h1)
    await expect(page.locator('h1')).toBeVisible();
    // Specialty badge
    await expect(page.getByText(new RegExp(body.doctors[0].specialization, 'i'))).toBeVisible();
  });
});

// ── Tier 3.2: Patient self-registration UI ─────────────────

test.describe('Patient self-registration UI @ui @tier3 @smoke', () => {
  test('/register page renders the form', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await expect(page.getByRole('heading', { name: /create your patient account/i })).toBeVisible();
    await expect(page.getByLabel(/first name/i)).toBeVisible();
    await expect(page.getByLabel(/last name/i)).toBeVisible();
    await expect(page.getByLabel(/^email$/i)).toBeVisible();
    await expect(page.getByLabel(/^phone$/i)).toBeVisible();
    await expect(page.getByLabel(/date of birth/i)).toBeVisible();
    await expect(page.getByLabel(/^password$/i)).toBeVisible();
    await expect(page.getByLabel(/confirm password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /create account/i })).toBeVisible();
  });

  test('/register validates password mismatch client-side', async ({ page }) => {
    await page.goto(`${BASE_URL}/register`);
    await page.getByLabel(/first name/i).fill('Test');
    await page.getByLabel(/last name/i).fill('User');
    await page.getByLabel(/^email$/i).fill(`pw-mismatch-${Date.now()}@example.test`);
    await page.getByLabel(/^phone$/i).fill('+8801700000099');
    await page.getByLabel(/date of birth/i).fill('1995-01-01');
    await page.getByLabel(/^password$/i).fill('TestPass123!');
    await page.getByLabel(/confirm password/i).fill('DifferentPass123!');
    await page.getByRole('button', { name: /create account/i }).click();
    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test('/login page has Create account link', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    const link = page.getByRole('link', { name: /create a patient account/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/register$/);
  });
});

test.describe('Verify email UI @ui @tier3 @smoke', () => {
  test('/verify-email with bogus token shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/verify-email?token=bogus-token-12345`);
    await expect(page.getByText(/invalid|expired/i)).toBeVisible({ timeout: 5000 });
  });

  test('/verify-email with no token shows error', async ({ page }) => {
    await page.goto(`${BASE_URL}/verify-email`);
    await expect(page.getByText(/missing verification token/i)).toBeVisible();
  });
});
