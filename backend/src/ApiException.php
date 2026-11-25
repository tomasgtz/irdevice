<?php
declare(strict_types=1);

namespace App;

final class ApiException extends \Exception
{
    public function __construct(public int $status, public string $codeStr, string $message = '')
    {
        parent::__construct($message !== '' ? $message : $codeStr);
    }
}
