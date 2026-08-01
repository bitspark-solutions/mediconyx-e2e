import { test, expect, APIRequestContext } from '@playwright/test';
import { ContactSalesPage } from '../pages/contact-sales.page';

/**
 * The complete onboarding story, told in one visible browser flow:
 *   1. A new hospital submits the contact-sales form (browser)
 *   2. Sales claims, qualifies, collects profile + modules, sets pricing, marks paid (API)
 *   3. Master provisions the tenant (API)
 *   4. The welcome email arrives (browser — MailHog)
 *   5. The new hospital admin logs in for the first time (browser)
 *
 * Run with video on (default for the e2e project) and collect with:
 *   node scripts/collect-videos.mjs "onboarding story"
 */

const API = process.env.API_BASE_URL || 'http://localhost:9765';
const MAILHOG = process.env.MAILHOG_URL
  || (process.env.TEST_ENV === 'test' ? 'http://localhost:8026' : 'http://localhost:8025');
const MASTER_PASSWORD = process.env.TEST_MASTER_PASSWORD || 'MasterPass123!';

const STAMP = Date.now().toString(36);
const HOSPITAL = {
  name: `Onboard Story Hospital ${STAMP}`,
  contact: 'Dr. Onboard Demo',
  email: `onboard-admin-${STAMP}@storyhospital.local`,
  phone: '+880-1700-555555',
};
const PASSWORD = 'Onboard@123';

async function login(request: APIRequestContext, email: string, password: string) {
  const r = await request.post(`${API}/api/auth/login`, { data: { email, password } });
  expect(r.ok(), `login as ${email}`).toBeTruthy();
  return (await r.json()).accessToken as string;
}

test.describe('Full onboarding story @e2e @onboarding @video', () => {
  test('tenant submits → sales onboards → master provisions → welcome email → admin first login', async ({ page, request }) => {
    test.setTimeout(120_000);

    // ── 1. Tenant submits the contact form ──────────────────────────
    const form = new ContactSalesPage(page);
    await form.goto();
    await form.fillRequiredFields({
      hospitalName: HOSPITAL.name,
      contactPerson: HOSPITAL.contact,
      email: HOSPITAL.email,
      phone: HOSPITAL.phone,
    });
    await form.fillOptionalFields({
      notes: 'Full onboarding demo: OPD + IPD + billing + telemedicine, 25 seats.',
    });
    await page.waitForTimeout(800);
    await form.submit();
    await form.expectSuccessState();
    await page.waitForTimeout(1200);

    // ── 2. Sales takes over ─────────────────────────────────────────
    const sales = await login(request, 'sales@mediconyx.local', 'Sales@123');
    const salesH = { Authorization: `Bearer ${sales}`, 'Content-Type': 'application/json' };

    const list = await request.get(`${API}/api/sales/requests?pageSize=50`, { headers: salesH });
    const items = (await list.json()).items ?? [];
    const req = items.find((r: any) => r.hospitalName === HOSPITAL.name);
    expect(req, 'submitted request in pipeline').toBeTruthy();

    expect((await request.post(`${API}/api/sales/requests/${req.id}/claim`, { headers: salesH })).status()).toBe(204);
    expect((await request.patch(`${API}/api/sales/requests/${req.id}/qualify`, {
      headers: salesH, data: { qualified: true, notes: 'Onboarding demo: approved' },
    })).ok()).toBeTruthy();

    expect((await request.post(`${API}/api/sales/requests/${req.id}/hospital-profile`, {
      headers: salesH,
      data: {
        hospitalLegalName: HOSPITAL.name, licenseNumber: `LIC-${STAMP}`, taxId: `TAX-${STAMP}`,
        hospitalType: 'Private', bedCapacity: 100, addressLine1: '1 Story Lane',
        city: 'Dhaka', stateProvince: 'Dhaka', postalCode: '1200', country: 'Bangladesh',
        primaryContactName: HOSPITAL.contact, primaryContactEmail: HOSPITAL.email,
        primaryContactPhone: HOSPITAL.phone, establishedYear: 2020,
      },
    })).status()).toBe(201);

    expect((await request.post(`${API}/api/sales/requests/${req.id}/modules`, {
      headers: salesH,
      data: {
        opdManagement: true, ipdManagement: true, emergencyServices: false,
        pharmacyManagement: false, laboratory: true, radiologyImaging: false,
        billingInvoicing: true, inventoryManagement: false, hrPayroll: false,
        appointmentScheduling: true, telemedicine: true, analyticsReporting: false,
      },
    })).status()).toBe(201);

    expect((await request.patch(`${API}/api/sales/requests/${req.id}/pricing`, {
      headers: salesH,
      data: { subscriptionPlan: 'Standard', billingCycle: 'Annual', currency: 'BDT', quotedPrice: 500000, seats: 25, userLicenses: 25, contractDuration: 12 },
    })).status()).toBe(204);

    expect((await request.patch(`${API}/api/sales/requests/${req.id}/payment-status`, {
      headers: salesH,
      data: { paymentStatus: 'Paid', paymentMethod: 'BankTransfer', contractStartDate: new Date().toISOString() },
    })).status()).toBe(204);

    expect((await request.patch(`${API}/api/sales/requests/${req.id}/status`, {
      headers: salesH, data: { status: 'AwaitingPayment', notes: 'Payment confirmed' },
    })).status()).toBe(204);

    // ── 3. Master provisions ────────────────────────────────────────
    const master = await login(request, 'master@mediconyx.local', MASTER_PASSWORD);
    const provision = await request.post(`${API}/api/sales/requests/${req.id}/provision`, {
      headers: { Authorization: `Bearer ${master}`, 'Content-Type': 'application/json' }, data: {},
    });
    expect(provision.ok(), await provision.text()).toBeTruthy();
    const provisioned = await provision.json();
    expect(provisioned.success).toBe(true);

    // ── 4. Welcome email arrives (browser — MailHog) ────────────────
    let tempPassword = '';
    await expect(async () => {
      const res = await request.get(`${MAILHOG}/api/v2/messages?limit=10`);
      const messages = (await res.json()).items ?? [];
      const welcome = messages.find((m: any) =>
        m.To.some((t: any) => `${t.Mailbox}@${t.Domain}` === HOSPITAL.email)
        && /account is ready/i.test(m.Content.Headers.Subject?.[0] ?? ''));
      expect(welcome, 'welcome email for new admin').toBeTruthy();
      const body = welcome.Content.Body.replace(/=[0-9A-Fa-f]{2}/g, ' ').replace(/<[^>]+>/g, ' ');
      const candidates = (body.match(/[A-Za-z0-9!@#$%^&*]{12,}/g) || [])
        .filter((x: string) => /\d/.test(x) && /[A-Z]/.test(x) && /[a-z]/.test(x));
      expect(candidates.length).toBeGreaterThan(0);
      tempPassword = candidates[0];
    }).toPass({ timeout: 15_000, intervals: [1000, 2000] });

    await page.goto(MAILHOG);
    await page.getByText(/account is ready/i).first().click();
    await page.waitForTimeout(2500); // let the viewer read the welcome email

    // ── 5. New hospital admin's first login (browser) ───────────────
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(HOSPITAL.email);
    await page.getByLabel(/password/i).fill(tempPassword);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await page.waitForURL(/\/portal\//, { timeout: 15_000 });
    await page.waitForTimeout(2500); // show the new admin's portal landing

    expect(page.url()).toContain('/portal/');
  });
});
