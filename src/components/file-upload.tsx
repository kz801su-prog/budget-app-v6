"use client"

import { useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { parseExcelFile } from '@/lib/excel-parser';
import { MonthlyRecord } from '@/lib/types';

interface FileUploadProps {
    onDataLoaded: (monthUpdate: number | Record<number, MonthlyRecord[]>, data?: MonthlyRecord[]) => Promise<void> | void;
    loadedMonths: number[];
    budgetOnlyMonths?: number[];
    onReset: () => void;
}

export function FileUpload({ onDataLoaded, loadedMonths, budgetOnlyMonths = [], onReset }: FileUploadProps) {
    const [loading, setLoading] = useState(false);
    const [month, setMonth] = useState<string>("");
    const [isBudgetMode, setIsBudgetMode] = useState(false);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setLoading(true);
        let processedCount = 0;
        let errorCount = 0;

        // Process each file
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                // ── ファイル名から月を先に検出し、パーサーに渡す ──────────────
                const normalizedFileNameEarly = file.name.normalize('NFKC');
                let earlyMonthIndex = -1;
                const jpMatchEarly = normalizedFileNameEarly.match(/(\d{1,2})月/);
                const engMatchEarly = normalizedFileNameEarly.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);
                if (jpMatchEarly) {
                    const m = parseInt(jpMatchEarly[1]);
                    if (m >= 1 && m <= 12) earlyMonthIndex = m - 1;
                } else if (engMatchEarly) {
                    const map: Record<string, number> = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
                    earlyMonthIndex = map[engMatchEarly[1].toLowerCase().substring(0, 3)];
                }
                if (earlyMonthIndex === -1 && month && month !== "auto") earlyMonthIndex = parseInt(month);

                console.log(`[FileUpload] Processing file: ${file.name} (BudgetMode: ${isBudgetMode}, 検出月: ${earlyMonthIndex + 1 || '?'})`);
                const records = await parseExcelFile(file, isBudgetMode, earlyMonthIndex);
                console.log(`[FileUpload] Parsed ${records.length} records from ${file.name}`);

                // 1. If in Budget Mode, the parser takes care of everything (multiple months)
                if (isBudgetMode) {
                    const recordsByMonth: Record<number, MonthlyRecord[]> = {};
                    records.forEach(r => {
                        const mIdx = r.monthIndex ?? -1;
                        if (mIdx !== -1) {
                            if (!recordsByMonth[mIdx]) recordsByMonth[mIdx] = [];
                            recordsByMonth[mIdx].push(r);
                        }
                    });

                    onDataLoaded(recordsByMonth);
                    processedCount++;
                    continue;
                }

                // ファイル名月はすでに earlyMonthIndex で検出済み
                const detectedMonthIndex = earlyMonthIndex;
                console.log(`[FileUpload] Detected month index: ${detectedMonthIndex}`);

                // Group records by month index
                const recordsByMonth: Record<number, MonthlyRecord[]> = {};
                let hasUnassignedRecords = false;

                records.forEach(r => {
                    const mIdx = r.monthIndex !== undefined ? r.monthIndex : detectedMonthIndex;
                    if (mIdx !== -1) {
                        if (!recordsByMonth[mIdx]) recordsByMonth[mIdx] = [];
                        recordsByMonth[mIdx].push(r);
                    } else {
                        hasUnassignedRecords = true;
                    }
                });

                const monthKeys = Object.keys(recordsByMonth);
                if (monthKeys.length === 0) {
                    console.error(`[FileUpload] Failed to assign records to any month for ${file.name}`);
                    alert(`月を検出できませんでした。ファイル名に「5月」などを含めるか、手動で月を選択してください。`);
                    errorCount++;
                    continue;
                }

                // 月次モード: ファイル名で検出した特定の月だけを保存（他の月列は無視）
                // → 5月ファイルを上げても4月・6月のデータを上書きしない
                const monthsToDispatch = detectedMonthIndex !== -1
                    ? [detectedMonthIndex]          // ファイル名から月が特定できた場合はその月のみ
                    : monthKeys.map(Number);        // 特定できない場合は全月（後方互換）

                for (const mIdx of monthsToDispatch) {
                    const data = recordsByMonth[mIdx];
                    if (!data || data.length === 0) continue;
                    console.log(`[FileUpload] ${mIdx + 1}月を保存 (${data.length}件)`);
                    await onDataLoaded(mIdx, data);
                }

                processedCount++;
            } catch (error: any) {
                console.error(`[FileUpload] Error processing ${file.name}:`, error);
                alert(`Error parsing file ${file.name}: ${error.message || 'Unknown error'}`);
                errorCount++;
            }
        }

        setLoading(false);
        e.target.value = ""; // Reset input

        if (processedCount > 0) {
            // Optional: Success message
        }
    };

    return (
        <Card className="p-5 w-full space-y-4 border-none shadow-md bg-white">
            {/* ── モード切り替えタブ ── */}
            <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                    onClick={() => setIsBudgetMode(false)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                        !isBudgetMode ? 'bg-white shadow-sm text-slate-800' : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    月次実績アップロード
                </button>
                <button
                    onClick={() => setIsBudgetMode(true)}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${
                        isBudgetMode ? 'bg-amber-400 shadow-sm text-white' : 'text-slate-400 hover:text-slate-600'
                    }`}
                >
                    予算書アップロード
                </button>
            </div>

            {/* ── 月次モードの説明 ── */}
            {!isBudgetMode && (
                <div className="space-y-3">
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        月次実績ファイルをドロップしてください。<br />
                        ファイル名に「5月」などを含めると月が自動判定されます。<br />
                        <span className="font-semibold text-indigo-600">同じ月を再アップロードすると自動的に上書きされます。</span>
                    </p>
                    <div className="space-y-1">
                        <Label className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">月を手動指定（自動判定できない場合）</Label>
                        <Select onValueChange={setMonth} value={month}>
                            <SelectTrigger className="h-9 bg-slate-50 border-slate-200 text-sm">
                                <SelectValue placeholder="ファイル名から自動検出" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">ファイル名から自動検出</SelectItem>
                                {[3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map((m) => (
                                    <SelectItem key={m} value={m.toString()}>
                                        {m + 1}月
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {/* ── 予算モードの説明 ── */}
            {isBudgetMode && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                    <p className="font-bold">予算書アップロード（年1回）</p>
                    <p className="leading-relaxed">
                        全シートの12ヶ月分予算が一括で取り込まれます。<br />
                        既存の予算データは上書きされます。
                    </p>
                </div>
            )}

            {/* ── ドロップエリア ── */}
            <div className={`border-2 border-dashed rounded-lg p-5 text-center transition cursor-pointer relative flex items-center justify-center h-28 ${
                isBudgetMode ? 'border-amber-300 hover:bg-amber-50' : 'border-indigo-200 hover:bg-indigo-50'
            }`}>
                <Input
                    type="file"
                    accept=".xlsx, .xls"
                    multiple
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    disabled={loading}
                />
                {loading ? (
                    <div className="flex flex-col items-center text-slate-500">
                        <Loader2 className="h-7 w-7 animate-spin text-indigo-400 mb-2" />
                        <p className="text-xs">保存中...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-slate-400">
                        <Upload className={`h-7 w-7 mb-2 ${isBudgetMode ? 'text-amber-400' : 'text-indigo-400'}`} />
                        <p className="text-xs font-medium">
                            {isBudgetMode ? '予算書をここにドロップ' : '月次ファイルをここにドロップ'}
                        </p>
                        <p className="text-[10px] mt-1">または クリックして選択</p>
                    </div>
                )}
            </div>

            {/* ── 入力済み月の状況 ── */}
            {(loadedMonths.length > 0 || budgetOnlyMonths.length > 0) && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">入力状況</span>
                        <Button variant="ghost" size="sm" onClick={onReset}
                            className="text-[10px] text-red-400 hover:text-red-500 h-6 px-2">
                            全クリア
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {[3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map(m => {
                            const hasActual = loadedMonths.includes(m);
                            const budgetOnly = budgetOnlyMonths.includes(m);
                            return (
                                <div key={m}
                                    title={hasActual ? '実績入力済み（再アップロードで上書き可）' : budgetOnly ? '予算のみ（実績未入力）' : '未入力'}
                                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                        hasActual  ? 'bg-green-50 border-green-200 text-green-700'
                                        : budgetOnly ? 'bg-blue-50 border-blue-200 text-blue-500'
                                        : 'bg-gray-50 border-gray-100 text-gray-300'
                                    }`}
                                >
                                    {m + 1}月
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-3 text-[9px] text-gray-400">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-200 inline-block" />実績済み（上書き可）</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-200 inline-block" />予算のみ</span>
                    </div>
                </div>
            )}
        </Card>
    );
}
