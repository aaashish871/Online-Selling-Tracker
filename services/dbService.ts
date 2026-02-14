
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

  async register(email: string, password: string, role: string = 'Staff'): Promise<{ user: User | null; error: any }> {
    if (!supabase) throw new Error("Supabase is not configured.");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (data.user) {
      await this.syncProfile(data.user, role);
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

  async syncProfile(user: User, role?: string): Promise<void> {
    if (!supabase) return;
    
    const profileData: any = { 
      id: user.id, 
      email: user.email, 
      updated_at: new Date().toISOString() 
    };

    if (role) profileData.role = role;

    await supabase
      .from('osot_profiles')
      .upsert(profileData, { onConflict: 'id' });
  },

  async getAllProfiles(): Promise<UserProfile[]> {
    if (!supabase) return [];
    const { data, error } = await supabase.from('osot_profiles').select('*');
    if (error) console.error("Error fetching profiles:", error);
    return (data as UserProfile[]) || [];
  },

  // --- Admin Data Sharing ---
  async shareData(targetUserId: string, options: { inventory: boolean; orders: boolean; }): Promise<void> {
    if (!supabase) return;
    const admin = await this.getCurrentUser();
    if (!admin) return;

    if (options.inventory) {
      const { data: adminInv } = await supabase.from('osot_inventory').select('*').eq('user_id', admin.id);
      if (adminInv && adminInv.length > 0) {
        const newInv = adminInv.map(item => {
          const { id, created_at, ...rest } = item;
          return { ...rest, user_id: targetUserId };
        });
        await supabase.from('osot_inventory').insert(newInv);
      }
    }

    if (options.orders) {
      const { data: adminOrders } = await supabase.from('osot_orders').select('*').eq('user_id', admin.id);
      if (adminOrders && adminOrders.length > 0) {
        const newOrders = adminOrders.map(order => {
          const { id, ...rest } = order;
          return { ...rest, user_id: targetUserId };
        });
        await supabase.from('osot_orders').insert(newOrders);
      }
    }
  },

  async getInventory(): Promise<InventoryItem[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];
    const { data } = await supabase.from('osot_inventory').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    return data as InventoryItem[];
  },

  async saveInventoryItem(item: InventoryItem): Promise<void> {
    if (!supabase) return;
    const user = await this.getCurrentUser();
    if (!user) return;
    await supabase.from('osot_inventory').insert([{ ...item, user_id: user.id }]);
  },

  async getOrders(): Promise<Order[]> {
    if (!supabase) return [];
    const user = await this.getCurrentUser();
    if (!user) return [];
    const { data } = await supabase.from('osot_orders').select('*').eq('user_id', user.id).order('date', { ascending: false });
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
  }
};
