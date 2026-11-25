-- IR Remote schema (MySQL 5.7+/8, utf8mb4). All timestamps are UTC.
SET NAMES utf8mb4;

CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80)  NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  language      ENUM('es','en') NOT NULL DEFAULT 'es',
  created_at    DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Long-lived (90 days, sliding) rotating refresh tokens. Only the SHA-256 is stored.
CREATE TABLE refresh_tokens (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  family_id  CHAR(32)     NOT NULL,
  token_hash CHAR(64)     NOT NULL UNIQUE,
  user_agent VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  rotated    TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_family (family_id),
  KEY idx_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE password_resets (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id    INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at    DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE login_attempts (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email      VARCHAR(190) NOT NULL,
  ip         VARCHAR(45)  NOT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_email (email, created_at),
  KEY idx_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Physical IR devices. Shared: no single owner. Provision with tools/provision-device.php
CREATE TABLE ir_devices (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  device_code  VARCHAR(64) NOT NULL UNIQUE,   -- the ID printed on the device (= ir_device_id)
  api_key_hash CHAR(64)    NOT NULL,          -- SHA-256 of the key the device sends in X-Device-Key
  is_online    TINYINT(1)  NOT NULL DEFAULT 0, -- maintained from MQTT status/LWT
  last_seen_at DATETIME NULL,
  created_at   DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE controls (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  ir_device_id INT UNSIGNED NOT NULL,
  type         ENUM('tv','ac') NOT NULL,
  name         VARCHAR(60) NOT NULL,
  status       ENUM('draft','ready') NOT NULL DEFAULT 'draft',
  ac_protocol  VARCHAR(64) NULL,               -- protocol detected from the captured AC frame
  state_json   TEXT NULL,                      -- AC state: power, mode, temp, fan, swing
  created_at   DATETIME NOT NULL,
  KEY idx_user (user_id),
  FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
  FOREIGN KEY (ir_device_id) REFERENCES ir_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE control_actions (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  control_id  INT UNSIGNED NOT NULL,
  action_name VARCHAR(32)  NOT NULL,           -- power_on, vol_up, custom_x1y2 ...
  label       VARCHAR(60)  NULL,               -- only for custom buttons
  protocol    VARCHAR(64)  NOT NULL,
  length      INT UNSIGNED NOT NULL DEFAULT 0,
  raw_data    MEDIUMTEXT   NOT NULL,           -- JSON-encoded rawData as sent by the device
  learned_at  DATETIME NOT NULL,
  UNIQUE KEY uq_control_action (control_id, action_name),
  FOREIGN KEY (control_id) REFERENCES controls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- A learn session: the backend asks the device to capture; the device POSTs the code back.
-- Only one pending session per physical device at a time (device is shared).
CREATE TABLE learn_jobs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ir_device_id INT UNSIGNED NOT NULL,
  control_id   INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  action_name  VARCHAR(32) NOT NULL,
  label        VARCHAR(60) NULL,
  status       ENUM('pending','done','expired','cancelled') NOT NULL DEFAULT 'pending',
  created_at   DATETIME NOT NULL,
  expires_at   DATETIME NOT NULL,
  completed_at DATETIME NULL,
  KEY idx_device_status (ir_device_id, status),
  FOREIGN KEY (ir_device_id) REFERENCES ir_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (control_id)   REFERENCES controls(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
