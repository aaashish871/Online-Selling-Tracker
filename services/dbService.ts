
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { Order, InventoryItem, UserProfile } from "../types.ts";

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

  // --- Auth & Profile Operations ---
  async login(email: string, password: string): Promise<{ user: User | null; error: any }> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (data.user) {
      await this.syncProfile(data.user);
    }
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

  async syncProfile(user: User): Promise<void> {
    if (!supabase) return;
    await supabase
      .from('osot_profiles')
      .upsert({ id: user.id, email: user.email, updated_at: new Date().toISOString() });
  },

  async getAllProfiles(): Promise<UserProfile[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('osot_profiles').select('*');
    return (data as UserProfile[]) || [];
  },

  // --- Admin Data Sharing ---
  async shareData(targetUserId: string, options: { inventory: boolean; orders: boolean; }): Promise<void> {
    if (!supabase) return;
    const admin = await this.getCurrentUser();
    if (!admin) return;

    // 1. Share Inventory
    if (options.inventory) {
      const { data: adminInv } = await supabase.from('osot_inventory').select('*').eq('user_id', admin.id);
      if (adminInv && adminInv.length > 0) {
        const newInv = adminInv.map(item => ({
          ...item,
          id: `INV-${Math.floor(Math.random() * 100000)}`, // New ID to avoid collision
          user_id: targetUserId,
          created_at: new Date().toISOString()
        }));
        await supabase.from('osot_inventory').insert(newInv);
      }
    }

    // 2. Share Orders
    if (options.orders) {
      const { data: adminOrders } = await supabase.from('osot_orders').select('*').eq('user_id', admin.id);
      if (adminOrders && adminOrders.length > 0) {
        const newOrders = adminOrders.map(order => ({
          ...order,
          id: `ORD-${Math.floor(Math.random() * 100000)}`,
          user_id: targetUserId
        }));
        await supabase.from('osot_orders').insert(newOrders);
      }
    }
  },

  // --- Utility ---
  async claimLegacyData(): Promise<{ success: boolean; count: number; error?: string }> {
    if (!supabase) return { success: false, count: 0, error: "Not configured" };
    const user = await this.getCurrentUser();
    if (!user) return { success: false, count: 0, error: "Not logged in" };

    try {
      const invUpdate = await supabase.from('osot_inventory').update({ user_id: user.id }).is('user_id', null).select();
      const ordUpdate = await supabase.from('osot_orders').update({ user_id: user.id }).is('user_id', null).select();
      if (invUpdate.error) throw invUpdate.error;
      if (ordUpdate.error) throw ordUpdate.error;
      return { success: true, count: (invUpdate.data?.length || 0) + (ordUpdate.data?.length || 0) };
    } catch (e: any) {
      return { success: false, count: 0, error: e.message };
    }
  },

  async getOrphanedCounts(): Promise<{ orders: number; inventory: number }> {
    if (!supabase) return { orders: 0, inventory: 0 };
    const { count: ordCount } = await supabase.from('osot_orders').select('*', { count: 'exact', head: true }).is('user_id', null);
    const { count: invCount } = await supabase.from('osot_inventory').select('*', { count: 'exact', head: true }).is('user_id', null);
    return { orders: ordCount || 0, inventory: invCount || 0 };
  },

  // --- Inventory ---
  async getInventory(): Promise<InventoryItem[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase.from('osot_inventory').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error && error.message.includes('user_id')) throw new Error("SCHEMA_MISSING_USER_ID");
    return data as InventoryItem[];
  },

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) return;
    const user = await this.getCurrentUser();
    if (!user) return;
    await supabase.from('osot_inventory').insert([{ ...item, user_id: user.id }]);
  },

  async updateInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) return;
    await supabase.from('osot_inventory').update(item).eq('id', item.id);
  },

  async deleteInventoryItem(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('osot_inventory').delete().eq('id', id);
  },

  // --- Orders ---
  async getOrders(): Promise<Order[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];
    const { data, error } = await supabase.from('osot_orders').select('*').eq('user_id', user.id).order('date', { ascending: false });
    if (error && error.message.includes('user_id')) throw new Error("SCHEMA_MISSING_USER_ID");
    return data as Order[];
  },

  async saveOrder(order: Order): Promise<void> {
    if (!supabase) return;
    const user = await this.getCurrentUser();
    if (!user) return;
    await supabase.from('osot_orders').insert([{ ...order, user_id: user.id }]);
  },

  async updateOrder(order: Order): Promise<void> {
    if (!supabase) return;
    await supabase.from('osot_orders').update(order).eq('id', order.id);
  },

  async deleteOrder(id: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('osot_orders').delete().eq('id', id);
  }
};
