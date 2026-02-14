
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Order, InventoryItem } from "../types.ts";

/**
 * DATABASE FIX REQUIRED:
 * 
 * The app expects 'user_id' columns in your tables for security and multi-user support.
 * Please run the following SQL in your Supabase SQL Editor:
 * 
 * ALTER TABLE osot_inventory ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
 * ALTER TABLE osot_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();
 * ALTER TABLE osot_inventory ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
 * ALTER TABLE osot_orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
 * 
 * TO RECOVER "MISSING" DATA:
 * If your old data is not visible, it's because it doesn't have a user_id assigned yet.
 * Run this:
 * UPDATE osot_inventory SET user_id = auth.uid() WHERE user_id IS NULL;
 * UPDATE osot_orders SET user_id = auth.uid() WHERE user_id IS NULL;
 */

const supabaseUrl = 'https://yvugbgjrakdcgirxpcvi.supabase.co';
const supabaseKey = 'sb_publishable_f3m2s_7xpL28Tm8vQsjU1A_R7HVsVJP';

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

  // --- Auth Operations ---
  async login(email: string, password: string): Promise<{ user: User | null; error: any }> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { user: data.user, error };
  },

  async logout(): Promise<void> {
    if (!supabase) return;
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    if (!supabase) return null;
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  },

  /**
   * Assigns all records with NULL user_id to the currently logged in user.
   * This recovers data stored before the multi-user update.
   */
  async claimLegacyData(): Promise<{ success: boolean; count: number; error?: string }> {
    if (!supabase) return { success: false, count: 0, error: "Not configured" };
    const user = await this.getCurrentUser();
    if (!user) return { success: false, count: 0, error: "Not logged in" };

    try {
      const invUpdate = await supabase
        .from('osot_inventory')
        .update({ user_id: user.id })
        .is('user_id', null);

      const ordUpdate = await supabase
        .from('osot_orders')
        .update({ user_id: user.id })
        .is('user_id', null);

      if (invUpdate.error) throw invUpdate.error;
      if (ordUpdate.error) throw ordUpdate.error;

      return { 
        success: true, 
        count: (invUpdate.count || 0) + (ordUpdate.count || 0) 
      };
    } catch (e: any) {
      return { success: false, count: 0, error: e.message };
    }
  },

  // --- Inventory Operations ---
  async getInventory(): Promise<InventoryItem[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from('osot_inventory')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching inventory:", error.message);
      if (error.message.includes('user_id')) {
        throw new Error("SCHEMA_MISSING_USER_ID");
      }
      throw error; 
    }
    return data as InventoryItem[];
  },

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const user = await this.getCurrentUser();
    if (!user) throw new Error("User not authenticated.");
    
    const { error } = await supabase
      .from('osot_inventory')
      .insert([{ ...item, user_id: user.id }]);

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
    const user = await this.getCurrentUser();
    if (!user) return [];
    
    const { data, error } = await supabase
      .from('osot_orders')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (error) {
      console.error("Error fetching orders:", error.message);
      if (error.message.includes('user_id')) {
        throw new Error("SCHEMA_MISSING_USER_ID");
      }
      throw error;
    }
    return data as Order[];
  },

  async saveOrder(order: Order): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const user = await this.getCurrentUser();
    if (!user) throw new Error("User not authenticated.");
    
    const { error } = await supabase
      .from('osot_orders')
      .insert([{ ...order, user_id: user.id }]);

    if (error) {
      throw new Error(`Failed to save order: ${error.message}`);
    }
  },

  async updateOrder(order: Order): Promise<void> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase
      .from('osot_orders')
      .update(order)
      .eq('id', order.id);

    if (error) {
      throw new Error(`Failed to update order status: ${error.message}`);
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
