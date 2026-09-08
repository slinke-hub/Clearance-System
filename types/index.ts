// ============================================================
// Global TypeScript Types for KSA Customs Clearance System
// ============================================================

export type UserRole = 'user' | 'admin' | 'superadmin';
export type UserType = 'individual' | 'enterprise';
export type SubscriptionPlan = 'free' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'inactive' | 'suspended';
export type InvoiceRunStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type RegulationStatus = 'REGULATED' | 'NON-REGULATED' | 'UNKNOWN';
export type OrgMemberRole = 'owner' | 'admin' | 'member';
export type Language = 'en' | 'ar';

// ── Business Type for KSA Clearance ─────────────────────────
export type ClearanceBusinessType = 'customs_broker' | 'importer_exporter' | 'freight_forwarder' | 'individual';

// ── Profile ──────────────────────────────────────────────────
export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  user_type: UserType;
  business_type?: ClearanceBusinessType;
  role: UserRole;
  language_pref: Language;
  avatar_url: string | null;
  phone: string | null;
  company_name: string | null;
  company_name_ar?: string | null;
  cr_number?: string | null;
  vat_number: string | null;
  broker_license_no?: string | null;
  fasah_id?: string | null;
  primary_port?: string | null;
  industry_sector?: string | null;
  transport_license_no?: string | null;
  monthly_volume?: string | null;
  org_id: string | null;
  created_at: string;
  updated_at: string;
}

// ── Subscription ─────────────────────────────────────────────
export interface Subscription {
  id: string;
  user_id: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  monthly_limit: number;
  invoices_used: number;
  period_start: string;
  period_end: string;
  created_at: string;
  updated_at: string;
}

// ── Organization ─────────────────────────────────────────────
export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_id: string | null;
  logo_url: string | null;
  company_name_ar?: string | null;
  vat_number: string | null;
  cr_number: string | null;
  broker_license_no?: string | null;
  fasah_id?: string | null;
  primary_port?: string | null;
  business_type?: ClearanceBusinessType | null;
  created_at: string;
  updated_at: string;
}

// ── Org Member ───────────────────────────────────────────────
export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgMemberRole;
  invited_by: string | null;
  joined_at: string;
  profile?: Profile;
}

// ── Invoice Run ──────────────────────────────────────────────
export interface InvoiceRun {
  id: string;
  user_id: string;
  org_id: string | null;
  file_name: string;
  file_url: string | null;
  status: InvoiceRunStatus;
  total_items: number;
  processed_items: number;
  error_message: string | null;
  column_mapping: ColumnMapping | null;
  created_at: string;
  updated_at: string;
}

// ── Column Mapping ───────────────────────────────────────────
export interface ColumnMapping {
  itemName: string;
  itemDescription?: string;
  quantity?: string;
  unitPrice?: string;
  totalPrice?: string;
  currency?: string;
}

// ── Invoice Line Item ────────────────────────────────────────
export interface InvoiceLineItem {
  id: string;
  run_id: string;
  row_index: number;
  item_name: string | null;
  item_description: string | null;
  quantity: string | null;
  unit_price: string | null;
  total_price: string | null;
  currency: string | null;
  raw_data: Record<string, unknown> | null;
  created_at: string;
  classification?: ClassificationResult;
}

// ── Classification Result ────────────────────────────────────
export interface ClassificationResult {
  id: string;
  line_item_id: string;
  run_id: string;
  hs_code: string | null;
  cdf: string | null;
  regulation_status: RegulationStatus | null;
  standardized_name: string | null;
  confidence_score: number | null;
  ai_model: string | null;
  raw_ai_response: Record<string, unknown> | null;
  classified_at: string;
}

// ── AI Classification Output Schema ──────────────────────────
export interface ZatcaClassification {
  hsCode: string;
  cdf: string;
  regulationStatus: RegulationStatus;
  standardizedZatcaName: string;
  confidenceScore?: number;
}

// ── Audit Log ────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  profile?: Pick<Profile, 'full_name' | 'email'>;
}

// ── Excel Parsed Row ─────────────────────────────────────────
export interface ParsedExcelRow {
  rowIndex: number;
  data: Record<string, string | number | null>;
}

// ── Subscription Plan Config ─────────────────────────────────
export interface PlanConfig {
  name: string;
  monthlyLimit: number;
  features: string[];
  price: string;
  badge?: string;
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  free: {
    name: 'Free Trial',
    monthlyLimit: 5,
    features: ['5 invoices/month', 'Basic AI classification', 'CSV export'],
    price: 'SAR 0',
  },
  pro: {
    name: 'Pro',
    monthlyLimit: 50,
    features: [
      '50 invoices/month',
      'Advanced AI classification',
      'Excel export with formatting',
      'Classification history',
      'Email support',
    ],
    price: 'SAR 299/month',
    badge: 'Popular',
  },
  enterprise: {
    name: 'Enterprise',
    monthlyLimit: -1, // unlimited
    features: [
      'Unlimited invoices',
      'Priority AI processing',
      'Full Excel export',
      'Team/Org management',
      'API access',
      'Dedicated support',
      'Custom HS-Code rules',
    ],
    price: 'SAR 999/month',
    badge: 'Best Value',
  },
};
