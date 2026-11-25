<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Actions;
use App\ApiException;
use App\Auth;
use App\Config;
use App\Db;
use App\Mqtt;
use App\Request;
use App\Util;

final class ControlController
{
    private const SELECT = 'SELECT c.*, d.device_code, d.is_online, d.last_seen_at
                            FROM controls c JOIN ir_devices d ON d.id = c.ir_device_id';

    public static function present(array $c): array
    {
        $acMode = null;
        if ($c['type'] === 'ac' && $c['ac_protocol']) {
            $acMode = Actions::isAcProtocol($c['ac_protocol']) ? 'state' : 'raw';
        }
        $actions = Db::all(
            'SELECT action_name,label,protocol,learned_at FROM control_actions WHERE control_id=? ORDER BY id',
            [$c['id']]
        );
        return [
            'id'           => (int) $c['id'],
            'name'         => $c['name'],
            'type'         => $c['type'],
            'status'       => $c['status'],
            'device_code'  => $c['device_code'],
            'is_online'    => (bool) $c['is_online'],
            'last_seen_at' => Util::iso($c['last_seen_at']),
            'ac_mode'      => $acMode,
            'state'        => $c['type'] === 'ac' ? (json_decode((string) $c['state_json'], true) ?: Actions::defaultAcState()) : null,
            'actions'      => array_map(static fn ($a) => [
                'action_name' => $a['action_name'],
                'label'       => $a['label'],
                'protocol'    => $a['protocol'],
                'learned_at'  => Util::iso($a['learned_at']),
            ], $actions),
        ];
    }

    private static function own(Request $r): array
    {
        $u = Auth::user($r);
        $c = Db::one(self::SELECT . ' WHERE c.id=? AND c.user_id=?', [(int) $r->params['id'], $u['id']]);
        if (!$c) {
            throw new ApiException(404, 'control_not_found');
        }
        return $c;
    }

    public static function list(Request $r): array
    {
        $u = Auth::user($r);
        $rows = Db::all(self::SELECT . ' WHERE c.user_id=? ORDER BY c.created_at DESC, c.id DESC', [$u['id']]);
        return ['controls' => array_map([self::class, 'present'], $rows)];
    }

    public static function create(Request $r): array
    {
        $u = Auth::user($r);
        $code = trim((string) $r->input('ir_device_code', ''));
        $type = (string) $r->input('type', '');
        $name = trim((string) $r->input('name', ''));
        if (!in_array($type, ['tv', 'ac'], true)) {
            throw new ApiException(422, 'invalid_type');
        }
        if ($name === '' || mb_strlen($name) > 60) {
            throw new ApiException(422, 'invalid_name');
        }
        $d = Db::one('SELECT id FROM ir_devices WHERE device_code=?', [$code]);
        if (!$d) {
            throw new ApiException(404, 'device_not_found');
        }
        $id = Db::insert(
            'INSERT INTO controls(user_id,ir_device_id,type,name,status,created_at) VALUES(?,?,?,?,?,?)',
            [$u['id'], $d['id'], $type, $name, 'draft', Util::now()]
        );
        $c = Db::one(self::SELECT . ' WHERE c.id=?', [$id]);
        return ['control' => self::present($c)];
    }

    public static function show(Request $r): array
    {
        return ['control' => self::present(self::own($r))];
    }

    public static function update(Request $r): array
    {
        $c = self::own($r);
        $name = trim((string) $r->input('name', $c['name']));
        if ($name === '' || mb_strlen($name) > 60) {
            throw new ApiException(422, 'invalid_name');
        }
        Db::exec('UPDATE controls SET name=? WHERE id=?', [$name, $c['id']]);
        $c['name'] = $name;
        return ['control' => self::present($c)];
    }

    public static function delete(Request $r): array
    {
        $c = self::own($r);
        Db::exec('DELETE FROM controls WHERE id=?', [$c['id']]);
        return ['ok' => true];
    }

    public static function finish(Request $r): array
    {
        $c = self::own($r);
        $n = Db::one('SELECT COUNT(*) n FROM control_actions WHERE control_id=?', [$c['id']]);
        if ((int) $n['n'] === 0) {
            throw new ApiException(422, 'nothing_learned');
        }
        Db::exec("UPDATE controls SET status='ready' WHERE id=?", [$c['id']]);
        $c['status'] = 'ready';
        return ['control' => self::present($c)];
    }

    /** Ask the device to capture an IR code for one action. */
    public static function learn(Request $r): array
    {
        $c = self::own($r);
        $action = (string) $r->input('action_name', '');
        $label = trim((string) $r->input('label', ''));
        if (!Actions::valid($c['type'], $action)) {
            throw new ApiException(422, 'invalid_action');
        }
        if (Actions::isCustom($action) && ($label === '' || mb_strlen($label) > 60)) {
            throw new ApiException(422, 'invalid_label');
        }
        if (!$c['is_online']) {
            throw new ApiException(409, 'device_offline');
        }

        $now = Util::now();
        Db::exec("UPDATE learn_jobs SET status='expired' WHERE status='pending' AND expires_at<=?", [$now]);
        $busy = Db::one("SELECT id FROM learn_jobs WHERE ir_device_id=? AND status='pending' AND NOT (control_id=? AND user_id=?)", [$c['ir_device_id'], $c['id'], $c['user_id']]);
        if ($busy) {
            throw new ApiException(409, 'device_busy'); // device is shared: one capture at a time
        }
        Db::exec("UPDATE learn_jobs SET status='cancelled' WHERE ir_device_id=? AND status='pending'", [$c['ir_device_id']]);

        $timeout = (int) Config::get('learn_timeout', 45);
        $jobId = Db::insert(
            'INSERT INTO learn_jobs(ir_device_id,control_id,user_id,action_name,label,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)',
            [$c['ir_device_id'], $c['id'], $c['user_id'], $action, $label !== '' ? $label : null, 'pending', $now, Util::now($timeout)]
        );
        try {
            Mqtt::publish(Mqtt::cmdTopic($c['device_code']), [
                'cmd' => 'learn', 'action_name' => $action, 'job_id' => $jobId, 'timeout' => $timeout,
            ]);
        } catch (\Throwable $e) {
            Db::exec("UPDATE learn_jobs SET status='cancelled' WHERE id=?", [$jobId]);
            throw $e;
        }
        return ['job_id' => $jobId, 'expires_at' => Util::iso(Util::now($timeout))];
    }

    public static function learnStatus(Request $r): array
    {
        $c = self::own($r);
        $job = Db::one('SELECT * FROM learn_jobs WHERE id=? AND control_id=?', [(int) $r->params['jobId'], $c['id']]);
        if (!$job) {
            throw new ApiException(404, 'job_not_found');
        }
        if ($job['status'] === 'pending' && Util::ts($job['expires_at']) <= time()) {
            Db::exec("UPDATE learn_jobs SET status='expired' WHERE id=?", [$job['id']]);
            $job['status'] = 'expired';
        }
        $out = ['status' => $job['status']];
        if ($job['status'] === 'done') {
            $fresh = Db::one(self::SELECT . ' WHERE c.id=?', [$c['id']]);
            $out['control'] = self::present($fresh);
        }
        return $out;
    }

    public static function deleteAction(Request $r): array
    {
        $c = self::own($r);
        $name = (string) $r->params['action'];
        Db::exec('DELETE FROM control_actions WHERE control_id=? AND action_name=?', [$c['id'], $name]);
        if ($c['type'] === 'ac' && $name === 'power_on') {
            Db::exec('UPDATE controls SET ac_protocol=NULL, state_json=NULL WHERE id=?', [$c['id']]);
        }
        return ['control' => self::present(Db::one(self::SELECT . ' WHERE c.id=?', [$c['id']]))];
    }

    /** Send a button press. AC with a supported protocol is state-based; everything else replays the raw code. */
    public static function send(Request $r): array
    {
        $c = self::own($r);
        $action = (string) $r->input('action_name', '');
        if (!Actions::valid($c['type'], $action)) {
            throw new ApiException(422, 'invalid_action');
        }
        if (!$c['is_online']) {
            throw new ApiException(409, 'device_offline');
        }
        $topic = Mqtt::cmdTopic($c['device_code']);

        $stateful = $c['type'] === 'ac' && $c['ac_protocol'] && Actions::isAcProtocol($c['ac_protocol']) && !Actions::isCustom($action);
        if ($stateful) {
            $state = Actions::applyAc(json_decode((string) $c['state_json'], true) ?: [], $action);
            Db::exec('UPDATE controls SET state_json=? WHERE id=?', [json_encode($state), $c['id']]);
            Mqtt::publish($topic, ['cmd' => 'send_ac', 'protocol' => $c['ac_protocol']] + $state);
            return ['state' => $state];
        }

        $a = Db::one('SELECT protocol,length,raw_data FROM control_actions WHERE control_id=? AND action_name=?', [$c['id'], $action]);
        if (!$a) {
            throw new ApiException(404, 'action_not_learned');
        }
        Mqtt::publish($topic, [
            'cmd' => 'send', 'protocol' => $a['protocol'], 'length' => (int) $a['length'],
            'rawData' => json_decode($a['raw_data'], true),
        ]);
        return ['ok' => true];
    }
}
