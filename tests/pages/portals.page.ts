import { type Locator, type Page, expect } from '@playwright/test';

export class LoginPage {
  constructor(public page: Page) {}

  get emailInput() { return this.page.locator('input[type="email"], input[name="email"]').first(); }
  get passwordInput() { return this.page.locator('input[type="password"]').first(); }
  get submitButton() { return this.page.locator('button[type="submit"]').first(); }

  async goto() {
    await this.page.goto('/login');
  }

  async loginAs(email: string, password: string) {
    await this.goto();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
    // Wait until the login form is no longer visible OR the URL changes.
    // Some roles redirect slowly via AuthRedirectGuard; some via direct router.push.
    // Either way, the login form being gone means auth worked.
    try {
      await this.page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
    } catch {
      // URL didn't change — wait for the form to disappear (means login completed but maybe stuck in guard)
      await this.page.locator('form').first().waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {});
    }
    // Give the app a moment to settle
    await this.page.waitForTimeout(500);
    // Fail loudly if login clearly did not succeed — otherwise later steps
    // fail with misleading "element not found" errors on the login page.
    if (this.page.url().includes('/login')) {
      throw new Error(`Login as ${email} failed: still on /login after submit (check credentials for this stack)`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// DOCTOR PORTAL
// ═══════════════════════════════════════════════════════════════

export class DoctorPortalPage {
  constructor(public page: Page) {}

  get heading() { return this.page.locator('h2').first(); }
  get patientsTab() { return this.page.getByRole('button', { name: /^Patients$/ }); }
  get appointmentsTab() { return this.page.getByRole('button', { name: /^Appointments$/ }); }
  get aiAssistTab() { return this.page.getByRole('button', { name: /AI Assist/i }); }
  get newConsultationTab() { return this.page.getByRole('button', { name: /New Consultation/i }); }
  get patientSearchInput() { return this.page.getByPlaceholder(/Search patients/i).last(); }
  get aiSummaryHeading() { return this.page.getByText('AI Health Summary'); }
  get emptyPatientsState() { return this.page.getByText(/No patients found/i); }

  async goto() {
    await this.page.goto('/portal/doctor');
  }

  async selectPatientByName(name: string) {
    await this.page.getByRole('button').filter({ hasText: name }).first().click();
  }
}

// ═══════════════════════════════════════════════════════════════
// PATIENT PORTAL
// ═══════════════════════════════════════════════════════════════

export class PatientPortalPage {
  constructor(public page: Page) {}

  get heading() { return this.page.locator('h2').first(); }
  get chatTab() { return this.page.getByRole('button', { name: /AI Assistant/i }); }
  get reportsTab() { return this.page.getByRole('button', { name: /My Reports/i }); }
  get appointmentsTab() { return this.page.getByRole('button', { name: /^Appointments$/ }); }
  get profileTab() { return this.page.getByRole('button', { name: /My Profile/i }); }

  async goto() {
    await this.page.goto('/portal/patient');
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN PORTAL
// ═══════════════════════════════════════════════════════════════

export class AdminPortalPage {
  constructor(public page: Page) {}

  get heading() { return this.page.locator('h1').first(); }
  get reviewQueueTab() { return this.page.getByRole('button', { name: /Review Queue/i }); }
  get tenantsTab() { return this.page.getByRole('button', { name: /^Tenants$/ }); }
  get hospitalSettingsTab() { return this.page.getByRole('button', { name: /Hospital Settings/i }); }
  get usersTab() { return this.page.getByRole('button', { name: /^Users$/ }); }

  get hospitalNameInput() { return this.page.getByLabel(/Hospital Name/i); }
  get descriptionInput() { return this.page.getByLabel(/Description/i); }
  get contactEmailInput() { return this.page.getByLabel(/Contact Email/i); }
  get contactPhoneInput() { return this.page.getByLabel(/Contact Phone/i); }
  get addressInput() { return this.page.getByLabel(/^Address/i); }
  get saveButton() { return this.page.getByRole('button', { name: /Save Changes/i }); }
  get uploadLogoButton() { return this.page.getByText(/Upload Logo/i); }
  get successMessage() { return this.page.getByText(/Settings saved successfully/i); }

  async goto() {
    await this.page.goto('/portal/admin');
  }

  async openHospitalSettings() {
    await this.hospitalSettingsTab.click();
    // Wait for the settings panel to render
    await this.page.waitForTimeout(800);
  }

  async openTenants() {
    await this.tenantsTab.click();
    await this.page.waitForTimeout(800);
  }
}

// ═══════════════════════════════════════════════════════════════
// NURSE PORTAL
// ═══════════════════════════════════════════════════════════════

export class NursePortalPage {
  constructor(public page: Page) {}

  get heading() { return this.page.locator('h2').first(); }
  get patientsTab() { return this.page.getByRole('button', { name: /Patient List/i }); }
  get vitalsTab() { return this.page.getByRole('list').getByRole('button', { name: /Record Vitals/i }); }
  get queueTab() { return this.page.getByRole('button', { name: /Today's Queue/i }); }

  get patientSelect() { return this.page.locator('select').first(); }
  get systolicInput() { return this.page.getByLabel(/Systolic/i); }
  get diastolicInput() { return this.page.getByLabel(/Diastolic/i); }
  get heartRateInput() { return this.page.getByLabel(/Heart Rate/i); }
  get temperatureInput() { return this.page.getByLabel(/Temperature/i); }
  get weightInput() { return this.page.getByLabel(/Weight/i); }
  get heightInput() { return this.page.getByLabel(/Height/i); }
  get spO2Input() { return this.page.getByLabel(/SpO2/i); }
  get bloodGlucoseInput() { return this.page.getByLabel(/Blood Glucose/i); }
  get recordVitalsButton() { return this.page.getByRole('button', { name: /Record Vitals/i }).last(); }
  get vitalsSuccessMessage() { return this.page.getByText(/Vitals recorded successfully/i); }

  async goto() {
    await this.page.goto('/portal/nurse');
  }
}

// ═══════════════════════════════════════════════════════════════
// ACCOUNTANT PORTAL
// ═══════════════════════════════════════════════════════════════

export class AccountantPortalPage {
  constructor(public page: Page) {}

  get heading() { return this.page.locator('h2').first(); }
  get invoicesTab() { return this.page.getByRole('button', { name: /^Invoices$/ }); }
  get recordPaymentTab() { return this.page.getByRole('button', { name: /Record Payment/i }).first(); }

  get invoiceSelect() { return this.page.locator('select').first(); }
  get amountInput() { return this.page.getByLabel(/^Amount/i); }
  get methodSelect() { return this.page.getByLabel(/Method/i); }
  get referenceInput() { return this.page.getByLabel(/Reference/i); }
  get submitPaymentButton() { return this.page.getByRole('button', { name: /Record Payment/i }); }
  get paymentSuccessMessage() { return this.page.getByText(/Payment recorded successfully/i); }

  async goto() {
    await this.page.goto('/portal/accountant');
  }
}

// ═══════════════════════════════════════════════════════════════
// RECEPTIONIST PORTAL
// ═══════════════════════════════════════════════════════════════

export class ReceptionistPortalPage {
  constructor(public page: Page) {}

  get heading() { return this.page.locator('h2').first(); }
  get dashboardTab() { return this.page.getByRole('button', { name: /^Dashboard$/ }); }
  get patientsTab() { return this.page.getByRole('button', { name: /^Patients$/ }); }
  get appointmentsTab() { return this.page.getByRole('button', { name: /^Appointments$/ }); }
  get queueTab() { return this.page.getByRole('button', { name: /^Queue$/ }); }

  async goto() {
    await this.page.goto('/portal/receptionist');
  }
}
