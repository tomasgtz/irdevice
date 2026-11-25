<?php
declare(strict_types=1);

namespace App\Controllers;

use App\ApiException;
use App\Auth;
use App\Config;
use App\Db;
use App\Request;
use App\Util;

final class DeviceController
{
    /** GET /ir-devices/{code} — used by the "add device" wizard to validate the printed ID. */
    public static function check(Request $r): array
    {
        Auth::user($r);
        $d = Db::one('SELECT device_code,is_online,last_seen_at FROM ir_devices WHERE device_code=?', [$r->params['code']]);
        if (!$d) {
            throw new ApiException(404, 'device_not_found');
        }
        return ['code' => $d['device_code'], 'online' => (bool) $d['is_online'], 'last_seen_at' => Util::iso($d['last_seen_at'])];
    }

    /** GET /status — online state of every IR device the user has controls on (polled by the top bar). */
    public static function status(Request $r): array
    {
        $u = Auth::user($r);
        $rows = Db::all(
            'SELECT d.device_code, d.is_online, d.last_seen_at, GROUP_CONCAT(c.id) AS control_ids
             FROM controls c JOIN ir_devices d ON d.id = c.ir_device_id
             WHERE c.user_id=? GROUP BY d.id',
            [$u['id']]
        );
        return ['devices' => array_map(static fn ($d) => [
            'code'         => $d['device_code'],
            'online'       => (bool) $d['is_online'],
            'last_seen_at' => Util::iso($d['last_seen_at']),
            'control_ids'  => array_map('intval', explode(',', (string) $d['control_ids'])),
        ], $rows)];
    }

    /** Authenticate a device request: X-Device-Key must match the device's stored hash. */
    private static function device(Request $r, string $code): array
    {
        $key = $r->header('X-Device-Key') ?? '';
        $d = Db::one('SELECT * FROM ir_devices WHERE device_code=?', [$code]);
        if (!$d || $key === '' || !hash_equals($d['api_key_hash'], Util::hash($key))) {
            throw new ApiException(401, 'invalid_device');
        }
        return $d;
    }

    /**
     * POST /device/learn — called by the IR device with the captured code.
     * Body: ir_device_id, action_name, protocol, length, rawData
     */
    public static function learnResult(Request $r): array
    {
        $d = self::device($r, (string) $r->input('ir_device_id', ''));
        $protocol = trim((string) $r->input('protocol', ''));
        $raw = $r->input('rawData');
        if ($protocol === '' || strlen($protocol) > 64 || $raw === null || $raw === '' || $raw === []) {
            throw new ApiException(422, 'invalid_payload');
        }
        $rawJson = json_encode($raw);
        if (strlen($rawJson) > 2_000_000) {
            throw new ApiException(422, 'invalid_payload');
        }

        $job = Db::one(
            "SELECT * FROM learn_jobs WHERE ir_device_id=? AND status='pending' AND expires_at>? ORDER BY id DESC LIMIT 1",
            [$d['id'], Util::now()]
        );
        if (!$job) {
            throw new ApiException(404, 'no_pending_job');
        }
        $name = (string) $r->input('action_name', $job['action_name']);
        if ($name !== $job['action_name']) {
            throw new ApiException(409, 'action_mismatch');
        }

        Db::exec(
            'INSERT INTO control_actions(control_id,action_name,label,protocol,length,raw_data,learned_at) VALUES(?,?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE label=VALUES(label), protocol=VALUES(protocol), length=VALUES(length), raw_data=VALUES(raw_data), learned_at=VALUES(learned_at)',
            [$job['control_id'], $name, $job['label'], $protocol, (int) $r->input('length', 0), $rawJson, Util::now()]
        );
        $ctl = Db::one('SELECT type FROM controls WHERE id=?', [$job['control_id']]);
        if ($ctl && $ctl['type'] === 'ac' && $name === 'power_on') {
            // The detected protocol decides state-based (IRac) vs raw replay for this AC.
            Db::exec('UPDATE controls SET ac_protocol=?, state_json=NULL WHERE id=?', [$protocol, $job['control_id']]);
        }
        Db::exec("UPDATE learn_jobs SET status='done', completed_at=? WHERE id=?", [Util::now(), $job['id']]);
        Db::exec('UPDATE ir_devices SET is_online=1, last_seen_at=? WHERE id=?', [Util::now(), $d['id']]);
        return ['ok' => true];
    }

    /**
     * POST /internal/device-status — broker webhook (rule on irdev/+/status).
     * Body: {"topic":"irdev/<id>/status","payload":"online"|"offline"}   (or {"ir_device_id","status"})
     * The device publishes retained "online" on connect; the broker publishes its LWT "offline".
     */
    public static function statusWebhook(Request $r): array
    {
        $secret = (string) Config::get('webhook_secret');
        if ($secret === '' || !hash_equals($secret, $r->header('X-Webhook-Secret') ?? '')) {
            throw new ApiException(401, 'unauthorized');
        }
        $code = (string) $r->input('ir_device_id', '');
        $status = $r->input('status');
        if ($code === '') {
            $prefix = preg_quote((string) Config::get('mqtt.topic_prefix', 'irdev'), '#');
            if (!preg_match('#^' . $prefix . '/([A-Za-z0-9_-]{1,64})/status$#', (string) $r->input('topic', ''), $m)) {
                throw new ApiException(422, 'invalid_payload');
            }
            $code = $m[1];
            $payload = $r->input('payload');
            if (is_string($payload) && ($j = json_decode($payload, true)) && is_array($j)) {
                $payload = $j['status'] ?? $j['state'] ?? null;
            }
            $status = $payload;
        }
        $online = in_array(strtolower(trim((string) $status)), ['online', '1', 'true'], true);
        // Unknown devices are ignored: provisioning is done with tools/provision-device.php
        Db::exec('UPDATE ir_devices SET is_online=?, last_seen_at=? WHERE device_code=?', [$online ? 1 : 0, Util::now(), $code]);
        return ['ok' => true];
    }
}
