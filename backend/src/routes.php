<?php
declare(strict_types=1);

use App\Controllers\AuthController as A;
use App\Controllers\ControlController as C;
use App\Controllers\DeviceController as D;
use App\Router;

$r = new Router();

// Auth
$r->add('POST', '/auth/register', [A::class, 'register']);
$r->add('POST', '/auth/login',    [A::class, 'login']);
$r->add('POST', '/auth/refresh',  [A::class, 'refresh']);
$r->add('POST', '/auth/logout',   [A::class, 'logout']);
$r->add('POST', '/auth/forgot',   [A::class, 'forgot']);
$r->add('POST', '/auth/reset',    [A::class, 'reset']);

// Profile
$r->add('GET',   '/me',          [A::class, 'me']);
$r->add('PATCH', '/me',          [A::class, 'updateMe']);
$r->add('POST',  '/me/password', [A::class, 'changePassword']);

// Controls
$r->add('GET',    '/controls',                         [C::class, 'list']);
$r->add('POST',   '/controls',                         [C::class, 'create']);
$r->add('GET',    '/controls/{id}',                    [C::class, 'show']);
$r->add('PATCH',  '/controls/{id}',                    [C::class, 'update']);
$r->add('DELETE', '/controls/{id}',                    [C::class, 'delete']);
$r->add('POST',   '/controls/{id}/finish',             [C::class, 'finish']);
$r->add('POST',   '/controls/{id}/learn',              [C::class, 'learn']);
$r->add('GET',    '/controls/{id}/learn/{jobId}',      [C::class, 'learnStatus']);
$r->add('DELETE', '/controls/{id}/actions/{action}',   [C::class, 'deleteAction']);
$r->add('POST',   '/controls/{id}/send',               [C::class, 'send']);

// Devices
$r->add('GET', '/ir-devices/{code}', [D::class, 'check']);
$r->add('GET', '/status',            [D::class, 'status']);

// Device- and broker-facing
$r->add('POST', '/device/learn',           [D::class, 'learnResult']);
$r->add('POST', '/internal/device-status', [D::class, 'statusWebhook']);

return $r;
