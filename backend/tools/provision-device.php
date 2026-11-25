<?php
declare(strict_types=1);
// Usage: php tools/provision-device.php <DEVICE_CODE>
// Registers an IR device and prints the API key to flash into its firmware (shown once).

if (PHP_SAPI !== 'cli') {
    exit(1);
}
require dirname(__DIR__) . '/src/bootstrap.php';

use App\Db;
use App\Util;

$code = $argv[1] ?? '';
if (!preg_match('/^[A-Za-z0-9_-]{4,64}$/', $code)) {
    fwrite(STDERR, "Usage: php tools/provision-device.php <DEVICE_CODE>   (4-64 chars: letters, digits, - _)\n");
    exit(1);
}
if (Db::one('SELECT id FROM ir_devices WHERE device_code=?', [$code])) {
    fwrite(STDERR, "Device $code already exists.\n");
    exit(1);
}
$key = Util::token(24);
Db::insert('INSERT INTO ir_devices(device_code,api_key_hash,created_at) VALUES(?,?,?)', [$code, Util::hash($key), Util::now()]);
echo "Device:  $code\nAPI key: $key   (send as X-Device-Key; store it in the firmware, it can't be recovered)\n";
