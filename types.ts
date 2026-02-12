
export interface Order {
  id: string;
  date: string;
  productId: string;
  productName: string;
  category: string;
  listingPrice: number;
  settledAmount: number; // The amount received in bank
  profit: number;
  status: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  sku: string;
  stockLevel: number;
  unitCost: number; // Purchasing price
  retailPrice: number; // Listing price on website
  bankSettledAmount: number; // Actual amount received in bank
  minStockLevel: number;
}

export interface MonthlyReport {
  month: string;
  sales: number;
  profit: number;
  orderCount: number;
  topProduct: string;
}
