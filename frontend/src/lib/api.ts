import type {
  AdminAuthToken,
  AdminAuditLog,
  AdminLoginResponse,
  AdminManagedUser,
  AdminRoom,
  AdminManagedUserDetail,
  AdminStatus,
  AdminUser,
  Building,
  CheckAttempt,
  LoginResponse,
  RegisterResponse,
  Reading,
  RuntimeLimits,
  RuntimeSettings,
  SmtpSettings,
  User,
  UserRoomBinding,
  UserRoomSummary
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : `Request failed with status ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

export interface ApiClient {
  getMe: () => Promise<User>;
  listBuildings: () => Promise<Building[]>;
  register: (payload: { email: string; password: string }) => Promise<RegisterResponse>;
  verifyEmail: (payload: { email: string; code: string }) => Promise<User>;
  login: (payload: { email: string; password: string }) => Promise<LoginResponse>;
  requestNotificationEmailCode: (payload: { email: string }) => Promise<{ email: string; dev_verification_code?: string | null; email_sent: boolean }>;
  verifyNotificationEmail: (payload: { email: string; code: string }) => Promise<User>;
  updateMePreferences: (payload: {
    notify_cooldown_hours?: number | null;
    daily_report_enabled?: boolean;
    daily_report_interval_days?: number;
  }) => Promise<User>;
  sendTestEmail: () => Promise<{ email: string; email_sent: boolean }>;
  deleteAccount: (payload: { password: string }) => Promise<void>;
  getRuntimeLimits: () => Promise<RuntimeLimits>;
  listRoomSummaries: () => Promise<UserRoomSummary[]>;
  listRoomBindings: () => Promise<UserRoomBinding[]>;
  listRoomReadings: (
    bindingId: number,
    params?: { days?: number; start_at?: string; end_at?: string; limit?: number }
  ) => Promise<Reading[]>;
  listCheckAttempts: () => Promise<CheckAttempt[]>;
  bindRoom: (payload: {
    campus?: string | null;
    campus_param?: string | null;
    building_key?: string | null;
    building_name?: string | null;
    building_param?: string | null;
    room_number: string;
    alert_days: number;
    low_power_threshold?: string | null;
  }) => Promise<UserRoomBinding>;
  checkRoom: (bindingId: number) => Promise<Reading>;
  updateBinding: (
    bindingId: number,
    payload: {
      campus?: string | null;
      campus_param?: string | null;
      building_key?: string | null;
      building_name?: string | null;
      building_param?: string | null;
      room_number?: string;
      alert_days?: number;
      low_power_threshold?: string | null;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
      enabled?: boolean;
    }
  ) => Promise<UserRoomBinding>;
  deleteBinding: (bindingId: number) => Promise<void>;
  adminLogin: (payload: { username: string; password: string }) => Promise<AdminLoginResponse>;
  getAdminMe: () => Promise<AdminUser>;
  updateAdminProfile: (payload: { display_name?: string | null }) => Promise<AdminUser>;
  updateAdminPassword: (payload: { old_password: string; new_password: string }) => Promise<{ status: string }>;
  listAdminUsers: () => Promise<AdminManagedUser[]>;
  getAdminUser: (userId: number) => Promise<AdminManagedUserDetail>;
  updateAdminUser: (
    userId: number,
    payload: {
      notification_email?: string | null;
      notification_email_verified?: boolean;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
    }
  ) => Promise<AdminManagedUserDetail>;
  deleteAdminUser: (userId: number) => Promise<void>;
  updateAdminUserRoom: (
    userId: number,
    bindingId: number,
    payload: {
      campus?: string | null;
      campus_param?: string | null;
      building_key?: string | null;
      building_name?: string | null;
      building_param?: string | null;
      room_number?: string;
      alert_days?: number;
      low_power_threshold?: string | null;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
      enabled?: boolean;
    }
  ) => Promise<UserRoomBinding>;
  deleteAdminUserRoom: (userId: number, bindingId: number) => Promise<void>;
  listAdminRooms: () => Promise<AdminRoom[]>;
  listAdminTokens: () => Promise<AdminAuthToken[]>;
  createAdminToken: (payload: {
    name: string;
    token_value: string;
    min_interval_seconds: number;
    enabled: boolean;
  }) => Promise<AdminAuthToken>;
  updateAdminToken: (
    tokenId: number,
    payload: { name?: string; token_value?: string; min_interval_seconds?: number; enabled?: boolean }
  ) => Promise<AdminAuthToken>;
  deleteAdminToken: (tokenId: number) => Promise<void>;
  getSmtpSettings: () => Promise<SmtpSettings>;
  updateSmtpSettings: (payload: {
    host?: string | null;
    port?: number;
    username?: string | null;
    password?: string | null;
    from_email?: string | null;
    use_ssl?: boolean;
    use_starttls?: boolean;
  }) => Promise<SmtpSettings>;
  testSmtpSettings: (payload: { to_email: string }) => Promise<{ status: string }>;
  getRuntimeSettings: () => Promise<RuntimeSettings>;
  updateRuntimeSettings: (payload: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;
  getAdminStatus: () => Promise<AdminStatus>;
  listAdminAuditLogs: () => Promise<AdminAuditLog[]>;
  runAdminChecks: () => Promise<{ checked: number; succeeded: number; failed: number }>;
  runAdminNotifications: () => Promise<{ scanned: number; sent: number; skipped: number; failed: number }>;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    let detail: unknown = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.detail ?? payload;
    } catch {
      detail = response.statusText;
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

function buildQuery(params?: Record<string, string | number | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export function createApiClient(token?: string | null): ApiClient {
  return {
    getMe: () => request<User>("/api/auth/me", {}, token),
    listBuildings: () => request<Building[]>("/api/buildings", {}, token),
    register: (payload) =>
      request<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    verifyEmail: (payload) =>
      request<User>("/api/auth/verify-email", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    login: (payload) =>
      request<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    requestNotificationEmailCode: (payload) =>
      request<{ email: string; dev_verification_code?: string | null; email_sent: boolean }>(
        "/api/me/notification-email/request-code",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    verifyNotificationEmail: (payload) =>
      request<User>(
        "/api/me/notification-email/verify",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    updateMePreferences: (payload) =>
      request<User>(
        "/api/me/preferences",
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    sendTestEmail: () =>
      request<{ email: string; email_sent: boolean }>(
        "/api/me/test-email",
        {
          method: "POST"
        },
        token
      ),
    deleteAccount: (payload) =>
      request<void>(
        "/api/me/account",
        {
          method: "DELETE",
          body: JSON.stringify(payload)
        },
        token
      ),
    getRuntimeLimits: () => request<RuntimeLimits>("/api/me/runtime-limits", {}, token),
    listRoomSummaries: () => request<UserRoomSummary[]>("/api/me/rooms/summary", {}, token),
    listRoomBindings: () => request<UserRoomBinding[]>("/api/me/rooms", {}, token),
    listRoomReadings: (bindingId, params) =>
      request<Reading[]>(`/api/me/rooms/${bindingId}/readings${buildQuery(params)}`, {}, token),
    listCheckAttempts: () => request<CheckAttempt[]>("/api/me/check-attempts", {}, token),
    bindRoom: (payload) =>
      request<UserRoomBinding>(
        "/api/me/rooms",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    checkRoom: (bindingId) =>
      request<Reading>(
        `/api/me/rooms/${bindingId}/check`,
        {
          method: "POST"
        },
        token
      ),
    updateBinding: (bindingId, payload) =>
      request<UserRoomBinding>(
        `/api/me/rooms/${bindingId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    deleteBinding: (bindingId) =>
      request<void>(
        `/api/me/rooms/${bindingId}`,
        {
          method: "DELETE"
        },
        token
      ),
    adminLogin: (payload) =>
      request<AdminLoginResponse>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    getAdminMe: () => request<AdminUser>("/api/admin/auth/me", {}, token),
    updateAdminProfile: (payload) =>
      request<AdminUser>(
        "/api/admin/auth/me",
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    updateAdminPassword: (payload) =>
      request<{ status: string }>(
        "/api/admin/auth/password",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    listAdminUsers: () => request<AdminManagedUser[]>("/api/admin/users", {}, token),
    getAdminUser: (userId) => request<AdminManagedUserDetail>(`/api/admin/users/${userId}`, {}, token),
    updateAdminUser: (userId, payload) =>
      request<AdminManagedUserDetail>(
        `/api/admin/users/${userId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    deleteAdminUser: (userId) =>
      request<void>(
        `/api/admin/users/${userId}`,
        {
          method: "DELETE"
        },
        token
      ),
    updateAdminUserRoom: (userId, bindingId, payload) =>
      request<UserRoomBinding>(
        `/api/admin/users/${userId}/rooms/${bindingId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    deleteAdminUserRoom: (userId, bindingId) =>
      request<void>(
        `/api/admin/users/${userId}/rooms/${bindingId}`,
        {
          method: "DELETE"
        },
        token
      ),
    listAdminRooms: () => request<AdminRoom[]>("/api/admin/rooms", {}, token),
    listAdminTokens: () => request<AdminAuthToken[]>("/api/admin/tokens", {}, token),
    createAdminToken: (payload) =>
      request<AdminAuthToken>(
        "/api/admin/tokens",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    updateAdminToken: (tokenId, payload) =>
      request<AdminAuthToken>(
        `/api/admin/tokens/${tokenId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    deleteAdminToken: (tokenId) =>
      request<void>(
        `/api/admin/tokens/${tokenId}`,
        {
          method: "DELETE"
        },
        token
      ),
    getSmtpSettings: () => request<SmtpSettings>("/api/admin/smtp", {}, token),
    updateSmtpSettings: (payload) =>
      request<SmtpSettings>(
        "/api/admin/smtp",
        {
          method: "PUT",
          body: JSON.stringify(payload)
        },
        token
      ),
    testSmtpSettings: (payload) =>
      request<{ status: string }>(
        "/api/admin/smtp/test",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    getRuntimeSettings: () => request<RuntimeSettings>("/api/admin/settings", {}, token),
    updateRuntimeSettings: (payload) =>
      request<RuntimeSettings>(
        "/api/admin/settings",
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    getAdminStatus: () => request<AdminStatus>("/api/admin/status", {}, token),
    listAdminAuditLogs: () => request<AdminAuditLog[]>("/api/admin/audit-logs", {}, token),
    runAdminChecks: () =>
      request<{ checked: number; succeeded: number; failed: number }>(
        "/api/admin/jobs/checks/run",
        {
          method: "POST"
        },
        token
      ),
    runAdminNotifications: () =>
      request<{ scanned: number; sent: number; skipped: number; failed: number }>(
        "/api/admin/jobs/notifications/run",
        {
          method: "POST"
        },
        token
      )
  };
}
