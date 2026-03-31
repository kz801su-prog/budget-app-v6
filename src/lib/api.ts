export const API_BASE = 'https://kz801xs.xsrv.jp/budget_v6/api.php';

export async function callApi(action: string, body: Record<string, unknown> = {}): Promise<any> {
    const res = await fetch(`${API_BASE}?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    return res.json();
}
