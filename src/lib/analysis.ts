import { AggregatedRow } from './types';

export interface VarianceAnalysis {
    isSignificant: boolean; // > 10%
    variancePercent: number;
    comment: string;
    question: string;
}

export const analyzeVariance = (row: AggregatedRow): VarianceAnalysis => {
    if (row.totalAnnual.budget === 0) {
        const isSignificant = Math.abs(row.totalAnnual.actual) > 0;
        return {
            isSignificant,
            variancePercent: isSignificant ? 100 : 0, // Treat as 100% or infinite
            comment: isSignificant ? "Unbudgeted expense" : "No activity",
            question: isSignificant ? `Why was there expense recorded for ${row.subject} which has zero budget?` : ""
        };
    }

    const variancePercent = (row.variance / row.totalAnnual.budget) * 100;
    const isSignificant = Math.abs(variancePercent) > 10;

    let comment = "Within 10% of budget";
    let question = "";

    if (isSignificant) {
        if (variancePercent > 0) { // Actual > Budget (assuming Expense, but logic holds)
            // Wait, Variance = Actual - Budget. 
            // If Expense: Positive Variance = Over Budget (Bad).
            // If Revenue: Positive Variance = Over Budget (Good).
            // Assuming P&L Expenses mostly for "Budget Performance" context usually implies controlling costs.
            // Let's assume generic "Deviation".
            comment = `Deviation: +${variancePercent.toFixed(1)}%`;
            question = `What drove the ${variancePercent.toFixed(1)}% variance in ${row.subject} vs budget?`;
        } else {
            comment = `Deviation: ${variancePercent.toFixed(1)}%`;
            question = `What drove the ${variancePercent.toFixed(1)}% variance in ${row.subject} vs budget?`;
        }
    }

    return {
        isSignificant,
        variancePercent,
        comment,
        question
    };
};
