<?php
// ==========================================================
// Budget App V6 - API (api.php)
// XServer 等の PHP環境に設置してください
// ==========================================================
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");
header("Content-Type: application/json; charset=UTF-8");

// OPTIONS（Preflight request）の場合はここで終了
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// -------------------------------------------------------------
// 【1】 データベース接続設定 (ご自身の環境に合わせて変更してください)
// -------------------------------------------------------------
$db_host = 'localhost';         // XServer等のホスト名 (例: mysql〇〇.xserver.jp)
$db_name = 'kz801xs_budgetv6';  // 作成したデータベース名
$db_user = 'kz801xs_692';      // データベースユーザー名
$db_pass = 'W|x7<J!BGGpG';     // パスワード

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$db_name;charset=utf8mb4", $db_user, $db_pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'データベース接続エラー: ' . $e->getMessage()]);
    exit;
}

// -------------------------------------------------------------
// 【2】 POSTデータの取得とActionの特定
// -------------------------------------------------------------
$json = file_get_contents('php://input');
$data = json_decode($json, true);
if (!$data) $data = $_POST;

// Action を URLパラメータ、またはJSONボディから取得
$action = $_GET['action'] ?? $data['action'] ?? '';

// -------------------------------------------------------------
// 【3】 アクション別の処理
// -------------------------------------------------------------
    // テーブル自動作成
    $pdo->exec("CREATE TABLE IF NOT EXISTS financial_data (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_name VARCHAR(255),
        fiscal_year INT,
        month_index INT,
        department VARCHAR(255),
        subject_code VARCHAR(50),
        subject_name VARCHAR(255),
        budget DECIMAL(15, 2) DEFAULT 0,
        actual DECIMAL(15, 2) DEFAULT 0,
        calc_result DECIMAL(15, 2) DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uni_idx (company_name, fiscal_year, month_index, department, subject_code, subject_name)
    )");

    $pdo->exec("CREATE TABLE IF NOT EXISTS account_master (
        code VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )");

switch ($action) {
    case 'save_financial_data':
        $company = $data['company'] ?? '';
        $year = $data['year'] ?? 0;
        $records = $data['records'] ?? [];
        $type = $data['dataType'] ?? 'actual'; // 'actual' or 'budget'

        if (!$company || !$year || empty($records)) {
            echo json_encode(['success' => false, 'message' => 'Invalid parameters']);
            exit;
        }

        $stmt = $pdo->prepare("INSERT INTO financial_data 
            (company_name, fiscal_year, month_index, department, subject_code, subject_name, $type, calc_result)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE 
            $type = VALUES($type),
            calc_result = actual - budget");

        $stmtMaster = $pdo->prepare("INSERT INTO account_master (code, name) VALUES (?, ?) 
                                     ON DUPLICATE KEY UPDATE name = VALUES(name)");

        try {
            $pdo->beginTransaction();
            foreach ($records as $r) {
                $val = $r['value'] ?? 0;
                $code = $r['code'] ?? '';
                $subject = $r['subject'] ?? '';

                // 財務データの保存
                $stmt->execute([
                    $company, $year, $r['month'], $r['department'], 
                    $code, $subject, $val, 0 // calc_resultはUPDATE側で計算
                ]);

                // 科目マスタの更新 (コードがある場合のみ)
                if ($code !== "") {
                    $stmtMaster->execute([$code, $subject]);
                }
            }
            $pdo->commit();
            echo json_encode(['success' => true]);
        } catch (Exception $e) {
            $pdo->rollBack();
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    case 'get_financial_data':
        $company = $data['company'] ?? '';
        $year = $data['year'] ?? 0;
        
        $stmt = $pdo->prepare("SELECT * FROM financial_data WHERE company_name = ? AND fiscal_year = ?");
        $stmt->execute([$company, $year]);
        $rows = $stmt->fetchAll();
        
        echo json_encode(['success' => true, 'data' => $rows]);
        break;

    case 'check_user':
        // 社員番号と氏名で登録状況を確認
        $empId = $data['employeeId'] ?? '';
        $fullName = $data['fullName'] ?? '';

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
            // 初回登録が必要。ランダムな16文字のBase32シークレットを生成
            $secret = generateBase32Secret(16);
            // 本番環境では発行者(Issuer)を会社の名称などにします
            $appName = urlencode("BudgetAppV6");
            $userLabel = urlencode($empId);
            $qrCodeUrl = "https://api.qrserver.com/v1/create-qr-code/?data=otpauth://totp/{$appName}:{$userLabel}?secret={$secret}&issuer={$appName}&size=200x200";

            echo json_encode([
                'success' => true, 
                'is_registered' => false, 
                'totpSecret' => $secret,
                'qrCodeUrl' => $qrCodeUrl
            ]);
        }
        break;

    case 'register_setup':
        // パスワードの設定とAuthenticatorの検証（初回）
        $empId = $data['employeeId'] ?? '';
        $fullName = $data['fullName'] ?? '';
        $password = $data['newPassword'] ?? '';
        $totpCode = $data['totpCode'] ?? '';
        $totpSecret = $data['totpSecret'] ?? '';

        if (!verifyTOTP($totpSecret, $totpCode)) {
            echo json_encode(['success' => false, 'message' => 'Authenticatorのコードが間違っています。']);
            exit;
        }

        // パスワードをハッシュ化
        $hash = password_hash($password, PASSWORD_DEFAULT);

        $stmt = $pdo->prepare("UPDATE users SET password_hash = ?, totp_secret = ?, is_registered = 1 WHERE employee_id = ? AND full_name = ?");
        $success = $stmt->execute([$hash, $totpSecret, $empId, $fullName]);

        if ($success) {
            $stmt = $pdo->prepare("SELECT id, employee_id, full_name, role FROM users WHERE employee_id = ?");
            $stmt->execute([$empId]);
            $user = $stmt->fetch();
            echo json_encode(['success' => true, 'user' => $user]);
        } else {
            echo json_encode(['success' => false, 'message' => '設定の保存に失敗しました。']);
        }
        break;

    case 'login':
        // 通常のログイン（社員番号、パスワード、TOTPコード）
        $empId = $data['employeeId'] ?? '';
        $password = $data['password'] ?? '';
        $totpCode = $data['totpCode'] ?? '';

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

        // ログイン成功（セキュリティ上、パスワードやシークレットは除外して返す）
        unset($user['password_hash']);
        unset($user['totp_secret']);
        echo json_encode(['success' => true, 'user' => $user]);
        break;

    default:
        echo json_encode(['success' => false, 'message' => "Invalid action: '{$action}'"]);
        break;
}

// ==========================================================
// TOTP ヘルパー関数群（簡易版）
// ==========================================================

function generateBase32Secret($length = 16) {
    $b32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    $s = "";
    for ($i = 0; $i < $length; $i++) {
        $s .= $b32[random_int(0, 31)];
    }
    return $s;
}

function verifyTOTP($secret, $code, $window = 1) {
    $timeWindow = floor(time() / 30);
    for ($i = -$window; $i <= $window; $i++) {
        $calculatedCode = calculateTOTP($secret, $timeWindow + $i);
        if ($calculatedCode === $code) {
            return true;
        }
    }
    return false;
}

function calculateTOTP($secret, $timeWindow) {
    $key = base32_decode($secret);
    $time = pack('N*', 0) . pack('N*', $timeWindow);
    $hash = hash_hmac('sha1', $time, $key, true);
    $offset = ord(substr($hash, -1)) & 0x0F;
    $value = unpack('N', substr($hash, $offset, 4));
    $value = $value[1] & 0x7FFFFFFF;
    $modulo = pow(10, 6);
    return str_pad($value % $modulo, 6, '0', STR_PAD_LEFT);
}

function base32_decode($base32) {
    $base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $base32charsFlipped = array_flip(str_split($base32chars));
    $paddingCharCount = substr_count($base32, '=');
    $allowedValues = array(6, 4, 3, 1, 0);
    if (!in_array($paddingCharCount, $allowedValues)) return false;
    for ($i = 0; $i < 4; $i++) {
        if ($paddingCharCount == $allowedValues[$i] &&
            substr($base32, -($allowedValues[$i])) != str_repeat('=', $allowedValues[$i])) {
            return false;
        }
    }
    $base32 = str_replace('=', '', $base32);
    $base32 = str_split($base32);
    $binaryString = "";
    foreach ($base32 as $char) {
        $binaryString .= str_pad(decbin($base32charsFlipped[$char]), 5, '0', STR_PAD_LEFT);
    }
    $eightBitPieces = str_split($binaryString, 8);
    $decodedString = "";
    foreach ($eightBitPieces as $piece) {
        if (strlen($piece) == 8) {
            $decodedString .= chr(bindec($piece));
        }
    }
    return $decodedString;
}
