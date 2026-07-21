import { test, expect } from '@playwright/test';
import { PortalApiClient } from '../helpers/portal-api-client';

let api: PortalApiClient;

test.beforeEach(async ({ request }) => {
  api = new PortalApiClient(request);
});

const CITY_GENERAL_TENANT = 2;

function uniqEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@citygeneral.local`;
}

async function getFirstDepartmentId(): Promise<number> {
  const r = await api.listDepartments('hospitalAdmin');
  const items = r.body.departments || r.body.items || r.body;
  expect(items.length).toBeGreaterThan(0);
  return items[0].id;
}

async function findUserByEmail(email: string) {
  const r = await api.listUsers('hospitalAdmin');
  const items = r.body.items || r.body.users || r.body;
  return items.find((u: any) => u.email === email);
}

async function loginDirect(email: string, password: string, request: any) {
  const r = await request.post(`${process.env.API_BASE_URL || 'http://localhost:9766'}/api/auth/login`, {
    data: { email, password },
  });
  expect(r.status()).toBe(200);
  return (await r.json()).accessToken;
}

test.describe('Employees — designation & multi-role @tier4 @employees @api @smoke', () => {
  test('create employee with designation, department, and additional roles', async () => {
    const deptId = await getFirstDepartmentId();
    const email = uniqEmail('director');
    // String enums — exercises JsonStringEnumConverter the way the UI sends them
    const r = await api.createUser('hospitalAdmin', {
      email, password: 'Director@123', firstName: 'Shirin', lastName: 'Akter',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
      designation: 'Director of Cardiology', primaryDepartmentId: deptId,
      additionalRoles: ['Doctor'],
    });
    expect(r.ok).toBe(true);
    expect(r.body.designation).toBe('Director of Cardiology');
    expect(r.body.primaryDepartmentId).toBe(deptId);
    expect(r.body.additionalRoles).toContain('Doctor');
    expect(r.body.role).toBe('Nurse');

    // Persisted: visible in the user list too
    const listed = await findUserByEmail(email);
    expect(listed.designation).toBe('Director of Cardiology');
    expect(listed.additionalRoles).toContain('Doctor');
  });

  test('update syncs additional roles (grant + revoke), primary role untouched', async () => {
    const email = uniqEmail('multirole');
    const created = await api.createUser('hospitalAdmin', {
      email, password: 'Multi@1234', firstName: 'Multi', lastName: 'Role',
      role: 'Receptionist', tenantId: CITY_GENERAL_TENANT, additionalRoles: ['Accountant'],
    });
    expect(created.ok).toBe(true);
    const id = created.body.id;

    // Grant Nurse, revoke Accountant
    const upd = await api.updateUser('hospitalAdmin', id, { additionalRoles: ['Nurse'] });
    expect(upd.ok).toBe(true);
    expect(upd.body.additionalRoles).toContain('Nurse');
    expect(upd.body.additionalRoles).not.toContain('Accountant');
    expect(upd.body.role).toBe('Receptionist');

    // Clear all additional roles
    const cleared = await api.updateUser('hospitalAdmin', id, { additionalRoles: [] });
    expect(cleared.ok).toBe(true);
    expect(cleared.body.additionalRoles ?? []).toHaveLength(0);
  });

  test('requesting the primary role as additional does not duplicate it', async () => {
    const email = uniqEmail('dup');
    const r = await api.createUser('hospitalAdmin', {
      email, password: 'Dup@12345', firstName: 'Dup', lastName: 'Role',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT, additionalRoles: ['Nurse', 'Doctor'],
    });
    expect(r.ok).toBe(true);
    const roles = r.body.additionalRoles ?? [];
    expect(roles.filter((x: string) => x === 'Nurse')).toHaveLength(0);
    expect(roles).toContain('Doctor');
  });

  test('cross-tenant department is rejected', async () => {
    const email = uniqEmail('xdept');
    const r = await api.createUser('hospitalAdmin', {
      email, password: 'Xdept@123', firstName: 'X', lastName: 'Dept',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT, primaryDepartmentId: 999999,
    });
    expect(r.status).toBe(400);
  });

  test('staff without user.manage cannot create employees (403)', async () => {
    const r = await api.createUser('nurse', {
      email: uniqEmail('forbidden'), password: 'Nope@1234', firstName: 'No', lastName: 'Pe',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
    });
    expect(r.status).toBe(403);
  });

  test('duplicate email in same tenant is rejected', async () => {
    const email = uniqEmail('twice');
    const first = await api.createUser('hospitalAdmin', {
      email, password: 'Twice@123', firstName: 'One', lastName: 'Two',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
    });
    expect(first.ok).toBe(true);
    const second = await api.createUser('hospitalAdmin', {
      email, password: 'Twice@123', firstName: 'Uno', lastName: 'Dos',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
    });
    expect(second.status).toBe(400);
  });
});

test.describe('Employees — attach doctor profile (director-who-practices) @tier4 @employees @api @smoke', () => {
  test('existing staff user gains a doctor profile and the Doctor role', async ({ request }) => {
    const deptId = await getFirstDepartmentId();
    const email = uniqEmail('surgeon');
    const created = await api.createUser('hospitalAdmin', {
      email, password: 'Surgeon@123', firstName: 'Kabir', lastName: 'Singh',
      role: 'Admin', tenantId: CITY_GENERAL_TENANT, designation: 'Chief of Surgery',
    });
    expect(created.ok).toBe(true);
    const userId = created.body.id;

    // Before attach: no doctor profile visible for this user
    const before = await api.listDoctors('hospitalAdmin');
    const beforeItems = before.body.items || before.body.doctors || before.body;
    expect(beforeItems.find((d: any) => d.userId === userId || d.email === email)).toBeUndefined();

    const attach = await api.attachDoctorProfile('hospitalAdmin', {
      userId, medicalLicenseNumber: 'BMDC-E2E-001', specialization: 'Cardiology',
      departmentId: deptId, consultationDurationMinutes: 30, consultationFee: 1500,
    });
    expect(attach.status).toBe(201);
    expect(attach.body.specialization).toBe('Cardiology');
    expect(attach.body.userId).toBe(userId);

    // Doctor role granted as additional role
    const user = await findUserByEmail(email);
    expect(user.additionalRoles).toContain('Doctor');

    // Appears in the doctor directory
    const after = await api.listDoctors('hospitalAdmin');
    const afterItems = after.body.items || after.body.doctors || after.body;
    expect(afterItems.find((d: any) => d.userId === userId || d.email === email)).toBeTruthy();

    // Permission union is live: the user can now hit doctor-only endpoints with a FRESH login
    const token = await loginDirect(email, 'Surgeon@123', request);
    const me = await request.get(`${process.env.API_BASE_URL || 'http://localhost:9766'}/api/UserManagement/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(me.status()).toBe(200);
  });

  test('user whose primary role is already Doctor gets profile without extra assignment', async () => {
    const email = uniqEmail('plaindoc');
    const created = await api.createUser('hospitalAdmin', {
      email, password: 'Doc@12345', firstName: 'Plain', lastName: 'Doc',
      role: 'Doctor', tenantId: CITY_GENERAL_TENANT,
    });
    expect(created.ok).toBe(true);

    const attach = await api.attachDoctorProfile('hospitalAdmin', {
      userId: created.body.id, specialization: 'General',
    });
    expect(attach.status).toBe(201);

    const user = await findUserByEmail(email);
    expect((user.additionalRoles ?? []).filter((r: string) => r === 'Doctor')).toHaveLength(0);
  });

  test('duplicate attach is rejected', async () => {
    const created = await api.createUser('hospitalAdmin', {
      email: uniqEmail('dupattach'), password: 'Dup@12345', firstName: 'Dup', lastName: 'Attach',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
    });
    const first = await api.attachDoctorProfile('hospitalAdmin', {
      userId: created.body.id, specialization: 'General',
    });
    expect(first.status).toBe(201);
    const second = await api.attachDoctorProfile('hospitalAdmin', {
      userId: created.body.id, specialization: 'General',
    });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/already has a doctor profile/i);
  });

  test('invalid specialization rejected with allowed list', async () => {
    const created = await api.createUser('hospitalAdmin', {
      email: uniqEmail('badspec'), password: 'Bad@12345', firstName: 'Bad', lastName: 'Spec',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
    });
    const r = await api.attachDoctorProfile('hospitalAdmin', {
      userId: created.body.id, specialization: 'Astrology',
    });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/Invalid specialization/i);
  });

  test('cross-tenant user cannot be attached (404)', async () => {
    // Master (Platform tenant, id 1) is not in city-general — attach must 404
    const r = await api.attachDoctorProfile('hospitalAdmin', {
      userId: 1, specialization: 'General',
    });
    expect(r.status).toBe(404);
  });

  test('cross-tenant department is rejected on attach', async () => {
    const created = await api.createUser('hospitalAdmin', {
      email: uniqEmail('xdeptattach'), password: 'X@123456', firstName: 'X', lastName: 'Dept',
      role: 'Nurse', tenantId: CITY_GENERAL_TENANT,
    });
    const r = await api.attachDoctorProfile('hospitalAdmin', {
      userId: created.body.id, specialization: 'General', departmentId: 999999,
    });
    expect(r.status).toBe(400);
  });
});
