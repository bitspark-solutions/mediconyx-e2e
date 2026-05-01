import { APIRequestContext } from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:9765';

export class ApiClient {
  constructor(private request: APIRequestContext) {}

  async createSalesRequest(data: {
    hospitalName: string;
    contactPerson: string;
    email: string;
    phone: string;
    region?: string;
    notes?: string;
    captchaToken?: string;
  }) {
    const payload = {
      captchaToken: 'ok',
      ...data,
    };

    const response = await this.request.post(`${API_BASE_URL}/api/sales/requests/public`, {
      data: payload,
    });

    return {
      response,
      status: response.status(),
      body: response.ok() ? await response.json() : null,
    };
  }

  async getSalesRequest(id: number, authToken: string) {
    const response = await this.request.get(`${API_BASE_URL}/api/sales/requests/${id}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    return {
      response,
      status: response.status(),
      body: response.ok() ? await response.json() : null,
    };
  }

  async listSalesRequests(authToken: string, params?: { page?: number; pageSize?: number; q?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.q) query.set('q', params.q);

    const url = `${API_BASE_URL}/api/sales/requests${query.toString() ? '?' + query.toString() : ''}`;
    const response = await this.request.get(url, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    return {
      response,
      status: response.status(),
      body: response.ok() ? await response.json() : null,
    };
  }

  async login(email: string, password: string) {
    const response = await this.request.post(`${API_BASE_URL}/api/auth/login`, {
      data: { email, password },
    });

    if (response.ok()) {
      const body = await response.json();
      return body.accessToken as string;
    }
    return null;
  }
}
