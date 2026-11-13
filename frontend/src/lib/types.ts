export type AnnouncementVisibility = "public" | "users";

export interface Announcement {
  id: number;
  title: string;
  content: string;
  is_published: boolean;
  visibility: AnnouncementVisibility;
  created_at: string;
  updated_at?: string | null;
  published_at?: string | null;
}

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
  provider: "mcard" | "hwgl" | string;
}

export interface Room {
  id: number;
  campus: string;
  campus_param: string;
  building_key?: string | null;
  building_name: string;
  building_param: string;
  room_number: string;
  provider: "mcard" | "hwgl" | string;
  provider_price?: string | null;
  provider_price_updated_at?: string | null;
  probe_only?: boolean;
  created_at: string;
}

export interface Reading {
  id: number;
  room_id?: number;
  balance: string;
  source?: string;
  provider?: "mcard" | "hwgl" | string;
  provider_updated_at?: string | null;
  reported_daily_usage?: string | null;
  reported_usage_date?: string | null;
  power_status?: string | null;
  free_electricity?: string | null;
  paid_electricity?: string | null;
  arrears_electricity?: string | null;
  electricity_price?: string | null;
  estimated_amount?: string | null;
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
  latest_provider_updated_at?: string | null;
  latest_power_status?: string | null;
  average_daily_usage?: string | null;
  average_daily_usage_source?:
    | "provider_reported"
    | "provider_reported_historical"
    | "measured"
    | "measured_historical"
    | "inactive"
    | "insufficient"
    | "unknown"
    | string;
  usage_window_hours?: string | null;
  days_remaining?: string | null;
  days_remaining_source?:
    | "provider_reported"
    | "provider_reported_historical"
    | "measured"
    | "measured_historical"
    | "default"
    | "unknown"
    | string;
  alert_threshold?: string | null;
  alert_threshold_source?:
    | "fixed"
    | "provider_reported"
    | "provider_reported_historical"
    | "measured"
    | "measured_historical"
    | "default"
    | "unknown"
    | string;
  is_low_power: boolean;
  status: "unknown" | "low" | "ok" | string;
  estimated_daily_usage?: string | null;
  estimated_daily_usage_source?:
    | "provider_reported"
    | "provider_reported_historical"
    | "measured"
    | "measured_historical"
    | "default"
    | "unknown"
    | string;
  average_daily_usage_sample_days?: number;
  average_daily_usage_basis?: string;
  active_period_start?: string | null;
  active_period_end?: string | null;
  free_electricity?: string | null;
  paid_electricity?: string | null;
  arrears_electricity?: string | null;
  electricity_price?: string | null;
  estimated_amount?: string | null;
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
  recent_recharges?: ElectricityRecharge[];
}

export interface ElectricityRecharge {
  id: number;
  room_id: number;
  provider: string;
  external_id_tail?: string | null;
  paid_at?: string | null;
  amount?: string | null;
  line_type?: string | null;
  payment_status?: string | null;
  processing_status?: string | null;
  source: string;
  fetched_at: string;
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
  health_status: string;
  failure_count: number;
  last_checked_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error_kind?: string | null;
  last_error_msg?: string | null;
  created_at: string;
}

export interface SmtpSettings {
  id: number;
  name: string;
  configured: boolean;
  host?: string | null;
  port: number;
  username?: string | null;
  from_email?: string | null;
  enabled: boolean;
  min_interval_seconds: number;
  use_ssl: boolean;
  use_starttls: boolean;
  password_configured: boolean;
  last_used_at?: string | null;
  health_status: string;
  failure_count: number;
  last_checked_at?: string | null;
  last_success_at?: string | null;
  last_error_at?: string | null;
  last_error_kind?: string | null;
  last_error_msg?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminHealthTestResult {
  success: boolean;
  error_kind?: string | null;
  error_msg?: string | null;
}

export interface AdminAuthTokenHealthLog {
  id: number;
  token_id?: number | null;
  token_name?: string | null;
  source: string;
  success: boolean;
  error_kind?: string | null;
  error_msg?: string | null;
  health_status: string;
  failure_count: number;
  created_at: string;
}

export interface SmtpHealthLog {
  id: number;
  smtp_id?: number | null;
  smtp_name?: string | null;
  source: string;
  recipient_email?: string | null;
  success: boolean;
  error_kind?: string | null;
  error_msg?: string | null;
  health_status: string;
  failure_count: number;
  created_at: string;
}

export interface AdminLogQuery {
  days?: number;
  limit?: number;
  q?: string;
  sort?: "asc" | "desc";
}

export interface AppearanceSettings {
  background_image_url?: string | null;
  light_background_image_url?: string | null;
  dark_background_image_url?: string | null;
  light_background_blurred_url?: string | null;
  dark_background_blurred_url?: string | null;
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
  scheduled_job_run_retention_days: number;
  retention_cleanup_hour: number;
  hwgl_metadata_sync_interval_seconds: number;
  hwgl_metadata_history_days: number;
  hwgl_recharge_history_days: number;
  hwgl_probe_max_duration_seconds: number;
  appearance?: AppearanceSettings | null;
}

export interface DataRetentionCleanupResult {
  verification_codes_deleted: number;
  check_attempts_deleted: number;
  notifications_deleted: number;
  email_delivery_logs_deleted: number;
  electricity_readings_deleted: number;
  admin_audit_logs_deleted: number;
  scheduled_job_runs_deleted: number;
  electricity_recharges_deleted?: number;
  hwgl_probe_samples_deleted?: number;
  hwgl_probe_sessions_deleted?: number;
  total_deleted: number;
}

export interface RuntimeLimits {
  manual_check_cooldown_seconds: number;
  notify_cooldown_hours: number;
  max_rooms_per_user: number;
}

export interface AdminActivityPoint {
  day: string;
  readings: number;
  emails_sent: number;
  emails_failed: number;
  checks_succeeded: number;
  checks_failed: number;
  new_users: number;
}

export interface AdminBuildingStat {
  campus: string;
  building_key?: string | null;
  building_name: string;
  room_count: number;
  binding_count: number;
  enabled_binding_count: number;
  user_count: number;
  rooms_with_readings: number;
  average_latest_balance?: string | null;
  latest_read_at?: string | null;
}

export interface AdminStatus {
  token_count: number;
  enabled_token_count: number;
  unhealthy_token_count: number;
  smtp_count: number;
  enabled_smtp_count: number;
  unhealthy_smtp_count: number;
  smtp_configured: boolean;
  pending_notifications: number;
  failed_notifications: number;
  sent_notifications: number;
  total_notifications: number;
  recent_sent_notifications: number;
  recent_failed_notifications: number;
  all_sent_emails: number;
  all_total_emails: number;
  recent_sent_emails: number;
  recent_failed_emails: number;
  active_bindings: number;
  verified_users: number;
  total_rooms: number;
  total_users: number;
  latest_read_at?: string | null;
  activity_series: AdminActivityPoint[];
  building_stats: AdminBuildingStat[];
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

export interface AdminPageQuery {
  page: number;
  page_size: number;
  q: string;
  sort: string;
}

export interface AdminManagedUserPage {
  items: AdminManagedUser[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
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
  latest_balance?: string | null;
  latest_read_at?: string | null;
  latest_provider_updated_at?: string | null;
  latest_reported_daily_usage?: string | null;
  latest_reported_usage_date?: string | null;
  latest_power_status?: string | null;
  latest_free_electricity?: string | null;
  latest_paid_electricity?: string | null;
  latest_arrears_electricity?: string | null;
  latest_electricity_price?: string | null;
  latest_estimated_amount?: string | null;
  reading_count: number;
  recent_recharges: ElectricityRecharge[];
}

export interface AdminRoomPage {
  items: AdminRoom[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
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

export interface AdminHwglProbeSample {
  id: number;
  session_id: number;
  room_id: number;
  requested_at: string;
  received_at: string;
  provider_updated_at?: string | null;
  balance?: string | null;
  reported_daily_usage?: string | null;
  power_status?: string | null;
  latency_ms?: number | null;
  http_status?: number | null;
  success: boolean;
  error_kind?: string | null;
  error_msg?: string | null;
}

export interface AdminHwglProbe {
  id: number;
  room_id: number;
  interval_seconds: number;
  duration_seconds: number;
  status: "running" | "finished" | "stopped" | "failed" | string;
  started_at: string;
  next_run_at: string;
  finished_at?: string | null;
  sample_count: number;
  unique_snapshot_count: number;
  summary?: Record<string, unknown> | null;
  room: Room;
}

export interface AdminHwglProbeStartPayload {
  room_id?: number;
  room_number?: string;
  building_side?: "auto" | "11" | "13";
  interval_seconds: number;
  duration_seconds: number;
}

export interface AdminHwglProbeDetail extends AdminHwglProbe {
  samples: AdminHwglProbeSample[];
}
