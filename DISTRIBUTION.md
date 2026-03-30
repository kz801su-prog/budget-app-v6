# 配布用パッケージの作成手順

## 1. ビルドの実行
```bash
npm run build
```

## 2. 配布用フォルダの作成

以下のファイル・フォルダを含めてZIPファイルを作成：

### 必須ファイル
- `.next/` フォルダ全体
- `public/` フォルダ全体
- `package.json`
- `next.config.ts`
- `install.bat`
- `start.bat`
- `README_PORTABLE.md`

### 除外するもの
- `node_modules/` （ユーザーが install.bat で自動インストール）
- `.git/`
- `src/`
- `electron/`
- その他の開発用ファイル

## 3. ZIPファイルの作成

PowerShellで実行：
```powershell
$exclude = @('node_modules', '.git', 'src', 'electron', 'dist', 'out', '.next/cache')
$include = @('.next', 'public', 'package.json', 'next.config.ts', '*.bat', 'README_PORTABLE.md')

# 配布用フォルダを作成
New-Item -ItemType Directory -Force -Path ".\dist-portable"

# 必要なファイルをコピー
Copy-Item -Path ".next" -Destination ".\dist-portable\.next" -Recurse -Force
Copy-Item -Path "public" -Destination ".\dist-portable\public" -Recurse -Force
Copy-Item -Path "package.json" -Destination ".\dist-portable\" -Force
Copy-Item -Path "next.config.ts" -Destination ".\dist-portable\" -Force
Copy-Item -Path "*.bat" -Destination ".\dist-portable\" -Force
Copy-Item -Path "README_PORTABLE.md" -Destination ".\dist-portable\" -Force

# ZIPファイルを作成
Compress-Archive -Path ".\dist-portable\*" -DestinationPath ".\BudgetApp-Portable.zip" -Force
```

## 4. 配布

`BudgetApp-Portable.zip` を配布してください。

ユーザーは：
1. ZIPを解凍
2. `install.bat` を実行（初回のみ）
3. `start.bat` で起動

これで他のPCでも使用できます。
