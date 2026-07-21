import { test, expect } from '@playwright/test';
import { PortalApiClient, Role } from '../helpers/portal-api-client';

// Serial: the single-main invariant tests mutate shared tenant state (which branch
// is main), so they must not race each other or the read-only assertions below.
test.describe.configure({ mode: 'serial' });

let api: PortalApiClient;

test.beforeEach(async ({ request }) => {
  api = new PortalApiClient(request);
});

// Unique code per call — parallel runs must never collide.
// Server caps codes at 20 chars — keep it short.
function uniq(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

async function makeBranch(role: Role, overrides: any = {}) {
  const r = await api.createBranch(role, {
    name: `E2E Branch ${Date.now()}`, code: uniq('BR'), city: 'Dhaka', ...overrides,
  });
  expect(r.status).toBe(201);
  return r.body;
}

test.describe('Branches — CRUD @tier4 @branch @api @smoke', () => {
  test('every tenant has a Main Branch from backfill', async () => {
    const r = await api.listBranches('hospitalAdmin');
    expect(r.status).toBe(200);
    const mains = r.body.filter((b: any) => b.isMain);
    expect(mains.length).toBe(1);
    expect(r.body.find((b: any) => b.code === 'MAIN')).toBeTruthy();
  });

  test('admin can create, read, update, soft-delete a branch', async () => {
    const branch = await makeBranch('hospitalAdmin', { address: 'Sector 7', phone: '+880-1' });
    expect(branch.code).toBe(branch.code.toUpperCase());
    expect(branch.isMain).toBe(false);
    expect(branch.isActive).toBe(true);

    const fetched = await api.getBranch('hospitalAdmin', branch.id);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe(branch.name);

    const updated = await api.updateBranch('hospitalAdmin', branch.id, { city: 'Uttara', phone: '+880-2' });
    expect(updated.status).toBe(200);
    expect(updated.body.city).toBe('Uttara');

    const del = await api.deleteBranch('hospitalAdmin', branch.id);
    expect(del.status).toBe(204);

    // Soft delete: gone from default list, present with includeInactive
    const active = await api.listBranches('hospitalAdmin');
    expect(active.body.find((b: any) => b.id === branch.id)).toBeUndefined();
    const all = await api.listBranches('hospitalAdmin', true);
    expect(all.body.find((b: any) => b.id === branch.id)?.isActive).toBe(false);
  });

  test('duplicate code (case-insensitive) is rejected', async () => {
    const code = uniq('DUP');
    await makeBranch('hospitalAdmin', { code: code.toLowerCase() });
    const dup = await api.createBranch('hospitalAdmin', { name: 'Dup', code: code.toUpperCase() });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toMatch(/already exists/i);
  });

  test('list is ordered main-first', async () => {
    await makeBranch('hospitalAdmin');
    const r = await api.listBranches('hospitalAdmin');
    expect(r.body[0].isMain).toBe(true);
  });
});

test.describe('Branches — single-main invariant @tier4 @branch @api', () => {
  test('promoting a branch to main demotes the previous main', async () => {
    const branch = await makeBranch('hospitalAdmin');
    const promoted = await api.updateBranch('hospitalAdmin', branch.id, { isMain: true });
    expect(promoted.status).toBe(200);
    expect(promoted.body.isMain).toBe(true);

    const list = await api.listBranches('hospitalAdmin');
    const mains = list.body.filter((b: any) => b.isMain);
    expect(mains.length).toBe(1);
    expect(mains[0].id).toBe(branch.id);

    // Restore: re-promote the original MAIN so other tests are unaffected
    const original = list.body.find((b: any) => b.code === 'MAIN');
    await api.updateBranch('hospitalAdmin', original.id, { isMain: true });
    // Cleanup the temp branch
    await api.deleteBranch('hospitalAdmin', branch.id);
  });

  test('cannot delete the main branch', async () => {
    const list = await api.listBranches('hospitalAdmin');
    const main = list.body.find((b: any) => b.isMain);
    const del = await api.deleteBranch('hospitalAdmin', main.id);
    expect(del.status).toBe(400);
    expect(del.body.message).toMatch(/main branch/i);
  });

  test('cannot deactivate the main branch', async () => {
    const list = await api.listBranches('hospitalAdmin');
    const main = list.body.find((b: any) => b.isMain);
    const r = await api.updateBranch('hospitalAdmin', main.id, { isActive: false });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/main branch/i);
  });
});

test.describe('Branches — permissions & isolation @tier4 @branch @api', () => {
  test('roles without tenant-settings permissions get 403', async () => {
    const create = await api.createBranch('nurse', { name: 'Nope', code: uniq('NO') });
    expect(create.status).toBe(403);
    const read = await api.listBranches('nurse');
    expect(read.status).toBe(403);
  });

  test('cross-tenant read returns 404, not data', async () => {
    const branch = await makeBranch('hospitalAdmin');
    // Master is in the Platform tenant — must not see city-general branches
    const r = await api.getBranch('master', branch.id);
    expect(r.status).toBe(404);
    await api.deleteBranch('hospitalAdmin', branch.id);
  });

  test('master sees only Platform branches in own list', async () => {
    const r = await api.listBranches('master');
    expect(r.status).toBe(200);
    r.body.forEach((b: any) => expect(b.tenantId).toBe(1));
  });
});
