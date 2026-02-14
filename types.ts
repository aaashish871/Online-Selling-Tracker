
export interface Order {
  id: string;
  user_id?: string; // Associated Supabase user UID
  date: string;
  productId: string;
  productName: string;
  category: string;
  listingPrice: number;
  settledAmount: number;
  profit: number;
  status: string;
  returnType?: 'Courier' | 'Customer' | null;
  lossAmount?: number;
  claimStatus?: 'Pending' | 'Approved' | 'Rejected' | 'None';
}

export interface InventoryItem {
  id: string;
  user_id?: string; // Associated Supabase user UID
  name: string;
  category: string;
  sku: string;
  stockLevel: number;
  unitCost: number;
  retailPrice: number;
  bankSettledAmount: number;
  minStockLevel: number;
}

export interface UserProfile {
  id: string;
  email: string;
  role: string;
  updated_at: string;
}

export interface MonthlyReport {
  month: string;
  sales: number;
  profit: number;
  orderCount: number;
  topProduct: string;
}
