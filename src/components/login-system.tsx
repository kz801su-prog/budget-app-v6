import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Lock, User, KeyRound, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

// 実際のAPIのURLに書き換えてください（例：https://yourdomain.com/budget-app/api.php）
const API_URL = 'https://kz801xs.xsrv.jp/budget_v6/api.php'; // ※成功した方のURLを正確に！



export function LoginSystem({ onLoginSuccess }: { onLoginSuccess: (user: any) => void }) {
  const [step, setStep] = useState<'ID_CHECK' | 'PASSWORD_SET' | 'LOGIN'>('ID_CHECK');
  
  const [employeeId, setEmployeeId] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  
  // 初回登録用ステート
  const [newPassword, setNewPassword] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. 社員番号と氏名でDBを照合する（初回か、既に登録済みかを判定）
  const handleIdCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?action=check_user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, fullName })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || '社員番号または氏名が正しくありません。');
      }

      if (data.is_registered) {
        // すでに登録済みの場合はログイン画面へ
        setStep('LOGIN');
      } else {
        // 未登録の場合は設定画面へ（QRコードとシークレットを受け取る）
        setQrCodeUrl(data.qrCodeUrl);
        setTotpSecret(data.totpSecret);
        setStep('PASSWORD_SET');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. 初回登録（パスワードとAuthenticatorの初期確認）
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?action=register_setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, fullName, newPassword, totpCode, totpSecret })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || '設定に失敗しました。コードが正しいか確認してください。');
      }
      // 成功したらログイン状態にする
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 3. 通常ログイン
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, password, totpCode })
      });
      const data = await res.json();
      
      if (!data.success) {
        throw new Error(data.message || 'ログインに失敗しました。');
      }
      onLoginSuccess(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-none">
        
        <CardHeader className="space-y-2 bg-indigo-600 text-white rounded-t-lg">
          <CardTitle className="text-2xl font-bold flex items-center gap-2 justify-center">
            <ShieldCheck className="h-6 w-6" /> Budget App v6
          </CardTitle>
          <CardDescription className="text-indigo-100 text-center">
            セキュアログインシステム
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {step === 'ID_CHECK' && (
            <form onSubmit={handleIdCheck} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-500" /> 社員番号 (Employee ID)
                </label>
                <Input required value={employeeId} onChange={e => setEmployeeId(e.target.value)} placeholder="0001" className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-500" /> 氏名 (Full Name)
                </label>
                <Input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="山田 太郎" className="h-11" />
              </div>
              <Button type="submit" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 font-bold" disabled={loading}>
                {loading ? '照合中...' : '次へ (Next)'}
              </Button>
            </form>
          )}

          {step === 'LOGIN' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="p-3 bg-indigo-50 text-indigo-800 rounded text-sm mb-4 font-medium flex items-center gap-2">
                <User className="h-4 w-4" /> {fullName} さん、パスワードと認証コードを入力してください。
              </div>
              
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-indigo-500" /> パスワード
                </label>
                <Input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="h-11" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-indigo-500" /> Authenticator コード (6桁)
                </label>
                <Input required type="text" maxLength={6} pattern="\d{6}" value={totpCode} onChange={e => setTotpCode(e.target.value)} placeholder="123456" className="h-11 tracking-widest text-lg font-mono text-center" />
              </div>
              <Button type="submit" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 font-bold" disabled={loading}>
                {loading ? 'ログイン処理中...' : 'ログイン (Login)'}
              </Button>
            </form>
          )}

          {step === 'PASSWORD_SET' && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-md mb-2">
                <h4 className="font-bold text-orange-800 text-sm mb-1">初回セットアップ</h4>
                <p className="text-xs text-orange-700 leading-relaxed">
                  新しいパスワードを設定し、お使いのスマートフォン（Google Authenticator等）でQRコードを読み取ってください。
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <Lock className="h-4 w-4 text-indigo-500" /> 新規パスワード設定
                </label>
                <Input required type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="h-10" />
              </div>
              
              <div className="space-y-2 pt-2 border-t">
                <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-500" /> Authenticator 登録
                </label>
                <div className="flex justify-center bg-white p-2 rounded border">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt="QR Code" className="w-40 h-40" />
                  ) : (
                    <div className="w-40 h-40 bg-slate-100 flex items-center justify-center text-xs text-slate-400">Loading QR...</div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-bold text-slate-700">表示された6桁のコードを入力</label>
                <Input required type="text" maxLength={6} pattern="\d{6}" value={totpCode} onChange={e => setTotpCode(e.target.value)} placeholder="000000" className="h-11 tracking-widest text-lg font-mono text-center bg-indigo-50" />
              </div>

              <Button type="submit" className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 font-bold" disabled={loading}>
                {loading ? '登録中...' : '登録してログイン'}
              </Button>
            </form>
          )}
        </CardContent>
        
        {step !== 'ID_CHECK' && (
          <CardFooter className="bg-slate-50 border-t justify-center">
            <Button variant="ghost" size="sm" onClick={() => { setStep('ID_CHECK'); setPassword(''); setTotpCode(''); setNewPassword(''); }} className="text-slate-500">
              最初からやり直す
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
