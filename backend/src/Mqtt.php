<?php
declare(strict_types=1);

namespace App;

/**
 * Publishes commands to the device through MQTT.
 * Shared hosting can't hold a persistent MQTT connection, so we publish through the broker's
 * HTTPS REST API (EMQX). Driver 'log' appends to storage/mqtt.log for local development
 * (tools/device-simulator.mjs tails that file).
 */
final class Mqtt
{
    public static function cmdTopic(string $deviceCode): string
    {
        return Config::get('mqtt.topic_prefix', 'irdev') . '/' . $deviceCode . '/cmd';
    }

    public static function publish(string $topic, array $payload): void
    {
        $json = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $driver = Config::get('mqtt.driver', 'log');

        if ($driver === 'log') {
            $dir = dirname(__DIR__) . '/storage';
            @mkdir($dir, 0775, true);
            file_put_contents($dir . '/mqtt.log', json_encode(['topic' => $topic, 'payload' => $payload]) . "\n", FILE_APPEND | LOCK_EX);
            return;
        }

        $c = Config::get('mqtt.emqx', []);
        $ch = curl_init(rtrim((string) $c['api_url'], '/') . '/publish');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_USERPWD        => $c['app_id'] . ':' . $c['app_secret'],
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_POSTFIELDS     => json_encode(['topic' => $topic, 'payload' => $json, 'qos' => 1, 'retain' => false]),
        ]);
        $res = curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($res === false || $code >= 300) {
            error_log("[irdevice] MQTT publish failed ($code): " . (string) $res);
            throw new ApiException(502, 'mqtt_unavailable');
        }
    }
}
