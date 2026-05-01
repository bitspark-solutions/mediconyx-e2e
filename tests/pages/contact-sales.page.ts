import { type Locator, type Page, expect } from '@playwright/test';

export class ContactSalesPage {
  readonly page: Page;

  // Nav
  readonly logo: Locator;
  readonly signInLink: Locator;
  readonly homeLink: Locator;

  // Hero
  readonly heading: Locator;
  readonly badge: Locator;

  // Form — inputs
  readonly hospitalNameInput: Locator;
  readonly contactPersonInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly regionInput: Locator;
  readonly notesTextarea: Locator;

  // Form — file upload
  readonly fileInput: Locator;
  readonly uploadLabel: Locator;

  // Form — actions
  readonly submitButton: Locator;

  // Feedback
  readonly errorAlert: Locator;

  // Success state
  readonly successHeading: Locator;
  readonly backToHomeLink: Locator;
  readonly submitAnotherButton: Locator;

  // Trust badges
  readonly hipaaCompliant: Locator;
  readonly sslEncryption: Locator;
  readonly responseTime: Locator;

  constructor(page: Page) {
    this.page = page;

    // Nav
    this.logo = page.locator('nav').getByText('Mediconyx');
    this.signInLink = page.locator('nav').getByText('SIGN IN');
    this.homeLink = page.locator('nav').getByText('Home');

    // Hero
    this.heading = page.getByRole('heading', { name: /Get Started with Mediconyx/i });
    this.badge = page.getByText('Hospital Onboarding');

    // Form fields
    this.hospitalNameInput = page.getByLabel(/Hospital Name/i);
    this.contactPersonInput = page.getByLabel(/Contact Person/i);
    this.emailInput = page.getByLabel(/Email Address/i);
    this.phoneInput = page.getByLabel(/Phone Number/i);
    this.regionInput = page.getByLabel(/Region/i);
    this.notesTextarea = page.getByLabel(/Notes/i);

    // File upload
    this.fileInput = page.locator('input[type="file"]');
    this.uploadLabel = page.getByText(/Click to upload or drag files here/i);

    // Actions
    this.submitButton = page.getByRole('button', { name: /Submit Request/i });

    // Feedback
    this.errorAlert = page.locator('[class*="bg-red"]');

    // Success
    this.successHeading = page.getByRole('heading', { name: /Request Submitted/i });
    this.backToHomeLink = page.getByRole('link', { name: /Back to Home/i });
    this.submitAnotherButton = page.getByRole('button', { name: /Submit Another/i });

    // Trust badges
    this.hipaaCompliant = page.getByText('HIPAA Compliant');
    this.sslEncryption = page.getByText('256-bit SSL Encryption');
    this.responseTime = page.getByText('Response within 24 hours');
  }

  async goto() {
    await this.page.goto('/contact-sales');
  }

  async fillRequiredFields(data?: Partial<{
    hospitalName: string;
    contactPerson: string;
    email: string;
    phone: string;
  }>) {
    await this.hospitalNameInput.fill(data?.hospitalName ?? 'City General Hospital');
    await this.contactPersonInput.fill(data?.contactPerson ?? 'Dr. Rahman Ahmed');
    await this.emailInput.fill(data?.email ?? 'rahman@citygeneral.com');
    await this.phoneInput.fill(data?.phone ?? '+880-1712-345678');
  }

  async fillOptionalFields(data?: Partial<{
    region: string;
    notes: string;
  }>) {
    if (data?.region) await this.regionInput.fill(data.region);
    if (data?.notes) await this.notesTextarea.fill(data.notes);
  }

  async submit() {
    await this.submitButton.click();
  }

  async expectErrorVisible(message?: string) {
    await expect(this.errorAlert).toBeVisible();
    if (message) {
      await expect(this.errorAlert).toContainText(message);
    }
  }

  async expectSuccessState() {
    await expect(this.successHeading).toBeVisible();
    await expect(this.backToHomeLink).toBeVisible();
    await expect(this.submitAnotherButton).toBeVisible();
  }
}
