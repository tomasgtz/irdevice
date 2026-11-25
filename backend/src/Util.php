<?php
declare(strict_types=1);

namespace App;

final class Util
{
    /** Current UTC time as a MySQL DATETIME string, optionally shifted by seconds. */
    public static function now(int $offsetSeconds = 0): string
    {
        return gmdate('Y-m-d H:i:s', time() + $offsetSeconds);
    }

    /** MySQL UTC DATETIME -> ISO-8601 (or null). */
    public static function iso(?string $dt): ?string
    {
        return $dt === null ? null : str_replace(' ', 'T', $dt) . 'Z';
    }

    public static function ts(string $dt): int
    {
        return (int) strtotime($dt . ' UTC');
    }

    public static function token(int $bytes = 32): string
    {
        return bin2hex(random_bytes($bytes));
    }

    public static function hash(string $s): string
    {
        return hash('sha256', $s);
    }

    public static function isHttps(): bool
    {
        return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    }
}
