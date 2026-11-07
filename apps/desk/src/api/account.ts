/**
 * Typed calls to the account service, v2. Shapes follow
 * accounts-django/docs/API_MICROAPPS.md and RELEASE_2026-10-25_APPS.md.
 */
import { api } from './client';

export interface AccountOrganization {
  id: string;
  pms_id?: string | null;
  ascend_id?: string | null;
  name: string;
}

export interface AccountLocation {
  id: string;
  pms_id?: string | null;
  ascend_id?: string | null;
  name: string;
  timezone?: string | null;
}

export interface AccountUser {
  id: string;
  name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  pms_id?: string | null;
  ascend_id?: string | null;
}

export type AccountRole = 'admin' | 'staff' | 'provider';

export interface AccountPlan {
  product_name: string;
  name: string;
  billing_cycle: string;
  status: string;
  start_date: string;
  end_date: string | null;
}

export interface AccountAccess {
  location: string;
  role: AccountRole;
  permissions: string[];
  plans: AccountPlan[];
  credits: { type: string; balance: number }[];
  pms?: string | null;
  pms_id?: string | null;
  is_owner?: boolean;
  two_factor_required?: boolean;
}

export interface MePayload {
  organization: AccountOrganization;
  locations: AccountLocation[];
  user?: AccountUser;
  /** The organization account. It opens no app. */
  admin?: AccountUser;
  access?: AccountAccess | null;
  amr?: string[];
  auth_time?: number;
}

export interface SessionPayload extends MePayload {
  accessToken: string;
  /** Absent on switch-location. */
  refreshToken?: string;
  expiresIn: number;
}

interface Envelope<T> {
  statusCode: number;
  data: T;
}

export const account = {
  async redeemHandoff(body: {
    code: string;
    code_verifier: string;
    client_id: string;
    redirect_uri: string;
  }): Promise<SessionPayload> {
    const res = await api.post<Envelope<SessionPayload>>('/auth/handoff/redeem', body, { skipAuth: true });
    return res.data.data;
  },

  async refresh(refreshToken: string, locationId: string | null): Promise<SessionPayload> {
    const res = await api.post<Envelope<SessionPayload>>(
      '/auth/refresh',
      { refresh_token: refreshToken },
      { skipAuth: true, headers: locationId ? { 'X-Location-Id': locationId } : {} },
    );
    return res.data.data;
  },

  async me(locationId: string | null): Promise<MePayload> {
    const res = await api.get<Envelope<MePayload>>('/me', {
      headers: locationId ? { 'X-Location-Id': locationId } : {},
    });
    return res.data.data;
  },

  async switchLocation(locationId: string): Promise<SessionPayload> {
    const res = await api.post<Envelope<SessionPayload>>('/auth/switch-location', { location_id: locationId });
    return res.data.data;
  },

  async logout(refreshToken: string | null): Promise<void> {
    await api.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : {});
  },

  async logoutAll(): Promise<void> {
    await api.post('/auth/logout-all', {});
  },
};
