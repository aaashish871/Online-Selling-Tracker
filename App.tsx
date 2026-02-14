
import React, { useState, useMemo, useEffect } from 'react';
import { Order, InventoryItem, UserProfile } from './types.ts';
import { INITIAL_STATUSES, CATEGORIES } from './constants.tsx';
import StatsCard from './components/StatsCard.tsx';
import OrderForm from './components/OrderForm.tsx';
import InventoryForm from './components/InventoryForm.tsx';
import { dbService } from './services/dbService.ts';
import { User } from '@supabase/supabase-js';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

type ViewMode = 'dashboard' | 'orders' | 'inventory' | 'reports' | 'settings' | 'team';

const TEAM_ROLES = ['Staff', 'Manager', 'Viewer'];

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  const [view, setView] = useState<ViewMode>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  
  const [statuses, setStatuses] = useState<string[]>(INITIAL_STATUSES);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);

  const [isInvFormOpen, setIsInvFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // New Member Onboarding States
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Staff');
  const [showNewMemberPassword, setShowNewMemberPassword] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);

  // Sharing States
  const [sharingUser, setSharingUser] = useState<UserProfile | null>(null);
  const [shareConfig, setShareConfig] = useState({ inventory: true, orders: false });
  const [isSharingData, setIsSharingData] = useState(false);

  const isAdmin = user?.email?.toLowerCase() === 'aaashish871@gmail.com';

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const currentUser = await dbService.getCurrentUser();
        setUser(currentUser);
      } finally {
        setAuthLoading(false);
      }
    };
    checkAuth();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    const { user: loggedInUser, error } = isRegisterMode 
      ? await dbService.register(email, password)
      : await dbService.login(email, password);
    
    if (error) { 
      setAuthError(error.message); 
      setAuthLoading(false); 
    } else { 
      setUser(loggedInUser); 
      setAuthLoading(false); 
    }
  };

  const handleLogout = async () => {
    await dbService.logout();
    setUser(null);
    setOrders([]);
    setInventory([]);
    setView('dashboard');
  };

  const loadData = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const [fetchedOrders, fetchedInventory] = await Promise.all([
        dbService.getOrders(),
        dbService.getInventory()
      ]);
      setOrders(fetchedOrders || []);
      setInventory(fetchedInventory || []);
      if (isAdmin) {
        const allProfiles = await dbService.getAllProfiles();
        setProfiles(allProfiles.filter(p => p.email !== user.email));
      }
    } catch (error: any) {
      console.error("Data load error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const handleOnboardMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`Registering ${newMemberEmail} as ${newMemberRole}. Note: You will need to re-login as Admin after this action. Proceed?`)) return;
    
    setIsOnboarding(true);
    try {
      const { error } = await dbService.register(newMemberEmail, newMemberPassword, newMemberRole);
      if (error) throw error;
      alert(`Success! Team member created. Redirecting to admin login.`);
      handleLogout();
    } catch (e: any) {
      alert("Registration failed: " + e.message);
    } finally {
      setIsOnboarding(false);
      setNewMemberEmail('');
      setNewMemberPassword('');
    }
  };

  const handleShareSubmit = async () => {
    if (!sharingUser) return;
    setIsSharingData(true);
    try {
      await dbService.shareData(sharingUser.id, shareConfig);
      alert(`Data successfully synced to ${sharingUser.email}.`);
      setSharingUser(null);
    } catch (e: any) {
      alert("Sharing failed: " + e.message);
    } finally {
      setIsSharingData(false);
    }
  };

  const stats = useMemo(() => {
    const settled = orders.filter(o => o.status === 'Settled');
    const rev = settled.reduce((s, o) => s + (Number(o.settledAmount) || 0), 0);
    const prof = settled.reduce((s, o) => s + (Number(o.profit) || 0), 0);
    return { rev, prof, count: orders.length };
  }, [orders]);

  const monthlyData = useMemo(() => {
    const map: Record<string, any> = {};
    orders.forEach(o => {
      const m = o.date.substring(0, 7);
      if (!map[m]) map[m] = { month: m, revenue: 0, profit: 0 };
      if (o.status === 'Settled') { map[m].revenue += Number(o.settledAmount); map[m].profit += Number(o.profit); }
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [orders]);

  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-slate-100 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white font-black text-4xl shadow-xl mx-auto mb-6">O</div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Analyzer</h1>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">
              {isRegisterMode ? 'Team Member Registration' : 'Secure Access Gateway'}
            </p>
          </div>
          <form onSubmit={handleAuth} className="space-y-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email Address</label>
              <input type="email" className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 transition-all" value={password} onChange={e => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600">
                  {showPassword ? '👁️' : '🕶️'}
                </button>
              </div>
            </div>
            {authError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{authError}</p>}
            <button type="submit" className="w-full py-5 bg-indigo-600 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl shadow-xl hover:bg-indigo-700 transition-all">
              {isRegisterMode ? 'Create Account' : 'Enter Dashboard'}
            </button>
            <button type="button" onClick={() => setIsRegisterMode(!isRegisterMode)} className="w-full text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors">
              {isRegisterMode ? 'Back to Login' : "Register new team account"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (authLoading || isLoading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC]">
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-50 px-4 py-4 md:px-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg">O</div>
              <div>
                <h1 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  Order Tracker
                  {isAdmin && <span className="bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter shadow-sm border border-amber-200">👑 Admin</span>}
                </h1>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{user?.email}</span>
              </div>
            </div>
            <button onClick={handleLogout} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors">✕</button>
          </div>
          <div className="flex overflow-x-auto pb-1 gap-1 no-scrollbar">
            {(['dashboard', 'orders', 'inventory', 'reports', 'settings', 'team'] as ViewMode[]).map(m => {
              if (m === 'team' && !isAdmin) return null;
              return (
                <button key={m} onClick={() => setView(m)} className={`px-5 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${view === m ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-7xl mx-auto w-full px-4 md:px-8 py-6 pb-24">
        {view === 'team' && isAdmin && (
          <div className="space-y-6 animate-in slide-in-from-bottom-10">
            {/* Onboard New Member with Role */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 tracking-tight mb-6">Onboard New Member</h2>
              <form onSubmit={handleOnboardMember} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Email</label>
                  <input 
                    type="email" 
                    placeholder="member@email.com" 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 text-sm"
                    value={newMemberEmail}
                    onChange={e => setNewMemberEmail(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Password</label>
                  <div className="relative">
                    <input 
                      type={showNewMemberPassword ? "text" : "password"} 
                      placeholder="••••••••" 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 text-sm"
                      value={newMemberPassword}
                      onChange={e => setNewMemberPassword(e.target.value)}
                      required
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowNewMemberPassword(!showNewMemberPassword)} 
                      className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600"
                    >
                      {showNewMemberPassword ? '👁️' : '🕶️'}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Role</label>
                  <select 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-slate-800 outline-none focus:ring-4 focus:ring-indigo-100 text-sm appearance-none cursor-pointer"
                    value={newMemberRole}
                    onChange={e => setNewMemberRole(e.target.value)}
                  >
                    {TEAM_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <button 
                  type="submit" 
                  disabled={isOnboarding}
                  className="py-4 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 h-[56px]"
                >
                  {isOnboarding ? 'Adding...' : 'Onboard Member'}
                </button>
              </form>
            </div>

            {/* Team Directory with Role Badges */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h2 className="text-xl font-black text-slate-900 tracking-tight mb-8">Team Directory</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profiles.map(p => (
                  <div key={p.id} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 group transition-all hover:bg-white hover:shadow-xl hover:border-indigo-100 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">👤</div>
                      <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                        p.role === 'Manager' ? 'bg-purple-50 text-purple-600 border-purple-100' : 
                        p.role === 'Viewer' ? 'bg-slate-50 text-slate-500 border-slate-100' :
                        'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {p.role || 'Staff'}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight truncate">{p.email}</h4>
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mt-1">Active Cloud Instance</p>
                    <button 
                      onClick={() => setSharingUser(p)}
                      className="mt-6 w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all"
                    >
                      Sync Business Data
                    </button>
                  </div>
                ))}
                {profiles.length === 0 && (
                  <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
                    <p className="text-sm font-bold text-slate-400">Directory is currently empty.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard label="Net Settled" value={`₹${stats.rev.toLocaleString()}`} color="bg-indigo-600" icon="₹" />
              <StatsCard label="Net Profit" value={`₹${stats.prof.toLocaleString()}`} color="bg-emerald-500" icon="📈" />
              <StatsCard label="Total Orders" value={stats.count} color="bg-slate-800" icon="📦" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4">
                <OrderForm onAdd={async o => { await dbService.saveOrder(o); loadData(); }} inventory={inventory} statuses={statuses} />
              </div>
              <div className="lg:col-span-8 bg-white p-6 rounded-[2rem] border border-slate-100 h-[350px]">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Sales Trend</h3>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 900}} />
                    <Tooltip />
                    <Area type="monotone" dataKey="profit" stroke="#10b981" fillOpacity={0.1} fill="#10b981" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {(['orders', 'inventory', 'reports', 'settings'] as ViewMode[]).includes(view) && (
          <div className="bg-white p-12 rounded-[2.5rem] border border-slate-100 text-center">
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-widest text-indigo-600">{view} Active</h3>
            <p className="text-sm text-slate-400 mt-2 font-medium">This module is currently syncing with the cloud database.</p>
          </div>
        )}
      </main>

      {/* Sharing Modal */}
      {sharingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-indigo-600 text-white">
              <h3 className="text-xl font-black">Context Sync</h3>
              <p className="text-xs opacity-70 mt-1">Initializing workspace for: {sharingUser.email}</p>
            </div>
            <div className="p-8 space-y-6">
              <p className="text-xs font-bold text-slate-500">Push following data structures to their account:</p>
              <div className="space-y-3">
                <label className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" className="w-5 h-5 rounded text-indigo-600" checked={shareConfig.inventory} onChange={e => setShareConfig({...shareConfig, inventory: e.target.checked})} />
                  <div>
                    <span className="block text-sm font-black text-slate-800">Inventory Catalog</span>
                    <span className="text-[10px] text-slate-400">All products, SKU IDs, and purchase costs</span>
                  </div>
                </label>
                <label className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input type="checkbox" className="w-5 h-5 rounded text-indigo-600" checked={shareConfig.orders} onChange={e => setShareConfig({...shareConfig, orders: e.target.checked})} />
                  <div>
                    <span className="block text-sm font-black text-slate-800">Order Streams</span>
                    <span className="text-[10px] text-slate-400">Current active and settled order history</span>
                  </div>
                </label>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setSharingUser(null)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase">Cancel</button>
                <button 
                  onClick={handleShareSubmit}
                  disabled={isSharingData}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSharingData ? 'Syncing...' : 'Start Data Push'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInvFormOpen && (
        <InventoryForm onAdd={async i => { await dbService.saveInventoryItem(i); loadData(); }} onUpdate={async i => { /* update logic */ }} onClose={() => setIsInvFormOpen(false)} inventory={inventory} categories={categories} initialData={editingItem} />
      )}
    </div>
  );
};

export default App;
