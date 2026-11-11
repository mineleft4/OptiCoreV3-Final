-- Referencia: el backend crea estas tablas SOLO al arrancar (CREATE TABLE IF NOT EXISTS).
-- Úsalo únicamente si prefieres crearlas a mano.
CREATE DATABASE IF NOT EXISTS opticore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE opticore;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(24) NOT NULL,
  salt CHAR(32) NOT NULL,
  password_hash CHAR(128) NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_username (username)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  PRIMARY KEY (token_hash),
  KEY idx_sessions_user (user_id),
  KEY idx_sessions_exp (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  t BIGINT NOT NULL,
  cpu TINYINT UNSIGNED NOT NULL,
  ram TINYINT UNSIGNED NOT NULL,
  procs INT UNSIGNED NOT NULL,
  health TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_history_user_t (user_id, t),
  CONSTRAINT fk_history_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS applied (
  user_id BIGINT UNSIGNED NOT NULL,
  rec_id VARCHAR(120) NOT NULL,
  applied_at BIGINT NOT NULL,
  PRIMARY KEY (user_id, rec_id),
  CONSTRAINT fk_applied_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB;
