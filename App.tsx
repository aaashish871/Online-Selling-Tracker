
import React, { useState, useMemo, useEffect } from 'react';
import { Order, InventoryItem, UserProfile } from './types.ts';
import { INITIAL_STATUSES, CATEGORIES } from './constants.tsx';
import StatsCard from './components/StatsCard.tsx';
import OrderForm from './components/OrderForm.tsx';
import InventoryForm from './components/InventoryForm.tsx';
import { dbService } from './services/dbService.ts';
import { getAIAnalysis } from './services/geminiService.ts';
import { User } from '@supabase/supabase-js';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';

type ViewMode = 'dashboard' | 'orders' | 'returned' | 'inventory' | 'reports' | 'settings' | 'team';

const TEAM_ROLES = ['Staff', 'Manager', 'Viewer'];

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [dbStatus, setDbStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const [view, setView] = useState<ViewMode>('dashboard');
  const [orders, setOrders] = useState<Order[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  
  const [statuses, setStatuses] = useState<string[]>(INITIAL_STATUSES);
  const [categories, setCategories] = useState<string[]>(CATEGORIES);

  const [isInvFormOpen, setIsInvFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Filtering States for Orders
  const [orderFilterMonth, setOrderFilterMonth] = useState('all');
  const [orderFilterStatus, setOrderFilterStatus] = useState('all');

  // Filtering States for Returned Tab
  const [returnFilterType, setReturnFilterType] = useState('all');
  const [returnFilterReceived, setReturnFilterReceived] = useState('all');
  const [returnFilterClaim, setReturnFilterClaim] = useState('all');

  // Reports State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

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
        const isOnline = await dbService.checkConnection();
        setDbStatus(isOnline ? 'online' : 'offline');
      } catch {
        setDbStatus('offline');
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
      let msg = error.message;
      if (msg === 'Failed to fetch') {
        msg = 'Connection Error: Please check your internet or ensure the database project is active.';
      }
      setAuthError(msg); 
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

  const loadData = async (silent = false) => {
    if (!user) return;
    if (!silent) setIsLoading(true);
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
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const handleOnboardMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm(`This will register ${newMemberEmail} as ${newMemberRole}. IMPORTANT: You will be logged out and must sign back in as Admin to see this user in your directory. Continue?`)) return;
    
    setIsOnboarding(true);
    try {
      const { error } = await dbService.register(newMemberEmail, newMemberPassword, newMemberRole);
      if (error) throw error;
      alert(`User ${newMemberEmail} created! Logging out. Please sign in as Admin.`);
      handleLogout();
    } catch (e: any) {
      alert("Registration failed: " + e.message);
    } finally {
      setIsOnboarding(false);
    }
  };

  const runAIAnalysis = async () => {
    if (orders.length === 0) {
      alert("Record some orders first to get AI insights!");
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await getAIAnalysis(orders);
      setAiAnalysis(result);
    } finally {
      setIsAnalyzing(false);
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
    const baseRev = settled.reduce((s, o) => s + (Number(o.settledAmount) || 0), 0);
    const baseProf = settled.reduce((s, o) => s + (Number(o.profit) || 0), 0);
    
    // Calculate Customer Loss (sum of lossAmount where status is Returned and bankSettled is true)
    const customerLoss = orders
      .filter(o => o.status === 'Returned' && o.bankSettled)
      .reduce((s, o) => s + (Number(o.lossAmount) || 0), 0);
    
    const rev = baseRev - customerLoss;
    const prof = baseProf - customerLoss;
    
    return { rev, prof, customerLoss, count: orders.length };
  }, [orders]);

  const monthlyData = useMemo(() => {
    const map: Record<string, any> = {};
    orders.forEach(o => {
      const m = o.date.substring(0, 7);
      if (!map[m]) map[m] = { month: m, revenue: 0, profit: 0 };
      if (o.status === 'Settled') { 
        map[m].revenue += Number(o.settledAmount); 
        map[m].profit += Number(o.profit); 
      }
      // Subtract customer loss from monthly profit and revenue
      if (o.status === 'Returned' && o.bankSettled) {
        const loss = Number(o.lossAmount) || 0;
        map[m].profit -= loss;
        map[m].revenue -= loss;
      }
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month));
  }, [orders]);

  // Status Counts for Cards - Sorted by Highest
  const orderStatusSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      counts[o.status] = (counts[o.status] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count);
  }, [orders]);

  // Available unique months for filtering
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    orders.forEach(o => months.add(o.date.substring(0, 7)));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [orders]);

  // Filtered Orders Logic
  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const monthMatch = orderFilterMonth === 'all' || o.date.startsWith(orderFilterMonth);
      const statusMatch = orderFilterStatus === 'all' || o.status === orderFilterStatus;
      return monthMatch && statusMatch;
    });
  }, [orders, orderFilterMonth, orderFilterStatus]);

  // Filtered Returned Orders Logic
  const filteredReturnedOrders = useMemo(() => {
    return orders.filter(o => {
      if (o.status !== 'Returned') return false;
      const typeMatch = returnFilterType === 'all' || o.returnType === returnFilterType;
      const receivedMatch = returnFilterReceived === 'all' || (o.receivedStatus || 'Pending') === returnFilterReceived;
      const claimMatch = returnFilterClaim === 'all' || (o.claimStatus || 'None') === returnFilterClaim;
      return typeMatch && receivedMatch && claimMatch;
    });
  }, [orders, returnFilterType, returnFilterReceived, returnFilterClaim]);

  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-2xl p-8 md:p-12 border border-slate-100 animate-in fade-in zoom-in duration-500">
          <div className="text-center mb-10">
            <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white font-black text-4xl shadow-xl mx-auto mb-6">O</div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Order Analyzer</h1>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : dbStatus === 'offline' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]' : 'bg-slate-300 animate-pulse'}`}></div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                System Status: {dbStatus === 'online' ? 'Connected' : dbStatus === 'offline' ? 'Database Paused/Offline' : 'Checking...'}
              </p>
            </div>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-3">
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

  if (authLoading || (isLoading && orders.length === 0)) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>;

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
            {(['dashboard', 'orders', 'returned', 'inventory', 'reports', 'settings', 'team'] as ViewMode[]).map(m => {
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
            {/* Onboard New Member Form */}
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
                    <button type="button" onClick={() => setShowNewMemberPassword(!showNewMemberPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-indigo-600">
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
                <button type="submit" disabled={isOnboarding} className="py-4 bg-indigo-600 text-white font-black uppercase text-[10px] tracking-widest rounded-2xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 h-[56px]">
                  {isOnboarding ? 'Onboarding...' : 'Onboard Member'}
                </button>
              </form>
            </div>

            {/* Team Directory */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-black text-slate-900 tracking-tight">Team Directory</h2>
                <button onClick={loadData} className="px-4 py-2 bg-slate-50 text-[10px] font-black uppercase text-slate-400 rounded-xl hover:bg-slate-100 transition-colors">Refresh Directory</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {profiles.map(p => (
                  <div key={p.id} className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 group transition-all hover:bg-white hover:shadow-xl hover:border-indigo-100 relative overflow-hidden">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-xl shadow-sm">👤</div>
                      <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${p.role === 'Manager' ? 'bg-purple-50 text-purple-600 border-purple-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                        {p.role || 'Staff'}
                      </span>
                    </div>
                    <h4 className="text-sm font-black text-slate-800 tracking-tight truncate">{p.email}</h4>
                    <button onClick={() => setSharingUser(p)} className="mt-6 w-full py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all">Sync Data</button>
                  </div>
                ))}
                {profiles.length === 0 && <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem]"><p className="text-sm font-bold text-slate-400">Directory is currently empty. Members will appear here after they sign up.</p></div>}
              </div>
            </div>
          </div>
        )}

        {view === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard label="Net Settled" value={`₹${stats.rev.toLocaleString()}`} color="bg-indigo-600" icon="₹" />
              <StatsCard label="Net Profit" value={`₹${stats.prof.toLocaleString()}`} color="bg-emerald-500" icon="📈" />
              <StatsCard label="Customer Loss" value={`₹${stats.customerLoss.toLocaleString()}`} color="bg-rose-500" icon="📉" />
              <StatsCard label="Total Orders" value={stats.count} color="bg-slate-800" icon="📦" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4">
                <OrderForm 
                  onAdd={async o => { 
                    // Optimistic update
                    setOrders(prev => [o, ...prev]);
                    try {
                      await dbService.saveOrder(o); 
                      await loadData(true); 
                    } catch (err) {
                      // Rollback on error
                      setOrders(prev => prev.filter(item => item.id !== o.id));
                      throw err;
                    }
                  }} 
                  inventory={inventory} 
                  statuses={statuses} 
                />
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

        {view === 'returned' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatsCard 
                label="Total Returns" 
                value={orders.filter(o => o.status === 'Returned').length} 
                color="bg-rose-500" 
                icon="🔄" 
              />
              <StatsCard 
                label="Total Loss" 
                value={`₹${orders.filter(o => o.status === 'Returned').reduce((sum, o) => sum + (o.lossAmount || 0), 0).toLocaleString()}`} 
                color="bg-slate-800" 
                icon="📉" 
              />
              <StatsCard 
                label="Pending Claims" 
                value={orders.filter(o => o.status === 'Returned' && o.claimStatus === 'Pending').length} 
                color="bg-amber-500" 
                icon="⏳" 
              />
              <StatsCard 
                label="Not Received" 
                value={orders.filter(o => o.status === 'Returned' && o.receivedStatus === 'Not Received').length} 
                color="bg-rose-600" 
                icon="📦" 
              />
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Returns Management</h2>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {filteredReturnedOrders.length} Returned Items Showing
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="flex-1 md:flex-none">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Return Type</label>
                    <select 
                      className="w-full md:w-32 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100"
                      value={returnFilterType}
                      onChange={e => setReturnFilterType(e.target.value)}
                    >
                      <option value="all">All Types</option>
                      <option value="Courier">Courier</option>
                      <option value="Customer">Customer</option>
                    </select>
                  </div>
                  <div className="flex-1 md:flex-none">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Received</label>
                    <select 
                      className="w-full md:w-32 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100"
                      value={returnFilterReceived}
                      onChange={e => setReturnFilterReceived(e.target.value)}
                    >
                      <option value="all">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Received">Received</option>
                      <option value="Not Received">Not Received</option>
                    </select>
                  </div>
                  <div className="flex-1 md:flex-none">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Claim</label>
                    <select 
                      className="w-full md:w-32 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100"
                      value={returnFilterClaim}
                      onChange={e => setReturnFilterClaim(e.target.value)}
                    >
                      <option value="all">All Claims</option>
                      <option value="None">None</option>
                      <option value="Pending">Pending</option>
                      <option value="Approved">Approved</option>
                      <option value="Rejected">Rejected</option>
                      <option value="Not Required">Not Required</option>
                    </select>
                  </div>
                  <button 
                    onClick={() => { setReturnFilterType('all'); setReturnFilterReceived('all'); setReturnFilterClaim('all'); }}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Clear Filters"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-8 py-4">ID</th>
                      <th className="px-4 py-4">Product</th>
                      <th className="px-4 py-4">Return Type</th>
                      <th className="px-4 py-4">Received Status</th>
                      <th className="px-4 py-4">Loss Amount</th>
                      <th className="px-4 py-4 text-center">Bank Settled</th>
                      <th className="px-4 py-4">Claim Status</th>
                      <th className="px-4 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredReturnedOrders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-4 font-black text-indigo-600 text-xs">{o.id}</td>
                        <td className="px-4 py-4 font-bold text-slate-800 text-xs">{o.productName}</td>
                        <td className="px-4 py-4">
                          <select 
                            className="px-3 py-1.5 bg-slate-50 text-slate-700 text-[10px] font-black rounded-lg border-none focus:ring-2 focus:ring-indigo-200"
                            value={o.returnType || ''}
                            onChange={async (e) => {
                              const val = e.target.value as any;
                              setOrders(prev => prev.map(item => item.id === o.id ? { ...item, returnType: val } : item));
                              await dbService.updateOrder({ ...o, returnType: val });
                            }}
                          >
                            <option value="">Select Type</option>
                            <option value="Courier">Courier</option>
                            <option value="Customer">Customer</option>
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <select 
                            className={`px-3 py-1.5 text-[10px] font-black rounded-lg border-none focus:ring-2 focus:ring-indigo-200 ${
                              o.receivedStatus === 'Received' ? 'bg-emerald-50 text-emerald-600' :
                              o.receivedStatus === 'Not Received' ? 'bg-rose-50 text-rose-600' :
                              'bg-slate-50 text-slate-600'
                            }`}
                            value={o.receivedStatus || 'Pending'}
                            onChange={async (e) => {
                              const val = e.target.value as any;
                              setOrders(prev => prev.map(item => item.id === o.id ? { ...item, receivedStatus: val } : item));
                              await dbService.updateOrder({ ...o, receivedStatus: val });
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Received">Received</option>
                            <option value="Not Received">Not Received</option>
                          </select>
                        </td>
                        <td className="px-4 py-4 font-bold text-rose-500 text-xs">
                          <div className="flex items-center gap-1">
                            <span>₹</span>
                            <input 
                              type="number" 
                              className="w-20 bg-transparent border-b border-slate-200 focus:border-indigo-500 outline-none"
                              value={o.lossAmount || 0}
                              onChange={async (e) => {
                                const val = Number(e.target.value);
                                setOrders(prev => prev.map(item => item.id === o.id ? { ...item, lossAmount: val } : item));
                                await dbService.updateOrder({ ...o, lossAmount: val });
                              }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={o.bankSettled || false}
                            onChange={async (e) => {
                              const val = e.target.checked;
                              setOrders(prev => prev.map(item => item.id === o.id ? { ...item, bankSettled: val } : item));
                              await dbService.updateOrder({ ...o, bankSettled: val });
                            }}
                          />
                        </td>
                        <td className="px-4 py-4">
                          <select 
                            className={`px-3 py-1.5 text-[10px] font-black rounded-lg border-none focus:ring-2 focus:ring-indigo-200 ${
                              o.claimStatus === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                              o.claimStatus === 'Rejected' ? 'bg-rose-50 text-rose-600' :
                              o.claimStatus === 'Pending' ? 'bg-amber-50 text-amber-600' :
                              o.claimStatus === 'Not Required' ? 'bg-slate-100 text-slate-500' :
                              'bg-slate-50 text-slate-600'
                            }`}
                            value={o.claimStatus || 'None'}
                            onChange={async (e) => {
                              const val = e.target.value as any;
                              setOrders(prev => prev.map(item => item.id === o.id ? { ...item, claimStatus: val } : item));
                              await dbService.updateOrder({ ...o, claimStatus: val });
                            }}
                          >
                            <option value="None">None</option>
                            <option value="Pending">Pending</option>
                            <option value="Approved">Approved</option>
                            <option value="Rejected">Rejected</option>
                            <option value="Not Required">Not Required</option>
                          </select>
                        </td>
                        <td className="px-4 py-4">
                          <button 
                            onClick={() => setView('orders')}
                            className="text-indigo-600 font-black text-[10px] uppercase hover:underline"
                          >
                            View Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredReturnedOrders.length === 0 && (
                  <div className="p-12 text-center text-slate-400 text-sm font-bold uppercase tracking-widest">
                    No returned items found matching filters
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'orders' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            {/* Status Summary Cards - Sorted by Highest Count */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {orderStatusSummary.map(({ status, count }) => (
                <div 
                  key={status} 
                  className={`p-4 rounded-2xl border flex flex-col items-center justify-center text-center transition-all cursor-pointer hover:shadow-md ${orderFilterStatus === status ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-100 text-slate-800'}`}
                  onClick={() => setOrderFilterStatus(orderFilterStatus === status ? 'all' : status)}
                >
                  <span className={`text-[10px] font-black uppercase tracking-widest mb-1 ${orderFilterStatus === status ? 'text-indigo-100' : 'text-slate-400'}`}>{status}</span>
                  <span className="text-2xl font-black tracking-tighter">{count}</span>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Order Management</h2>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{filteredOrders.length} Records Showing</span>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                  <div className="flex-1 md:flex-none">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Month Filter</label>
                    <select 
                      className="w-full md:w-40 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100"
                      value={orderFilterMonth}
                      onChange={e => setOrderFilterMonth(e.target.value)}
                    >
                      <option value="all">All Months</option>
                      {availableMonths.map(m => (
                        <option key={m} value={m}>{new Date(m + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 md:flex-none">
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-1 tracking-widest">Status Filter</label>
                    <select 
                      className="w-full md:w-40 px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black uppercase text-slate-600 outline-none focus:ring-2 focus:ring-indigo-100"
                      value={orderFilterStatus}
                      onChange={e => setOrderFilterStatus(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <button 
                    onClick={() => { setOrderFilterMonth('all'); setOrderFilterStatus('all'); }}
                    className="mt-4 md:mt-0 p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                    title="Clear Filters"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-8 py-4">ID</th>
                      <th className="px-4 py-4">Product</th>
                      <th className="px-4 py-4">Date</th>
                      <th className="px-4 py-4">Settled</th>
                      <th className="px-4 py-4">Profit</th>
                      <th className="px-4 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredOrders.map(o => (
                      <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-4 font-black text-indigo-600 text-xs">{o.id}</td>
                        <td className="px-4 py-4 font-bold text-slate-800 text-xs">{o.productName}</td>
                        <td className="px-4 py-4 text-slate-400 text-[11px]">{o.date}</td>
                        <td className="px-4 py-4 font-bold text-slate-700 text-xs">₹{o.settledAmount}</td>
                        <td className={`px-4 py-4 font-black text-xs ${o.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{o.profit}</td>
                        <td className="px-4 py-4">
                          <select 
                            className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-lg border-none focus:ring-2 focus:ring-indigo-200"
                            value={o.status}
                            onChange={async (e) => {
                              const newStatus = e.target.value;
                              let actualSettledAmount = o.settledAmount;
                              let newProfit = o.profit;

                              if (newStatus === 'Settled') {
                                const promptVal = window.prompt(`Enter actual settled amount for order ${o.id}:`, o.settledAmount.toString());
                                if (promptVal !== null) {
                                  const amount = parseFloat(promptVal);
                                  if (!isNaN(amount)) {
                                    actualSettledAmount = amount;
                                    // Recalculate profit based on original unit cost
                                    // Original profit = original settled - unit cost
                                    // unit cost = original settled - original profit
                                    const unitCost = o.settledAmount - o.profit;
                                    newProfit = actualSettledAmount - unitCost;
                                  }
                                }
                              }

                              // Targeted state update instead of loadData() to prevent perceived "page refresh"
                              setOrders(prev => prev.map(item => item.id === o.id ? { 
                                ...item, 
                                status: newStatus,
                                settledAmount: actualSettledAmount,
                                profit: newProfit
                              } : item));
                              
                              try {
                                const updated = { 
                                  ...o, 
                                  status: newStatus,
                                  settledAmount: actualSettledAmount,
                                  profit: newProfit
                                };
                                await dbService.updateOrder(updated);
                              } catch (err) {
                                console.error("Failed to update status:", err);
                                loadData(); // Re-sync on failure
                              }
                            }}
                          >
                            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredOrders.length === 0 && <div className="p-12 text-center text-slate-400 text-sm font-bold uppercase tracking-widest">No matching records found</div>}
              </div>
            </div>
          </div>
        )}

        {view === 'inventory' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Stock Inventory</h2>
              <button onClick={() => { setEditingItem(null); setIsInvFormOpen(true); }} className="px-6 py-3 bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest rounded-2xl shadow-xl hover:bg-indigo-700 transition-all">+ Add Product</button>
            </div>
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr><th className="px-8 py-4">SKU</th><th className="px-4 py-4">Product Name</th><th className="px-4 py-4">Stock</th><th className="px-4 py-4">Unit Cost</th><th className="px-4 py-4">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {inventory.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-8 py-4 font-mono text-[10px] font-black text-slate-400 uppercase tracking-tighter">{item.sku}</td>
                        <td className="px-4 py-4 font-bold text-slate-800 text-xs">{item.name}</td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase ${item.stockLevel <= item.minStockLevel ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {item.stockLevel} units
                          </span>
                        </td>
                        <td className="px-4 py-4 font-bold text-slate-700 text-xs">₹{item.unitCost}</td>
                        <td className="px-4 py-4">
                          <button onClick={() => { setEditingItem(item); setIsInvFormOpen(true); }} className="text-indigo-600 font-black text-[10px] uppercase hover:underline">Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {view === 'reports' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-bottom-10 duration-500">
            <div className="bg-indigo-600 p-12 rounded-[3rem] text-white text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl"></div>
              <h2 className="text-3xl font-black mb-4">AI Business Auditor</h2>
              <p className="text-indigo-100 font-medium mb-8 max-w-lg mx-auto">Gemini analyzes your real-time sales data to suggest inventory optimizations and profit boosters.</p>
              <button onClick={runAIAnalysis} disabled={isAnalyzing} className="px-8 py-4 bg-white text-indigo-600 font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl hover:bg-slate-50 transition-all disabled:opacity-50">
                {isAnalyzing ? 'Processing Intelligence...' : 'Generate AI Business Audit'}
              </button>
            </div>
            {aiAnalysis && (
              <div className="bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm animate-in zoom-in-95 duration-500">
                <div className="flex items-center gap-2 mb-6 text-indigo-600"><span className="text-xl">🤖</span> <h3 className="text-[10px] font-black uppercase tracking-widest">Gemini Analysis Result</h3></div>
                <div className="prose prose-indigo max-w-none text-slate-600 font-medium whitespace-pre-wrap leading-relaxed">{aiAnalysis}</div>
              </div>
            )}
          </div>
        )}

        {view === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 mb-6 uppercase tracking-tight">Business Configuration</h3>
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Order Status Workflow</label>
                  <div className="flex flex-wrap gap-2">
                    {statuses.map(s => <span key={s} className="px-3 py-1.5 bg-slate-50 text-slate-600 text-[10px] font-bold rounded-lg border border-slate-100">{s}</span>)}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Product Categories</label>
                  <div className="flex flex-wrap gap-2">
                    {categories.map(c => <span key={c} className="px-3 py-1.5 bg-slate-50 text-indigo-600 text-[10px] font-bold rounded-lg border border-slate-100">{c}</span>)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Shared Modals */}
      {sharingUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 bg-indigo-600 text-white"><h3 className="text-xl font-black">Admin Sync Portal</h3><p className="text-xs opacity-70 mt-1">Copying context to: {sharingUser.email}</p></div>
            <div className="p-8 space-y-6">
              <p className="text-xs font-bold text-slate-500">Select modules to push:</p>
              <div className="space-y-3">
                {['Inventory', 'Orders'].map(type => (
                  <label key={type} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                    <input type="checkbox" className="w-5 h-5 rounded text-indigo-600" checked={(shareConfig as any)[type.toLowerCase()]} onChange={e => setShareConfig({...shareConfig, [type.toLowerCase()]: e.target.checked})} />
                    <span className="text-sm font-black text-slate-800">{type} Records</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setSharingUser(null)} className="flex-1 py-4 text-slate-400 font-black text-[10px] uppercase">Cancel</button>
                <button onClick={handleShareSubmit} disabled={isSharingData} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase shadow-xl disabled:opacity-50">{isSharingData ? 'Syncing...' : 'Initialize Sync'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isInvFormOpen && (
        <InventoryForm 
          onAdd={async i => { 
            setInventory(prev => [i, ...prev]);
            try {
              await dbService.saveInventoryItem(i); 
              await loadData(true); 
            } catch (err) {
              setInventory(prev => prev.filter(item => item.id !== i.id));
              throw err;
            }
          }} 
          onUpdate={async i => { 
            const oldItem = inventory.find(item => item.id === i.id);
            setInventory(prev => prev.map(item => item.id === i.id ? i : item));
            try {
              await dbService.updateInventoryItem(i); 
              await loadData(true); 
            } catch (err) {
              if (oldItem) setInventory(prev => prev.map(item => item.id === i.id ? oldItem : item));
              throw err;
            }
          }} 
          onClose={() => setIsInvFormOpen(false)} 
          inventory={inventory} 
          categories={categories} 
          initialData={editingItem} 
        />
      )}
    </div>
  );
};

export default App;
