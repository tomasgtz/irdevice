<?php
declare(strict_types=1);

namespace App;

final class Router
{
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $re = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '/?$#';
        $this->routes[] = [$method, $re, $handler];
    }

    public function dispatch(Request $req): ?array
    {
        foreach ($this->routes as [$method, $re, $handler]) {
            if ($method === $req->method && preg_match($re, $req->path, $m)) {
                $req->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
                return $handler($req);
            }
        }
        throw new ApiException(404, 'not_found');
    }
}
