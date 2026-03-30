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
    onDataLoaded: (monthUpdate: number | Record<number, MonthlyRecord[]>, data?: MonthlyRecord[]) => void;
    loadedMonths: number[];
    onReset: () => void;
}

export function FileUpload({ onDataLoaded, loadedMonths, onReset }: FileUploadProps) {
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
                console.log(`[FileUpload] Processing file: ${file.name} (BudgetMode: ${isBudgetMode})`);
                const records = await parseExcelFile(file, isBudgetMode);
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

                // 2. Try to detect month from filename for standard files
                const normalizedFileName = file.name.normalize('NFKC');
                let detectedMonthIndex = -1;
                // ... (rest of the month detection logic)

                const jpMatch = normalizedFileName.match(/(\d{1,2})月/);
                const engMatch = normalizedFileName.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i);

                if (jpMatch) {
                    const m = parseInt(jpMatch[1]);
                    if (m >= 1 && m <= 12) {
                        detectedMonthIndex = m - 1;
                    }
                } else if (engMatch) {
                    const map: Record<string, number> = {
                        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
                        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
                    };
                    detectedMonthIndex = map[engMatch[1].toLowerCase().substring(0, 3)];
                } else {
                    // Try to catch formats like "3.16" or "R8.3.16"
                    const dotMatch = normalizedFileName.match(/\.(\d{1,2})\./);
                    if (dotMatch) {
                        const m = parseInt(dotMatch[1]);
                        if (m >= 1 && m <= 12) detectedMonthIndex = m - 1;
                    }
                }

                // Fallback: manual selection
                if (detectedMonthIndex === -1 && month && month !== "auto") {
                    detectedMonthIndex = parseInt(month);
                }

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
                    alert(`Could not detect month for "${file.name}". Please rename it to include something like "4月" or select a month manually.`);
                    errorCount++;
                    continue;
                }

                // Dispatch to parent
                Object.entries(recordsByMonth).forEach(([mIdx, data]) => {
                    console.log(`[FileUpload] Dispatching ${data.length} records for month ${parseInt(mIdx) + 1}`);
                    onDataLoaded(parseInt(mIdx), data);
                });

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
        <Card className="p-6 w-full max-w-md mx-auto space-y-4">
            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-lg text-slate-800">Upload Data</h3>
                    <Button
                        variant={isBudgetMode ? "default" : "outline"}
                        onClick={() => setIsBudgetMode(!isBudgetMode)}
                        className={`text-xs h-8 px-4 font-bold transition-all ${isBudgetMode ? 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-100' : ''}`}
                    >
                        {isBudgetMode ? "★ 予算入力モード" : "予算入力モード"}
                    </Button>
                </div>

                {isBudgetMode && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 animate-in fade-in duration-300">
                        <p className="font-bold flex items-center gap-1.5 mb-1">
                            ⚠️ 予算アップロードの重要事項:
                        </p>
                        <p className="text-xs leading-relaxed">
                            ファイル名は「<b>西暦で○○○年会社名予算書</b>」にしてください。<br />
                            (例: 2026年シンコー予算書.xlsx)
                        </p>
                    </div>
                )}
            </div>

            {!isBudgetMode && (
                <div className="space-y-2">
                    <Label className="text-slate-500 text-[11px] font-bold uppercase tracking-wider">Manual Month Selection</Label>
                    <Select onValueChange={setMonth} value={month}>
                        <SelectTrigger className="w-full bg-slate-50 border-slate-200">
                            <SelectValue placeholder="Auto-detect from Filename" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="auto">Auto-detect from Filename</SelectItem>
                            {[3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map((m) => (
                                <SelectItem key={m} value={m.toString()}>
                                    <span className="font-medium mr-2">{m + 1}月</span>
                                    <span className="text-gray-400 text-xs">
                                        ({new Date(0, m).toLocaleString('en-US', { month: 'short' })})
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            )}

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition cursor-pointer relative h-32 flex items-center justify-center">
                <Input
                    type="file"
                    accept=".xlsx, .xls"
                    multiple // Enable multiple files
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={handleFileChange}
                    disabled={loading}
                />
                {loading ? (
                    <div className="flex flex-col items-center">
                        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        <p className="mt-2 text-sm text-gray-500">Processing files...</p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-gray-500">
                        <Upload className="h-8 w-8 mb-2" />
                        <p className="text-sm">
                            Drag & Drop files here (e.g. "Data_4月.xlsx")
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                            Use "4月" in filename for auto-detection
                        </p>
                    </div>
                )}
            </div>
            {loadedMonths.length > 0 && (
                <div className="pt-4 border-t border-gray-100 space-y-3">
                    <div className="flex justify-between items-center">
                        <h4 className="text-sm font-semibold text-gray-700">Loaded Data:</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onReset}
                            className="text-xs text-red-500 hover:text-red-600 h-7"
                        >
                            Clear All
                        </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2].map(m => {
                            const isLoaded = loadedMonths.includes(m);
                            return (
                                <div
                                    key={m}
                                    className={`px-2 py-1 rounded text-xs font-medium border ${isLoaded
                                        ? "bg-green-50 border-green-200 text-green-700"
                                        : "bg-gray-50 border-gray-100 text-gray-300"
                                        }`}
                                >
                                    {m + 1}月
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[10px] text-gray-400 italic">
                        Upload additional files to add more months.
                    </p>
                </div>
            )}

            <p className="text-xs text-gray-400 text-center">
                *Sheet Names = Departments.
            </p>
        </Card>
    );
}
