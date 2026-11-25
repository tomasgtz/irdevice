<?php
declare(strict_types=1);

namespace App\Controllers;

use App\ApiException;
use App\Auth;
use App\Config;
use App\Db;
use App\Mailer;
use App\Request;
use App\Util;

final class AuthController
{
    private static function session(Request $r, int $uid, ?string $family = null): array
    {
        Auth::startSession($r, $uid, $family);
        return ['access_token' => Auth::accessToken($uid), 'user' => Auth::publicUser($uid)];
    }

    private static function lang(mixed $v): string
    {
        return in_array($v, ['es', 'en'], true) ? $v : 'es';
    }

    public static function register(Request $r): array
    {
        $name = trim((string) $r->input('name', ''));
        $email = strtolower(trim((string) $r->input('email', '')));
        $pass = (string) $r->input('password', '');

        if ($name === '' || mb_strlen($name) > 80) {
            throw new ApiException(422, 'invalid_name');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
            throw new ApiException(422, 'invalid_email');
        }
        if (strlen($pass) < 8 || strlen($pass) > 200) {
            throw new ApiException(422, 'weak_password');
        }
        if (Db::one('SELECT id FROM users WHERE email=?', [$email])) {
            throw new ApiException(409, 'email_taken');
        }
        $id = Db::insert(
            'INSERT INTO users(name,email,password_hash,language,created_at) VALUES(?,?,?,?,?)',
            [$name, $email, password_hash($pass, PASSWORD_DEFAULT), self::lang($r->input('language')), Util::now()]
        );
        return self::session($r, $id);
    }

    public static function login(Request $r): array
    {
        $email = strtolower(trim((string) $r->input('email', '')));
        $pass = (string) $r->input('password', '');

        $since = Util::now(-900);
        $n = Db::one('SELECT COUNT(*) c FROM login_attempts WHERE created_at>? AND (email=? OR ip=?)', [$since, $email, $r->ip()]);
        if ((int) $n['c'] >= 10) {
            throw new ApiException(429, 'too_many_attempts');
        }

        $u = Db::one('SELECT id,password_hash FROM users WHERE email=?', [$email]);
        if (!$u || !password_verify($pass, $u['password_hash'])) {
            Db::insert('INSERT INTO login_attempts(email,ip,created_at) VALUES(?,?,?)', [substr($email, 0, 190), $r->ip(), Util::now()]);
            throw new ApiException(401, 'invalid_credentials');
        }
        Db::exec('DELETE FROM login_attempts WHERE email=?', [$email]);
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            Db::exec('UPDATE users SET password_hash=? WHERE id=?', [password_hash($pass, PASSWORD_DEFAULT), $u['id']]);
        }
        return self::session($r, (int) $u['id']);
    }

    /** Silent restore: exchange the HttpOnly refresh cookie for a new access token. */
    public static function refresh(Request $r): array
    {
        $res = Auth::refresh($r);
        return ['access_token' => Auth::accessToken($res['user_id']), 'user' => Auth::publicUser($res['user_id'])];
    }

    public static function logout(Request $r): array
    {
        Auth::logout();
        return ['ok' => true];
    }

    public static function forgot(Request $r): array
    {
        $email = strtolower(trim((string) $r->input('email', '')));
        $u = Db::one('SELECT id,name,language FROM users WHERE email=?', [$email]);
        if ($u) {
            $token = Util::token(32);
            Db::insert('INSERT INTO password_resets(user_id,token_hash,expires_at) VALUES(?,?,?)', [$u['id'], Util::hash($token), Util::now(3600)]);
            $link = rtrim((string) Config::get('app_url'), '/') . '/reset-password?token=' . $token;
            try {
                Mailer::resetPassword($email, $u['name'], $u['language'], $link);
            } catch (\Throwable $e) {
                error_log('[irdevice] mail failed: ' . $e->getMessage());
            }
        }
        return ['ok' => true]; // same answer whether or not the account exists
    }

    public static function reset(Request $r): array
    {
        $token = (string) $r->input('token', '');
        $pass = (string) $r->input('password', '');
        if (strlen($pass) < 8 || strlen($pass) > 200) {
            throw new ApiException(422, 'weak_password');
        }
        $row = Db::one('SELECT id,user_id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>?', [Util::hash($token), Util::now()]);
        if (!$row) {
            throw new ApiException(400, 'invalid_reset_token');
        }
        Db::exec('UPDATE users SET password_hash=? WHERE id=?', [password_hash($pass, PASSWORD_DEFAULT), $row['user_id']]);
        Db::exec('UPDATE password_resets SET used_at=? WHERE id=?', [Util::now(), $row['id']]);
        Auth::revokeAll((int) $row['user_id']);
        return self::session($r, (int) $row['user_id']);
    }

    public static function me(Request $r): array
    {
        return ['user' => Auth::publicUser((int) Auth::user($r)['id'])];
    }

    public static function updateMe(Request $r): array
    {
        $u = Auth::user($r);
        $name = trim((string) $r->input('name', $u['name']));
        if ($name === '' || mb_strlen($name) > 80) {
            throw new ApiException(422, 'invalid_name');
        }
        Db::exec('UPDATE users SET name=?, language=? WHERE id=?', [$name, self::lang($r->input('language', $u['language'])), $u['id']]);
        return ['user' => Auth::publicUser((int) $u['id'])];
    }

    public static function changePassword(Request $r): array
    {
        $u = Auth::user($r);
        $new = (string) $r->input('new_password', '');
        $row = Db::one('SELECT password_hash FROM users WHERE id=?', [$u['id']]);
        if (!password_verify((string) $r->input('current_password', ''), $row['password_hash'])) {
            throw new ApiException(403, 'invalid_credentials');
        }
        if (strlen($new) < 8 || strlen($new) > 200) {
            throw new ApiException(422, 'weak_password');
        }
        Db::exec('UPDATE users SET password_hash=? WHERE id=?', [password_hash($new, PASSWORD_DEFAULT), $u['id']]);
        Auth::revokeAll((int) $u['id']);
        return self::session($r, (int) $u['id']);
    }
}
