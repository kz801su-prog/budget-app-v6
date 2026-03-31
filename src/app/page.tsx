"use client"

import { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { FileUpload } from '@/components/file-upload';
import { VarianceTable } from '@/components/variance-table';
import { FinancialTable } from '@/components/financial-table';
import { MonthlyRecord, PnLData, StorageData, AppMode } from '@/lib/types';
import { aggregateData } from '@/lib/aggregator';
import { analyzeFinancials } from '@/lib/financial-analyzer';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, RefreshCw, LayoutDashboard, PlusCircle, Trash2, Building2, CalendarDays } from 'lucide-react';
import { Dashboard } from '@/components/dashboard';
import { AIAdvisor } from '@/components/ai-advisor';
import { History, Brain, BarChart3, Building } from 'lucide-react';
import { BSTable } from '@/components/bs-table';
import { PLSpTable } from '@/components/pl-sp-table';
import { DeptPLTable } from '@/components/dept-pl-table';
import { DeptDashboard } from '@/components/dept-dashboard';
import { DeptRatioTable } from '@/components/dept-ratio-table';
import { BackupManager } from '@/components/backup-manager';
import { cn } from '@/lib/utils';
import { exportAllData, downloadBackup } from '@/lib/storage-utils';

import { LoginSystem } from '@/components/login-system';

const STORAGE_KEY_PREFIX = 'budget_app_data_';
const METADATA_KEY = 'budget_app_metadata';

interface AppMetadata {
  savedProfiles: { company: string; year: string }[];
  lastUsedProfile?: { company: string; year: string };
}

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dataByMonth, setDataByMonth] = useState<Record<number, MonthlyRecord[]>>({});
  const [prevDataByMonth, setPrevDataByMonth] = useState<Record<number, MonthlyRecord[]>>({});
  const [selectedDept, setSelectedDept] = useState<string>("All");

  // Storage focus states
  const [companyName, setCompanyName] = useState<string>("");
  const [fiscalYear, setFiscalYear] = useState<string>(new Date().getFullYear().toString());
  const [appMode, setAppMode] = useState<AppMode>('standard');
  const [savedProfiles, setSavedProfiles] = useState<{ company: string; year: string }[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState(true);

  // Load metadata and profiles on mount
  useEffect(() => {
    console.log("🔍 [Recovery] Aggressive storage scan started...");
    const keys = Object.keys(localStorage);
    const discoveredProfiles: { company: string; year: string }[] = [];

    // 1. Scan for ANY budget data, even with old/wrong prefixes
    keys.forEach(key => {
      // Current prefix OR any key that looks like it has data
      if (key.startsWith(STORAGE_KEY_PREFIX) || key.includes('budget_app_data')) {
        try {
          const val = localStorage.getItem(key);
          if (!val) return;
          const parsed = JSON.parse(val);

          // It's a valid profile if it has company and month data
          const company = parsed.companyName || parsed.company;
          const year = parsed.fiscalYear || parsed.year;
          const mode = parsed.appMode || 'standard';

          if (company && year) {
            console.log(`✨ [Recovery] Found profile: ${company} (${year}) in ${mode} mode`);
            const alreadyInDiscovered = discoveredProfiles.some(p => p.company === company && p.year === year);
            if (!alreadyInDiscovered) {
              discoveredProfiles.push({ company, year });
            }

            // Normalize key if it was using an old prefix/name
            const correctKey = `${STORAGE_KEY_PREFIX}${company}_${year}`;
            if (key !== correctKey) {
              localStorage.setItem(correctKey, JSON.stringify({
                ...parsed,
                companyName: company,
                fiscalYear: year,
                appMode: mode
              }));
            }
          }
        } catch (e) { }
      }
    });

    // 2. Load existing metadata
    const metaStr = localStorage.getItem(METADATA_KEY);
    let meta: AppMetadata = { savedProfiles: [] };
    if (metaStr) {
      try {
        meta = JSON.parse(metaStr);
      } catch (e) {
        console.warn("⚠️ Meta corrupted, will rebuild");
      }
    }

    // 3. Merge discovered into metadata
    discoveredProfiles.forEach(p => {
      if (!meta.savedProfiles.some(mp => mp.company === p.company && mp.year === p.year)) {
        meta.savedProfiles.push(p);
      }
    });

    setSavedProfiles(meta.savedProfiles);

    // 4. Set/Restore last used profile
    let lastProfile = meta.lastUsedProfile;
    if (!lastProfile && meta.savedProfiles.length > 0) {
      lastProfile = meta.savedProfiles[0];
    }

    if (lastProfile) {
      setCompanyName(lastProfile.company);
      setFiscalYear(lastProfile.year);
      loadProfileData(lastProfile.company, lastProfile.year);

      // Persist the repaired metadata
      localStorage.setItem(METADATA_KEY, JSON.stringify({
        ...meta,
        lastUsedProfile: lastProfile
      }));
    }

    setIsLoadingStorage(false);
    console.log(`✅ [Recovery] Scan finished. Profiles found: ${meta.savedProfiles.length}`);
  }, []);

  const normalizeLegacyDeptName = (name: string): string => {
    let clean = name.normalize('NFKC').trim();
    clean = clean.replace(/[()（）]/g, '').trim();
    const match = clean.match(/^(\d+)?\s*(.*)$/);
    if (match && match[2]) {
        return match[2].trim();
    }
    return clean;
  };

  const fetchSQLOrLocal = async (comp: string, y: string): Promise<Record<number, MonthlyRecord[]>> => {
    try {
      const res = await fetch(`https://kz801xs.xsrv.jp/budget_v6/api.php?action=get_financial_data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company: comp, year: parseInt(y) })
      });
      const result = await res.json();
      
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        const newData: Record<number, MonthlyRecord[]> = {};
        result.data.forEach((row: any) => {
          const mIdx = parseInt(row.month_index);
          if (!newData[mIdx]) newData[mIdx] = [];
          
          newData[mIdx].push({
            code: row.subject_code,
            subject: row.subject_name,
            department: row.department,
            actual: parseFloat(row.actual || 0),
            budget: parseFloat(row.budget || 0),
            prevYearActual: 0,
            monthIndex: mIdx
          });
        });
        console.log(`[Data Fetch] Loaded ${y} for ${comp} from SQL.`);
        return newData;
      }
    } catch (e) {
      console.warn(`[Data Fetch] Failed to fetch SQL for ${comp} ${y}`, e);
    }
    
    // Fallback to localStorage
    const storageKey = `${STORAGE_KEY_PREFIX}${comp}_${y}`;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.dataByMonth) {
          const normalizedData: Record<number, MonthlyRecord[]> = {};
          Object.entries(parsed.dataByMonth as Record<number, MonthlyRecord[]>).forEach(([mIdx, records]) => {
             normalizedData[parseInt(mIdx)] = records.map(r => ({
               ...r,
               department: normalizeLegacyDeptName(r.department)
             }));
          });
          console.log(`[Data Fetch] Loaded ${y} for ${comp} from LocalStorage (Fallback).`);
          return normalizedData;
        }
      } catch (e) {
        console.error("Error parsing local storage fallback data", e);
      }
    }

    console.log(`[Data Fetch] No data found for ${comp} ${y}.`);
    return {};
  };

  const loadProfileData = async (company: string, year: string) => {
    if (!company || !year) return;
    setIsLoadingStorage(true);
    
    // Fetch Current Year (SQL -> LocalStorage fallback)
    const currentData = await fetchSQLOrLocal(company, year);
    setDataByMonth(currentData);

    // Fetch Previous Year (SQL -> LocalStorage fallback)
    const prevYearStr = (parseInt(year) - 1).toString();
    const prevData = await fetchSQLOrLocal(company, prevYearStr);
    setPrevDataByMonth(prevData);

    setIsLoadingStorage(false);
  };

  const saveProfileData = (company: string, year: string, data: Record<number, MonthlyRecord[]>, mode: AppMode = appMode) => {
    if (!company) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${company}_${year}`;
    const storageData: StorageData = {
      companyName: company,
      fiscalYear: year,
      dataByMonth: data,
      lastUpdated: new Date().toISOString(),
      appMode: mode
    };

    // Save data (ignore quota exceeded errors since main truth is SQL)
    try {
      localStorage.setItem(storageKey, JSON.stringify(storageData));
    } catch (e) {
      console.warn("[Storage] LocalStorage quota exceeded. Data is still safely in SQL.");
    }

    // Update metadata
    const exists = savedProfiles.some(p => p.company === company && p.year === year);
    let newProfiles = savedProfiles;
    if (!exists) {
      newProfiles = [...savedProfiles, { company, year }];
      setSavedProfiles(newProfiles);
    }

    const newMeta: AppMetadata = {
      savedProfiles: newProfiles,
      lastUsedProfile: { company, year }
    };
    localStorage.setItem(METADATA_KEY, JSON.stringify(newMeta));
  };

  const handleProfileSwitch = (profileStr: string) => {
    const [company, year] = profileStr.split('|');
    setCompanyName(company);
    setFiscalYear(year);
    loadProfileData(company, year);

    // Save last used to metadata
    const metaStr = localStorage.getItem(METADATA_KEY);
    if (metaStr) {
      const meta: AppMetadata = JSON.parse(metaStr);
      localStorage.setItem(METADATA_KEY, JSON.stringify({
        ...meta,
        lastUsedProfile: { company, year }
      }));
    }
  };

  const deleteProfile = (e: React.MouseEvent, company: string, year: string) => {
    e.stopPropagation();
    if (!confirm(`Are you sure you want to delete data for ${company} (${year})?`)) return;

    const storageKey = `${STORAGE_KEY_PREFIX}${company}_${year}`;
    localStorage.removeItem(storageKey);

    const newProfiles = savedProfiles.filter(p => !(p.company === company && p.year === year));
    setSavedProfiles(newProfiles);

    const newMeta: AppMetadata = {
      savedProfiles: newProfiles,
      lastUsedProfile: companyName === company && fiscalYear === year ? undefined : { company: companyName, year: fiscalYear }
    };
    localStorage.setItem(METADATA_KEY, JSON.stringify(newMeta));

    if (companyName === company && fiscalYear === year) {
      setDataByMonth({});
      setPrevDataByMonth({});
    }
  };

  const [masterAccounts, setMasterAccounts] = useState<Record<string, string>>({}); // code -> subject

  const handleDataLoaded = async (dataUpdate: number | Record<number, MonthlyRecord[]>, records?: MonthlyRecord[]) => {
    if (!companyName) {
      alert("Please enter a Company Name before uploading data.");
      return;
    }

    // 1. アップロードされたデータが「予算」か「実績」かを判定
    const allRecords: MonthlyRecord[] = typeof dataUpdate === 'number' ? (records || []) : Object.values(dataUpdate).flat();
    
    const hasBudget = allRecords.some(r => r.budget !== 0);
    const hasActual = allRecords.some(r => r.actual !== 0);
    const dataType = hasActual ? 'actual' : 'budget';

    // 2. SQLサーバーへ保存送信 (チャンクに分けて送信)
    const CHUNK_SIZE = 1000;
    const recordsToSave = allRecords.map(r => ({
      month: r.monthIndex,
      department: r.department,
      code: r.code,
      subject: r.subject,
      value: dataType === 'actual' ? r.actual : r.budget
    }));

    try {
      // 過去に BudgetMode: false で誤って「予算」を「実績」としてアップロードしてしまった場合、
      // SQLの actual カラムに予算の数字が入ったまま残ってしまいます。
      // これを打ち消すため、予算アップロード時は、対象の actual を一律 0 で上書きクリアします。
      if (dataType === 'budget') {
        console.log(`[SQL Save] Pre-clearing false actuals for budget mode...`);
        const clearRecords = recordsToSave.map(r => ({ ...r, value: 0 }));
        for (let i = 0; i < clearRecords.length; i += CHUNK_SIZE) {
          await fetch(`https://kz801xs.xsrv.jp/budget_v6/api.php?action=save_financial_data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              company: companyName,
              year: parseInt(fiscalYear),
              dataType: 'actual', // Target the actual column to clear it
              records: clearRecords.slice(i, i + CHUNK_SIZE)
            })
          });
        }
      }

      console.log(`[SQL Save] Starting save for ${recordsToSave.length} records in chunks of ${CHUNK_SIZE}...`);
      
      for (let i = 0; i < recordsToSave.length; i += CHUNK_SIZE) {
        const chunk = recordsToSave.slice(i, i + CHUNK_SIZE);
        
        const res = await fetch(`https://kz801xs.xsrv.jp/budget_v6/api.php?action=save_financial_data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company: companyName,
            year: parseInt(fiscalYear),
            dataType: dataType,
            records: chunk
          })
        });
        
        const result = await res.json();
        if (!result.success) {
          throw new Error(result.message || "Unknown error during chunk save");
        }
        
        console.log(`[SQL Save] Progress: ${Math.min(i + CHUNK_SIZE, recordsToSave.length)} / ${recordsToSave.length}`);
      }
      
      console.log(`✅ ${dataType} data saved to SQL successfully (${recordsToSave.length} total records).`);
      
      // Update LocalStorage as a backup/cache (so user doesn't panic if SQL isn't completely setup)
      const currentData = await fetchSQLOrLocal(companyName, fiscalYear);
      saveProfileData(companyName, fiscalYear, currentData, appMode);
      
      // 再読み込みして表示を更新
      loadProfileData(companyName, fiscalYear);
      
    } catch (e: any) {
      console.error("Failed to save data to SQL:", e);
      alert("データ保存に失敗しました: " + e.message);
    }
  };

  const aggregatedData: PnLData = useMemo(() => {
    return aggregateData(dataByMonth, appMode, prevDataByMonth, masterAccounts);
  }, [dataByMonth, appMode, prevDataByMonth, masterAccounts]);


  const financialReport = useMemo(() => {
    // Filter rows based on selected department
    // IMPORTANT: Always include BS rows (貸借対照表) for ratio calculations
    // Only filter P/L rows by department
    const relevantRows = selectedDept === "All"
      ? aggregatedData.rows
      : aggregatedData.rows.filter(r =>
        r.department.includes('貸借対照表') || // Always include BS
        r.department === selectedDept || // Filter P/L by department
        (appMode === 'manufacturing' && r.department.includes('製造原価報告書')) // Include Mfg in Mfg mode
      );

    return analyzeFinancials({
      ...aggregatedData,
      rows: relevantRows
    });
  }, [aggregatedData, selectedDept]);

  const hasData = aggregatedData.rows.length > 0;
  const departments = ["All", ...aggregatedData.departments];

  const handleExport = () => {
    // ... (rest of export logic, keeping as is)
    const wb = XLSX.utils.book_new();
    const allPnlRows: any[] = [];
    const allRatioRows: any[] = [];
    const allCommentRows: any[] = [];
    const deptsToExport = ["All", ...aggregatedData.departments];
    const monthNamesShort = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const monthIndices = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2];

    deptsToExport.forEach((dept, deptIdx) => {
      const relevantRows = dept === "All"
        ? aggregatedData.rows
        : aggregatedData.rows.filter(r => r.department === dept);

      const deptData: PnLData = {
        departments: aggregatedData.departments,
        rows: relevantRows,
        totals: aggregatedData.totals
      };
      const deptReport = analyzeFinancials(deptData);

      allPnlRows.push({ Department: `--- ${dept} ---`, Code: "---", Subject: "---" });
      relevantRows.forEach(r => {
        const row: any = {
          Department: r.department,
          Code: r.code,
          Subject: r.subject,
          "1st Half Actual": r.totalFirstHalf.actual,
          "2nd Half Actual": r.totalSecondHalf.actual,
          "Total Actual": r.totalAnnual.actual,
          "Total Budget": r.totalAnnual.budget,
          "Variance": r.variance,
        };
        monthIndices.forEach((m, i) => {
          const mName = monthNamesShort[i];
          row[`${mName} Actual`] = r.monthlyData[m]?.actual || 0;
          row[`${mName} Budget`] = r.monthlyData[m]?.budget || 0;
        });
        allPnlRows.push(row);
      });
      allPnlRows.push({});

      if (dept === "All") {
        allRatioRows.push({ "Metric (Eng)": `--- ${dept} ---` });
        deptReport.metrics.forEach(def => {
          const row: any = { "Metric (Eng)": def.labelEng, "Metric (JP)": def.labelJp, "Meaning": def.meaning };
          monthIndices.forEach((m, i) => {
            const mName = monthNamesShort[i];
            const value = deptReport.values[def.id]?.[m] ?? 0;
            row[mName] = parseFloat(value.toFixed(1));
          });
          row["1st Half"] = parseFloat((deptReport.values[def.id]?.['1H'] ?? 0).toFixed(1));
          row["2nd Half"] = parseFloat((deptReport.values[def.id]?.['2H'] ?? 0).toFixed(1));
          row["Total Year"] = parseFloat((deptReport.values[def.id]?.['FY'] ?? 0).toFixed(1));
          allRatioRows.push(row);
        });
        allRatioRows.push({});
      }

      allCommentRows.push({ Month: `--- ${dept} ---` });
      monthIndices.forEach((m, i) => {
        const mName = monthNamesShort[i];
        const msgs = deptReport.comments[m];
        if (msgs && msgs.length > 0) {
          msgs.forEach(msg => { allCommentRows.push({ Month: mName, Alert: msg }); });
        }
      });
      allCommentRows.push({});
    });

    const wsPnL = XLSX.utils.json_to_sheet(allPnlRows);
    XLSX.utils.book_append_sheet(wb, wsPnL, "Budget Analysis");
    const wsFin = XLSX.utils.json_to_sheet(allRatioRows);
    XLSX.utils.book_append_sheet(wb, wsFin, "Financial Ratios");
    const wsDashboard = XLSX.utils.json_to_sheet([
      { Category: "KPI - 本年度累計", Metric: "売上高", Value: (financialReport.values['sales']?.['FY'] || 0).toLocaleString() },
      { Category: "KPI - 本年度累計", Metric: "営業利益", Value: (financialReport.values['operating_profit']?.['FY'] || 0).toLocaleString() },
    ]);
    XLSX.utils.book_append_sheet(wb, wsDashboard, "Dashboard Summary");
    XLSX.writeFile(wb, `${companyName}_${fiscalYear}_Budget_Report.xlsx`);
  };

  const [isTableThousands, setIsTableThousands] = useState(false);

  // Auth Guard
  if (!currentUser) {
    return <LoginSystem onLoginSuccess={setCurrentUser} />;
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <header className="flex justify-between items-start">
          <div className="flex gap-4 items-center">
            <div className="p-3 bg-indigo-600 rounded-2xl shadow-lg shadow-indigo-100">
              <LayoutDashboard className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Budget Performance Manager V6</h1>
              <div className="flex items-center gap-2 text-slate-500 mt-1">
                {companyName ? (
                  <span className="flex items-center gap-1.5 font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    <Building2 className="h-3.5 w-3.5" /> {companyName}
                  </span>
                ) : (
                  <span className="italic">Advanced Edition: Cumulative Intelligence & Advisory</span>
                )}
                {companyName && (
                  <span className="flex items-center gap-1.5 font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    <CalendarDays className="h-3.5 w-3.5" /> FY{fiscalYear}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {hasData && (
              <>
                <div className="flex bg-slate-200 p-1 rounded-lg mr-2">
                  <Button
                    variant={isTableThousands ? "ghost" : "secondary"}
                    className={`h-8 px-3 text-xs ${!isTableThousands ? "bg-white shadow-sm" : ""}`}
                    onClick={() => setIsTableThousands(false)}
                  >
                    円表示
                  </Button>
                  <Button
                    variant={!isTableThousands ? "ghost" : "secondary"}
                    className={`h-8 px-3 text-xs ${isTableThousands ? "bg-white shadow-sm" : ""}`}
                    onClick={() => setIsTableThousands(true)}
                  >
                    千円単位
                  </Button>
                </div>
                <Button variant="outline" onClick={() => { if (confirm("Clear current visible data?")) setDataByMonth({}); }} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Reset View
                </Button>
                <Button onClick={handleExport} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  <Download className="h-4 w-4" /> Export Report
                </Button>
              </>
            )}
          </div>
        </header>

        <section className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-1 space-y-6">
            <Card className="p-5 border-none shadow-md space-y-6 bg-white">
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 border-b pb-2">
                  <PlusCircle className="h-4 w-4 text-indigo-500" /> 基準年度・企業の設定
                </h3>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">表示企業 (Company)</label>
                    <Select value={companyName} onValueChange={(val) => {
                      if (val === "NEW") {
                        const name = prompt("Enter new company name:");
                        if (name) {
                          setCompanyName(name);
                          loadProfileData(name, fiscalYear);
                        }
                      } else {
                        setCompanyName(val);
                        loadProfileData(val, fiscalYear);
                      }
                    }}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select Company" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(new Set(savedProfiles.map(p => p.company))).map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                        <SelectItem value="NEW" className="text-indigo-600 font-medium">
                          + New Company...
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">表示年度 (Fiscal Year)</label>
                    <Select value={fiscalYear} onValueChange={(val) => {
                      setFiscalYear(val);
                      loadProfileData(companyName, val);
                    }}>
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="Select Term / Year" />
                      </SelectTrigger>
                      <SelectContent>
                        {[2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030].map(y => (
                          <SelectItem key={y} value={y.toString()}>第{y - 1977}期 (FY{y})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">分析モード (Analysis Mode)</label>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <Button
                    variant={appMode === 'standard' ? 'secondary' : 'ghost'}
                    className={`flex-1 h-8 text-[11px] font-bold ${appMode === 'standard' ? 'bg-white shadow-sm' : ''}`}
                    onClick={() => { setAppMode('standard'); saveProfileData(companyName, fiscalYear, dataByMonth, 'standard'); }}
                  >
                    通常
                  </Button>
                  <Button
                    variant={appMode === 'manufacturing' ? 'secondary' : 'ghost'}
                    className={`flex-1 h-8 text-[11px] font-bold ${appMode === 'manufacturing' ? 'bg-white shadow-sm' : ''}`}
                    onClick={() => { setAppMode('manufacturing'); saveProfileData(companyName, fiscalYear, dataByMonth, 'manufacturing'); }}
                  >
                    製造業
                  </Button>
                </div>
              </div>

              {savedProfiles.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2 underline decoration-indigo-200 underline-offset-4">保存済みデータ管理</label>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {savedProfiles.map(p => (
                      <div 
                        key={`${p.company}|${p.year}`} 
                        onClick={() => handleProfileSwitch(`${p.company}|${p.year}`)}
                        className={cn(
                          "flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors group",
                          companyName === p.company && fiscalYear === p.year 
                            ? "bg-indigo-50 border border-indigo-100 text-indigo-700" 
                            : "hover:bg-slate-50 text-slate-600"
                        )}
                      >
                        <span className="font-medium">{p.company} ({p.year})</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-rose-500"
                          onClick={(e) => deleteProfile(e, p.company, p.year)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <FileUpload
              onDataLoaded={handleDataLoaded}
              loadedMonths={Object.keys(dataByMonth).map(Number)}
              onReset={() => { if (confirm("Clear data for this profile?")) { setDataByMonth({}); saveProfileData(companyName, fiscalYear, {}); } }}
            />

            <BackupManager
              savedProfiles={savedProfiles}
              onDataImported={() => {
                // Reload metadata and profiles
                const metaStr = localStorage.getItem(METADATA_KEY);
                if (metaStr) {
                  const meta: AppMetadata = JSON.parse(metaStr);
                  setSavedProfiles(meta.savedProfiles);
                  if (meta.lastUsedProfile) {
                    setCompanyName(meta.lastUsedProfile.company);
                    setFiscalYear(meta.lastUsedProfile.year);
                    loadProfileData(meta.lastUsedProfile.company, meta.lastUsedProfile.year);
                  }
                }
              }}
            />

            {hasData && (
              <Card className="p-4 border-none shadow-md">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Department Filter</label>
                  <Select value={selectedDept} onValueChange={setSelectedDept}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            )}
          </div>

          <div className="lg:col-span-4">
            {hasData ? (
              <Tabs
                defaultValue="dashboard"
                className="w-full"
                onValueChange={(value) => {
                  // Reset to "All" when switching to Dashboard tab
                  if (value === "dashboard") {
                    setSelectedDept("All");
                  }
                }}
              >
                <TabsList className="grid w-full grid-cols-7">
                  <TabsTrigger value="dashboard" className="flex gap-2">
                    <LayoutDashboard className="h-4 w-4" /> Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="pl-matrix" className="flex gap-2">
                    <BarChart3 className="h-4 w-4" /> P/L
                  </TabsTrigger>
                  <TabsTrigger value="bs-data" className="flex gap-2">
                    <History className="h-4 w-4" /> BS
                  </TabsTrigger>
                  <TabsTrigger value="bs-sp" className="flex gap-2">
                    <History className="h-4 w-4" /> BS SP
                  </TabsTrigger>
                  <TabsTrigger value="pl-sp" className="flex gap-2">
                    <BarChart3 className="h-4 w-4" /> P/L SP
                  </TabsTrigger>
                  <TabsTrigger value="bs-ratios" className="flex gap-2">
                    <History className="h-4 w-4" /> Ratio
                  </TabsTrigger>
                  {appMode === 'manufacturing' && (
                    <TabsTrigger value="mfg-report" className="flex gap-2">
                      <Building2 className="h-4 w-4" /> 製造原価
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="dept-pl" className="flex gap-2">
                    <Building className="h-4 w-4" /> 各部P/L
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="dashboard" className="mt-4">
                  <Dashboard report={financialReport} data={aggregatedData} />
                </TabsContent>

                <TabsContent value="pl-matrix" className="mt-4">
                  <VarianceTable
                    data={aggregatedData}
                    selectedDepartment={selectedDept === "All" ? null : selectedDept}
                    isThousands={isTableThousands}
                    sheetFilter={['損益計算書', '販売費及び一般管理費']}
                  />
                </TabsContent>

                <TabsContent value="mfg-report" className="mt-4 text-slate-900">
                  <VarianceTable
                    data={aggregatedData}
                    selectedDepartment={null}
                    isThousands={isTableThousands}
                    sheetFilter={['製造原価報告書']}
                  />
                </TabsContent>

                <TabsContent value="bs-data" className="mt-4">
                  <BSTable data={aggregatedData} isThousands={isTableThousands} />
                </TabsContent>

                <TabsContent value="bs-sp" className="mt-4">
                  <BSTable data={aggregatedData} isThousands={isTableThousands} dataType="prevYear" />
                </TabsContent>

                <TabsContent value="pl-sp" className="mt-4">
                  <PLSpTable data={aggregatedData} isThousands={isTableThousands} fiscalYear={fiscalYear} />
                </TabsContent>

                <TabsContent value="bs-ratios" className="mt-4">
                  <FinancialTable report={financialReport} isThousands={isTableThousands} metricType="bs" />
                </TabsContent>

                <TabsContent value="dept-pl" className="mt-4">
                  {/* Second-tier tabs for Department Analysis */}
                  <Tabs defaultValue="dept-dashboard" className="w-full">
                    <TabsList className="grid w-full grid-cols-5">
                      <TabsTrigger value="dept-dashboard" className="flex gap-2">
                        <LayoutDashboard className="h-4 w-4" /> Dashboard 各部
                      </TabsTrigger>
                      <TabsTrigger value="dept-pl-main" className="flex gap-2">
                        <BarChart3 className="h-4 w-4" /> 各部P/L
                      </TabsTrigger>
                      <TabsTrigger value="dept-ratio" className="flex gap-2">
                        <History className="h-4 w-4" /> 各部Ratio
                      </TabsTrigger>
                      <TabsTrigger value="dept-budget" className="flex gap-2">
                        <Building2 className="h-4 w-4" /> 各部予算
                      </TabsTrigger>
                      <TabsTrigger value="dept-lastyear" className="flex gap-2">
                        <CalendarDays className="h-4 w-4" /> 各部昨年
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="dept-dashboard" className="mt-4">
                      <DeptDashboard
                        data={aggregatedData}
                        selectedDepartment={selectedDept}
                        companyName={companyName}
                        fiscalYear={fiscalYear}
                        onDepartmentChange={setSelectedDept}
                      />
                    </TabsContent>

                    <TabsContent value="dept-pl-main" className="mt-4">
                      <DeptPLTable
                        data={aggregatedData}
                        isThousands={isTableThousands}
                        selectedDepartment={selectedDept === "All" ? null : selectedDept}
                        allDepartments={departments}
                        onDepartmentChange={setSelectedDept}
                        onToggleThousands={() => setIsTableThousands(!isTableThousands)}
                      />
                    </TabsContent>

                    <TabsContent value="dept-ratio" className="mt-4">
                      <DeptRatioTable
                        data={aggregatedData}
                        selectedDepartment={selectedDept}
                        companyName={companyName}
                        fiscalYear={fiscalYear}
                      />
                    </TabsContent>

                    <TabsContent value="dept-budget" className="mt-4">
                      <DeptPLTable
                        data={aggregatedData}
                        isThousands={isTableThousands}
                        dataType="budget"
                        selectedDepartment={selectedDept === "All" ? null : selectedDept}
                        allDepartments={departments}
                        onDepartmentChange={setSelectedDept}
                        onToggleThousands={() => setIsTableThousands(!isTableThousands)}
                      />
                    </TabsContent>

                    <TabsContent value="dept-lastyear" className="mt-4">
                      <DeptPLTable
                        data={aggregatedData}
                        isThousands={isTableThousands}
                        dataType="prevYear"
                        selectedDepartment={selectedDept === "All" ? null : selectedDept}
                        allDepartments={departments}
                        onDepartmentChange={setSelectedDept}
                        onToggleThousands={() => setIsTableThousands(!isTableThousands)}
                      />
                    </TabsContent>
                  </Tabs>
                </TabsContent>

                {/* Keep AI Advisor hidden for now */}
                <TabsContent value="ai" className="mt-4 hidden">
                  <AIAdvisor
                    data={aggregatedData}
                    report={financialReport}
                    selectedDept={selectedDept}
                  />
                </TabsContent>
              </Tabs>
            ) : (
              <Card className="h-96 flex items-center justify-center border-dashed">
                <div className="text-center text-gray-400">
                  <p className="text-xl font-medium">No Data Available</p>
                  <p>Upload files (Apr, May...) to generate P&L and Financial Analysis.</p>
                </div>
              </Card>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
