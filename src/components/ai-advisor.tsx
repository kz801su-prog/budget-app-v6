"use client"

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, BrainCircuit, AlertTriangle, MessageSquareQuote } from 'lucide-react';
import { PnLData, AggregatedRow } from '@/lib/types';
import { FinancialReport } from '@/lib/financial-analyzer';

interface AIAdvisorProps {
    data: PnLData;
    report: FinancialReport;
    selectedDept: string;
}

export function AIAdvisor({ data, report, selectedDept }: AIAdvisorProps) {
    const [loading, setLoading] = useState(false);
    const [advice, setAdvice] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState("");

    const generateAdvice = async () => {
        if (!apiKey) {
            alert("Gemini API Keyを入力してください。");
            return;
        }

        setLoading(true);
        try {
            // Find worst variances
            const variances = data.rows
                .filter(r => selectedDept === "All" || r.department === selectedDept)
                .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
                .slice(0, 5);

            const prompt = `
            あなたは高度な財務コンサルタントです。以下の財務データを分析してください。
            部門: ${selectedDept}
            
            主な異常項目（予算比）:
            ${variances.map(v => `- ${v.subject}: 実績 ${v.totalAnnual.actual.toLocaleString()} / 予算 ${v.totalAnnual.budget.toLocaleString()} (差額: ${v.variance.toLocaleString()})`).join('\n')}

            財務指標:
            - 営業利益率: ${report.values['operating_margin']?.['FY']?.toFixed(1)}%
            - 自己資本比率: ${report.values['equity_ratio']?.['FY']?.toFixed(1)}%

            指示:
            1. 予算と大きく乖離している項目について、どのような原因が考えられるか仮説を立ててください。
            2. 各項目の責任者（部門長）に対して、改善や説明のために投げかけるべき「鋭い質問案」を3つ作成してください。
            3. 経営層向けの簡潔なエグゼクティブ・サマリー（改善の方向性）を提示してください。
            
            回答は日本語で、プロフェッショナルなトーンで行ってください。
            `;

            // Note: Since I don't have a backend proxy here, I'm simulating the call structure
            // In a real app, this would call a Server Action or API route.
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            const result = await response.json();
            const text = result.candidates[0].content.parts[0].text;
            setAdvice(text);
        } catch (error) {
            console.error(error);
            alert("AI分析に失敗しました。APIキーを確認してください。");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="p-6 border-indigo-100 bg-gradient-to-br from-white to-indigo-50/30">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h3 className="text-xl font-bold text-indigo-900 flex items-center gap-2">
                        <BrainCircuit className="h-6 w-6 text-indigo-600" />
                        AI 財務アドバイザー (Gemini)
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                        予算差異の深い分析と、部門長へのヒアリング案を自動生成します
                    </p>
                </div>
                <div className="flex gap-2">
                    <input
                        type="password"
                        placeholder="Gemini API Key"
                        className="text-xs p-2 border rounded-md w-40"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <Button
                        onClick={generateAdvice}
                        disabled={loading}
                        className="bg-indigo-600 hover:bg-indigo-700"
                    >
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "分析を開始"}
                    </Button>
                </div>
            </div>

            {advice ? (
                <div className="prose prose-indigo max-w-none">
                    <div className="whitespace-pre-wrap text-slate-700 text-sm leading-relaxed bg-white p-6 rounded-xl border border-indigo-50 shadow-sm">
                        {advice}
                    </div>
                </div>
            ) : (
                <div className="h-48 flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-indigo-100 rounded-xl">
                    <MessageSquareQuote className="h-12 w-12 mb-2 opacity-20" />
                    <p>APIキーを入力して「分析を開始」をクリックしてください</p>
                </div>
            )}
        </Card>
    );
}
