<?php
// Copy to config.php and edit. config.php is git-ignored and blocked by .htaccess.
return [
    'app_url'     => 'https://example.com',   // public URL of the web app (used in reset emails)
    'base_path'   => '/api',                  // URL prefix the API is served under ('' for `php -S` dev behind the Vite proxy)
    'cookie_path' => '/api/auth',             // path the browser sees for the refresh cookie
    'debug'       => false,

    'db' => ['host' => 'localhost', 'name' => 'irdevice', 'user' => '', 'pass' => '', 'charset' => 'utf8mb4'],

    'jwt_secret'       => 'CHANGE_ME_random_64_chars',
    'access_ttl'       => 900,   // seconds (15 min)
    'refresh_ttl_days' => 90,    // sliding
    'learn_timeout'    => 45,    // seconds a learn session stays open

    // Shared secret the MQTT broker's webhook sends in the X-Webhook-Secret header
    'webhook_secret' => 'CHANGE_ME_webhook_secret',

    'mqtt' => [
        'driver'       => 'log',      // 'log' (dev: writes storage/mqtt.log) | 'emqx' (EMQX REST API over HTTPS)
        'topic_prefix' => 'irdev',    // commands -> irdev/{id}/cmd ; status -> irdev/{id}/status
        'emqx' => [
            'api_url'    => 'https://YOUR-DEPLOYMENT.emqxsl.com:8443/api/v5',
            'app_id'     => '',
            'app_secret' => '',
        ],
    ],

    // Leave host empty in dev: emails are written to storage/mail.log instead
    'smtp' => ['host' => '', 'port' => 465, 'secure' => 'ssl', 'user' => '', 'pass' => '',
               'from' => 'noreply@example.com', 'from_name' => 'IR Remote'],
];
