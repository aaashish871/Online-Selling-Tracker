
import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, CheckCircle2, AlertCircle, IndianRupee } from 'lucide-react';
import * as XLSX from 'xlsx';
import { dbService } from '../services/dbService';

interface PaymentSyncModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaymentSyncModal({ onClose, onSuccess }: PaymentSyncModalProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ updated: number, failed: number, totalSettled: number } | null>(null);
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
      
      // Get raw rows as array of arrays to handle multi-row headers
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

      if (rows.length === 0) {
        throw new Error("The file appears to be empty.");
      }

      // Find the header row (the one containing 'Sub Order No')
      let headerRowIndex = -1;
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        if (rows[i] && rows[i].some(cell => String(cell || '').toLowerCase().includes('sub order no'))) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1) {
        throw new Error("Could not find 'Sub Order No' column in the report. Please ensure you are uploading the correct Meesho Payment report.");
      }

      const headers = rows[headerRowIndex].map(h => String(h || '').trim());
      const idIdx = headers.findIndex(h => h.toLowerCase().includes('sub order no'));
      const settlementIdx = headers.findIndex(h => h.toLowerCase().includes('final settlement amount'));
      const statusIdx = headers.findIndex(h => h.toLowerCase().includes('live order status'));

      if (idIdx === -1 || settlementIdx === -1) {
        throw new Error("Could not find 'Sub Order No' and 'Final Settlement Amount' columns in the report.");
      }

      const updates = rows.slice(headerRowIndex + 1)
        .filter(row => {
          const id = String(row[idIdx] || '').trim();
          // Skip formula rows (usually single letters like 'A', 'B') or empty rows or header repeats
          return id && id.length > 5 && !id.toLowerCase().includes('sub order no');
        })
        .map(row => {
          const rawId = String(row[idIdx]).trim();
          // Ensure ID ends with _1 for matching
          const normalizedId = rawId.endsWith('_1') ? rawId : `${rawId}_1`;
          
          // Final Settlement Amount
          const settledAmount = parseFloat(String(row[settlementIdx] || '0').replace(/[^0-9.-]+/g, ""));
          const liveStatus = String(row[statusIdx] || '').trim().toUpperCase();
          
          const update: any = {
            id: normalizedId,
            settledAmount: isNaN(settledAmount) ? 0 : settledAmount
          };

          // If status is Delivered, we mark it as Settled in our app
          if (liveStatus === 'DELIVERED') {
            update.status = 'Settled';
          }

          return update;
        })
        .filter(u => u.id);

      if (updates.length === 0) {
        throw new Error("No valid payment records found in the file.");
      }

      let updatedCount = 0;
      let failedCount = 0;
      let totalSettled = 0;

      // Update one by one to handle individual failures gracefully
      for (const update of updates) {
        try {
          await dbService.updateOrderPayments([update]);
          updatedCount++;
          totalSettled += update.settledAmount;
        } catch (err) {
          console.error(`Failed to update payment for order ${update.id}:`, err);
          failedCount++;
        }
      }

      setResult({ updated: updatedCount, failed: failedCount, totalSettled });
      onSuccess();
    } catch (err: any) {
      console.error("Payment Sync Error:", err);
      setError(err.message || "Failed to process payment report.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="p-8 bg-emerald-600 text-white flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight">Payment to Date Sync</h3>
            <p className="text-xs opacity-70 mt-1">Upload Meesho Payment Report</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          {!result ? (
            <div className="space-y-6">
              <div className="p-6 bg-emerald-50 rounded-3xl border-2 border-dashed border-emerald-200 text-center">
                <FileText className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <p className="text-sm font-bold text-emerald-900 mb-2">Upload Payment Report (.csv/.xlsx)</p>
                <p className="text-[10px] text-emerald-500 uppercase font-black tracking-widest mb-6">
                  Matches 'Sub Order No' and updates 'Settled Amount'
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
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-100 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing Payments...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Select Payment Report
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
                  <li>Download the "Payment to Date" report from Meesho.</li>
                  <li>Upload the file here to sync actual settled amounts.</li>
                  <li>Orders marked as "Delivered" in the report will be updated to "Settled" status.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6 py-4 animate-in zoom-in-95">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
              </div>
              <div>
                <h4 className="text-lg font-black text-slate-900 uppercase tracking-tight">Payment Sync Complete</h4>
                <div className="mt-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Orders Updated</span>
                    <span className="text-sm font-black text-emerald-600">{result.updated}</span>
                  </div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Settled</span>
                    <span className="text-sm font-black text-slate-900">₹{result.totalSettled.toFixed(2)}</span>
                  </div>
                  {result.failed > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Not Found</span>
                      <span className="text-sm font-black text-rose-500">{result.failed}</span>
                    </div>
                  )}
                </div>
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
