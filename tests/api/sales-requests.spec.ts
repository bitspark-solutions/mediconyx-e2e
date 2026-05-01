import { test, expect } from '@playwright/test';
import { ApiClient } from '../helpers/api-client';
import { generateSalesRequest, generateMinimalSalesRequest } from '../helpers/data-factory';

let api: ApiClient;

test.beforeEach(async ({ request }) => {
  api = new ApiClient(request);
});

// ── Public Endpoint: Create Sales Request ──────────────────────

test.describe('POST /api/sales/requests/public @api @smoke', () => {
  test('creates a request with all fields', async () => {
    const data = generateSalesRequest();
    const { status, body } = await api.createSalesRequest(data);

    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body.id).toBeGreaterThan(0);
    expect(body).toHaveProperty('status', 'pending');
    expect(typeof body.id).toBe('number');
  });

  test('creates a request with only required fields', async () => {
    const data = generateMinimalSalesRequest();
    const { status, body } = await api.createSalesRequest(data);

    expect(status).toBe(201);
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('status', 'pending');
  });

  test('each request gets a unique ID', async () => {
    const data1 = generateSalesRequest();
    const data2 = generateSalesRequest();

    const result1 = await api.createSalesRequest(data1);
    const result2 = await api.createSalesRequest(data2);

    expect(result1.status).toBe(201);
    expect(result2.status).toBe(201);
    expect(result1.body.id).not.toBe(result2.body.id);
  });

  test('rejects request without hospital name', async () => {
    const data = generateSalesRequest();
    data.hospitalName = '';

    const { status } = await api.createSalesRequest(data);
    expect(status).toBe(400);
  });

  test('rejects request without email', async () => {
    const data = generateSalesRequest();
    data.email = '';

    const { status } = await api.createSalesRequest(data);
    expect(status).toBe(400);
  });

  test('rejects request with invalid email format', async () => {
    const data = generateSalesRequest();
    data.email = 'not-an-email';

    const { status } = await api.createSalesRequest(data);
    expect(status).toBe(400);
  });

  test('rejects request without captcha token', async () => {
    const data = generateSalesRequest();
    data.captchaToken = '';

    const { status } = await api.createSalesRequest(data);
    expect(status).toBe(400);
  });
});

// ── Persistence: Created request appears in database ───────────

test.describe('POST + GET /api/sales/requests — persistence @api @smoke', () => {
  test('created request appears in the authenticated list', async () => {
    const data = generateSalesRequest();
    const createResult = await api.createSalesRequest(data);
    expect(createResult.status).toBe(201);

    const token = await api.login('sales@mediconyx.local', 'Sales@123');
    expect(token).toBeTruthy();

    const { status, body } = await api.listSalesRequests(token!, { q: data.hospitalName });
    expect(status).toBe(200);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const found = body.items.find((item: any) => item.id === createResult.body.id);
    expect(found).toBeTruthy();
    expect(found.hospitalName).toBe(data.hospitalName);
    expect(found.email).toBe(data.email);
  });
});

// ── Authenticated Endpoints ────────────────────────────────────

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
