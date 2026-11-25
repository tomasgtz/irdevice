<?php
declare(strict_types=1);

require __DIR__ . '/src/bootstrap.php';

use App\ApiException;
use App\Config;
use App\Http;
use App\Request;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    $router = require __DIR__ . '/src/routes.php';
    $result = $router->dispatch(Request::capture());
    Http::json(200, $result ?? ['ok' => true]);
} catch (ApiException $e) {
    Http::json($e->status, ['error' => $e->codeStr, 'message' => $e->getMessage()]);
} catch (\Throwable $e) {
    error_log('[irdevice] ' . $e);
    Http::json(500, ['error' => 'server_error', 'message' => Config::get('debug') ? $e->getMessage() : 'Server error']);
}
