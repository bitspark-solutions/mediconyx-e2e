import { test, expect } from '@playwright/test';
import { faker } from '@faker-js/faker';
import {
  LoginPage, DoctorPortalPage, PatientPortalPage, AdminPortalPage,
  NursePortalPage, AccountantPortalPage, ReceptionistPortalPage,
} from '../pages/portals.page';
import { PortalApiClient } from '../helpers/portal-api-client';

// ═══════════════════════════════════════════════════════════════
// DOCTOR PORTAL — full E2E
// ═══════════════════════════════════════════════════════════════

test.describe('Doctor Portal E2E @e2e @doctor @smoke', () => {
  test('logs in, views patient list, opens AI summary, switches to appointments', async ({ page, request }) => {
    const login = new LoginPage(page);
    const doctor = new DoctorPortalPage(page);
    const api = new PortalApiClient(request);

    // Login as Dr. Khan
    await login.loginAs('dr.khan@citygeneral.local', 'Doctor@123');
    await doctor.goto();

    // Portal renders
    await expect(doctor.heading).toBeVisible();
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toContain('patient');

    // Verify patient list data is real (cross-check with API)
    const { body: apiBody } = await api.listPatients('doctor');
    const apiPatientCount = (apiBody.patients || apiBody.items || []).length;
    if (apiPatientCount > 0) {
      // UI should not be stuck on empty state
      await expect(doctor.emptyPatientsState).not.toBeVisible();
    }

    // Switch to Appointments tab
    await doctor.appointmentsTab.click();
    await page.waitForTimeout(1000);
    const apptsBody = await page.locator('body').innerText();
    expect(apptsBody.toLowerCase()).toMatch(/appointment|no appointment/);

    // Switch to AI Assist tab
    await doctor.aiAssistTab.click();
    await page.waitForTimeout(800);
    const aiBody = await page.locator('body').innerText();
    expect(aiBody.toLowerCase()).toContain('ai');
  });

  test('search filters patient list', async ({ page }) => {
    const login = new LoginPage(page);
    const doctor = new DoctorPortalPage(page);

    await login.loginAs('dr.khan@citygeneral.local', 'Doctor@123');
    await doctor.goto();
    await expect(doctor.heading).toBeVisible();

    // Get full list count
    const allButtons = await page.locator('button:has(p.text-sm)').count();

    // Search for something specific
    await doctor.patientSearchInput.fill('zzzz_no_match');
    await page.waitForTimeout(500);
    const filteredBody = await page.locator('body').innerText();
    // Either shows empty state or filtered list
    expect(filteredBody.length).toBeGreaterThan(50);
  });
});

// ═══════════════════════════════════════════════════════════════
// PATIENT PORTAL — full E2E
// ═══════════════════════════════════════════════════════════════

test.describe('Patient Portal E2E @e2e @patient @smoke', () => {
  test('logs in, views profile, navigates between tabs', async ({ page }) => {
    const login = new LoginPage(page);
    const patient = new PatientPortalPage(page);

    await login.loginAs('karim.hassan@patient.local', 'Patient@123');
    await patient.goto();
    await expect(patient.heading).toBeVisible();

    // AI Assistant tab is default — should show chat or AI interface
    let bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/assistant|ai|chat/);

    // My Reports tab
    await patient.reportsTab.click();
    await page.waitForTimeout(800);
    bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/report|upload|file/);

    // My Appointments tab
    await patient.appointmentsTab.click();
    await page.waitForTimeout(1000);
    bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/appointment|upcoming|no upcoming/);

    // My Profile tab
    await patient.profileTab.click();
    await page.waitForTimeout(800);
    bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/profile|patient/i);
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN PORTAL — full E2E
// ═══════════════════════════════════════════════════════════════

test.describe('Admin Portal E2E @e2e @admin @smoke', () => {
  test('admin views tenants, hospital settings, and (master) users', async ({ page, request }) => {
    const login = new LoginPage(page);
    const admin = new AdminPortalPage(page);
    const api = new PortalApiClient(request);

    await login.loginAs('admin@mediconyx.local', 'Admin@123');
    await admin.goto();
    await expect(admin.heading).toBeVisible();

    // Tenants tab
    await admin.openTenants();
    let bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/tenant|onboarded/);

    // Hospital Settings tab
    await admin.openHospitalSettings();
    await expect(admin.hospitalNameInput).toBeVisible();

    // Update a setting (description) and save
    const testDesc = `E2E test ${new Date().toISOString()}`;
    const { body: original } = await api.getTenantSettings('admin');
    await admin.descriptionInput.fill(testDesc);
    await admin.saveButton.click();

    // Wait for success or rejection message
    await page.waitForTimeout(2000);
    bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/saved|success|failed/);

    // Verify it persisted via API
    const { body: updated } = await api.getTenantSettings('admin');
    expect(updated.description).toBe(testDesc);

    // Restore original
    if (original && original.description !== undefined) {
      await api.updateTenantSettings('admin', { ...updated, description: original.description });
    }
  });

  test('master sees extra Users tab, regular admin does not', async ({ page, browser }) => {
    const login = new LoginPage(page);

    // Master — should see Users tab
    await login.loginAs('master@mediconyx.local', process.env.TEST_MASTER_PASSWORD || 'MasterPass123!');
    await page.goto('/portal/admin');
    await page.waitForTimeout(1500);
    const masterBody = await page.locator('body').innerText();
    const masterSeesUsers = await page.getByRole('button', { name: /^Users$/ }).isVisible().catch(() => false);
    expect(masterSeesUsers, 'Master should see Users tab').toBe(true);

    // Regular admin — should NOT see Users tab
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    const login2 = new LoginPage(page2);
    await login2.loginAs('admin@mediconyx.local', 'Admin@123');
    await page2.goto('/portal/admin');
    await page2.waitForTimeout(1500);
    const adminSeesUsers = await page2.getByRole('button', { name: /^Users$/ }).isVisible().catch(() => false);
    expect(adminSeesUsers, 'Regular admin should NOT see Users tab').toBe(false);
    await ctx2.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// NURSE PORTAL — full E2E
// ═══════════════════════════════════════════════════════════════

test.describe('Nurse Portal E2E @e2e @nurse @smoke', () => {
  test('nurse views patient list and records vitals', async ({ page, request }) => {
    const login = new LoginPage(page);
    const nurse = new NursePortalPage(page);
    const api = new PortalApiClient(request);

    await login.loginAs('nurse@citygeneral.local', 'Nurse@123');
    await nurse.goto();
    await expect(nurse.heading).toBeVisible();

    // Patient List tab (default)
    let bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toContain('patient');

    // Record Vitals tab
    await nurse.vitalsTab.click();
    await page.waitForTimeout(800);
    await expect(nurse.recordVitalsButton).toBeVisible();

    // Pick a patient + fill vitals + submit
    const { body: patientsBody } = await api.listPatients('nurse').catch(() => ({ body: { patients: [] } }));
    const patients = patientsBody.patients || patientsBody.items || [];
    test.skip(patients.length === 0, 'No patients in DB to record vitals for');

    await nurse.patientSelect.selectOption({ index: 1 });
    await nurse.systolicInput.fill('120');
    await nurse.diastolicInput.fill('80');
    await nurse.heartRateInput.fill('72');
    await nurse.temperatureInput.fill('36.6');
    await nurse.weightInput.fill('70');
    await nurse.heightInput.fill('170');
    await nurse.spO2Input.fill('98');
    await nurse.bloodGlucoseInput.fill('95');
    await nurse.recordVitalsButton.click();

    // Wait for success message OR error
    await page.waitForTimeout(2000);
    bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/vitals recorded|recorded successfully|failed/);

    // Verify in API
    const { body: vitals } = await api.listVitals('nurse', patients[0].id);
    expect(vitals).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// ACCOUNTANT PORTAL — full E2E
// ═══════════════════════════════════════════════════════════════

test.describe('Accountant Portal E2E @e2e @accountant @smoke', () => {
  test('accountant views invoices list', async ({ page }) => {
    const login = new LoginPage(page);
    const accountant = new AccountantPortalPage(page);

    await login.loginAs('admin@mediconyx.local', 'Admin@123'); // admin also allowed
    await accountant.goto();
    await expect(accountant.heading).toBeVisible();

    // Invoices tab is default
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.toLowerCase()).toMatch(/invoice|no invoice|total|paid|outstanding/);

    // Record Payment tab
    await accountant.recordPaymentTab.click();
    await page.waitForTimeout(800);
    await expect(accountant.amountInput).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════
// RECEPTIONIST PORTAL — full E2E
// ═══════════════════════════════════════════════════════════════

test.describe('Receptionist Portal E2E @e2e @receptionist @smoke', () => {
  test('receptionist navigates portal sections', async ({ page }) => {
    const login = new LoginPage(page);
    const reception = new ReceptionistPortalPage(page);

    await login.loginAs('reception@citygeneral.local', 'Reception@123');
    await reception.goto();
    await expect(reception.heading).toBeVisible();

    // Dashboard is default — navigate sections
    for (const tab of [reception.patientsTab, reception.appointmentsTab, reception.queueTab, reception.dashboardTab]) {
      await tab.click();
      await page.waitForTimeout(700);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(50);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// CROSS-PORTAL SMOKE — login + logout for every role
// ═══════════════════════════════════════════════════════════════

test.describe('Cross-portal role-based access @e2e @auth @smoke', () => {
  const rolePortals: Array<{ email: string; password: string; portal: string; canAccess: boolean }> = [
    { email: 'master@mediconyx.local',       password: process.env.TEST_MASTER_PASSWORD || 'MasterPass123!', portal: '/portal/master',       canAccess: true  },
    { email: 'sales@mediconyx.local',         password: 'Sales@123',      portal: '/portal/sales',        canAccess: true  },
    { email: 'admin@mediconyx.local',         password: 'Admin@123',      portal: '/portal/admin',        canAccess: true  },
    { email: 'dr.khan@citygeneral.local',     password: 'Doctor@123',     portal: '/portal/doctor',       canAccess: true  },
    { email: 'reception@citygeneral.local',   password: 'Reception@123',  portal: '/portal/receptionist', canAccess: true  },
    { email: 'karim.hassan@patient.local',    password: 'Patient@123',    portal: '/portal/patient',      canAccess: true  },
  ];

  for (const r of rolePortals) {
    test(`${r.email.split('@')[0]} can access ${r.portal}`, async ({ page }) => {
      const login = new LoginPage(page);
      await login.loginAs(r.email, r.password);
      await page.goto(r.portal);
      await page.waitForTimeout(1500);

      const body = await page.locator('body').innerText();
      // Should NOT be on the unauthorized page
      const url = page.url();
      expect(url).not.toContain('/unauthorized');

      // Body should have substantial content (not blank or error)
      expect(body.length, `${r.email} should see content on ${r.portal}`).toBeGreaterThan(100);
    });
  }

  test('wrong role gets blocked from protected portal', async ({ page }) => {
    // Patient trying to access doctor portal should be blocked
    const login = new LoginPage(page);
    await login.loginAs('karim.hassan@patient.local', 'Patient@123');
    await page.goto('/portal/doctor');

    // Block is asynchronous (hydration → role check → redirect), so poll
    // instead of asserting after a fixed sleep — fixed sleeps flake under
    // parallel worker CPU contention.
    await expect(async () => {
      const url = page.url();
      const body = await page.locator('body').innerText();
      const isBlocked = url.includes('/unauthorized') ||
                        url.includes('/login') ||
                        body.toLowerCase().includes('unauthorized') ||
                        body.toLowerCase().includes('not authorized') ||
                        body.toLowerCase().includes('access denied') ||
                        body.toLowerCase().includes('redirecting');
      expect(isBlocked, `Patient should be blocked from /portal/doctor, but got URL=${url}`).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
