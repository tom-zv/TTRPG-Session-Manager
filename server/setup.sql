DROP DATABASE IF EXISTS DND;
CREATE DATABASE IF NOT EXISTS DND;

USE DND;
-- --------- --
-- Combat DB --
-- --------- --
CREATE TABLE
  IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    email VARCHAR(64) DEFAULT NULL,
    is_dm BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS characters (
    character_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    max_hp INT NOT NULL DEFAULT 1,
    current_hp INT NOT NULL DEFAULT 1,
    initiative INT NOT NULL DEFAULT 10
  );

CREATE TABLE
  IF NOT EXISTS user_characters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    character_id INT NOT NULL,
    UNIQUE (user_id, character_id),
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (character_id) REFERENCES characters (character_id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS creatures (
    creature_id int AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    max_hp INT NOT NULL DEFAULT 1,
    current_hp INT NOT NULL DEFAULT 1,
    initiative INT NOT NULL DEFAULT 10
  );

CREATE TABLE
  IF NOT EXISTS dm_creatures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    dm_user_id INT NOT NULL,
    creature_id INT NOT NULL,
    UNIQUE (dm_user_id, creature_id),
    FOREIGN KEY (dm_user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (creature_id) REFERENCES creatures (creature_id) ON DELETE CASCADE
  );
-- -------- --
-- Audio DB --
-- -------- --

CREATE TABLE 
  IF NOT EXISTS folders (
    folder_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    parent_folder_id INT,
    folder_type ENUM('music', 'sfx', 'ambience', 'root') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_folder_id) REFERENCES folders (folder_id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS audio_files (
    audio_file_id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(128) NOT NULL,
    audio_type ENUM ('music', 'sfx', 'ambience') NOT NULL DEFAULT 'music',
    file_url VARCHAR(256),
    file_path VARCHAR(256),
    folder_id INT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_folder_id FOREIGN KEY (folder_id) REFERENCES folders (folder_id) ON DELETE SET NULL
  );

-- Music playlists 
CREATE TABLE
  IF NOT EXISTS music_playlists (
    playlist_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT
  );

CREATE TABLE
  IF NOT EXISTS music_playlist_files (
    playlist_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    play_order INT,
    CONSTRAINT pk_music_playlist_files PRIMARY KEY (playlist_id, audio_file_id),
    CONSTRAINT fk_music_playlist_id FOREIGN KEY (playlist_id) REFERENCES music_playlists (playlist_id) ON DELETE CASCADE,
    CONSTRAINT fk_playlist_audio_file FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

-- SFX sets
CREATE TABLE
  IF NOT EXISTS sfx_sets (
    set_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT
  );

-- SFX macros 
CREATE TABLE
  IF NOT EXISTS sfx_macros (
    macro_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS sfx_macro_files (
    macro_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    play_order INT,
    CONSTRAINT pk_sfx_macro_files PRIMARY KEY (macro_id, audio_file_id),
    CONSTRAINT fk_macro_id FOREIGN KEY (macro_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE,
    CONSTRAINT fk_macro_audio_file FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

-- SFX sets contain files and macros.
CREATE TABLE
  IF NOT EXISTS sfx_set_files (
    sfx_set_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    default_volume FLOAT DEFAULT 1.0,
    PRIMARY KEY (sfx_set_id, audio_file_id),
    FOREIGN KEY (sfx_set_id) REFERENCES sfx_sets (set_id) ON DELETE CASCADE,
    FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS sfx_set_macros (
    sfx_set_id INT NOT NULL,
    macro_id INT NOT NULL,
    PRIMARY KEY (sfx_set_id, macro_id),
    FOREIGN KEY (sfx_set_id) REFERENCES sfx_sets (set_id) ON DELETE CASCADE,
    FOREIGN KEY (macro_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE
  );

-- Ambience sets
CREATE TABLE
  IF NOT EXISTS ambience_sets (
    set_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT
  );

CREATE TABLE
  IF NOT EXISTS audio_ambience_set_files (
    ambience_set_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    default_volume FLOAT DEFAULT 1.0,
    PRIMARY KEY (ambience_set_id, audio_file_id),
    FOREIGN KEY (ambience_set_id) REFERENCES ambience_sets (set_id) ON DELETE CASCADE,
    FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

-- Audio packs - contain playlist, sfx macros, and ambience sets
CREATE TABLE
  IF NOT EXISTS audio_packs (
    pack_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE
  IF NOT EXISTS audio_pack_playlists (
    pack_id INT NOT NULL,
    playlist_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_playlists PRIMARY KEY (pack_id, playlist_id),
    CONSTRAINT fk_pack_playlist FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_playlist_id FOREIGN KEY (playlist_id) REFERENCES music_playlists (playlist_id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS audio_pack_macros (
    pack_id INT NOT NULL,
    macro_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_macros PRIMARY KEY (pack_id, macro_id),
    CONSTRAINT fk_pack_macro FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_macro_pack FOREIGN KEY (macro_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE
  );

CREATE TABLE 
  IF NOT EXISTS audio_pack_sets (
    pack_id INT NOT NULL,
    set_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_sets PRIMARY KEY (pack_id, set_id),
    CONSTRAINT fk_pack_set FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_set_id FOREIGN KEY (set_id) REFERENCES ambience_sets (set_id) ON DELETE CASCADE
  );

CREATE TABLE 
  IF NOT EXISTS audio_pack_ambience_sets (
    pack_id INT NOT NULL,
    ambience_set_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_ambience_sets PRIMARY KEY (pack_id, ambience_set_id),
    CONSTRAINT fk_pack_ambience FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_ambience_set_id FOREIGN KEY (ambience_set_id) REFERENCES ambience_sets (set_id) ON DELETE CASCADE
  );

CREATE TABLE 
  IF NOT EXISTS audio_pack_sfx_sets (
    pack_id INT NOT NULL,
    sfx_set_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_sfx_sets PRIMARY KEY (pack_id, sfx_set_id),
    CONSTRAINT fk_pack_sfx FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_sfx_set_id FOREIGN KEY (sfx_set_id) REFERENCES sfx_sets (set_id) ON DELETE CASCADE
  );

-- Create base folders
INSERT INTO folders (name, folder_type) VALUES ('audio', 'root');
INSERT INTO folders (name, folder_type, parent_folder_id) VALUES ('music', 'music', 1);
INSERT INTO folders (name, folder_type, parent_folder_id) VALUES ('sfx', 'sfx', 1);
INSERT INTO folders (name, folder_type, parent_folder_id) VALUES ('ambience', 'ambience', 1);