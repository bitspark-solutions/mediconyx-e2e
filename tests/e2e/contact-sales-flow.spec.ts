import { test, expect } from '@playwright/test';
import { ContactSalesPage } from '../pages/contact-sales.page';
import { ApiClient } from '../helpers/api-client';
import { faker } from '@faker-js/faker';

test.describe('Contact Sales Full E2E Flow @e2e @smoke', () => {
  test('complete flow: fill form → submit → verify in database via API', async ({ page, request }) => {
    const contactSales = new ContactSalesPage(page);
    const api = new ApiClient(request);

    // Generate unique test data
    const hospitalName = `${faker.company.name()} E2E Hospital`;
    const contactPerson = faker.person.fullName();
    const email = faker.internet.email().toLowerCase();
    const phone = faker.phone.number({ style: 'international' });
    const region = faker.location.city();
    const notes = 'E2E test submission — ' + faker.lorem.sentence(8);

    // Step 1: Navigate to contact sales page
    await contactSales.goto();
    await expect(contactSales.heading).toBeVisible();

    // Step 2: Fill the form with real data
    await contactSales.hospitalNameInput.fill(hospitalName);
    await contactSales.contactPersonInput.fill(contactPerson);
    await contactSales.emailInput.fill(email);
    await contactSales.phoneInput.fill(phone);
    await contactSales.regionInput.fill(region);
    await contactSales.notesTextarea.fill(notes);

    // Step 3: Submit — hits REAL API (no mocking)
    await contactSales.submit();

    // Step 4: Verify success screen appears
    await expect(contactSales.successHeading).toBeVisible({ timeout: 15_000 });
    await expect(contactSales.backToHomeLink).toBeVisible();
    await expect(contactSales.submitAnotherButton).toBeVisible();

    // Step 5: Verify data actually persisted in the database via API
    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const { status, body } = await api.listSalesRequests(token!, { q: hospitalName });
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const createdRequest = body.items.find((item: any) => item.hospitalName === hospitalName);
    expect(createdRequest).toBeTruthy();
    expect(createdRequest.email).toBe(email);
  });

  test('form validation prevents submission with empty required fields', async ({ page }) => {
    const contactSales = new ContactSalesPage(page);
    await contactSales.goto();

    // Try to submit empty — no API call should happen
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');

    // The page should NOT show success state
    await expect(contactSales.successHeading).not.toBeVisible();
  });

  test('navigation from landing page to contact sales and submit', async ({ page, request }) => {
    const api = new ApiClient(request);

    // Start at the landing page
    await page.goto('/');

    // Click the "ONBOARD YOUR HOSPITAL" CTA
    const ctaButton = page.getByRole('link', { name: /ONBOARD YOUR HOSPITAL/i });
    await expect(ctaButton).toBeVisible();
    await ctaButton.click();

    // Should be on contact sales page now
    await expect(page).toHaveURL(/\/contact-sales/);

    // Fill and submit with unique data
    const contactSales = new ContactSalesPage(page);
    const hospitalName = `${faker.company.name()} Landing-E2E`;
    const email = faker.internet.email().toLowerCase();

    await contactSales.hospitalNameInput.fill(hospitalName);
    await contactSales.contactPersonInput.fill(faker.person.fullName());
    await contactSales.emailInput.fill(email);
    await contactSales.phoneInput.fill(faker.phone.number({ style: 'international' }));

    // Submit to real API
    await contactSales.submit();
    await expect(contactSales.successHeading).toBeVisible({ timeout: 15_000 });

    // Verify in database
    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const { body } = await api.listSalesRequests(token!, { q: hospitalName });
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const created = body.items.find((item: any) => item.hospitalName === hospitalName);
    expect(created).toBeTruthy();
    expect(created.email).toBe(email);
  });

  test('submit another allows second submission', async ({ page, request }) => {
    const contactSales = new ContactSalesPage(page);
    const api = new ApiClient(request);

    // Strip chars the API HTML-encodes (matches data-factory behavior)
    const sanitize = (v: string) => v.replace(/['"&<>]/g, '');

    await contactSales.goto();

    // First submission
    const hospital1 = sanitize(`${faker.company.name()} First-E2E`);
    await contactSales.hospitalNameInput.fill(hospital1);
    await contactSales.contactPersonInput.fill(sanitize(faker.person.fullName()));
    await contactSales.emailInput.fill(faker.internet.email().toLowerCase());
    await contactSales.phoneInput.fill(faker.phone.number({ style: 'international' }));
    await contactSales.submit();
    await expect(contactSales.successHeading).toBeVisible({ timeout: 15_000 });

    // Click "Submit Another"
    await contactSales.submitAnotherButton.click();
    await expect(contactSales.heading).toBeVisible();
    await expect(contactSales.hospitalNameInput).toHaveValue('');

    // Second submission
    const hospital2 = sanitize(`${faker.company.name()} Second-E2E`);
    const email2 = faker.internet.email().toLowerCase();
    await contactSales.hospitalNameInput.fill(hospital2);
    await contactSales.contactPersonInput.fill(sanitize(faker.person.fullName()));
    await contactSales.emailInput.fill(email2);
    await contactSales.phoneInput.fill(faker.phone.number({ style: 'international' }));
    await contactSales.submit();
    await expect(contactSales.successHeading).toBeVisible({ timeout: 15_000 });

    // Verify both exist in database
    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const result1 = await api.listSalesRequests(token!, { q: hospital1 });
    expect(result1.body.items.length).toBeGreaterThanOrEqual(1);

    const result2 = await api.listSalesRequests(token!, { q: hospital2 });
    expect(result2.body.items.length).toBeGreaterThanOrEqual(1);

    const created2 = result2.body.items.find((item: any) => item.hospitalName === hospital2);
    expect(created2).toBeTruthy();
    expect(created2.email).toBe(email2);
  });
});
