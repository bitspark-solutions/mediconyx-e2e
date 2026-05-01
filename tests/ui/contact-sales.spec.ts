import { test, expect } from '@playwright/test';
import { ContactSalesPage } from '../pages/contact-sales.page';
import { validHospital } from '../helpers/test-data';

let contactSales: ContactSalesPage;

test.beforeEach(async ({ page }) => {
  contactSales = new ContactSalesPage(page);
  await contactSales.goto();
});

// ── Page Load ──────────────────────────────────────────────────

test.describe('Page Load @smoke', () => {
  test('displays correct heading and navbar', async () => {
    await expect(contactSales.heading).toBeVisible();
    await expect(contactSales.logo).toBeVisible();
    await expect(contactSales.signInLink).toBeVisible();
  });

  test('displays hospital onboarding badge', async () => {
    await expect(contactSales.badge).toBeVisible();
  });

  test('displays both form sections', async ({ page }) => {
    await expect(page.getByText('Hospital Information')).toBeVisible();
    await expect(page.getByText('Additional Details')).toBeVisible();
  });

  test('displays trust badges', async () => {
    await expect(contactSales.hipaaCompliant).toBeVisible();
    await expect(contactSales.sslEncryption).toBeVisible();
    await expect(contactSales.responseTime).toBeVisible();
  });

  test('all required fields have asterisk markers', async ({ page }) => {
    const requiredLabels = ['Hospital Name', 'Contact Person', 'Email Address', 'Phone Number'];
    for (const label of requiredLabels) {
      const labelEl = page.locator('label', { hasText: label });
      await expect(labelEl.locator('span')).toBeVisible();
    }
  });

  test('region field does not have asterisk', async ({ page }) => {
    const regionLabel = page.locator('label', { hasText: 'Region / City' });
    await expect(regionLabel.locator('span.text-red-500')).toHaveCount(0);
  });

  test('all form inputs are initially empty', async () => {
    await expect(contactSales.hospitalNameInput).toHaveValue('');
    await expect(contactSales.contactPersonInput).toHaveValue('');
    await expect(contactSales.emailInput).toHaveValue('');
    await expect(contactSales.phoneInput).toHaveValue('');
    await expect(contactSales.regionInput).toHaveValue('');
  });
});

// ── Validation ─────────────────────────────────────────────────

test.describe('Validation @contact', () => {
  test('shows error when submitting empty form', async () => {
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');
  });

  test('shows error when hospital name is missing', async () => {
    await contactSales.contactPersonInput.fill('Dr. Test');
    await contactSales.emailInput.fill('test@test.com');
    await contactSales.phoneInput.fill('+1-555-0000');
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');
  });

  test('shows error when email is missing', async () => {
    await contactSales.hospitalNameInput.fill('Test Hospital');
    await contactSales.contactPersonInput.fill('Dr. Test');
    await contactSales.phoneInput.fill('+1-555-0000');
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');
  });

  test('shows error when phone is missing', async () => {
    await contactSales.hospitalNameInput.fill('Test Hospital');
    await contactSales.contactPersonInput.fill('Dr. Test');
    await contactSales.emailInput.fill('test@test.com');
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');
  });

  test('shows error when contact person is missing', async () => {
    await contactSales.hospitalNameInput.fill('Test Hospital');
    await contactSales.emailInput.fill('test@test.com');
    await contactSales.phoneInput.fill('+1-555-0000');
    await contactSales.submit();
    await contactSales.expectErrorVisible('Please fill in all required fields.');
  });
});

// ── Form Interaction ───────────────────────────────────────────

test.describe('Form Interaction @contact', () => {
  test('can fill all fields', async () => {
    await contactSales.fillRequiredFields();
    await contactSales.fillOptionalFields({
      region: validHospital.region,
      notes: validHospital.notes,
    });

    await expect(contactSales.hospitalNameInput).toHaveValue(validHospital.hospitalName);
    await expect(contactSales.contactPersonInput).toHaveValue(validHospital.contactPerson);
    await expect(contactSales.emailInput).toHaveValue(validHospital.email);
    await expect(contactSales.phoneInput).toHaveValue(validHospital.phone);
    await expect(contactSales.regionInput).toHaveValue(validHospital.region);
  });

  test('submit button is visible and enabled', async () => {
    await expect(contactSales.submitButton).toBeVisible();
    await expect(contactSales.submitButton).toBeEnabled();
  });

  test('file upload area is visible', async () => {
    await expect(contactSales.uploadLabel).toBeVisible();
  });
});

// ── Successful Submission (Mocked) ─────────────────────────────

test.describe('Submission @contact @smoke', () => {
  test('successful submission shows success state', async ({ page }) => {
    await page.route('**/api/sales/requests/public', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999, status: 'pending' }),
      })
    );

    await contactSales.fillRequiredFields();
    await contactSales.submit();
    await contactSales.expectSuccessState();
  });

  test('success state has back to home link', async ({ page }) => {
    await page.route('**/api/sales/requests/public', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999, status: 'pending' }),
      })
    );

    await contactSales.fillRequiredFields();
    await contactSales.submit();
    await expect(contactSales.backToHomeLink).toHaveAttribute('href', '/');
  });

  test('submit another resets to form', async ({ page }) => {
    await page.route('**/api/sales/requests/public', route =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 999, status: 'pending' }),
      })
    );

    await contactSales.fillRequiredFields();
    await contactSales.submit();
    await contactSales.submitAnotherButton.click();

    await expect(contactSales.heading).toBeVisible();
    await expect(contactSales.hospitalNameInput).toHaveValue('');
  });

  test('shows error on API failure', async ({ page }) => {
    await page.route('**/api/sales/requests/public', route =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Invalid email address.' }),
      })
    );

    await contactSales.fillRequiredFields();
    await contactSales.submit();
    await contactSales.expectErrorVisible('Invalid email address.');
  });

  test('shows network error on connection failure', async ({ page }) => {
    await page.route('**/api/sales/requests/public', route => route.abort());

    await contactSales.fillRequiredFields();
    await contactSales.submit();
    await contactSales.expectErrorVisible('Network error');
  });
});

// ── Navigation ─────────────────────────────────────────────────

test.describe('Navigation @contact', () => {
  test('logo links to home page', async () => {
    await contactSales.logo.click();
    await expect(contactSales.page).toHaveURL('/');
  });

  test('sign in links to login page', async () => {
    await contactSales.signInLink.click();
    await expect(contactSales.page).toHaveURL(/\/login/);
  });
});
