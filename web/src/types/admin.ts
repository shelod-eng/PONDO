export type AdminRole = "super_admin" | "operations_admin";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  avatar: string;
  subtitle: string;
  permissions: string[];
}

export type CheckoutStatus =
  | "COMPLETED"
  | "DELIVERED"
  | "IN_TRANSIT"
  | "PENDING"
  | "BLOCKED";

export type VerificationState = "PASS" | "FAIL" | "PENDING" | "REVIEW" | "N_A";

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  hint: string;
  accent: string;
  surface: string;
  icon: string;
}

export interface CheckoutRecord {
  id: string;
  consumer: string;
  product: string;
  partner: string;
  amount: number;
  itc: VerificationState;
  kyc: VerificationState;
  vetting: VerificationState;
  status: CheckoutStatus;
  driver: string | null;
  time: string;
}

export interface KycAuditRecord {
  ref: string;
  consumer: string;
  saIdMasked: string;
  itc: VerificationState;
  kyc: VerificationState;
  vetting: VerificationState;
  status: "CLEARED" | "REVIEW" | "BLOCKED";
  time: string;
  product: string;
  amount: number;
}

export interface AdminManualReviewSummary {
  open: number;
  assigned: number;
  resolved: number;
  latestOpenedAt: string | null;
}

export interface AdminSettlementSummary {
  reconciledCount: number;
  pendingCount: number;
  reconciledGross: number;
  settledNet: number;
  latestSettledAt: string | null;
}

export interface AdminManualReviewQueueItem {
  id: string;
  customer: string;
  reason: string;
  riskDecision: string;
  amount: number;
  product: string;
  queue: string;
  status: string;
  openedAt: string;
}

export interface AdminOrderStatusItem {
  status: string;
  count: number;
  amount: number;
}

export interface AdminDashboardData {
  kpis: KpiMetric[];
  recentTransactions: CheckoutRecord[];
  kycAuditRecords: KycAuditRecord[];
  manualReview: AdminManualReviewSummary;
  manualReviewQueue: AdminManualReviewQueueItem[];
  orderStatuses: AdminOrderStatusItem[];
  settlement: AdminSettlementSummary;
  txVolumeData: TxVolumePoint[];
  kycPieData: KycPieSlice[];
  kycTrendData: KycTrendPoint[];
  revenueTrendData: RevenueTrendPoint[];
  partnerPerformanceData: PartnerPerformancePoint[];
  generatedAt: string;
}

export interface DriverAssignment {
  driverId: string;
  name: string;
  kycVerified: boolean;
  zone: string;
  status: "ACTIVE" | "OFF_SHIFT";
  currentAssignment: string | null;
  deliveriesToday: number;
  rating: number;
  pedDevice: string;
  deliveryStep: string;
}

export interface TxVolumePoint {
  hour: string;
  completed: number;
  failed: number;
  pending: number;
}

export interface KycTrendPoint {
  day: string;
  pass: number;
  review: number;
  fail: number;
}

export interface RevenueTrendPoint {
  week: string;
  revenue: number;
  target: number;
}

export interface KycPieSlice {
  name: string;
  value: number;
  color: string;
}

export interface PartnerPerformancePoint {
  name: string;
  orders: number;
  delivered: number;
  success: number;
}
