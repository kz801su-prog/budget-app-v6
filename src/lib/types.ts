export interface DeptHeadcount {
    sales: number;      // 営業
    warehouse: number;  // 倉庫 (非営業)
    operations: number; // 業務 (非営業)
    accounting: number; // 経理 (非営業)
}

export interface MonthlyRecord {
    code: string;
    subject: string;
    department: string;
    actual: number;
    budget: number;
    prevYearActual?: number; // Added for YOY analysis
    monthIndex?: number;
}

export interface AggregatedRow {
    code: string;
    subject: string;
    department: string;
    monthlyData: Record<number, { actual: number; budget: number; prevYearActual?: number }>;

    // Totals
    totalFirstHalf: { actual: number; budget: number; prevYearActual?: number };
    totalSecondHalf: { actual: number; budget: number; prevYearActual?: number };
    totalAnnual: { actual: number; budget: number; prevYearActual?: number };

    variance: number;
}

export interface PnLData {
    rows: AggregatedRow[];
    departments: string[];
    totals: {
        monthly: Record<number, { actual: number; budget: number; prevYearActual?: number }>;
        totalFirstHalf: { actual: number; budget: number; prevYearActual?: number };
        totalSecondHalf: { actual: number; budget: number; prevYearActual?: number };
        totalAnnual: { actual: number; budget: number; prevYearActual?: number };
    };
    appMode?: AppMode;
}

export interface StorageData {
    companyName: string;
    fiscalYear: string;
    dataByMonth: Record<number, MonthlyRecord[]>;
    lastUpdated: string;
    appMode?: AppMode;
}

export type AppMode = 'standard' | 'manufacturing';
