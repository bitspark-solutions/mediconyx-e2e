import { test, expect } from '@playwright/test';
import { LandingPage } from '../pages/landing.page';

let landing: LandingPage;

test.beforeEach(async ({ page }) => {
  landing = new LandingPage(page);
  await landing.goto();
});

test.describe('Landing Page @smoke', () => {
  test('displays hero section', async () => {
    await expect(landing.heroHeading).toBeVisible();
    await expect(landing.discoverMoreButton).toBeVisible();
  });

  test('has onboard your hospital CTA', async () => {
    await expect(landing.onboardHospitalButton).toBeVisible();
    await expect(landing.onboardHospitalButton).toHaveAttribute('href', '/contact-sales');
  });

  test('has contact sales link in navbar', async () => {
    await expect(landing.contactSalesNavLink).toBeVisible();
    await expect(landing.contactSalesNavLink).toHaveAttribute('href', '/contact-sales');
  });

  test('clicking onboard hospital navigates to contact sales', async ({ page }) => {
    await landing.onboardHospitalButton.click();
    await expect(page).toHaveURL(/\/contact-sales/);
  });

  test('clicking contact sales nav link navigates correctly', async ({ page }) => {
    await landing.contactSalesNavLink.click();
    await expect(page).toHaveURL(/\/contact-sales/);
  });
});
