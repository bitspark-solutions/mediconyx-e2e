import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/portals.page';
import { PortalApiClient } from '../helpers/portal-api-client';

// ═══════════════════════════════════════════════════════════════
// NEW CONSULTATION WORKFLOW — browser-driven (receptionist portal)
// Proves the UI creates a real appointment: register walk-in →
// pick department/doctor/slot → Create Consultation → queue + API.
// ═══════════════════════════════════════════════════════════════

test.describe('New Consultation workflow (browser) @e2e @consultation @receptionist', () => {
  test('receptionist books a consultation for a walk-in patient end to end', async ({ page, request }) => {
    const api = new PortalApiClient(request);
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const patientFirst = 'Browser';
    const patientLast = `Walkin-${stamp}`;
    const deptName = `Consult Dept ${stamp}`;
    const docLast = `Flow-${stamp}`;

    // ── Setup via API as hospital admin: fresh department + doctor + schedule ──
    const dept = await api.createDepartment('hospitalAdmin', {
      name: deptName, code: `CNS-${stamp}`.slice(0, 20),
    });
    expect(dept.status).toBe(201);
    const departmentId = dept.body.id;

    const doc = await api.createDoctor('hospitalAdmin', {
      firstName: 'Consult', lastName: docLast,
      email: `browser-consult-${stamp}@citygeneral.local`,
      password: 'Doc@12345', specialization: 'General',
      departmentId, consultationDurationMinutes: 30, consultationFee: 1000,
    });
    expect(doc.status).toBe(201);
    const doctorUserId = doc.body.userId;

    const sched = await api.createDoctorSchedule('hospitalAdmin', {
      doctorId: doctorUserId, departmentId,
      dayOfWeek: new Date().getUTCDay(), startTime: '09:00', endTime: '17:00', slotDurationMinutes: 60,
    });
    expect(sched.ok).toBe(true);

    // ── Browser: receptionist opens the New Consultation workflow ──
    const login = new LoginPage(page);
    await login.loginAs('reception@citygeneral.local', 'Reception@123');
    await page.goto('/portal/receptionist');
    await expect(page.locator('h2').first()).toBeVisible();

    // Open the New Consultation tab (sidebar nav or primary action — same destination)
    await page.getByRole('button', { name: /New Consultation/i }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: /New Patient Consultation/i })).toBeVisible();
    await page.waitForSelector('#nc-full-name', { state: 'visible' });

    // Step 2: register the walk-in patient
    await page.locator('#nc-full-name').fill(`${patientFirst} ${patientLast}`);
    await page.locator('#nc-phone').fill('+8801700112233');

    // Step 3: consultation details — dropdowns are keyed by API ids from setup
    await page.locator('#nc-department').selectOption(String(departmentId));
    await page.locator('#nc-doctor').selectOption(String(doctorUserId));

    // Slots derive from the doctor's schedule — pick the first one
    const slotChip = page.locator('button', { hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(slotChip).toBeVisible({ timeout: 10_000 });
    await slotChip.click();

    // Clinical note is carried into the appointment
    await page.getByLabel('Clinical note').fill('Walk-in with persistent cough, needs review.');

    // Submit — the workflow registers the patient, then books the appointment
    await page.getByRole('button', { name: /Create Consultation/i }).click();

    // Success banner carries the appointment id
    const successBanner = page.locator('[role="status"]');
    await expect(successBanner).toBeVisible({ timeout: 15_000 });
    await expect(successBanner).toContainText('Consultation created — appointment #');
    await expect(successBanner).toContainText(`${patientFirst} ${patientLast}`);
    const bannerText = await successBanner.innerText();
    const appointmentId = Number(bannerText.match(/appointment #(\d+)/)?.[1]);
    expect(appointmentId).toBeGreaterThan(0);

    // The patient shows up on the page (Today's Queue and/or Recent Patients) —
    // the API cross-check below verifies the queue contents exactly
    await expect(page.getByText(`${patientFirst} ${patientLast}`, { exact: true }).first()).toBeVisible();

    // ── Cross-check through the API: the appointment exists with the right shape ──
    const dateStr = new Date().toISOString().slice(0, 10);
    const listed = await api.listAppointments('hospitalAdmin', { dateFrom: dateStr, dateTo: dateStr, pageSize: 100 });
    const created = listed.body.appointments.find((a: any) => a.id === appointmentId);
    expect(created).toBeTruthy();
    expect(created.patientName).toBe(`${patientFirst} ${patientLast}`);
    expect(created.doctorName).toContain(docLast);
    expect(created.departmentName).toBe(deptName);
    expect(created.status).toBe('Scheduled');
  });
});
