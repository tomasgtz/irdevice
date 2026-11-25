<?php
declare(strict_types=1);

namespace App;

final class Jwt
{
    public static function encode(array $payload, string $secret): string
    {
        $h = self::b64(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $b = self::b64(json_encode($payload));
        return "$h.$b." . self::b64(hash_hmac('sha256', "$h.$b", $secret, true));
    }

    public static function decode(string $token, string $secret): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }
        [$h, $b, $s] = $parts;
        if (!hash_equals(self::b64(hash_hmac('sha256', "$h.$b", $secret, true)), $s)) {
            return null;
        }
        $payload = json_decode((string) base64_decode(strtr($b, '-_', '+/')), true);
        if (!is_array($payload) || ($payload['exp'] ?? 0) < time()) {
            return null;
        }
        return $payload;
    }

    private static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }
}
