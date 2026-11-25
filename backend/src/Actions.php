<?php
declare(strict_types=1);

namespace App;

final class Actions
{
    public const TV = ['power_on', 'power_off', 'ch_up', 'ch_down', 'vol_up', 'vol_down', 'mute', 'input'];
    public const AC = ['power_on', 'power_off', 'mode_cool', 'mode_heat', 'mode_dry', 'mode_fan', 'temp_up', 'temp_down', 'fan_speed', 'swing'];

    public const AC_MODES = ['cool', 'heat', 'dry', 'fan'];
    public const AC_FANS = ['auto', 'low', 'medium', 'high'];
    public const TEMP_MIN = 16;
    public const TEMP_MAX = 30;

    /** AC protocols IRremoteESP8266's IRac can generate from a state (names as typeToString()). */
    private const AC_PROTOCOLS = [
        'AIRTON', 'AIRWELL', 'AMCOR', 'ARGO', 'CARRIER_AC', 'COOLIX', 'CORONA_AC', 'DAIKIN', 'DAIKIN2', 'DAIKIN128',
        'DAIKIN152', 'DAIKIN160', 'DAIKIN176', 'DAIKIN216', 'DELONGHI_AC', 'ELECTRA_AC', 'FUJITSU_AC', 'GOODWEATHER',
        'GREE', 'HAIER_AC', 'HAIER_AC_YRW02', 'HAIER_AC176', 'HITACHI_AC', 'HITACHI_AC1', 'HITACHI_AC2', 'HITACHI_AC3',
        'HITACHI_AC344', 'HITACHI_AC424', 'KELVINATOR', 'LG', 'LG2', 'MIDEA', 'MITSUBISHI_AC', 'MITSUBISHI112',
        'MITSUBISHI136', 'MITSUBISHI_HEAVY_88', 'MITSUBISHI_HEAVY_152', 'NEOCLIMA', 'PANASONIC_AC', 'PANASONIC_AC32',
        'SAMSUNG_AC', 'SANYO_AC', 'SANYO_AC152', 'SHARP_AC', 'TCL112AC', 'TECO', 'TOSHIBA_AC', 'TRANSCOLD', 'TROTEC',
        'TROTEC_3550', 'VESTEL_AC', 'VOLTAS', 'WHIRLPOOL_AC', 'YORK',
    ];

    public static function isAcProtocol(string $protocol): bool
    {
        return in_array(strtoupper(trim($protocol)), self::AC_PROTOCOLS, true);
    }

    public static function isCustom(string $name): bool
    {
        return (bool) preg_match('/^custom_[a-z0-9]{1,16}$/', $name);
    }

    public static function valid(string $type, string $name): bool
    {
        $list = $type === 'tv' ? self::TV : self::AC;
        return in_array($name, $list, true) || self::isCustom($name);
    }

    public static function defaultAcState(): array
    {
        return ['power' => false, 'mode' => 'cool', 'temp' => 24, 'fan' => 'auto', 'swing' => false];
    }

    /** Apply a button press to the AC state. Returns the new state. */
    public static function applyAc(array $s, string $action): array
    {
        $s = $s + self::defaultAcState();
        switch ($action) {
            case 'power_on':
                $s['power'] = true;
                break;
            case 'power_off':
                $s['power'] = false;
                break;
            case 'mode_cool': case 'mode_heat': case 'mode_dry': case 'mode_fan':
                $s['mode'] = substr($action, 5);
                $s['power'] = true;
                break;
            case 'temp_up':
                $s['temp'] = min(self::TEMP_MAX, (int) $s['temp'] + 1);
                break;
            case 'temp_down':
                $s['temp'] = max(self::TEMP_MIN, (int) $s['temp'] - 1);
                break;
            case 'fan_speed':
                $i = array_search($s['fan'], self::AC_FANS, true);
                $s['fan'] = self::AC_FANS[(($i === false ? -1 : $i) + 1) % count(self::AC_FANS)];
                break;
            case 'swing':
                $s['swing'] = !$s['swing'];
                break;
        }
        return $s;
    }
}
