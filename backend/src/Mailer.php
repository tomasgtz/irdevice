<?php
declare(strict_types=1);

namespace App;

/** Minimal SMTP client (SSL or STARTTLS + AUTH LOGIN). No dependencies. */
final class Mailer
{
    public static function send(string $to, string $subject, string $text, string $html): void
    {
        $c = Config::get('smtp', []);
        if (empty($c['host'])) {
            $dir = dirname(__DIR__) . '/storage';
            @mkdir($dir, 0775, true);
            file_put_contents($dir . '/mail.log', "--- " . gmdate('c') . " to=$to subject=$subject\n$text\n\n", FILE_APPEND);
            return;
        }

        $secure = (string) ($c['secure'] ?? '');
        $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . $c['host'] . ':' . (int) $c['port'], $errno, $errstr, 15);
        if (!$fp) {
            throw new \RuntimeException("SMTP connect failed: $errstr");
        }
        stream_set_timeout($fp, 15);

        $read = static function () use ($fp): string {
            $resp = '';
            while (($line = fgets($fp, 1024)) !== false) {
                $resp .= $line;
                if (strlen($line) < 4 || $line[3] === ' ') {
                    break;
                }
            }
            return $resp;
        };
        $cmd = static function (string $line, string $ok) use ($fp, $read): string {
            if ($line !== '') {
                fwrite($fp, $line . "\r\n");
            }
            $resp = $read();
            if (!in_array(substr($resp, 0, 3), explode(',', $ok), true)) {
                throw new \RuntimeException('SMTP error: ' . trim($resp));
            }
            return $resp;
        };

        try {
            $cmd('', '220');
            $host = $_SERVER['SERVER_NAME'] ?? 'localhost';
            $cmd("EHLO $host", '250');
            if ($secure === 'tls') {
                $cmd('STARTTLS', '220');
                if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('SMTP STARTTLS failed');
                }
                $cmd("EHLO $host", '250');
            }
            if (!empty($c['user'])) {
                $cmd('AUTH LOGIN', '334');
                $cmd(base64_encode($c['user']), '334');
                $cmd(base64_encode((string) $c['pass']), '235');
            }
            $cmd('MAIL FROM:<' . $c['from'] . '>', '250');
            $cmd('RCPT TO:<' . $to . '>', '250,251');
            $cmd('DATA', '354');

            $b = 'b' . Util::token(8);
            $enc = static fn (string $s): string => chunk_split(base64_encode($s));
            $fromName = '=?UTF-8?B?' . base64_encode((string) ($c['from_name'] ?? '')) . '?=';
            $msg = "From: $fromName <{$c['from']}>\r\n"
                . "To: <$to>\r\n"
                . 'Subject: =?UTF-8?B?' . base64_encode($subject) . "?=\r\n"
                . 'Date: ' . gmdate('r') . "\r\n"
                . 'Message-ID: <' . Util::token(12) . '@' . $host . ">\r\n"
                . "MIME-Version: 1.0\r\n"
                . "Content-Type: multipart/alternative; boundary=\"$b\"\r\n\r\n"
                . "--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $enc($text)
                . "--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . $enc($html)
                . "--$b--\r\n";
            fwrite($fp, $msg . "\r\n.\r\n");
            $read();
            $cmd('QUIT', '221');
        } finally {
            fclose($fp);
        }
    }

    public static function resetPassword(string $to, string $name, string $lang, string $link): void
    {
        if ($lang === 'en') {
            $subject = 'Reset your password';
            $text = "Hi $name,\n\nUse this link to choose a new password (valid for 1 hour):\n$link\n\nIf you didn't request this, ignore this email.";
            $cta = 'Choose a new password';
            $intro = "Hi $name, use the button below to choose a new password. It is valid for 1 hour.";
            $outro = "If you didn't request this, you can ignore this email.";
        } else {
            $subject = 'Restablece tu contraseña';
            $text = "Hola $name,\n\nUsa este enlace para elegir una nueva contraseña (válido por 1 hora):\n$link\n\nSi no lo solicitaste, ignora este correo.";
            $cta = 'Elegir nueva contraseña';
            $intro = "Hola $name, usa el botón para elegir una nueva contraseña. Es válido por 1 hora.";
            $outro = 'Si no lo solicitaste, puedes ignorar este correo.';
        }
        $h = static fn (string $s): string => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
        $html = '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">'
            . '<p>' . $h($intro) . '</p>'
            . '<p><a href="' . $h($link) . '" style="display:inline-block;background:#4f46e5;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">' . $h($cta) . '</a></p>'
            . '<p style="color:#666;font-size:13px">' . $h($outro) . '</p></div>';
        self::send($to, $subject, $text, $html);
    }
}
