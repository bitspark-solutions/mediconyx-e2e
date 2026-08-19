import { test, expect, APIRequestContext, Page, Locator } from '@playwright/test';
import { ContactSalesPage } from '../pages/contact-sales.page';
import path from 'path';

/**
 * The complete onboarding story, told ENTIRELY through the UI (no API shortcuts):
 *   1. A new hospital submits the contact-sales form (browser)
 *   2. Sales logs in, claims + qualifies the request (browser)
 *   3. Sales fills hospital profile, technical requirements, modules,
 *      uploads 3 mandatory documents, sets pricing (browser)
 *   4. Sales approves, confirms payment, provisions the tenant (browser)
 *   5. The welcome email arrives (browser — MailHog)
 *   6. The new hospital admin logs in for the first time (browser)
 *
 * Companion to onboarding-story.spec.ts (which drives steps 2-4 via API).
 * Run headed + slow for demos:
 *   TEST_ENV=test SLOW_MO=2000 npx playwright test tests/e2e/onboarding-story-ui.spec.ts --headed --workers=1
 */

const API = process.env.API_BASE_URL || 'http://localhost:9765';
const MAILHOG = process.env.MAILHOG_URL
  || (process.env.TEST_ENV === 'test' ? 'http://localhost:8126' : 'http://localhost:8025');

const STAMP = Date.now().toString(36);
const HOSPITAL = {
  name: `UI Story Hospital ${STAMP}`,
  contact: 'Dr. UI Demo',
  email: `ui-admin-${STAMP}@storyhospital.local`,
  phone: '+880-1700-666666',
};

const FIXTURES = [
  'license.pdf',
  'tax-certificate.pdf',
  'business-registration.pdf',
].map(f => path.join(__dirname, '..', 'fixtures', f));

// The sales forms render <label> as an unlinked sibling of the input (no htmlFor),
// so getByLabel doesn't work — target the control that follows its label text.
// Exact normalized match: "Name *" must not match "Hospital Legal Name *".
function fieldAfter(page: Page, label: string, tag = 'input'): Locator {
  return page.locator(`xpath=//label[normalize-space(.)="${label}"]/following-sibling::${tag}`).first();
}

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/portal\//, { timeout: 15_000 });
}

async function extractTempPassword(request: APIRequestContext): Promise<string> {
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
  }).toPass({ timeout: 30_000, intervals: [1000, 2000] });
  return tempPassword;
}

test.describe('Full onboarding story — fully visible UI @e2e @onboarding @video', () => {
  test('every step through the browser: submit → sales pipeline → provision → email → first login', async ({ page, request }) => {
    test.setTimeout(480_000);

    // ── 1. Hospital submits the contact form ────────────────────────
    const form = new ContactSalesPage(page);
    await form.goto();
    await form.fillRequiredFields({
      hospitalName: HOSPITAL.name,
      contactPerson: HOSPITAL.contact,
      email: HOSPITAL.email,
      phone: HOSPITAL.phone,
    });
    await form.fillOptionalFields({
      notes: 'Fully-visible UI demo: OPD + IPD + billing + telemedicine, 25 seats.',
    });
    await page.waitForTimeout(800);
    await form.submit();
    await form.expectSuccessState();
    await page.waitForTimeout(1500);

    // ── 2. Sales logs in and opens the request ──────────────────────
    await uiLogin(page, 'sales@mediconyx.local', 'Sales@123');
    await page.waitForTimeout(1000);

    await page.getByPlaceholder(/search hospital or email/i).fill(HOSPITAL.name);
    await page.waitForTimeout(1200); // debounce (300ms) + fetch
    await page.getByRole('row', { name: new RegExp(HOSPITAL.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
    await expect(page.getByRole('heading', { name: HOSPITAL.name })).toBeVisible();
    await page.waitForTimeout(1000);

    // Claim + Qualify
    await page.getByRole('button', { name: 'Claim', exact: true }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Qualify', exact: true }).click();
    await page.waitForTimeout(1200);

    // ── 3a. Hospital Profile tab (Qualified → InProgress on save) ───
    await page.getByRole('button', { name: 'Hospital Profile', exact: true }).click();
    await page.waitForTimeout(800);
    await fieldAfter(page, 'Hospital Legal Name *').fill(HOSPITAL.name);
    await fieldAfter(page, 'License Number *').fill(`LIC-${STAMP}`);
    await fieldAfter(page, 'Tax ID *').fill(`TAX-${STAMP}`);
    await fieldAfter(page, 'Bed Capacity *').fill('100');
    await fieldAfter(page, 'Address Line 1 *').fill('1 Story Lane');
    await fieldAfter(page, 'City *').fill('Dhaka');
    await fieldAfter(page, 'State/Province *').fill('Dhaka');
    await fieldAfter(page, 'Postal Code *').fill('1200');
    await fieldAfter(page, 'Name *').fill(HOSPITAL.contact);
    await fieldAfter(page, 'Email *').fill(HOSPITAL.email);
    await fieldAfter(page, 'Phone *').fill(HOSPITAL.phone);
    await page.getByRole('button', { name: /Save Profile/i }).click();
    // Saving a new profile transitions Qualified → InProgress, which reveals the Approve button.
    // (The success banner is unobservable: onSaved reloads the modal and unmounts the form.)
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1000);

    // ── 3b. Technical Requirements tab ──────────────────────────────
    await page.getByRole('button', { name: 'Technical', exact: true }).click();
    await page.waitForTimeout(800);
    await fieldAfter(page, 'Departments List * (comma-separated)', 'textarea').fill('Cardiology, Neurology, Orthopedics, Emergency, ICU');
    await fieldAfter(page, 'Name *').fill('IT Demo Person');
    await fieldAfter(page, 'Email *').fill(`it-${STAMP}@storyhospital.local`);
    await fieldAfter(page, 'Phone *').fill(HOSPITAL.phone);
    await page.getByRole('button', { name: /Save Requirements/i }).click();
    await page.waitForTimeout(2000); // save + modal reload unmounts the success banner
    await expect(page.getByText(/Failed to save requirements/i)).not.toBeVisible();

    // ── 3c. Modules tab ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Modules', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'standard', exact: true }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Save Modules/i }).click();
    await page.waitForTimeout(2000); // save + modal reload unmounts the success banner
    await expect(page.getByText(/Failed to save module selection/i)).not.toBeVisible();

    // ── 3d. Documents tab — 3 mandatory uploads ─────────────────────
    await page.getByRole('button', { name: 'Documents', exact: true }).click();
    await page.waitForTimeout(800);
    const fileInput = page.locator('input[type="file"]');
    for (const fixture of FIXTURES) {
      await fileInput.setInputFiles(fixture);
      await page.waitForTimeout(1500); // upload + reload
    }
    await expect(page.getByText('license.pdf')).toBeVisible();
    await expect(page.getByText('tax-certificate.pdf')).toBeVisible();
    await expect(page.getByText('business-registration.pdf')).toBeVisible();

    // ── 3e. Pricing tab ─────────────────────────────────────────────
    await page.getByRole('button', { name: 'Pricing', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Standard/ }).first().click();
    await fieldAfter(page, 'User Seats').fill('25');
    await page.getByRole('button', { name: /Apply to Quote/i }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: /Save Pricing/i }).click();
    await page.waitForTimeout(1200);

    // ── 4. Approve → Confirm Payment → Provision ────────────────────
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Confirm Payment/i }).click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /Provision Tenant/i }).click();
    await page.waitForTimeout(4000); // provisioning + welcome email fire off

    // ── 5. Welcome email arrives (browser — MailHog) ────────────────
    const tempPassword = await extractTempPassword(request);
    await page.goto(MAILHOG);
    await page.getByText(/account is ready/i).first().click();
    await page.waitForTimeout(3000); // let the viewer read the email

    // ── 6. New hospital admin's first login (browser) ───────────────
    await uiLogin(page, HOSPITAL.email, tempPassword);
    await page.waitForTimeout(3000); // show the new admin's portal landing
    expect(page.url()).toContain('/portal/');
  });
});
