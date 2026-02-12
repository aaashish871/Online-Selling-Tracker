
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
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between transition-all hover:shadow-md">
      <div>
        <p className="text-slate-500 text-sm font-medium mb-1">{label}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        {trend && (
          <div className={`flex items-center mt-2 text-xs font-semibold ${trend.isUp ? 'text-emerald-500' : 'text-rose-500'}`}>
            <span>{trend.isUp ? '↑' : '↓'} {trend.value}%</span>
            <span className="text-slate-400 font-normal ml-1">vs last month</span>
          </div>
        )}
      </div>
      <div className={`p-3 rounded-xl ${color} text-white`}>
        {icon}
      </div>
    </div>
  );
};

export default StatsCard;
