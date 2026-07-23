import { test, expect } from '@playwright/test';
import { PortalApiClient, Role } from '../helpers/portal-api-client';

let api: PortalApiClient;

test.beforeEach(async ({ request }) => {
  api = new PortalApiClient(request);
});

// Helper: pick first available bed; if none, mark an existing Cleaning bed Available.
// Uses hospitalAdmin for the status flip (receptionist doesn't have BED_MANAGE).
async function ensureAvailableBed(role: Role): Promise<number> {
  const beds = await api.listBeds(role);
  if (!beds.ok) throw new Error(`listBeds failed: ${beds.status}`);
  const available = beds.body!.find((b: any) => b.status === 'Available');
  if (available) return available.id;
  const cleaning = beds.body!.find((b: any) => b.status === 'Cleaning');
  if (!cleaning) throw new Error('No Available or Cleaning beds in this tenant');
  const upd = await api.updateBedStatus('hospitalAdmin', cleaning.id, { status: 'Available' });
  if (!upd.ok) throw new Error(`Could not set bed ${cleaning.id} to Available: ${upd.status}`);
  return cleaning.id;
}

async function getFirstPatient(role: Role): Promise<number> {
  const r = await api.listPatients(role, { pageSize: 1 });
  if (!r.ok || !r.body?.patients?.length) throw new Error(`No patients in tenant: ${r.status}`);
  return r.body.patients[0].id;
}

async function getFirstDoctor(role: Role): Promise<number> {
  const r = await api.listDoctors(role);
  if (!r.ok || !r.body?.doctors?.length) throw new Error(`No doctors in tenant: ${r.status}`);
  return r.body.doctors[0].id;
}

// Tests need a ward to work in. Always create a fresh one: reusing an existing
// ward races with parallel tests that delete wards, and the demo seed has none.
// Server caps codes at 20 chars — keep it short and unique.
async function ensureWard(role: Role): Promise<any> {
  const created = await api.createWard('hospitalAdmin', {
    name: 'E2E Ward', code: `E2E${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    wardType: 'General', floor: 1, capacity: 10, defaultDailyRate: 1000,
  });
  if (!created.ok) throw new Error(`ensureWard: createWard failed: ${created.status}`);
  return created.body;
}

test.describe('IPD — wards @ipd @api @smoke', () => {
  test('admin can list wards', async () => {
    const r = await api.listWards('hospitalAdmin');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });

  test('patient role cannot create wards (403)', async () => {
    const r = await api.createWard('patient', {
      name: 'X', code: `X-${Date.now()}`, wardType: 'General', floor: 1, capacity: 1,
    });
    expect(r.status).toBe(403);
  });

  test('admin can create + update + delete an isolated ward', async () => {
    const code = `T2-${Date.now()}`;
    const create = await api.createWard('hospitalAdmin', {
      name: 'Tier2 Test Ward', code, wardType: 'Pediatric', floor: 2, capacity: 5, defaultDailyRate: 1500,
    });
    expect(create.status).toBe(201);
    expect(create.body.code).toBe(code);
    expect(create.body.defaultDailyRate).toBe(1500);

    const upd = await api.updateWard('hospitalAdmin', create.body.id, { defaultDailyRate: 2500 });
    expect(upd.status).toBe(200);
    expect(upd.body.defaultDailyRate).toBe(2500);

    const del = await api.deleteWard('hospitalAdmin', create.body.id);
    expect(del.status).toBe(204);
  });

  test('creating a ward with a duplicate code fails (per-branch uniqueness)', async () => {
    const existing = await ensureWard('hospitalAdmin');
    // Same code in the SAME branch must fail…
    const dup = await api.createWard('hospitalAdmin', {
      name: 'Duplicate', code: existing.code, wardType: 'General', floor: 1, capacity: 1,
      branchId: existing.branchId,
    });
    expect(dup.status).toBe(400);
    // …but the same code in a DIFFERENT branch is allowed (Stage 2 multi-branch).
    const otherBranch = await api.createBranch('hospitalAdmin', {
      name: `E2E Dup Branch ${Date.now()}`, code: `DU${Date.now().toString(36)}x`,
    });
    expect(otherBranch.ok).toBe(true);
    const allowed = await api.createWard('hospitalAdmin', {
      name: 'Allowed Copy', code: existing.code, wardType: 'General', floor: 1, capacity: 1,
      branchId: otherBranch.body.id,
    });
    expect(allowed.status).toBe(201);
    // Cleanup
    await api.deleteWard('hospitalAdmin', allowed.body.id);
    await api.deleteBranch('hospitalAdmin', otherBranch.body.id);
  });
});

test.describe('IPD — beds @ipd @api @smoke', () => {
  test('admin can list beds (optionally filtered by ward)', async () => {
    const r = await api.listBeds('hospitalAdmin');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    if (r.body.length > 0) {
      const wardId = r.body[0].wardId;
      const filtered = await api.listBeds('hospitalAdmin', { wardId });
      expect(filtered.status).toBe(200);
      filtered.body.forEach((b: any) => expect(b.wardId).toBe(wardId));
    }
  });

  test('admin can add a bed and set its status', async () => {
    const wards = await api.listWards('hospitalAdmin');
    if (wards.body.length === 0) test.skip();
    const ward = wards.body[0];
    const num = `T2-B-${Date.now()}`;
    const created = await api.createBed('hospitalAdmin', { wardId: ward.id, number: num, dailyRate: 7500 });
    expect(created.status).toBe(200);
    expect(created.body.number).toBe(num);
    expect(created.body.dailyRate).toBe(7500);

    const upd = await api.updateBedStatus('hospitalAdmin', created.body.id, { status: 'Maintenance' });
    expect(upd.status).toBe(200);
    expect(upd.body.status).toBe('Maintenance');
  });

  test('cannot set bed to Occupied directly (only via admission)', async () => {
    // Create a dedicated bed so this test isn't affected by others.
    const ward = await ensureWard('hospitalAdmin');
    const created = await api.createBed('hospitalAdmin', {
      wardId: ward.id, number: `E2E-OCC-${Date.now()}`, status: 'Available',
    });
    expect(created.status).toBe(200);
    const r = await api.updateBedStatus('hospitalAdmin', created.body.id, { status: 'Occupied' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/occupied/i);
  });
});

test.describe('IPD — admission full lifecycle @ipd @api @smoke', () => {
  test('receptionist admits → doctor transfers → doctor discharges', async () => {
    // Use a dedicated bed for this test so other tests don't pollute availability.
    const ward = await ensureWard('receptionist');
    const bedNum = `E2E-LC-${Date.now()}`;
    const createBed = await api.createBed('hospitalAdmin', {
      wardId: ward.id, number: bedNum, status: 'Available',
    });
    expect(createBed.status).toBe(200);
    const bedId = createBed.body.id;

    const patientId = await getFirstPatient('receptionist');
    const doctorId = await getFirstDoctor('receptionist');

    // 1. Admit
    const admit = await api.createAdmission('receptionist', {
      patientId, bedId, attendingDoctorId: doctorId,
      admissionType: 'Emergency', reason: 'E2E Tier 2 test', diagnosisOnAdmission: 'Smoke test',
    });
    expect(admit.status).toBe(201);
    expect(admit.body.status).toBe('Active');
    const admissionId = admit.body.id;

    // Bed should be Occupied now
    const bedsAfter = await api.listBeds('receptionist', { wardId: admit.body.wardId });
    const ourBed = bedsAfter.body.find((b: any) => b.id === bedId);
    expect(ourBed.status).toBe('Occupied');

    // 2. Transfer — create another dedicated available bed for the destination.
    const otherCreate = await api.createBed('hospitalAdmin', {
      wardId: ward.id, number: `E2E-LC-DST-${Date.now()}`, status: 'Available',
    });
    expect(otherCreate.status).toBe(200);
    const otherBed = otherCreate.body.id;
    const transfer = await api.transferAdmission('doctor', admissionId, {
      toBedId: otherBed, reason: 'E2E: stabilizing patient',
    });
    expect(transfer.status).toBe(200);
    expect(transfer.body.bedId).toBe(otherBed);

    // Old bed should be Cleaning
    const bedsAfterTransfer = await api.listBeds('receptionist', { wardId: admit.body.wardId });
    const oldBed = bedsAfterTransfer.body.find((b: any) => b.id === bedId);
    expect(oldBed.status).toBe('Cleaning');

    // 3. Discharge
    const discharge = await api.dischargeAdmission('doctor', admissionId, {
      dischargingDoctorId: doctorId,
      conditionAtDischarge: 'Improved',
      dischargeInstructions: 'E2E test discharge',
    });
    expect(discharge.status).toBe(200);
    expect(discharge.body.status).toBe('Discharged');
    expect(discharge.body.dischargeDate).toBeTruthy();
    expect(discharge.body.dischargeSummary).toBeTruthy();
  });

  test('cannot admit to a non-Available bed', async () => {
    const beds = await api.listBeds('receptionist', { status: 'Occupied' });
    if (beds.body.length === 0) test.skip();
    const bed = beds.body[0];
    const patientId = await getFirstPatient('receptionist');
    const doctorId = await getFirstDoctor('receptionist');
    const r = await api.createAdmission('receptionist', {
      patientId, bedId: bed.id, attendingDoctorId: doctorId,
      admissionType: 'Elective',
    });
    expect(r.status).toBe(400);
  });

  test('patient role cannot admit (403)', async () => {
    const r = await api.createAdmission('patient', {
      patientId: 1, bedId: 1, attendingDoctorId: 1, admissionType: 'Elective',
    });
    expect(r.status).toBe(403);
  });
});

test.describe('IPD — bed board @ipd @api @smoke', () => {
  test('returns wards with bed counts', async () => {
    const r = await api.getBedBoard('doctor');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
    r.body.forEach((ward: any) => {
      expect(ward).toHaveProperty('id');
      expect(ward).toHaveProperty('name');
      expect(ward).toHaveProperty('wardType');
      expect(Array.isArray(ward.beds)).toBe(true);
    });
  });

  test('active admissions are visible on the board', async () => {
    const board = await api.getBedBoard('doctor');
    const occupiedBeds = board.body.flatMap((w: any) => w.beds).filter((b: any) => b.status === 'Occupied');
    if (occupiedBeds.length === 0) test.skip();
    const bed = occupiedBeds[0];
    expect(bed.admissionId).toBeTruthy();
    expect(bed.patientName).toBeTruthy();
  });
});
