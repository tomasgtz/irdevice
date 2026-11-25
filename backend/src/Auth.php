<?php
declare(strict_types=1);

namespace App;

final class Auth
{
    private const COOKIE = 'rt';

    /** Resolve the user from the Bearer access token or fail with 401. */
    public static function user(Request $r): array
    {
        $token = $r->bearer();
        $payload = $token ? Jwt::decode($token, (string) Config::get('jwt_secret')) : null;
        if (!$payload) {
            throw new ApiException(401, 'unauthorized');
        }
        $user = Db::one('SELECT id,name,email,language FROM users WHERE id=?', [(int) $payload['sub']]);
        if (!$user) {
            throw new ApiException(401, 'unauthorized');
        }
        return $user;
    }

    public static function accessToken(int $userId): string
    {
        return Jwt::encode(
            ['sub' => $userId, 'exp' => time() + (int) Config::get('access_ttl', 900)],
            (string) Config::get('jwt_secret')
        );
    }

    public static function publicUser(int $userId): array
    {
        $u = Db::one('SELECT id,name,email,language FROM users WHERE id=?', [$userId]);
        return ['id' => (int) $u['id'], 'name' => $u['name'], 'email' => $u['email'], 'language' => $u['language']];
    }

    /** Create a refresh token (new family unless given) and set it as an HttpOnly cookie. */
    public static function startSession(Request $r, int $userId, ?string $familyId = null): void
    {
        $token = Util::token(32);
        $days = (int) Config::get('refresh_ttl_days', 90);
        Db::insert(
            'INSERT INTO refresh_tokens(user_id,family_id,token_hash,user_agent,created_at,expires_at) VALUES(?,?,?,?,?,?)',
            [$userId, $familyId ?? Util::token(16), Util::hash($token), $r->userAgent(), Util::now(), Util::now($days * 86400)]
        );
        self::setCookie($token, time() + $days * 86400);
    }

    public static function setCookie(string $value, int $expires): void
    {
        setcookie(self::COOKIE, $value, [
            'expires'  => $expires,
            'path'     => (string) Config::get('cookie_path', '/'),
            'secure'   => Util::isHttps(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function clearCookie(): void
    {
        self::setCookie('', time() - 86400);
    }

    public static function cookieToken(): ?string
    {
        $v = $_COOKIE[self::COOKIE] ?? '';
        return preg_match('/^[a-f0-9]{64}$/', $v) ? $v : null;
    }

    public static function revokeAll(int $userId): void
    {
        Db::exec('UPDATE refresh_tokens SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL', [Util::now(), $userId]);
    }

    /**
     * Rotate the refresh token. Returns the user id.
     * A token that was rotated within the last 15 s is tolerated (two tabs refreshing at once):
     * the caller then gets an access token but no new cookie. Reuse after that revokes the family.
     */
    public static function refresh(Request $r): array
    {
        $raw = self::cookieToken();
        $row = $raw ? Db::one('SELECT * FROM refresh_tokens WHERE token_hash=?', [Util::hash($raw)]) : null;
        if (!$row) {
            self::clearCookie();
            throw new ApiException(401, 'no_session');
        }
        $uid = (int) $row['user_id'];
        if ($row['revoked_at'] !== null) {
            if ((int) $row['rotated'] === 1 && time() - Util::ts($row['revoked_at']) <= 15) {
                return ['user_id' => $uid, 'rotated' => false];
            }
            if ((int) $row['rotated'] === 1) {
                Db::exec('UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL', [Util::now(), $row['family_id']]);
            }
            self::clearCookie();
            throw new ApiException(401, 'no_session');
        }
        if (Util::ts($row['expires_at']) < time()) {
            self::clearCookie();
            throw new ApiException(401, 'no_session');
        }
        Db::exec('UPDATE refresh_tokens SET revoked_at=?, rotated=1 WHERE id=?', [Util::now(), $row['id']]);
        self::startSession($r, $uid, $row['family_id']); // sliding 90-day window
        return ['user_id' => $uid, 'rotated' => true];
    }

    public static function logout(): void
    {
        $raw = self::cookieToken();
        if ($raw) {
            $row = Db::one('SELECT family_id FROM refresh_tokens WHERE token_hash=?', [Util::hash($raw)]);
            if ($row) {
                Db::exec('UPDATE refresh_tokens SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL', [Util::now(), $row['family_id']]);
            }
        }
        self::clearCookie();
    }
}
