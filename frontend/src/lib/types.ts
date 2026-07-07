export interface User {
  id: number;
  email: string;
  is_verified: boolean;
  notification_email?: string | null;
  notification_email_verified: boolean;
  manual_check_cooldown_seconds?: number | null;
  notify_cooldown_hours?: number | null;
  test_email_sent_at?: string | null;
  daily_report_enabled: boolean;
  daily_report_interval_days: number;
  daily_report_last_sent_at?: string | null;
  created_at: string;
}

export interface RegisterResponse {
  user?: User | null;
  dev_verification_code?: string | null;
  email_sent: boolean;
}

export interface LoginResponse {
  access_token: string;
  token_type: "bearer";
  user: User;
}

export interface Building {
  key: string;
  name: string;
  param: string;
}

export interface Room {
  id: number;
  campus: string;
  campus_param: string;
  building_key?: string | null;
  building_name: string;
  building_param: string;
  room_number: string;
  created_at: string;
}

export interface Reading {
  id: number;
  room_id?: number;
  balance: string;
  source?: string;
  read_at: string;
}

export interface CheckAttempt {
  id: number;
  room_id: number;
  user_room_id?: number | null;
  reading_id?: number | null;
  source: string;
  success: boolean;
  balance?: string | null;
  error_kind?: string | null;
  error_msg?: string | null;
  started_at: string;
  finished_at?: string | null;
  room: {
    id: number;
    campus: string;
    building_name: string;
    room_number: string;
  };
}

export interface UsageStats {
  latest_balance?: string | null;
  latest_read_at?: string | null;
  average_daily_usage?: string | null;
  average_daily_usage_source?: "measured" | "insufficient" | "unknown" | string;
  usage_window_hours?: string | null;
  days_remaining?: string | null;
  days_remaining_source?: "measured" | "default" | "unknown" | string;
  alert_threshold?: string | null;
  alert_threshold_source?: "fixed" | "measured" | "default" | "unknown" | string;
  is_low_power: boolean;
  status: "unknown" | "low" | "ok" | string;
}

export interface UserRoomSummary {
  binding_id: number;
  room: Room;
  alert_days: number;
  alert_threshold_mode?: "days" | "average" | "fixed" | null;
  low_power_threshold?: string | null;
  enabled: boolean;
  manual_check_available_at?: string | null;
  usage: UsageStats;
  recent_readings: Reading[];
}

export interface UserRoomBinding {
  id: number;
  room_id: number;
  alert_days: number;
  alert_threshold_mode?: "days" | "average" | "fixed" | null;
  low_power_threshold?: string | null;
  manual_check_cooldown_seconds?: number | null;
  notify_cooldown_hours?: number | null;
  enabled: boolean;
  created_at: string;
  room: Room;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name?: string | null;
  enabled: boolean;
  last_login_at?: string | null;
  created_at: string;
}

export interface AdminLoginResponse {
  access_token: string;
  token_type: "bearer";
  admin: AdminUser;
}

export interface AdminAuthToken {
  id: number;
  name: string;
  token_preview: string;
  enabled: boolean;
  min_interval_seconds: number;
  last_used_at?: string | null;
  created_at: string;
}

export interface SmtpSettings {
  configured: boolean;
  host?: string | null;
  port: number;
  username?: string | null;
  from_email?: string | null;
  use_ssl: boolean;
  use_starttls: boolean;
  password_configured: boolean;
  updated_at?: string | null;
}

export interface AppearanceSettings {
  background_image_url?: string | null;
  light_background_image_url?: string | null;
  dark_background_image_url?: string | null;
  background_position: "top" | "center" | "bottom";
  background_overlay_opacity: number;
  background_blur_px: number;
  glass_card_opacity: number;
  glass_blur_px: number;
  glass_effect_mode: "lite" | "frosted" | "liquid";
  updated_at?: string | null;
}

export interface RuntimeSettings {
  check_interval_seconds: number;
  check_batch_size: number;
  check_request_delay_seconds: number;
  notify_interval_seconds: number;
  notify_cooldown_hours: number;
  default_alert_days: number;
  default_daily_usage_kwh: number;
  usage_history_days: number;
  manual_check_cooldown_seconds: number;
  worker_idle_seconds: number;
  max_rooms_per_user: number;
  verification_code_retention_days: number;
  check_attempt_retention_days: number;
  notification_retention_days: number;
  electricity_reading_retention_days: number;
  admin_audit_log_retention_days: number;
  retention_cleanup_hour: number;
  appearance?: AppearanceSettings | null;
}

export interface DataRetentionCleanupResult {
  verification_codes_deleted: number;
  check_attempts_deleted: number;
  notifications_deleted: number;
  electricity_readings_deleted: number;
  admin_audit_logs_deleted: number;
  total_deleted: number;
}

export interface RuntimeLimits {
  manual_check_cooldown_seconds: number;
  notify_cooldown_hours: number;
  max_rooms_per_user: number;
}

export interface AdminStatus {
  token_count: number;
  enabled_token_count: number;
  smtp_configured: boolean;
  pending_notifications: number;
  failed_notifications: number;
  total_rooms: number;
  total_users: number;
  latest_read_at?: string | null;
}

export interface AdminManagedUser {
  id: number;
  email: string;
  is_verified: boolean;
  notification_email?: string | null;
  notification_email_verified: boolean;
  manual_check_cooldown_seconds?: number | null;
  notify_cooldown_hours?: number | null;
  room_count: number;
  created_at: string;
}

export interface AdminManagedUserDetail extends AdminManagedUser {
  rooms: UserRoomBinding[];
}

export interface AdminRoomBinding {
  binding_id: number;
  user_id: number;
  email: string;
  notification_email?: string | null;
  notification_email_verified: boolean;
  enabled: boolean;
  created_at: string;
}

export interface AdminRoom {
  room: Room;
  binding_count: number;
  bindings: AdminRoomBinding[];
}


export interface AdminAuditLog {
  id: number;
  admin_id?: number | null;
  action: string;
  target_type: string;
  target_id?: string | null;
  detail?: string | null;
  created_at: string;
}
