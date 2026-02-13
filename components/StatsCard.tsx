
import React from 'react';

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isUp: boolean;
  };
  color: string;
}

const StatsCard: React.FC<StatsCardProps> = ({ label, value, icon, trend, color }) => {
  return (
    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between transition-all hover:shadow-lg active:scale-95 group">
      <div className="flex-1">
        <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.15em] mb-1">{label}</p>
        <h3 className="text-xl md:text-2xl font-black text-slate-800 tracking-tighter">{value}</h3>
        {trend && (
          <div className={`flex items-center mt-1 text-[10px] font-bold ${trend.isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span>{trend.isUp ? '↑' : '↓'} {trend.value}%</span>
            <span className="text-slate-300 font-medium ml-1">vs prev.</span>
          </div>
        )}
      </div>
      <div className={`w-12 h-12 flex items-center justify-center rounded-2xl ${color} text-white shadow-lg group-hover:rotate-6 transition-transform`}>
        <span className="text-xl font-bold">{icon}</span>
      </div>
    </div>
  );
};

export default StatsCard;
