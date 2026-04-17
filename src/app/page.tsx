"use client"

import { useState, useMemo, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { FileUpload } from '@/components/file-upload';
import { VarianceTable } from '@/components/variance-table';
import { FinancialTable } from '@/components/financial-table';
import { MonthlyRecord, PnLData, AppMode } from '@/lib/types';
import { aggregateData } from '@/lib/aggregator';
import { analyzeFinancials } from '@/lib/financial-analyzer';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Download, RefreshCw, LayoutDashboard, PlusCircle, Trash2, Building2, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { API_BASE, callApi } from '@/lib/api';
import { LoginSystem } from '@/components/login-system';

export default function Home() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [dataByMonth, setDataByMonth] = useState<Record<number, MonthlyRecord[]>>({});
  const [prevDataByMonth, setPrevDataByMonth] = useState<Record<number, MonthlyRecord[]>>({});
  const [selectedDept, setSelectedDept] = useState<string>("All");

  const [companyName, setCompanyName] = useState<string>("");
  const [fiscalYear, setFiscalYear] = useState<string>(new Date().getFullYear().toString());
  const [appMode, setAppMode] = useState<AppMode>('standard');
  const [savedProfiles, setSavedProfiles] = useState<{ company: string; year: string; mode?: AppMode }[]>([]);
  const [isLoadingStorage, setIsLoadingStorage] = useState(true);
  const [masterAccounts, setMasterAccounts] = useState<Record<string, string>>({});
  const [isTableThousands, setIsTableThousands] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── プロフィール一覧を SQL から取得 ──────────────────────────
  const loadProfiles = useCallback(async () => {
    try {
      const res = await callApi('get_profiles');
      if (res.success && Array.isArray(res.profiles)) {
        const profiles = res.profiles.map((p: any) => ({
          company: p.company_name,
          year:    String(p.fiscal_year),
          mode:    (p.app_mode ?? 'standard') as AppMode,
        }));
        setSavedProfiles(profiles);
        return profiles;
      }
    } catch (e) {
      console.warn('[Profiles] SQL fetch failed', e);
    }
    return [];
  }, []);

  // ── 初回マウント時にプロフィールを読み込み ───────────────────
  useEffect(() => {
    (async () => {
      const profiles = await loadProfiles();
      if (profiles.length > 0) {
        const first = profiles[0];
        setCompanyName(first.company);
        setFiscalYear(first.year);
        setAppMode(first.mode ?? 'standard');
        await loadProfileData(first.company, first.year);
      }
      setIsLoadingStorage(false);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── ログイン後にデータを再ロード（SQLから確実に取得） ──────────
  useEffect(() => {
    if (currentUser && companyName && fiscalYear) {
      loadProfileData(companyName, fiscalYear);
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 財務データをSQLまたはlocalStorage(フォールバック)から取得 ─
  const normalizeLegacyDeptName = (name: string): string => {
    let clean = name.normalize('NFKC').trim();
    clean = clean.replace(/[()（）]/g, '').trim();
    const match = clean.match(/^(\d+)?\s*(.*)$/);
    if (match && match[2]) return match[2].trim();
    return clean;
  };

  const fetchFromSQL = async (comp: string, y: string): Promise<Record<number, MonthlyRecord[]>> => {
    try {
      const result = await callApi('get_financial_data', { company: comp, year: parseInt(y) });
      if (result.success && Array.isArray(result.data) && result.data.length > 0) {
        const newData: Record<number, MonthlyRecord[]> = {};
        result.data.forEach((row: any) => {
          const mIdx = parseInt(row.month_index);
          if (!newData[mIdx]) newData[mIdx] = [];
          newData[mIdx].push({
            code:           row.subject_code,
            subject:        row.subject_name,
            department:     row.department,
            actual:         parseFloat(row.actual          || 0),
            budget:         parseFloat(row.budget          || 0),
            prevYearActual: parseFloat(row.prev_year_actual || 0),
            monthIndex:     mIdx,
          });
        });
        // actual も budget も全て 0 の月はアップロード済みとみなさない
        // (予算 pre-clear の副産物などを除外)
        Object.keys(newData).forEach(mStr => {
          const m = parseInt(mStr);
          const hasValue = newData[m].some(r => r.actual !== 0 || r.budget !== 0 || (r.prevYearActual ?? 0) !== 0);
          if (!hasValue) delete newData[m];
        });
        console.log(`[Data Fetch] SQL → ${comp} FY${y}, 有効月: ${Object.keys(newData).join(',')}`);
        return newData;
      }
    } catch (e) {
      console.warn(`[Data Fetch] SQL failed for ${comp} ${y}`, e);
    }

    // localStorage フォールバック
    const STORAGE_KEY_PREFIX = 'budget_app_data_';
    const raw = typeof window !== 'undefined' ? localStorage.getItem(`${STORAGE_KEY_PREFIX}${comp}_${y}`) : null;
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.dataByMonth) {
          const normalized: Record<number, MonthlyRecord[]> = {};
          Object.entries(parsed.dataByMonth as Record<number, MonthlyRecord[]>).forEach(([mIdx, records]) => {
            normalized[parseInt(mIdx)] = records.map(r => ({
              ...r, department: normalizeLegacyDeptName(r.department),
            }));
          });
          console.log(`[Data Fetch] localStorage fallback → ${comp} FY${y}`);
          return normalized;
        }
      } catch (e) { /* ignore */ }
    }
    return {};
  };

  const loadProfileData = async (company: string, year: string) => {
    if (!company || !year) return;
    setIsLoadingStorage(true);
    const currentData = await fetchFromSQL(company, year);
    setDataByMonth(currentData);
    const prevData = await fetchFromSQL(company, (parseInt(year) - 1).toString());
    setPrevDataByMonth(prevData);
    setIsLoadingStorage(false);
  };

  // ── プロフィール切り替え ────────────────────────────────────
  const handleProfileSwitch = async (profileStr: string) => {
    const [company, year] = profileStr.split('|');
    const profile = savedProfiles.find(p => p.company === company && p.year === year);
    setCompanyName(company);
    setFiscalYear(year);
    setAppMode(profile?.mode ?? 'standard');
    // 最後にアクセスしたことを記録
    await callApi('save_profile', { company, year: parseInt(year), app_mode: profile?.mode ?? 'standard' });
    await loadProfileData(company, year);
  };

  // ── プロフィール削除 ────────────────────────────────────────
  const deleteProfile = async (e: React.MouseEvent, company: string, year: string) => {
    e.stopPropagation();
    if (!confirm(`${company} (${year}) のデータを全て削除しますか？`)) return;
    await callApi('delete_profile', { company, year: parseInt(year) });
    const newProfiles = savedProfiles.filter(p => !(p.company === company && p.year === year));
    setSavedProfiles(newProfiles);
    if (companyName === company && fiscalYear === year) {
      setDataByMonth({});
      setPrevDataByMonth({});
    }
  };

  // ── appMode 変更 ────────────────────────────────────────────
  const handleModeChange = async (mode: AppMode) => {
    setAppMode(mode);
    if (companyName && fiscalYear) {
      await callApi('save_profile', { company: companyName, year: parseInt(fiscalYear), app_mode: mode });
      setSavedProfiles(prev => prev.map(p =>
        p.company === companyName && p.year === fiscalYear ? { ...p, mode } : p,
      ));
    }
  };

  // ── データアップロード後の保存 ─────────────────────────────
  const handleDataLoaded = async (
    dataUpdate: number | Record<number, MonthlyRecord[]>,
    records?: MonthlyRecord[],
  ) => {
    if (!companyName) { alert("先に企業名を設定してください。"); return; }

    const allRecords: MonthlyRecord[] = typeof dataUpdate === 'number'
      ? (records || [])
      : Object.values(dataUpdate).flat();

    // ── 3種類のデータに分離 ────────────────────────────────────
    const actualRecs   = allRecords.filter(r => r.actual !== 0);
    const budgetRecs   = allRecords.filter(r => r.budget !== 0);
    const prevYearRecs = allRecords.filter(r => (r.prevYearActual ?? 0) !== 0);

    const activeActualMonths   = new Set(actualRecs.map(r => r.monthIndex ?? 0));
    const activeBudgetMonths   = new Set(budgetRecs.map(r => r.monthIndex ?? 0));
    const activePrevYearMonths = new Set(prevYearRecs.map(r => r.monthIndex ?? 0));

    if (activeActualMonths.size === 0 && activeBudgetMonths.size === 0 && activePrevYearMonths.size === 0) {
      alert("アップロードファイルに有効なデータが見つかりません。");
      return;
    }

    console.log(`[Upload] actual月: ${[...activeActualMonths].sort((a,b)=>a-b).map(m=>m+1).join(',')}  budget月: ${[...activeBudgetMonths].sort((a,b)=>a-b).map(m=>m+1).join(',')}  前年月: ${[...activePrevYearMonths].sort((a,b)=>a-b).map(m=>m+1).join(',')}`);

    const CHUNK_SIZE = 1000;

    // デッドロック対応: リトライ付きチャンク保存
    const saveChunkWithRetry = async (params: Record<string, unknown>, maxRetries = 4) => {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const res = await callApi('save_financial_data', params);
        if (res.success) return res;
        const isDeadlock = res.message?.includes('1213') || res.message?.includes('Deadlock');
        if (isDeadlock && attempt < maxRetries - 1) {
          const wait = 600 * (attempt + 1);
          console.warn(`[Deadlock] リトライ ${attempt + 1}/${maxRetries - 1} (${wait}ms 待機)`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        throw new Error(res.message || 'チャンク保存エラー');
      }
    };

    const toApiRecords = (recs: MonthlyRecord[], getValue: (r: MonthlyRecord) => number) =>
      recs.map(r => ({ month: r.monthIndex, department: r.department, code: r.code, subject: r.subject, value: getValue(r) }));

    const saveInChunks = async (apiRecs: ReturnType<typeof toApiRecords>, dataType: string) => {
      for (let i = 0; i < apiRecs.length; i += CHUNK_SIZE) {
        await saveChunkWithRetry({ company: companyName, year: parseInt(fiscalYear), dataType, records: apiRecs.slice(i, i + CHUNK_SIZE) });
      }
      console.log(`✅ ${dataType} saved (${apiRecs.length} records)`);
    };

    try {
      // 1. 実績を保存（既存の同月データを先にクリア）
      if (activeActualMonths.size > 0) {
        for (const m of Array.from(activeActualMonths)) {
          const existing = dataByMonth[m] || [];
          if (existing.length > 0) {
            const clears = existing.map(r => ({ month: m, department: r.department, code: r.code, subject: r.subject, value: 0 }));
            await saveInChunks(clears, 'actual');
          }
        }
        await saveInChunks(toApiRecords(actualRecs, r => r.actual), 'actual');
      }

      // 2. 予算を保存（対象月の actual を先にクリア）
      if (activeBudgetMonths.size > 0) {
        const clearActuals = toApiRecords(
          allRecords.filter(r => activeBudgetMonths.has(r.monthIndex ?? 0)),
          () => 0
        );
        await saveInChunks(clearActuals, 'actual');
        await saveInChunks(toApiRecords(budgetRecs, r => r.budget), 'budget');
      }

      // 3. 前年実績を保存
      const deptSummary = prevYearRecs.reduce((acc, r) => {
        acc[r.department] = (acc[r.department] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      console.log(`[Upload] prevYearRecs: ${prevYearRecs.length}件`, deptSummary);
      if (prevYearRecs.length > 0) {
        console.log('[Upload] prevYearRecs sample:', prevYearRecs.slice(0, 3).map(r => ({ dept: r.department, code: r.code, subject: r.subject, prevYearActual: r.prevYearActual, monthIndex: r.monthIndex })));
      }
      if (activePrevYearMonths.size > 0) {
        await saveInChunks(toApiRecords(prevYearRecs, r => r.prevYearActual ?? 0), 'prev_year_actual');
      }

      await loadProfiles();
      await loadProfileData(companyName, fiscalYear);
    } catch (e: any) {
      console.error("Save failed:", e);
      alert("データ保存に失敗しました: " + e.message);
    }
  };

  // ── セル値の直接編集 ──────────────────────────────────────
  const handleCellEdit = useCallback(async (
    dept: string, code: string, subject: string,
    month: number, field: 'actual' | 'budget', rawValue: number,
  ) => {
    try {
      const res = await callApi('save_financial_data', {
        company:  companyName,
        year:     parseInt(fiscalYear),
        dataType: field,
        records:  [{ month, department: dept, code, subject, value: rawValue }],
      });
      if (!res.success) throw new Error(res.message);
      // 画面を再読み込み
      const updated = await fetchFromSQL(companyName, fiscalYear);
      setDataByMonth(updated);
    } catch (e: any) {
      alert('保存失敗: ' + e.message);
    }
  }, [companyName, fiscalYear]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 集計 ──────────────────────────────────────────────────
  const aggregatedData: PnLData = useMemo(() => {
    return aggregateData(dataByMonth, appMode, prevDataByMonth, masterAccounts);
  }, [dataByMonth, appMode, prevDataByMonth, masterAccounts]);

  const financialReport = useMemo(() => {
    const relevantRows = selectedDept === "All"
      ? aggregatedData.rows
      : aggregatedData.rows.filter(r =>
          r.department.includes('貸借対照表') ||
          r.department === selectedDept ||
          (appMode === 'manufacturing' && r.department.includes('製造原価報告書'))
        );
    return analyzeFinancials({ ...aggregatedData, rows: relevantRows });
  }, [aggregatedData, selectedDept, appMode]);

  const hasData    = aggregatedData.rows.length > 0;
  const departments = ["All", ...aggregatedData.departments];

  // 実績入力済み月（actual≠0）と予算のみ月（budget≠0 かつ actual=0）を分離
  const actualLoadedMonths = useMemo(() =>
    Object.keys(dataByMonth).filter(m =>
      dataByMonth[parseInt(m)]?.some(r => r.actual !== 0)
    ).map(Number), [dataByMonth]);

  const budgetOnlyMonths = useMemo(() =>
    Object.keys(dataByMonth).filter(m =>
      !dataByMonth[parseInt(m)]?.some(r => r.actual !== 0) &&
      dataByMonth[parseInt(m)]?.some(r => r.budget !== 0)
    ).map(Number), [dataByMonth]);

  // ── Excel エクスポート ────────────────────────────────────
  const handleExport = () => {
    const wb = XLSX.utils.book_new();
    const allPnlRows: any[] = [];
    const allRatioRows: any[] = [];
    const allCommentRows: any[] = [];
    const deptsToExport = ["All", ...aggregatedData.departments];
    const monthNamesShort = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan","Feb","Mar"];
    const monthIndices    = [3,4,5,6,7,8,9,10,11,0,1,2];

    deptsToExport.forEach(dept => {
      const relevantRows = dept === "All"
        ? aggregatedData.rows
        : aggregatedData.rows.filter(r => r.department === dept);
      const deptData = { ...aggregatedData, rows: relevantRows };
      const deptReport = analyzeFinancials(deptData);

      allPnlRows.push({ Department: `--- ${dept} ---`, Code: "---", Subject: "---" });
      relevantRows.forEach(r => {
        const row: any = {
          Department: r.department, Code: r.code, Subject: r.subject,
          "1st Half Actual": r.totalFirstHalf.actual,
          "2nd Half Actual": r.totalSecondHalf.actual,
          "Total Actual":    r.totalAnnual.actual,
          "Total Budget":    r.totalAnnual.budget,
          "Variance":        r.variance,
        };
        monthIndices.forEach((m, i) => {
          row[`${monthNamesShort[i]} Actual`] = r.monthlyData[m]?.actual || 0;
          row[`${monthNamesShort[i]} Budget`] = r.monthlyData[m]?.budget || 0;
        });
        allPnlRows.push(row);
      });
      allPnlRows.push({});

      if (dept === "All") {
        deptReport.metrics.forEach(def => {
          const row: any = { "Metric (Eng)": def.labelEng, "Metric (JP)": def.labelJp };
          monthIndices.forEach((m, i) => {
            row[monthNamesShort[i]] = parseFloat((deptReport.values[def.id]?.[m] ?? 0).toFixed(1));
          });
          row["1st Half"] = parseFloat((deptReport.values[def.id]?.['1H'] ?? 0).toFixed(1));
          row["2nd Half"] = parseFloat((deptReport.values[def.id]?.['2H'] ?? 0).toFixed(1));
          row["Total Year"] = parseFloat((deptReport.values[def.id]?.['FY'] ?? 0).toFixed(1));
          allRatioRows.push(row);
        });
      }
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allPnlRows), "Budget Analysis");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allRatioRows), "Financial Ratios");
    XLSX.writeFile(wb, `${companyName}_${fiscalYear}_Budget_Report.xlsx`);
  };

  // ── Auth ──────────────────────────────────────────────────
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
                  >円表示</Button>
                  <Button
                    variant={!isTableThousands ? "ghost" : "secondary"}
                    className={`h-8 px-3 text-xs ${isTableThousands ? "bg-white shadow-sm" : ""}`}
                    onClick={() => setIsTableThousands(true)}
                  >千円単位</Button>
                </div>
                <Button variant="outline" onClick={() => { if (confirm("表示データをリセットしますか？")) setDataByMonth({}); }} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Reset View
                </Button>
                <Button onClick={handleExport} className="gap-2 bg-indigo-600 hover:bg-indigo-700">
                  <Download className="h-4 w-4" /> Export Report
                </Button>
              </>
            )}
          </div>
        </header>

        <section className={cn("grid grid-cols-1 gap-8", sidebarCollapsed ? "lg:grid-cols-1" : "lg:grid-cols-5")}>
          <div className={cn("space-y-6", sidebarCollapsed && "hidden")}>
            <Card className="p-5 border-none shadow-md space-y-6 bg-white">
              <div className="space-y-4">
                <h3 className="font-bold text-sm text-slate-800 flex items-center justify-between gap-2 border-b pb-2">
                  <span className="flex items-center gap-2"><PlusCircle className="h-4 w-4 text-indigo-500" /> 基準年度・企業の設定</span>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-slate-400 hover:text-slate-700" onClick={() => setSidebarCollapsed(true)} title="設定を折りたたむ">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </h3>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">表示企業 (Company)</label>
                    {savedProfiles.length > 0 ? (
                      <Select value={companyName} onValueChange={async (val) => {
                        if (val === "__new__") {
                          const name = prompt("新しい企業名を入力:");
                          if (name) { setCompanyName(name); await loadProfileData(name, fiscalYear); }
                        } else {
                          setCompanyName(val);
                          await loadProfileData(val, fiscalYear);
                        }
                      }}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="企業を選択" /></SelectTrigger>
                        <SelectContent>
                          {Array.from(new Set(savedProfiles.map(p => p.company))).map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                          <SelectItem value="__new__" className="text-indigo-600 font-medium">+ New Company...</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-10"
                        placeholder="企業名を入力"
                        value={companyName}
                        onChange={e => setCompanyName(e.target.value)}
                        onBlur={async () => { if (companyName) await loadProfileData(companyName, fiscalYear); }}
                        onKeyDown={async e => {
                          if (e.key === 'Enter' && companyName) await loadProfileData(companyName, fiscalYear);
                        }}
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">表示年度 (Fiscal Year)</label>
                    <Select value={fiscalYear} onValueChange={async (val) => {
                      setFiscalYear(val);
                      await loadProfileData(companyName, val);
                    }}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Select Year" /></SelectTrigger>
                      <SelectContent>
                        {[2023,2024,2025,2026,2027,2028,2029,2030].map(y => (
                          <SelectItem key={y} value={y.toString()}>第{y - 1977}期 (FY{y})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">分析モード</label>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <Button
                    variant={appMode === 'standard' ? 'secondary' : 'ghost'}
                    className={`flex-1 h-8 text-[11px] font-bold ${appMode === 'standard' ? 'bg-white shadow-sm' : ''}`}
                    onClick={() => handleModeChange('standard')}
                  >通常</Button>
                  <Button
                    variant={appMode === 'manufacturing' ? 'secondary' : 'ghost'}
                    className={`flex-1 h-8 text-[11px] font-bold ${appMode === 'manufacturing' ? 'bg-white shadow-sm' : ''}`}
                    onClick={() => handleModeChange('manufacturing')}
                  >製造業</Button>
                </div>
              </div>

              {savedProfiles.length > 0 && (
                <div className="pt-2 border-t border-slate-100">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">保存済みデータ管理</label>
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
                          variant="ghost" size="sm"
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
              loadedMonths={actualLoadedMonths}
              budgetOnlyMonths={budgetOnlyMonths}
              onReset={() => { if (confirm("このプロファイルのデータをクリアしますか？")) setDataByMonth({}); }}
            />

            <BackupManager
              savedProfiles={savedProfiles}
              onDataImported={loadProfiles}
            />

            {hasData && (
              <Card className="p-4 border-none shadow-md">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-400 uppercase">Department Filter</label>
                  <Select value={selectedDept} onValueChange={setSelectedDept}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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

          <div className={cn(sidebarCollapsed ? "lg:col-span-1" : "lg:col-span-4")}>
            {sidebarCollapsed && (
              <Button
                variant="outline"
                size="sm"
                className="mb-3 gap-1.5 text-xs text-slate-500 border-slate-200 hover:text-indigo-600 hover:border-indigo-300"
                onClick={() => setSidebarCollapsed(false)}
              >
                <ChevronRight className="h-3.5 w-3.5" /> 設定を表示
              </Button>
            )}
            {isLoadingStorage ? (
              <Card className="h-96 flex items-center justify-center border-dashed">
                <div className="text-center text-gray-400">
                  <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin text-indigo-400" />
                  <p className="text-xl font-medium">データ読み込み中...</p>
                  <p className="text-sm">SQLからデータを取得しています</p>
                </div>
              </Card>
            ) : hasData ? (
              <Tabs
                defaultValue="dashboard"
                className="w-full"
                onValueChange={(value) => { if (value === "dashboard") setSelectedDept("All"); }}
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
                    onCellEdit={handleCellEdit}
                  />
                </TabsContent>

                <TabsContent value="mfg-report" className="mt-4">
                  <VarianceTable
                    data={aggregatedData}
                    selectedDepartment={null}
                    isThousands={isTableThousands}
                    sheetFilter={['製造原価報告書']}
                    onCellEdit={handleCellEdit}
                  />
                </TabsContent>

                <TabsContent value="bs-data" className="mt-4">
                  <BSTable
                    data={aggregatedData}
                    isThousands={isTableThousands}
                    onCellEdit={handleCellEdit}
                  />
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
                        onCellEdit={handleCellEdit}
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
                        onCellEdit={handleCellEdit}
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

                <TabsContent value="ai" className="mt-4 hidden">
                  <AIAdvisor data={aggregatedData} report={financialReport} selectedDept={selectedDept} />
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
