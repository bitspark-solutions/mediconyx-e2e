import { test, expect } from '@playwright/test';
import { PortalApiClient } from '../helpers/portal-api-client';

// ═══════════════════════════════════════════════════════════════
// NEW CONSULTATION WORKFLOW — the API chain the UI drives
//   Step 1: patient search (GET /api/patient?searchTerm=)
//   Step 2: register walk-in (POST /api/patient)
//   Step 3: book consultation (POST /api/appointment)
//           with slots from GET /api/appointment/slots
// ═══════════════════════════════════════════════════════════════

let api: PortalApiClient;

const STAMP = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const dateStr = new Date().toISOString().slice(0, 10);

test.beforeEach(async ({ request }) => {
  api = new PortalApiClient(request);
});

async function provisionDoctor() {
  const depts = await api.listDepartments('hospitalAdmin');
  const deptItems = depts.body.departments || depts.body.items || depts.body;
  expect(deptItems.length).toBeGreaterThan(0);
  const departmentId = deptItems[0].id;

  const doc = await api.createDoctor('hospitalAdmin', {
    firstName: 'Consult',
    lastName: `Flow-${STAMP}`,
    email: `consult-flow-${STAMP}@citygeneral.local`,
    password: 'Doc@12345',
    specialization: 'General',
    departmentId,
    consultationDurationMinutes: 30,
    consultationFee: 1200,
  });
  expect(doc.status).toBe(201);
  const doctorUserId = doc.body.userId;
  expect(doctorUserId).toBeGreaterThan(0);

  // Publish a schedule for today so the slots endpoint has data
  const sched = await api.createDoctorSchedule('hospitalAdmin', {
    doctorId: doctorUserId,
    departmentId,
    dayOfWeek: new Date().getUTCDay(), // UTC day of week — matches the UTC dateStr used for slot queries
    startTime: '09:00',
    endTime: '17:00',
    slotDurationMinutes: 30,
  });
  expect(sched.ok).toBe(true);

  return { doctorUserId, departmentId };
}

async function registerWalkInPatient() {
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  const patient = await api.createPatient('hospitalAdmin', {
    firstName: 'Walkin',
    lastName: `Case-${STAMP}`,
    dateOfBirth: '1990-05-15',
    gender: 'Male',
    phone: `+8801700${suffix}00`,
  });
  expect(patient.status).toBe(201);
  return patient.body;
}

test.describe('New Consultation chain — full booking lifecycle @tier5 @consultation @api @smoke', () => {
  test('doctor schedule yields slots; booking consumes one; cancel releases it', async () => {
    const { doctorUserId, departmentId } = await provisionDoctor();

    // Slots derive from the fresh schedule
    const slots = await api.listAppointmentSlots('hospitalAdmin', doctorUserId, dateStr);
    expect(slots.ok).toBe(true);
    expect(Array.isArray(slots.body)).toBe(true);
    expect(slots.body.length).toBeGreaterThan(0);
    const firstSlot = slots.body[0];
    expect(firstSlot.startTime).toMatch(/^\d{2}:\d{2}$/);

    const patient = await registerWalkInPatient();

    // Book the consultation — exactly the payload the UI sends
    const apt = await api.createAppointment('hospitalAdmin', {
      patientId: patient.id,
      doctorId: doctorUserId,
      departmentId,
      appointmentDate: dateStr,
      startTime: firstSlot.startTime,
      endTime: firstSlot.endTime,
      type: 'Consultation',
      reason: 'Initial Consultation (Normal priority)',
      notes: 'E2E walk-in consultation',
    });
    expect(apt.status).toBe(201);
    expect(apt.body.patientName).toContain('Walkin');
    expect(apt.body.doctorName).toContain('Consult');
    expect(apt.body.departmentId).toBe(departmentId);
    expect(apt.body.status).toBe('Scheduled');
    // Branch defaulted to the tenant's main branch
    expect(apt.body.branchId).toBeGreaterThan(0);
    expect(apt.body.branchName).toBeTruthy();

    // The booked slot is no longer offered
    const slotsAfter = await api.listAppointmentSlots('hospitalAdmin', doctorUserId, dateStr);
    expect(slotsAfter.body.find((s: any) => s.startTime === firstSlot.startTime)).toBeUndefined();

    // The appointment shows up in today's list (source of the UI's queue + metrics)
    const list = await api.listAppointments('hospitalAdmin', { dateFrom: dateStr, dateTo: dateStr, pageSize: 100 });
    expect(list.ok).toBe(true);
    expect(list.body.appointments.some((a: any) => a.id === apt.body.id)).toBe(true);

    // Cancel with reason — the freed slot is offered again
    const cancel = await api.cancelAppointment('hospitalAdmin', apt.body.id, 'E2E: cancelling booked slot');
    expect(cancel.ok).toBe(true);
    expect(cancel.body.status).toBe('Cancelled');
    const slotsAfterCancel = await api.listAppointmentSlots('hospitalAdmin', doctorUserId, dateStr);
    expect(slotsAfterCancel.body.find((s: any) => s.startTime === firstSlot.startTime)).toBeTruthy();
  });

  test('patient search (step 1) finds a registered walk-in by name', async () => {
    const patient = await registerWalkInPatient();

    const found = await api.listPatients('hospitalAdmin', { searchTerm: `Case-${STAMP}`, pageSize: 10 });
    expect(found.ok).toBe(true);
    const items = found.body.patients || found.body.items || [];
    expect(items.some((p: any) => p.id === patient.id)).toBe(true);
  });

  test('receptionist books via the same chain (front-desk flow)', async () => {
    const { doctorUserId, departmentId } = await provisionDoctor();
    const patient = await registerWalkInPatient();

    const apt = await api.createAppointment('receptionist', {
      patientId: patient.id,
      doctorId: doctorUserId,
      departmentId,
      appointmentDate: dateStr,
      startTime: '15:00',
      endTime: '15:30',
      type: 'FollowUp',
      reason: 'Follow-up Visit (Normal priority)',
    });
    expect(apt.status).toBe(201);
    expect(apt.body.status).toBe('Scheduled');

    // Receptionist sees it in their appointment list too
    const list = await api.listAppointments('receptionist', { dateFrom: dateStr, dateTo: dateStr, pageSize: 100 });
    expect(list.body.appointments.some((a: any) => a.id === apt.body.id)).toBe(true);
  });
});

test.describe('New Consultation validation @tier5 @consultation @api', () => {
  test('end time before start time is rejected', async () => {
    const { doctorUserId, departmentId } = await provisionDoctor();
    const patient = await registerWalkInPatient();

    const r = await api.createAppointment('hospitalAdmin', {
      patientId: patient.id,
      doctorId: doctorUserId,
      departmentId,
      appointmentDate: dateStr,
      startTime: '10:30',
      endTime: '10:00',
      type: 'Consultation',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/end time must be after start time/i);
  });

  test('missing department is rejected', async () => {
    const { doctorUserId } = await provisionDoctor();
    const patient = await registerWalkInPatient();

    const r = await api.createAppointment('hospitalAdmin', {
      patientId: patient.id,
      doctorId: doctorUserId,
      departmentId: 0,
      appointmentDate: dateStr,
      startTime: '10:00',
      endTime: '10:30',
      type: 'Consultation',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/department id is required/i);
  });

  test('invalid time format is rejected', async () => {
    const { doctorUserId, departmentId } = await provisionDoctor();
    const patient = await registerWalkInPatient();

    const r = await api.createAppointment('hospitalAdmin', {
      patientId: patient.id,
      doctorId: doctorUserId,
      departmentId,
      appointmentDate: dateStr,
      startTime: 'not-a-time',
      endTime: '10:30',
      type: 'Consultation',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/invalid start time/i);
  });
});
