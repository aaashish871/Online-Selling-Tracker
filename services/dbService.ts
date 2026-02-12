
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Order, InventoryItem } from "../types.ts";

// Configured with your provided Supabase credentials
const supabaseUrl = 'https://yvugbgjrakdcgirxpcvi.supabase.co';
const supabaseKey = 'sb_publishable_f3m2s_7xpL28Tm8vQsjU1A_R7HVsVJP';

// Initialize the Supabase client
let supabase: SupabaseClient | null = null;
if (supabaseUrl && supabaseKey) {
  try {
    supabase = createClient(supabaseUrl, supabaseKey);
  } catch (e) {
    console.error("Failed to initialize Supabase client:", e);
  }
}

export const dbService = {
  isConfigured(): boolean {
    return !!supabase;
  },

  // --- Inventory Operations ---
  async getInventory(): Promise<InventoryItem[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('osot_inventory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching inventory:", error.message);
      throw error; 
    }
    return data as InventoryItem[];
  },

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { error } = await supabase
      .from('osot_inventory')
      .insert([item]);

    if (error) {
      throw new Error(`Failed to save inventory: ${error.message}`);
    }
  },

  async updateInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { error } = await supabase
      .from('osot_inventory')
      .update(item)
      .eq('id', item.id);

    if (error) {
      throw new Error(`Failed to update inventory: ${error.message}`);
    }
  },

  async deleteInventoryItem(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { error } = await supabase
      .from('osot_inventory')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete inventory item: ${error.message}`);
    }
  },

  // --- Order Operations ---
  async getOrders(): Promise<Order[]> {
    if (!supabase) return [];
    
    const { data, error } = await supabase
      .from('osot_orders')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error("Error fetching orders:", error.message);
      throw error;
    }
    return data as Order[];
  },

  async saveOrder(order: Order): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { error } = await supabase
      .from('osot_orders')
      .insert([order]);

    if (error) {
      throw new Error(`Failed to save order: ${error.message}`);
    }
  },

  async deleteOrder(id: string): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { error } = await supabase
      .from('osot_orders')
      .delete()
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to delete order: ${error.message}`);
    }
  }
};
