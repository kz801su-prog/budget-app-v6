<?php
// ==========================================================
// Budget App V6 - API (api.php)
// ==========================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

$db_host = 'localhost';
$db_name = 'kz801xs_budgetv6';
$db_user = 'kz801xs_692';
$db_pass = 'W|x7<J!BGGpG';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'DB接続エラー: ' . $e->getMessage()]);
    exit;
}

$json = file_get_contents('php://input');
$data = json_decode($json, true);
if (!$data) $data = $_POST;

$action = $_GET['action'] ?? $data['action'] ?? '';

// ── テーブル自動作成 ───────────────────────────────────────
$pdo->exec("CREATE TABLE IF NOT EXISTS financial_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(255),
    fiscal_year INT,
    month_index INT,
    department VARCHAR(255),
    subject_code VARCHAR(50),
    subject_name VARCHAR(255),
    budget DECIMAL(15,2) DEFAULT 0,
    actual DECIMAL(15,2) DEFAULT 0,
    calc_result DECIMAL(15,2) DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uni_idx (company_name, fiscal_year, month_index, department, subject_code, subject_name)
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS account_master (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(255),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    fiscal_year INT NOT NULL,
    app_mode VARCHAR(50) DEFAULT 'standard',
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uni_profile (company_name, fiscal_year)
)");

$pdo->exec("CREATE TABLE IF NOT EXISTS employee_counts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    fiscal_year INT NOT NULL,
    department VARCHAR(255) NOT NULL,
    sales_count INT DEFAULT 0,
    warehouse_count INT DEFAULT 0,
    operations_count INT DEFAULT 0,
    accounting_count INT DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uni_emp (company_name, fiscal_year, department)
)");

// ── アクション処理 ─────────────────────────────────────────
switch ($action) {

    // ── 財務データ保存 ─────────────────────────────────────
    case 'save_financial_data':
        $company = $data['company']  ?? '';
        $year    = $data['year']     ?? 0;
        $records = $data['records']  ?? [];
        $type    = $data['dataType'] ?? 'actual';

        if (!$company || !$year || empty($records)) {
            echo json_encode(['success' => false, 'message' => 'パラメータ不足']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO financial_data
            (company_name, fiscal_year, month_index, department, subject_code, subject_name, $type, calc_result)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            ON DUPLICATE KEY UPDATE
            $type = VALUES($type),
            calc_result = actual - budget");

        $stmtMaster = $pdo->prepare("INSERT INTO account_master (code, name) VALUES (?, ?)
                                     ON DUPLICATE KEY UPDATE name = VALUES(name)");

        $stmtProfile = $pdo->prepare("INSERT INTO profiles (company_name, fiscal_year, app_mode)
                                      VALUES (?, ?, 'standard')
                                      ON DUPLICATE KEY UPDATE last_accessed = CURRENT_TIMESTAMP");

        try {
            $pdo->beginTransaction();
            foreach ($records as $r) {
                $val     = $r['value']      ?? 0;
                $code    = $r['code']       ?? '';
                $subject = $r['subject']    ?? '';
                $stmt->execute([$company, $year, $r['month'], $r['department'], $code, $subject, $val]);
                if ($code !== '') {
                    $stmtMaster->execute([$code, $subject]);
                }
            }
            $stmtProfile->execute([$company, $year]);
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    // ── 財務データ取得 ─────────────────────────────────────
    case 'get_financial_data':
        $company = $data['company'] ?? '';
        $year    = $data['year']    ?? 0;

        $stmt = $pdo->prepare("SELECT * FROM financial_data WHERE company_name = ? AND fiscal_year = ?");
        $stmt->execute([$company, $year]);
        echo json_encode(['success' => true, 'data' => $stmt->fetchAll()]);
        break;

    // ── プロフィール一覧取得 ───────────────────────────────
    case 'get_profiles':
        // financial_data に存在するが profiles に未登録のレコードを自動補完
        $pdo->exec("INSERT IGNORE INTO profiles (company_name, fiscal_year, app_mode)
                    SELECT DISTINCT company_name, fiscal_year, 'standard'
                    FROM financial_data");

        $stmt = $pdo->query("SELECT company_name, fiscal_year, app_mode FROM profiles ORDER BY last_accessed DESC");
        echo json_encode(['success' => true, 'profiles' => $stmt->fetchAll()]);
        break;

    // ── プロフィール保存（app_mode 更新）────────────────────
    case 'save_profile':
        $company = $data['company']  ?? '';
        $year    = $data['year']     ?? 0;
        $mode    = $data['app_mode'] ?? 'standard';

        if (!$company || !$year) {
            echo json_encode(['success' => false, 'message' => 'パラメータ不足']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO profiles (company_name, fiscal_year, app_mode)
                               VALUES (?, ?, ?)
                               ON DUPLICATE KEY UPDATE app_mode = VALUES(app_mode), last_accessed = CURRENT_TIMESTAMP");
        $stmt->execute([$company, $year, $mode]);
        echo json_encode(['success' => true]);
        break;

    // ── プロフィール削除（関連データも削除）─────────────────
    case 'delete_profile':
        $company = $data['company'] ?? '';
        $year    = $data['year']    ?? 0;

        if (!$company || !$year) {
            echo json_encode(['success' => false, 'message' => 'パラメータ不足']);
            exit;
        }

        try {
            $pdo->beginTransaction();
            $pdo->prepare("DELETE FROM financial_data   WHERE company_name = ? AND fiscal_year = ?")->execute([$company, $year]);
            $pdo->prepare("DELETE FROM employee_counts  WHERE company_name = ? AND fiscal_year = ?")->execute([$company, $year]);
            $pdo->prepare("DELETE FROM profiles         WHERE company_name = ? AND fiscal_year = ?")->execute([$company, $year]);
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    // ── 従業員数取得 ──────────────────────────────────────
    case 'get_employee_counts':
        $company = $data['company'] ?? '';
        $year    = $data['year']    ?? 0;

        $stmt = $pdo->prepare("SELECT department, sales_count, warehouse_count, operations_count, accounting_count
                               FROM employee_counts WHERE company_name = ? AND fiscal_year = ?");
        $stmt->execute([$company, $year]);

        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[$row['department']] = [
                'sales'      => (int)$row['sales_count'],
                'warehouse'  => (int)$row['warehouse_count'],
                'operations' => (int)$row['operations_count'],
                'accounting' => (int)$row['accounting_count'],
            ];
        }
        echo json_encode(['success' => true, 'counts' => $result]);
        break;

    // ── 従業員数保存 ──────────────────────────────────────
    case 'save_employee_count':
        $company = $data['company']    ?? '';
        $year    = $data['year']       ?? 0;
        $dept    = $data['department'] ?? '';
        $count   = $data['count']      ?? [];

        if (!$company || !$year || !$dept) {
            echo json_encode(['success' => false, 'message' => 'パラメータ不足']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO employee_counts
            (company_name, fiscal_year, department, sales_count, warehouse_count, operations_count, accounting_count)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
            sales_count      = VALUES(sales_count),
            warehouse_count  = VALUES(warehouse_count),
            operations_count = VALUES(operations_count),
            accounting_count = VALUES(accounting_count)");

        $stmt->execute([
            $company, $year, $dept,
            $count['sales']      ?? 0,
            $count['warehouse']  ?? 0,
            $count['operations'] ?? 0,
            $count['accounting'] ?? 0,
        ]);
        echo json_encode(['success' => true]);
        break;

    // ── 全データエクスポート（バックアップ用）──────────────
    case 'export_all_data':
        $profiles  = $pdo->query("SELECT company_name, fiscal_year, app_mode FROM profiles")->fetchAll();
        $empRows   = $pdo->query("SELECT * FROM employee_counts")->fetchAll();

        $exportProfiles = [];
        foreach ($profiles as $p) {
            $stmt = $pdo->prepare("SELECT * FROM financial_data WHERE company_name = ? AND fiscal_year = ?");
            $stmt->execute([$p['company_name'], $p['fiscal_year']]);
            $rows = $stmt->fetchAll();

            $dataByMonth = [];
            foreach ($rows as $r) {
                $m = (int)$r['month_index'];
                if (!isset($dataByMonth[$m])) $dataByMonth[$m] = [];
                $dataByMonth[$m][] = [
                    'code'       => $r['subject_code'],
                    'subject'    => $r['subject_name'],
                    'department' => $r['department'],
                    'actual'     => (float)$r['actual'],
                    'budget'     => (float)$r['budget'],
                    'monthIndex' => $m,
                ];
            }

            $exportProfiles[] = [
                'companyName' => $p['company_name'],
                'fiscalYear'  => (string)$p['fiscal_year'],
                'appMode'     => $p['app_mode'],
                'dataByMonth' => $dataByMonth,
                'lastUpdated' => date('c'),
            ];
        }

        $empResult = [];
        foreach ($empRows as $e) {
            $key = $e['company_name'] . '_' . $e['fiscal_year'];
            if (!isset($empResult[$key])) $empResult[$key] = [];
            $empResult[$key][$e['department']] = [
                'sales'      => (int)$e['sales_count'],
                'warehouse'  => (int)$e['warehouse_count'],
                'operations' => (int)$e['operations_count'],
                'accounting' => (int)$e['accounting_count'],
            ];
        }

        echo json_encode([
            'success'        => true,
            'version'        => '2.0',
            'exportDate'     => date('c'),
            'profiles'       => $exportProfiles,
            'employeeCounts' => $empResult,
        ]);
        break;

    // ── ユーザー確認 ──────────────────────────────────────
    case 'check_user':
        $empId    = $data['employeeId'] ?? '';
        $fullName = $data['fullName']   ?? '';

        $stmt = $pdo->prepare("SELECT * FROM users WHERE employee_id = ? AND full_name = ?");
        $stmt->execute([$empId, $fullName]);
        $user = $stmt->fetch();

        if (!$user) {
            echo json_encode(['success' => false, 'message' => '社員番号または氏名が登録されていません。']);
            exit;
        }

        if ($user['is_registered']) {
            echo json_encode(['success' => true, 'is_registered' => true]);
        } else {
            $secret    = generateBase32Secret(16);
            $appName   = urlencode("BudgetAppV6");
            $userLabel = urlencode($empId);
            $qrCodeUrl = "https://api.qrserver.com/v1/create-qr-code/?data=otpauth://totp/{$appName}:{$userLabel}?secret={$secret}&issuer={$appName}&size=200x200";
            echo json_encode(['success' => true, 'is_registered' => false, 'totpSecret' => $secret, 'qrCodeUrl' => $qrCodeUrl]);
        }
        break;

    // ── 初回登録 ──────────────────────────────────────────
    case 'register_setup':
        $empId      = $data['employeeId']  ?? '';
        $fullName   = $data['fullName']    ?? '';
        $password   = $data['newPassword'] ?? '';
        $totpCode   = $data['totpCode']    ?? '';
        $totpSecret = $data['totpSecret']  ?? '';

        if (!verifyTOTP($totpSecret, $totpCode)) {
            echo json_encode(['success' => false, 'message' => 'Authenticatorのコードが間違っています。']);
            exit;
        }

        $hash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("UPDATE users SET password_hash = ?, totp_secret = ?, is_registered = 1 WHERE employee_id = ? AND full_name = ?");
        $ok   = $stmt->execute([$hash, $totpSecret, $empId, $fullName]);

        if ($ok) {
            $stmt = $pdo->prepare("SELECT id, employee_id, full_name, role FROM users WHERE employee_id = ?");
            $stmt->execute([$empId]);
            echo json_encode(['success' => true, 'user' => $stmt->fetch()]);
        } else {
            echo json_encode(['success' => false, 'message' => '設定の保存に失敗しました。']);
        }
        break;

    // ── ログイン ──────────────────────────────────────────
    case 'login':
        $empId    = $data['employeeId'] ?? '';
        $password = $data['password']   ?? '';
        $totpCode = $data['totpCode']   ?? '';

        $stmt = $pdo->prepare("SELECT * FROM users WHERE employee_id = ?");
        $stmt->execute([$empId]);
        $user = $stmt->fetch();

        if (!$user || !$user['is_registered']) {
            echo json_encode(['success' => false, 'message' => 'ユーザーが見つからないか、初期登録が完了していません。']);
            exit;
        }

        if (!password_verify($password, $user['password_hash'])) {
            echo json_encode(['success' => false, 'message' => 'パスワードが間違っています。']);
            exit;
        }

        if (!verifyTOTP($user['totp_secret'], $totpCode)) {
            echo json_encode(['success' => false, 'message' => 'Authenticatorのコードが間違っています。']);
            exit;
        }

        unset($user['password_hash']);
        unset($user['totp_secret']);
        echo json_encode(['success' => true, 'user' => $user]);
        break;

    default:
        echo json_encode(['success' => false, 'message' => "Invalid action: '{$action}'"]);
        break;
}

// ==========================================================
// TOTP ヘルパー関数
// ==========================================================

function generateBase32Secret($length = 16) {
    $b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    $s   = "";
    for ($i = 0; $i < $length; $i++) $s .= $b32[random_int(0, 31)];
    return $s;
}

function verifyTOTP($secret, $code, $window = 1) {
    $tw = floor(time() / 30);
    for ($i = -$window; $i <= $window; $i++) {
        if (calculateTOTP($secret, $tw + $i) === $code) return true;
    }
    return false;
}

function calculateTOTP($secret, $timeWindow) {
    $key    = base32_decode($secret);
    $time   = pack('N*', 0) . pack('N*', $timeWindow);
    $hash   = hash_hmac('sha1', $time, $key, true);
    $offset = ord(substr($hash, -1)) & 0x0F;
    $value  = unpack('N', substr($hash, $offset, 4));
    $value  = $value[1] & 0x7FFFFFFF;
    return str_pad($value % pow(10, 6), 6, '0', STR_PAD_LEFT);
}

function base32_decode($base32) {
    $chars   = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $flipped = array_flip(str_split($chars));
    $padding = substr_count($base32, '=');
    if (!in_array($padding, [6, 4, 3, 1, 0])) return false;
    $base32 = str_replace('=', '', $base32);
    $bin    = '';
    foreach (str_split($base32) as $ch) {
        $bin .= str_pad(decbin($flipped[$ch]), 5, '0', STR_PAD_LEFT);
    }
    $out = '';
    foreach (str_split($bin, 8) as $piece) {
        if (strlen($piece) == 8) $out .= chr(bindec($piece));
    }
    return $out;
}
