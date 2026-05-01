import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { generateSalesRequest } from '../helpers/data-factory';

// ═══════════════════════════════════════════════════════════════
// RATE LIMIT: POST /api/sales/requests/public is limited to 5 req/hour.
// ALL requests (including 400s) count against the limit.
// Budget allocation across all projects:
//   API tests:  2 POSTs (1 validation, 1 success+verify)
//   E2E tests:  1 POST  (full browser flow)
//   Total:      3 POSTs per full test run (2 remaining as buffer)
// ═══════════════════════════════════════════════════════════════

test.describe.configure({ mode: 'serial' });

let api: ApiClient;

test.beforeEach(async ({ request }) => {
  api = new ApiClient(request);
});

// ── Validation (1 POST) ────────────────────────────────────────

test.describe('POST /api/sales/requests/public — validation @api @smoke', () => {
  test('rejects request with missing required fields', async () => {
    const data = generateSalesRequest();
    data.hospitalName = '';

    const { status } = await api.createSalesRequest(data);
    expect(status).toBe(400);
  });
});

// ── Success + Persistence (1 POST) ─────────────────────────────

test.describe('POST /api/sales/requests/public — create + verify @api @smoke', () => {
  test('creates a request and it persists in the database', async () => {
    const data = generateSalesRequest();
    const { status, body } = await api.createSalesRequest(data);

    // Verify creation response
    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body.id).toBeGreaterThan(0);
    expect(body).toHaveProperty('status', 'pending');
    expect(typeof body.id).toBe('number');

    // Verify persistence — login as sales user and find the record
    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const listResult = await api.listSalesRequests(token!, { q: data.hospitalName });
    expect(listResult.status).toBe(200);
    expect(listResult.body.items.length).toBeGreaterThanOrEqual(1);

    const found = listResult.body.items.find((item: any) => item.id === body.id);
    expect(found).toBeTruthy();
    expect(found.hospitalName).toBe(data.hospitalName);
    expect(found.email).toBe(data.email);
  });
});

// ── Authenticated Endpoints (0 POSTs) ──────────────────────────

test.describe('GET /api/sales/requests (authenticated) @api', () => {
  test('returns 401 without auth token', async ({ request }) => {
    const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9765';
    const response = await request.get(`${API_BASE_URL}/api/sales/requests`);
    expect(response.status()).toBe(401);
  });

  test('returns list when authenticated as sales user', async () => {
    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const { status, body } = await api.listSalesRequests(token!);
    expect(status).toBe(200);
    expect(body).toHaveProperty('total');
    expect(body).toHaveProperty('items');
    expect(Array.isArray(body.items)).toBe(true);
  });
});
