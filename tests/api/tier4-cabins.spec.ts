import { test, expect } from '@playwright/test';
import { PortalApiClient, Role } from '../helpers/portal-api-client';

let api: PortalApiClient;

test.beforeEach(async ({ request }) => {
  api = new PortalApiClient(request);
});

function uniq(prefix: string) {
  // Server caps codes at 20 chars — keep it short.
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

// Self-provision a Cabin-type ward for the test; returns ward id.
async function makeCabinWard(): Promise<number> {
  const r = await api.createWard('hospitalAdmin', {
    name: `E2E Cabin Ward ${Date.now()}`, code: uniq('CAB'), wardType: 'Cabin',
    floor: 3, capacity: 5, defaultDailyRate: 8000,
  });
  expect(r.status).toBe(201);
  return r.body.id;
}

async function getFirstPatientId(): Promise<number> {
  const r = await api.listPatients('receptionist', { pageSize: 1 });
  expect(r.body.patients.length).toBeGreaterThan(0);
  return r.body.patients[0].id;
}

async function getFirstDoctorId(): Promise<number> {
  const r = await api.listDoctors('receptionist');
  expect(r.body.doctors.length).toBeGreaterThan(0);
  return r.body.doctors[0].id;
}

test.describe('Cabins — catalog @tier4 @cabin @api @smoke', () => {
  test('cabin-types returns all six categories with facilities and BDT rates', async () => {
    const r = await api.listCabinTypes('hospitalAdmin');
    expect(r.status).toBe(200);
    const types = r.body.map((t: any) => t.type);
    expect(types).toEqual(['Shared', 'Standard', 'Deluxe', 'VIP', 'VVIP', 'Suite']);
    for (const t of r.body) {
      expect(t.defaultFacilities.length).toBeGreaterThan(0);
      expect(t.typicalRateMinBdt).toBeGreaterThan(0);
      expect(t.typicalRateMaxBdt).toBeGreaterThanOrEqual(t.typicalRateMinBdt);
    }
    // Suite is the premium tier
    const suite = r.body.find((t: any) => t.type === 'Suite');
    expect(suite.typicalRateMaxBdt).toBeGreaterThanOrEqual(30000);
  });

  test('cabin-types requires authentication', async ({ request }) => {
    const r = await request.get(`${process.env.API_BASE_URL || 'http://localhost:9766'}/api/ipd/cabin-types`);
    expect(r.status()).toBe(401);
  });
});

test.describe('Cabins — creation & facilities @tier4 @cabin @api @smoke', () => {
  test('cabin gets default facilities from its type when omitted', async () => {
    const wardId = await makeCabinWard();
    const r = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Deluxe', dailyRate: 12000 });
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe('Cabin');
    expect(r.body.cabinType).toBe('Deluxe');
    const facilities = JSON.parse(r.body.facilities);
    expect(facilities).toContain('AC');
    expect(facilities).toContain('Attached Bathroom');
    expect(facilities).toContain('TV');
  });

  test('custom facilities override the defaults', async () => {
    const wardId = await makeCabinWard();
    const r = await api.createCabin('hospitalAdmin', {
      wardId, number: uniq('C'), cabinType: 'VIP', facilities: ['AC', 'Balcony'],
    });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body.facilities)).toEqual(['AC', 'Balcony']);
  });

  test('invalid cabin type rejected with the allowed list', async () => {
    const wardId = await makeCabinWard();
    const r = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Presidential' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Invalid cabin type/);
    expect(r.body.message).toMatch(/Suite/);
  });

  test('cabin without a type is rejected', async () => {
    const wardId = await makeCabinWard();
    const r = await api.authedPostRaw({ wardId, number: uniq('C'), kind: 'Cabin', status: 'Available' });
    expect(r.status).toBe(400);
  });

  test('invalid kind is rejected', async () => {
    const wardId = await makeCabinWard();
    const r = await api.authedPostRaw({ wardId, number: uniq('C'), kind: 'Igloo', status: 'Available' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Invalid kind/i);
  });

  test('regular bed in same ward stays untouched (kind=Bed, no facilities)', async () => {
    const wardId = await makeCabinWard();
    const r = await api.createBed('hospitalAdmin', { wardId, number: uniq('B') });
    expect(r.status).toBe(200);
    expect(r.body.kind).toBe('Bed');
    expect(r.body.cabinType).toBeNull();
    expect(r.body.facilities).toBeNull();
    // Ward default rate applies
    expect(r.body.dailyRate).toBe(8000);
  });

  test('duplicate cabin number in same ward rejected', async () => {
    const wardId = await makeCabinWard();
    const num = uniq('C');
    await api.createCabin('hospitalAdmin', { wardId, number: num, cabinType: 'Standard' });
    const dup = await api.createCabin('hospitalAdmin', { wardId, number: num, cabinType: 'Standard' });
    expect(dup.status).toBe(400);
  });

  test('staff without bed.manage cannot create cabins (403)', async () => {
    const wardId = await makeCabinWard();
    const r = await api.createCabin('receptionist', { wardId, number: uniq('C'), cabinType: 'Standard' });
    expect(r.status).toBe(403);
  });
});

test.describe('Cabins — listing & updates @tier4 @cabin @api', () => {
  test('GET /cabins lists only cabins, filters by status and type', async () => {
    const wardId = await makeCabinWard();
    await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Deluxe' });
    await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'VIP' });
    await api.createBed('hospitalAdmin', { wardId, number: uniq('B') });

    const all = await api.listCabins('hospitalAdmin');
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThanOrEqual(2);
    all.body.forEach((b: any) => expect(b.kind).toBe('Cabin'));

    const deluxeOnly = await api.listCabins('hospitalAdmin', { cabinType: 'Deluxe' });
    deluxeOnly.body.forEach((b: any) => expect(b.cabinType).toBe('Deluxe'));

    const available = await api.listCabins('hospitalAdmin', { status: 'Available' });
    available.body.forEach((b: any) => expect(b.status).toBe('Available'));
  });

  test('cabin type and facilities can be updated via status endpoint', async () => {
    const wardId = await makeCabinWard();
    const created = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Standard' });
    const upd = await api.authedPatchRaw(created.body.id, {
      status: 'Available', cabinType: 'VVIP', facilities: ['AC', 'Private Pool'],
    });
    expect(upd.status).toBe(200);
    expect(upd.body.cabinType).toBe('VVIP');
    expect(JSON.parse(upd.body.facilities)).toEqual(['AC', 'Private Pool']);
  });

  test('cabin update rejects invalid cabin type', async () => {
    const wardId = await makeCabinWard();
    const created = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Standard' });
    const upd = await api.authedPatchRaw(created.body.id, { status: 'Available', cabinType: 'Presidential' });
    expect(upd.status).toBe(400);
  });

  test('bed-board includes cabin fields', async () => {
    const wardId = await makeCabinWard();
    const num = uniq('C');
    await api.createCabin('hospitalAdmin', { wardId, number: num, cabinType: 'Deluxe' });
    const board = await api.getBedBoard('hospitalAdmin');
    const ward = board.body.find((w: any) => w.id === wardId);
    const cabin = ward.beds.find((b: any) => b.number === num);
    expect(cabin.kind).toBe('Cabin');
    expect(cabin.cabinType).toBe('Deluxe');
    expect(JSON.parse(cabin.facilities)).toContain('AC');
  });
});

test.describe('Cabins — admission & billing edges @tier4 @cabin @api', () => {
  test('cabin admission bills at cabin daily rate', async () => {
    const wardId = await makeCabinWard();
    const cabin = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'VVIP', dailyRate: 25000 });
    const patientId = await getFirstPatientId();
    const doctorId = await getFirstDoctorId();

    const admit = await api.createAdmission('receptionist', {
      patientId, bedId: cabin.body.id, attendingDoctorId: doctorId,
      admissionType: 'Elective', reason: 'E2E cabin billing',
    });
    expect(admit.status).toBe(201);

    // Cabin is Occupied and shows in /cabins with the admission linked
    const cabins = await api.listCabins('hospitalAdmin');
    const ours = cabins.body.find((b: any) => b.id === cabin.body.id);
    expect(ours.status).toBe('Occupied');
    expect(ours.currentAdmissionId).toBe(admit.body.id);

    const bill = await api.generateBill('hospitalAdmin', admit.body.id);
    expect(bill.status).toBe(200);
    expect(bill.body.totalAmount).toBe(25000);

    // Cleanup: discharge so the patient/bed is free for other tests
    await api.dischargeAdmission('doctor', admit.body.id, {
      dischargingDoctorId: doctorId, conditionAtDischarge: 'Improved',
    });
  });

  test('transfer bed → cabin switches the daily rate from transfer day onward', async () => {
    const wardId = await makeCabinWard();
    const bed = await api.createBed('hospitalAdmin', { wardId, number: uniq('B'), dailyRate: 8000 });
    const cabin = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'VIP', dailyRate: 18000 });
    const patientId = await getFirstPatientId();
    const doctorId = await getFirstDoctorId();

    const admit = await api.createAdmission('receptionist', {
      patientId, bedId: bed.body.id, attendingDoctorId: doctorId,
      admissionType: 'Emergency', reason: 'E2E rate switch',
    });
    expect(admit.status).toBe(201);

    const transfer = await api.transferAdmission('doctor', admit.body.id, {
      toBedId: cabin.body.id, reason: 'Patient upgraded to cabin',
    });
    expect(transfer.status).toBe(200);
    expect(transfer.body.bedId).toBe(cabin.body.id);

    const bill = await api.generateBill('hospitalAdmin', admit.body.id);
    expect(bill.status).toBe(200);
    // Same calendar day as admission+transfer: billed at the CURRENT (cabin) rate
    expect(bill.body.totalAmount).toBe(18000);

    await api.dischargeAdmission('doctor', admit.body.id, {
      dischargingDoctorId: doctorId, conditionAtDischarge: 'Improved',
    });
  });

  test('cannot admit to an occupied cabin', async () => {
    const wardId = await makeCabinWard();
    const cabin = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Standard' });
    const patientId = await getFirstPatientId();
    const doctorId = await getFirstDoctorId();

    const first = await api.createAdmission('receptionist', {
      patientId, bedId: cabin.body.id, attendingDoctorId: doctorId,
      admissionType: 'Elective', reason: 'E2E occupied cabin',
    });
    expect(first.status).toBe(201);

    const second = await api.createAdmission('receptionist', {
      patientId, bedId: cabin.body.id, attendingDoctorId: doctorId,
      admissionType: 'Elective', reason: 'should fail',
    });
    expect(second.status).toBe(400);

    await api.dischargeAdmission('doctor', first.body.id, {
      dischargingDoctorId: doctorId, conditionAtDischarge: 'Improved',
    });
  });

  test('cannot delete an occupied cabin', async () => {
    const wardId = await makeCabinWard();
    const cabin = await api.createCabin('hospitalAdmin', { wardId, number: uniq('C'), cabinType: 'Standard' });
    const patientId = await getFirstPatientId();
    const doctorId = await getFirstDoctorId();
    const admit = await api.createAdmission('receptionist', {
      patientId, bedId: cabin.body.id, attendingDoctorId: doctorId,
      admissionType: 'Elective', reason: 'E2E delete guard',
    });
    expect(admit.status).toBe(201);

    const del = await api.authedDeleteRaw(cabin.body.id);
    expect(del.status).toBe(400);
    expect(del.body.message).toMatch(/occupied/i);

    await api.dischargeAdmission('doctor', admit.body.id, {
      dischargingDoctorId: doctorId, conditionAtDischarge: 'Improved',
    });
  });
});
