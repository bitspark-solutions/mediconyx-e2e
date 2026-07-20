import { APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9765';

// Hospital (city-general) test users — see mediconyx/readme.md
// Master password differs between dev stack (MasterPass123!) and test stack (Master@123).
// Env vars let the test runner pick the right one: TEST_MASTER_PASSWORD.
const MASTER_PASSWORD = process.env.TEST_MASTER_PASSWORD || 'MasterPass123!';

export const TEST_USERS = {
  master: { email: 'master@mediconyx.local', password: MASTER_PASSWORD },
  admin: { email: 'admin@mediconyx.local', password: 'Admin@123' },
  hospitalAdmin: { email: 'admin@citygeneral.local', password: 'Hospital@123' },
  doctor: { email: 'dr.khan@citygeneral.local', password: 'Doctor@123' },
  nurse: { email: 'nurse@citygeneral.local', password: 'Nurse@123' },
  accountant: { email: 'accountant@citygeneral.local', password: 'Accountant@123' },
  receptionist: { email: 'reception@citygeneral.local', password: 'Reception@123' },
  patient: { email: 'karim.hassan@patient.local', password: 'Patient@123' },
  sales: { email: 'sales@mediconyx.local', password: 'Sales@123' },
} as const;

export type Role = keyof typeof TEST_USERS;

interface ApiResponse<T = any> {
  response: any;
  status: number;
  body: T | null;
  ok: boolean;
}

export class PortalApiClient {
  private tokens: Partial<Record<Role, string>> = {};

  constructor(private request: APIRequestContext) {}

  async login(role: Role): Promise<string> {
    if (this.tokens[role]) return this.tokens[role]!;
    const creds = TEST_USERS[role];
    const response = await this.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: creds,
    });
    if (!response.ok()) {
      throw new Error(`Login as ${role} failed: ${response.status()}`);
    }
    const body = await response.json();
    this.tokens[role] = body.accessToken;
    return body.accessToken!;
  }

  private async authedFetch(role: Role, method: string, path: string, data?: any, contentType?: string): Promise<ApiResponse> {
    const token = await this.login(role);
    const headers: any = { Authorization: `Bearer ${token}` };
    if (contentType) headers['Content-Type'] = contentType;
    const init: any = { method, headers };
    if (data !== undefined) {
      if (contentType === 'multipart/form-data') {
        init.multipart = data;
      } else {
        init.data = data;
      }
    }
    const response = await this.request.fetch(`${API_BASE_URL}${path}`, init);
    let body: any = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { response, status: response.status(), body, ok: response.ok() };
  }

  // ── Patients ─────────────────────────────────────────────────────
  listPatients(role: Role, params?: { page?: number; pageSize?: number; q?: string }): Promise<ApiResponse> {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize || 50));
    if (params?.q) query.set('q', params.q);
    const q = query.toString();
    return this.authedFetch(role, 'GET', `/api/patient${q ? '?' + q : ''}`);
  }

  getPatient(role: Role, id: number): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', `/api/patient/${id}`);
  }

  createPatient(role: Role, data: {
    firstName: string; lastName: string; dateOfBirth: string; gender: string;
    phone: string; email?: string; bloodGroup?: string; address?: string; city?: string;
  }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/patient', data);
  }

  updatePatient(role: Role, id: number, data: any): Promise<ApiResponse> {
    return this.authedFetch(role, 'PUT', `/api/patient/${id}`, data);
  }

  // ── Appointments ────────────────────────────────────────────────
  listAppointments(role: Role, params?: { pageSize?: number }): Promise<ApiResponse> {
    const query = new URLSearchParams();
    if (params?.pageSize) query.set('pageSize', String(params.pageSize || 50));
    const q = query.toString();
    return this.authedFetch(role, 'GET', `/api/appointment${q ? '?' + q : ''}`);
  }

  createAppointment(role: Role, data: {
    patientId: number; doctorId: number; serviceId?: number;
    appointmentDate: string; durationMinutes: number; type: string; notes?: string;
  }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/appointment', data);
  }

  cancelAppointment(role: Role, id: number, reason: string): Promise<ApiResponse> {
    return this.authedFetch(role, 'PATCH', `/api/appointment/${id}/cancel`, { reason });
  }

  // ── Vitals ──────────────────────────────────────────────────────
  listVitals(role: Role, patientId: number): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', `/api/vital-sign/patient/${patientId}`);
  }

  createVitals(role: Role, data: {
    patientId: number; recordedAt?: string;
    bloodPressureSystolic?: number; bloodPressureDiastolic?: number;
    heartRate?: number; temperatureCelsius?: number;
    weightKg?: number; heightCm?: number; oxygenSaturation?: number; bloodGlucoseMgDl?: number;
  }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/vital-sign', {
      recordedAt: new Date().toISOString(),
      ...data,
    });
  }

  // ── Tenant Settings ─────────────────────────────────────────────
  getTenantSettings(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/TenantSettings');
  }

  updateTenantSettings(role: Role, data: any): Promise<ApiResponse> {
    return this.authedFetch(role, 'PUT', '/api/TenantSettings', data);
  }

  // ── Doctors ─────────────────────────────────────────────────────
  listDoctors(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/doctor?pageSize=100');
  }

  // ── Departments ─────────────────────────────────────────────────
  listDepartments(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/department?pageSize=100');
  }

  // ── Services ────────────────────────────────────────────────────
  listServices(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/service?pageSize=100');
  }

  // ── Invoices ────────────────────────────────────────────────────
  listInvoices(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/invoice?pageSize=100');
  }

  recordPayment(role: Role, invoiceId: number, data: {
    amount: number; paymentMethod: string; reference?: string; paymentDate?: string;
  }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/invoice/${invoiceId}/payments`, {
      paymentDate: new Date().toISOString(),
      ...data,
    });
  }

  // ── Users ───────────────────────────────────────────────────────
  me(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/UserManagement/me');
  }

  listUsers(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/UserManagement?pageSize=100');
  }

  // ── RAG / AI ────────────────────────────────────────────────────
  getPatientSummary(role: Role, patientId: number, depth: number = 1): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', `/api/rag/patient/${patientId}/summary?depth=${depth}`);
  }

  // ── Sales ───────────────────────────────────────────────────────
  listSalesRequests(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/sales/requests?pageSize=100');
  }

  // ── Tier 2: IPD (wards / beds / admissions / bed board) ──────
  listWards(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/ipd/wards');
  }
  createWard(role: Role, data: { name: string; code: string; wardType: string; floor?: number; capacity?: number; defaultDailyRate?: number; location?: string; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/ipd/wards', data, 'application/json');
  }
  updateWard(role: Role, id: number, data: any): Promise<ApiResponse> {
    return this.authedFetch(role, 'PATCH', `/api/ipd/wards/${id}`, data, 'application/json');
  }
  deleteWard(role: Role, id: number): Promise<ApiResponse> {
    return this.authedFetch(role, 'DELETE', `/api/ipd/wards/${id}`);
  }
  listBeds(role: Role, params?: { wardId?: number; status?: string }): Promise<ApiResponse> {
    const query = new URLSearchParams();
    if (params?.wardId) query.set('wardId', String(params.wardId));
    if (params?.status) query.set('status', params.status);
    const q = query.toString();
    return this.authedFetch(role, 'GET', `/api/ipd/beds${q ? '?' + q : ''}`);
  }
  createBed(role: Role, data: { wardId: number; number: string; status?: string; dailyRate?: number; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/ipd/beds', data, 'application/json');
  }
  updateBedStatus(role: Role, id: number, data: { status: string; dailyRate?: number; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'PATCH', `/api/ipd/beds/${id}/status`, data, 'application/json');
  }
  getBedBoard(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/ipd/bed-board');
  }
  listAdmissions(role: Role, params?: { activeOnly?: boolean; status?: string }): Promise<ApiResponse> {
    const query = new URLSearchParams();
    if (params?.activeOnly) query.set('activeOnly', 'true');
    if (params?.status) query.set('status', params.status);
    const q = query.toString();
    return this.authedFetch(role, 'GET', `/api/ipd/admissions${q ? '?' + q : ''}`);
  }
  createAdmission(role: Role, data: { patientId: number; bedId: number; attendingDoctorId: number; admissionType: string; reason?: string; diagnosisOnAdmission?: string; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/ipd/admissions', data, 'application/json');
  }
  transferAdmission(role: Role, id: number, data: { toBedId: number; reason?: string; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/ipd/admissions/${id}/transfer`, data, 'application/json');
  }
  dischargeAdmission(role: Role, id: number, data: { dischargingDoctorId: number; conditionAtDischarge: string; dischargeInstructions?: string; followUpDate?: string; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/ipd/admissions/${id}/discharge`, data, 'application/json');
  }

  // ── Tier 3.1: Per-bed-day billing ──────────────────────────────
  generateBill(role: Role, admissionId: number): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/ipd/admissions/${admissionId}/generate-bill`, {}, 'application/json');
  }
  getBill(role: Role, admissionId: number): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', `/api/ipd/admissions/${admissionId}/bill`);
  }
  getChargesByDate(role: Role, date: string): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', `/api/ipd/billing/charges?date=${date}`);
  }

  // ── Tier 3.3: Telemedicine ─────────────────────────────────────
  listTelehealthSessions(role: Role): Promise<ApiResponse> {
    return this.authedFetch(role, 'GET', '/api/telemedicine/sessions');
  }
  createTelehealthSession(role: Role, data: { patientId: number; doctorId: number; scheduledAt: string; notes?: string; }): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', '/api/telemedicine/sessions', data, 'application/json');
  }
  startTelehealthSession(role: Role, id: number): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/telemedicine/sessions/${id}/start`, {}, 'application/json');
  }
  endTelehealthSession(role: Role, id: number, notes?: string): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/telemedicine/sessions/${id}/end`, JSON.stringify(notes ?? ''), 'application/json');
  }
  cancelTelehealthSession(role: Role, id: number, reason?: string): Promise<ApiResponse> {
    return this.authedFetch(role, 'POST', `/api/telemedicine/sessions/${id}/cancel`, JSON.stringify(reason ?? ''), 'application/json');
  }

  // ── Tier 3.4: Public doctor directory (NO auth) ───────────────
  async listPublicDoctors(params?: { q?: string; specialization?: string; tenantSubdomain?: string; accepting?: boolean }): Promise<ApiResponse> {
    const query = new URLSearchParams();
    if (params?.q) query.set('q', params.q);
    if (params?.specialization) query.set('specialization', params.specialization);
    if (params?.tenantSubdomain) query.set('tenantSubdomain', params.tenantSubdomain);
    if (params?.accepting !== undefined) query.set('accepting', String(params.accepting));
    const q = query.toString();
    const response = await this.request.get(`${API_BASE_URL}/api/public/doctors${q ? '?' + q : ''}`);
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    return { response, status: response.status(), body, ok: response.ok() };
  }
  async getPublicDoctor(id: number): Promise<ApiResponse> {
    const response = await this.request.get(`${API_BASE_URL}/api/public/doctors/${id}`);
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    return { response, status: response.status(), body, ok: response.ok() };
  }

  // ── Tier 3.2: Patient self-registration (NO auth) ─────────────
  async registerPatient(data: {
    firstName: string; lastName: string; email: string; password: string; phone: string;
    dateOfBirth: string; gender: string; tenantSubdomain?: string;
  }): Promise<ApiResponse> {
    const response = await this.request.post(`${API_BASE_URL}/api/auth/register-patient`, {
      data,
      headers: { 'Content-Type': 'application/json' },
    });
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    return { response, status: response.status(), body, ok: response.ok() };
  }
  async verifyEmail(token: string): Promise<ApiResponse> {
    const response = await this.request.get(`${API_BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    return { response, status: response.status(), body, ok: response.ok() };
  }
  async resendVerification(email: string): Promise<ApiResponse> {
    const response = await this.request.post(`${API_BASE_URL}/api/auth/resend-verification`, {
      data: { email },
      headers: { 'Content-Type': 'application/json' },
    });
    let body: any = null;
    try { body = await response.json(); } catch { body = null; }
    return { response, status: response.status(), body, ok: response.ok() };
  }

  // ── Health (unauthenticated) ────────────────────────────────────
  async health(): Promise<{ apiOk: boolean; uiOk: boolean }> {
    // Probe API via auth endpoint (always present in dev + test).
    // Swagger is only enabled in Development env, so don't rely on it.
    const apiRes = await this.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { email: 'nope@nope.com', password: 'invalid' },
    });
    const uiUrl = (process.env.BASE_URL || 'http://localhost:9673');
    const uiRes = await this.request.get(uiUrl);
    return { apiOk: apiRes.status() === 401 || apiRes.status() === 400, uiOk: uiRes.ok() };
  }
}
