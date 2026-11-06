export type ProductionCheck = {
  id: number;
  check_code?: string;
  check_date?: string;
  order_item_id: number;
  checker_user_id?: string | null;
  checker_email?: string | null;
  good_qty: number;
  reject_qty: number;
  status: string;
  notes?: string | null;
  pending_request?: CheckerEditRequest | null;
  rejected_request?: CheckerEditRequest | null;
  approved_request?: CheckerEditRequest | null;
  // Denormalized fields for Riwayat table (resolved from order_item_id → production_order_items → production_orders)
  spk_code?: string;
  work_item_name?: string;
  operator_name?: string;
  unit?: string;
  is_paid?: boolean | null;
  payment_status?: string | null;
};

export type CheckerEditRequest = {
  id: number;
  setoran_id: number;
  checker_id: string;
  current_qty: number;
  requested_qty: number;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  updated_at: string;
  check_code?: string;
  check_date?: string;
  spk_code?: string;
  work_item_name?: string;
  unit?: string;
  operator_name?: string;
  checker_name?: string;
  checker_email?: string;
};

export type CheckerTaskItem = {
  id: number;
  order_id: number;
  work_item_name_snapshot: string;
  unit_snapshot: string;
  assigned_qty: number;
  qty_per_product_snapshot: number;
  status: string;
  spk_code: string;
  product_name: string;
  product_code: string;
  operator_worker_id?: number | null;
  operator_name: string;
  operator_code: string;
  checker_email: string;
  due_date: string | null;
  notes: string | null;
  remain: number;
  isOrderEdited: boolean;
  has_dependencies: boolean;
  hard: boolean;
  availableEq: number | null;
  maxRaw: number | null;
  checks: ProductionCheck[];
};

export type ValidationResult = {
  is_valid: boolean;
  message: string;
  has_predecessor?: boolean;
  predecessor_work_item_id?: number;
  predecessor_work_item_name?: string;
  predecessor_qty_sah?: number;
  current_work_item_name?: string;
  input_qty?: number;
  max_allowed_qty?: number;
};

export type ProjectOptionItem = {
  id: number;
  name: string;
  project_code?: string | null;
  status?: string;
};

export type ProductOptionItem = {
  id: number;
  project_id: number;
  name: string;
  product_code?: string | null;
  target_production?: number;
  unit?: string;
  status?: string;
};

export type WorkItemOptionItem = {
  id: number;
  project_id: number;
  product_id?: number | null;
  name: string;
  unit: string;
  qty_per_product: number;
  operator_price?: number;
  proposed_price?: number;
  status?: string;
  executor_scope?: string | null;
};

export type WorkerOptionItem = {
  id: number;
  name: string;
  worker_code: string;
  department?: string | null;
  position?: string | null;
  status?: string;
};


