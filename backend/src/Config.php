<?php
declare(strict_types=1);

namespace App;

final class Config
{
    private static array $data = [];

    public static function load(array $data): void
    {
        self::$data = $data;
    }

    public static function get(string $path, mixed $default = null): mixed
    {
        $v = self::$data;
        foreach (explode('.', $path) as $k) {
            if (!is_array($v) || !array_key_exists($k, $v)) {
                return $default;
            }
            $v = $v[$k];
        }
        return $v;
    }
}
