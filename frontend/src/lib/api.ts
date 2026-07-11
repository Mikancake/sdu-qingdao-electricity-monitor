import type {
  AppearanceSettings,
  AdminAuthTokenHealthLog,
  AdminLogQuery,
  AdminHealthTestResult,
  AdminAuthToken,
  AdminAuditLog,
  AdminLoginResponse,
  AdminManagedUser,
  AdminManagedUserPage,
  AdminPageQuery,
  AdminRoom,
  AdminRoomPage,
  AdminManagedUserDetail,
  AdminStatus,
  AdminUser,
  Building,
  CheckAttempt,
  DataRetentionCleanupResult,
  LoginResponse,
  RegisterResponse,
  Reading,
  RuntimeLimits,
  RuntimeSettings,
  SmtpSettings,
  SmtpHealthLog,
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

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "稍后";
  }
  if (seconds < 60) {
    return `${Math.ceil(seconds)} 秒后`;
  }
  return `${Math.ceil(seconds / 60)} 分钟后`;
}

function validationMessage(detail: unknown) {
  if (!Array.isArray(detail)) {
    return null;
  }
  const first = detail[0] as { loc?: unknown[]; msg?: string; type?: string; ctx?: { min_length?: number } } | undefined;
  const field = Array.isArray(first?.loc) ? String(first.loc[first.loc.length - 1]) : "";
  if (field === "code") {
    return "验证码至少需要 4 位，请检查后再提交。";
  }
  if (field === "password") {
    return "密码至少需要 8 位。";
  }
  if (field === "email") {
    return "请输入有效的邮箱地址。";
  }
  if (first?.type === "string_too_short" && first.ctx?.min_length) {
    return `输入内容至少需要 ${first.ctx.min_length} 个字符。`;
  }
  return "提交内容格式不正确，请检查后再试。";
}

export function getApiErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      return "服务器暂时处理失败，请稍后再试。";
    }
    if (error.status === 422) {
      return validationMessage(error.detail) ?? "提交内容格式不正确，请检查后再试。";
    }
    if (typeof error.detail === "string") {
      const messages: Record<string, string> = {
        "invalid email": "请输入有效的邮箱地址。",
        "email already registered": "这个邮箱已经注册过了，请直接登录。",
        "invalid email or password": "邮箱或密码不正确。",
        "email not verified": "这个邮箱还没有完成验证，请先完成邮箱验证。",
        "invalid or expired verification code": "验证码错误或已过期，请重新获取后再试。",
        "registration code is no longer valid": "注册验证码已失效，请重新注册。",
        "room already bound": "这个宿舍已经绑定过了。"
      };
      return messages[error.detail] ?? error.detail;
    }
    if (error.detail && typeof error.detail === "object") {
      const detail = error.detail as { kind?: string; message?: string; retry_after_seconds?: number };
      if (detail.kind === "rate_limited") {
        return `操作太频繁了，请 ${formatSeconds(Number(detail.retry_after_seconds))}再试。`;
      }
      if (detail.kind === "verification_email_cooldown") {
        return `验证码刚刚发送过，请 ${formatSeconds(Number(detail.retry_after_seconds))}再试。`;
      }
      if (typeof detail.message === "string") {
        return detail.message;
      }
    }
    return "请求失败，请稍后再试。";
  }
  if (error instanceof Error) {
    if (error.message.toLowerCase().includes("failed to fetch")) {
      return "网络连接失败，请检查网络后再试。";
    }
    return error.message;
  }
  return "请求失败，请稍后再试。";
}

export interface ApiClient {
  getMe: () => Promise<User>;
  listBuildings: () => Promise<Building[]>;
  register: (payload: { email: string; password: string }) => Promise<RegisterResponse>;
  verifyEmail: (payload: { email: string; code: string; password: string }) => Promise<User>;
  login: (payload: { email: string; password: string }) => Promise<LoginResponse>;
  requestNotificationEmailCode: (payload: { email: string }) => Promise<{ email: string; dev_verification_code?: string | null; email_sent: boolean }>;
  verifyNotificationEmail: (payload: { email: string; code: string }) => Promise<User>;
  updateMePreferences: (payload: {
    notify_cooldown_hours?: number | null;
    daily_report_enabled?: boolean;
    daily_report_interval_days?: number;
  }) => Promise<User>;
  sendTestEmail: () => Promise<{ email: string; email_sent: boolean }>;
  updatePassword: (payload: { old_password: string; new_password: string }) => Promise<LoginResponse>;
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
    alert_threshold_mode?: "days" | "average" | "fixed";
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
      alert_threshold_mode?: "days" | "average" | "fixed";
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
  updateAdminPassword: (payload: { old_password: string; new_password: string }) => Promise<AdminLoginResponse>;
  listAdminUsers: () => Promise<AdminManagedUser[]>;
  listAdminUsersPage: (params: AdminPageQuery) => Promise<AdminManagedUserPage>;
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
      alert_threshold_mode?: "days" | "average" | "fixed";
      low_power_threshold?: string | null;
      manual_check_cooldown_seconds?: number | null;
      notify_cooldown_hours?: number | null;
      enabled?: boolean;
    }
  ) => Promise<UserRoomBinding>;
  deleteAdminUserRoom: (userId: number, bindingId: number) => Promise<void>;
  listAdminRooms: () => Promise<AdminRoom[]>;
  listAdminRoomsPage: (params: AdminPageQuery) => Promise<AdminRoomPage>;
  listAdminRoomReadings: (
    roomId: number,
    params?: { days?: number; start_at?: string; end_at?: string; limit?: number }
  ) => Promise<Reading[]>;
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
  testAdminToken: (tokenId: number, payload?: { room_id?: number | null }) => Promise<AdminHealthTestResult>;
  listAdminTokenHealthLogs: (params?: AdminLogQuery) => Promise<AdminAuthTokenHealthLog[]>;
  listSmtpSettings: () => Promise<SmtpSettings[]>;
  createSmtpSettings: (payload: {
    name: string;
    host: string;
    port: number;
    username?: string | null;
    password?: string | null;
    from_email: string;
    enabled: boolean;
    min_interval_seconds: number;
    use_ssl: boolean;
    use_starttls: boolean;
  }) => Promise<SmtpSettings>;
  updateSmtpSettings: (
    smtpId: number,
    payload: {
      name?: string;
      host?: string | null;
      port?: number;
      username?: string | null;
      password?: string | null;
      from_email?: string | null;
      enabled?: boolean;
      min_interval_seconds?: number;
      use_ssl?: boolean;
      use_starttls?: boolean;
    }
  ) => Promise<SmtpSettings>;
  deleteSmtpSettings: (smtpId: number) => Promise<void>;
  testSmtpSettings: (smtpId: number, payload: { to_email: string }) => Promise<{ status: string }>;
  listSmtpHealthLogs: (params?: AdminLogQuery) => Promise<SmtpHealthLog[]>;
  testAnySmtpSettings: (payload: { to_email: string }) => Promise<{ status: string }>;
  getAppearanceSettings: () => Promise<AppearanceSettings>;
  updateAppearanceSettings: (payload: Partial<AppearanceSettings>) => Promise<AppearanceSettings>;
  uploadAppearanceBackground: (payload: { theme: "light" | "dark"; file: File }) => Promise<{
    theme: "light" | "dark";
    url: string;
    blurred_url: string;
  }>;
  getRuntimeSettings: () => Promise<RuntimeSettings>;
  updateRuntimeSettings: (payload: Partial<RuntimeSettings>) => Promise<RuntimeSettings>;
  getAdminStatus: () => Promise<AdminStatus>;
  listAdminAuditLogs: (params?: AdminLogQuery) => Promise<AdminAuditLog[]>;
  runAdminChecks: () => Promise<{ checked: number; succeeded: number; failed: number }>;
  runAdminNotifications: () => Promise<{ scanned: number; sent: number; skipped: number; failed: number }>;
  runAdminDataRetentionCleanup: () => Promise<DataRetentionCleanupResult>;
  clearAdminRateLimits: (payload: { bucket?: string | null; client_ip?: string | null; identity?: string | null }) => Promise<{ cleared_keys: number }>;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
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
    updatePassword: (payload) =>
      request<LoginResponse>(
        "/api/me/password",
        {
          method: "POST",
          body: JSON.stringify(payload)
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
      request<AdminLoginResponse>(
        "/api/admin/auth/password",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    listAdminUsers: () => request<AdminManagedUser[]>("/api/admin/users", {}, token),
    listAdminUsersPage: (params) =>
      request<AdminManagedUserPage>(`/api/admin/users/page${buildQuery({ ...params })}`, {}, token),
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
    listAdminRoomsPage: (params) =>
      request<AdminRoomPage>(`/api/admin/rooms/page${buildQuery({ ...params })}`, {}, token),
    listAdminRoomReadings: (roomId, params) =>
      request<Reading[]>(`/api/admin/rooms/${roomId}/readings${buildQuery(params)}`, {}, token),
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
    testAdminToken: (tokenId, payload = {}) =>
      request<AdminHealthTestResult>(
        `/api/admin/tokens/${tokenId}/test`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    listAdminTokenHealthLogs: (params) =>
      request<AdminAuthTokenHealthLog[]>(`/api/admin/tokens/health-logs${buildQuery(params ? { ...params } : undefined)}`, {}, token),
    listSmtpSettings: () => request<SmtpSettings[]>("/api/admin/smtp", {}, token),
    createSmtpSettings: (payload) =>
      request<SmtpSettings>(
        "/api/admin/smtp",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    updateSmtpSettings: (smtpId, payload) =>
      request<SmtpSettings>(
        `/api/admin/smtp/${smtpId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    deleteSmtpSettings: (smtpId) =>
      request<void>(
        `/api/admin/smtp/${smtpId}`,
        {
          method: "DELETE"
        },
        token
      ),
    testSmtpSettings: (smtpId, payload) =>
      request<{ status: string }>(
        `/api/admin/smtp/${smtpId}/test`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    listSmtpHealthLogs: (params) =>
      request<SmtpHealthLog[]>(`/api/admin/smtp/health-logs${buildQuery(params ? { ...params } : undefined)}`, {}, token),
    testAnySmtpSettings: (payload) =>
      request<{ status: string }>(
        "/api/admin/smtp/test",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      ),
    getAppearanceSettings: () => request<AppearanceSettings>("/api/admin/appearance", {}, token),
    updateAppearanceSettings: (payload) =>
      request<AppearanceSettings>(
        "/api/admin/appearance",
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        },
        token
      ),
    uploadAppearanceBackground: ({ theme, file }) => {
      const form = new FormData();
      form.set("theme", theme);
      form.set("file", file);
      return request<{ theme: "light" | "dark"; url: string; blurred_url: string }>(
        "/api/admin/appearance/background",
        {
          method: "POST",
          body: form
        },
        token
      );
    },
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
    listAdminAuditLogs: (params) =>
      request<AdminAuditLog[]>(`/api/admin/audit-logs${buildQuery(params ? { ...params } : undefined)}`, {}, token),
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
      ),
    runAdminDataRetentionCleanup: () =>
      request<DataRetentionCleanupResult>(
        "/api/admin/jobs/data-retention/run",
        {
          method: "POST"
        },
        token
      ),
    clearAdminRateLimits: (payload) =>
      request<{ cleared_keys: number }>(
        "/api/admin/rate-limits/clear",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      )
  };
}
