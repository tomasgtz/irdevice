<?php
declare(strict_types=1);

namespace App;

final class Request
{
    public array $params = [];

    public function __construct(
        public string $method,
        public string $path,
        public array $query,
        public array $body
    ) {
    }

    public static function capture(): self
    {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        $base = rtrim((string) Config::get('base_path', ''), '/');
        if ($base !== '' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base)) ?: '/';
        }
        $body = [];
        $raw = file_get_contents('php://input');
        if ($raw !== false && $raw !== '') {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) {
                throw new ApiException(400, 'invalid_json');
            }
            $body = $decoded;
        }
        return new self(strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET'), '/' . trim($path, '/'), $_GET, $body);
    }

    public function input(string $key, mixed $default = null): mixed
    {
        return $this->body[$key] ?? $default;
    }

    public function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $v = $_SERVER[$key] ?? ($name === 'Authorization' ? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? null) : null);
        return $v === null ? null : (string) $v;
    }

    public function bearer(): ?string
    {
        $h = $this->header('Authorization');
        return ($h !== null && preg_match('/^Bearer\s+(.+)$/i', $h, $m)) ? trim($m[1]) : null;
    }

    public function ip(): string
    {
        return substr((string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'), 0, 45);
    }

    public function userAgent(): string
    {
        return substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255);
    }
}
