
import { Order, InventoryItem } from './types.ts';

export const INITIAL_STATUSES = [
  'Pending',
  'Processing',
  'Shipped',
  'Completed',
  'Cancelled',
  'Returned'
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ORD-001',
    date: '2023-10-25',
    productId: 'INV-001',
    productName: 'Wireless Headphones',
    category: 'Electronics',
    listingPrice: 199.99,
    settledAmount: 180.00,
    profit: 60.00,
    status: 'Completed',
  }
];

export const INITIAL_INVENTORY: InventoryItem[] = [
  {
    id: 'INV-001',
    name: 'Wireless Headphones',
    category: 'Electronics',
    sku: 'HEAD-WH-1000',
    stockLevel: 45,
    unitCost: 120.00,
    retailPrice: 199.99,
    bankSettledAmount: 180.00,
    minStockLevel: 10,
  },
  {
    id: 'INV-002',
    name: 'Office Chair',
    category: 'Furniture',
    sku: 'CHAIR-ERG-01',
    stockLevel: 12,
    unitCost: 180.00,
    retailPrice: 350.00,
    bankSettledAmount: 310.00,
    minStockLevel: 5,
  }
];

export const CATEGORIES = [
  'Electronics',
  'Furniture',
  'Home & Kitchen',
  'Fashion',
  'Sports',
  'Other'
];
