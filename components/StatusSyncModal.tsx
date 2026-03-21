
import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { dbService } from '../services/dbService';

interface StatusSyncModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function StatusSyncModal({ onClose, onSuccess }: StatusSyncModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ updated: number, failed: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setError(null);
    setResult(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        throw new Error("The Excel file appears to be empty.");
      }

      // Identify columns (case insensitive)
      const firstRow = jsonData[0];
      const idKey = Object.keys(firstRow).find(k => 
        k.toLowerCase().includes('sub order no') || 
        k.toLowerCase().includes('order id') || 
        k.toLowerCase() === 'id'
      );
      const statusKey = Object.keys(firstRow).find(k => 
        k.toLowerCase().includes('reason for credit entry') || 
        k.toLowerCase().includes('status')
      );

      if (!idKey || !statusKey) {
        throw new Error("Could not find 'Sub Order No' (or Order ID) and 'Reason for Credit Entry' (or Status) columns in the Excel sheet.");
      }

      const statusMap: Record<string, string> = {
        'CANCELLED': 'Cancelled',
        'DELIVERED': 'Delivered',
        'RTO_COMPLETE': 'Returned',
        'RTO_IN_TRANSIT': 'Returned',
        'RETURN_PENDING': 'Returned',
        'SHIPPED': 'Shipped'
      };

      const updates = jsonData
        .map(row => {
          const rawId = String(row[idKey]).trim();
          // Ensure ID ends with _1 for matching
          const normalizedId = rawId.endsWith('_1') ? rawId : `${rawId}_1`;
          
          let rawStatus = String(row[statusKey]).trim();
          // Map status if found in map, otherwise use raw (but capitalized correctly)
          const upperStatus = rawStatus.toUpperCase();
          const mappedStatus = statusMap[upperStatus] || rawStatus;

          return {
            id: normalizedId,
            status: mappedStatus
          };
        })
        .filter(u => u.id && u.status);

      if (updates.length === 0) {
        throw new Error("No valid order updates found in the file.");
      }

      let updatedCount = 0;
      let failedCount = 0;

      // Update in batches or one by one
      for (const update of updates) {
        try {
          await dbService.updateOrderStatuses([{ id: update.id, status: update.status }]);
          updatedCount++;
        } catch (err) {
          console.error(`Failed to update order ${update.id}:`, err);
          failedCount++;
        }
      }

      setResult({ updated: updatedCount, failed: failedCount });
      onSuccess();
    } catch (err: any) {
      console.error("Sync Error:", err);
      setError(err.message || "Failed to process Excel file.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 bg-indigo-600 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">Status Sync Portal</h3>
            <p className="text-xs opacity-70 mt-1">Update order statuses via Excel</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          {!result ? (
            <div className="space-y-6">
              <div className="p-6 bg-indigo-50 rounded-3xl border-2 border-dashed border-indigo-200 text-center">
                <FileSpreadsheet className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                <p className="text-sm font-bold text-indigo-900 mb-2">Upload Status Excel</p>
                <p className="text-[10px] text-indigo-500 uppercase font-black tracking-widest mb-6">
                  File must contain 'Sub Order No' and 'Reason for Credit Entry'
                </p>
                
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing File...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Select Excel File
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top-2">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-bold text-rose-600 leading-relaxed">{error}</p>
                </div>
              )}

              <div className="bg-slate-50 p-4 rounded-2xl">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Instructions</h4>
                <ul className="text-[10px] font-bold text-slate-600 space-y-1.5 list-disc pl-4">
                  <li>Ensure your Excel has clear headers.</li>
                  <li>Column names should include "Sub Order No" and "Reason for Credit Entry".</li>
                  <li>Common statuses like "CANCELLED", "DELIVERED", and "RTO_COMPLETE" are automatically mapped.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6 py-4 animate-in zoom-in-95">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Sync Complete</h4>
                <p className="text-xs font-bold text-slate-500 mt-2">
                  Successfully updated <span className="text-emerald-600">{result.updated}</span> orders.
                  {result.failed > 0 && (
                    <span className="text-rose-500 block mt-1">Failed to update {result.failed} orders (IDs not found).</span>
                  )}
                </p>
              </div>
              <button 
                onClick={onClose}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Close Portal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
