import { test, expect } from '@playwright/test';
import { ContactSalesPage } from '../pages/contact-sales.page';
import { ApiClient } from '../helpers/api-client';
import { faker } from '@faker-js/faker';

// ═══════════════════════════════════════════════════════════════
// RATE LIMIT BUDGET: 1 POST used here (full flow test).
// API project uses 2 POSTs. Total = 3 of 5 allowed per hour.
// ═══════════════════════════════════════════════════════════════

test.describe.configure({ mode: 'serial' });

test.describe('Contact Sales Full E2E Flow @e2e @smoke', () => {
  test('complete flow: landing → form → submit → verify in database', async ({ page, request }) => {
    const contactSales = new ContactSalesPage(page);
    const api = new ApiClient(request);

    // Start at the landing page and navigate via CTA
    await page.goto('/');
    const ctaButton = page.getByRole('link', { name: /ONBOARD YOUR HOSPITAL/i });
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();
    await expect(page).toHaveURL(/\/contact-sales/);

    // Generate unique test data
    const hospitalName = `${faker.company.name()} E2E Hospital`;
    const contactPerson = faker.person.fullName();
    const email = faker.internet.email().toLowerCase();
    const phone = faker.phone.number({ style: 'international' });
    const region = faker.location.city();
    const notes = 'E2E test — ' + faker.lorem.sentence(8);

    // Fill the form
    await contactSales.hospitalNameInput.fill(hospitalName);
    await contactSales.contactPersonInput.fill(contactPerson);
    await contactSales.emailInput.fill(email);
    await contactSales.phoneInput.fill(phone);
    await contactSales.regionInput.fill(region);
    await contactSales.notesTextarea.fill(notes);

    // Submit — hits REAL API (no mocking)
    await contactSales.submit();

    // Verify success screen (allow extra time for real API)
    await expect(contactSales.successHeading).toBeVisible({ timeout: 15_000 });
    await expect(contactSales.backToHomeLink).toBeVisible();
    await expect(contactSales.submitAnotherButton).toBeVisible();
    await expect(contactSales.backToHomeLink).toHaveAttribute('href', '/');

    // Verify data persisted in database via authenticated API
    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const { status, body } = await api.listSalesRequests(token!, { q: hospitalName });
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const created = body.items.find((item: any) => item.hospitalName === hospitalName);
    expect(created).toBeTruthy();
    expect(created.email).toBe(email);

    // Verify "Submit Another" resets the form
    await contactSales.submitAnotherButton.click();
    await expect(contactSales.heading).toBeVisible();
    await expect(contactSales.hospitalNameInput).toHaveValue('');
  });

  test('form validation prevents submission — no API call made', async ({ page }) => {
    const contactSales = new ContactSalesPage(page);
    await contactSales.goto();

    // Submit empty form
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');
    await expect(contactSales.successHeading).not.toBeVisible();
  });
});
