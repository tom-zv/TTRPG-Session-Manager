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
    duration INT,
    file_url VARCHAR(256),
    file_path VARCHAR(256),
    folder_id INT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_folder_id FOREIGN KEY (folder_id) REFERENCES folders (folder_id) ON DELETE SET NULL
  );

-- Music playlists 
CREATE TABLE
  IF NOT EXISTS playlists (
    playlist_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT
  );

CREATE TABLE IF NOT EXISTS playlist_files (
  playlist_id INT NOT NULL,
  audio_file_id INT NOT NULL,
  position INT NOT NULL,
  CONSTRAINT pk_playlist_files PRIMARY KEY (playlist_id, audio_file_id),
  CONSTRAINT playlist_id FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE,
  CONSTRAINT playlist_audio_file FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE,
  UNIQUE KEY unique_position (playlist_id, position)
);

-- SFX collections
CREATE TABLE
  IF NOT EXISTS sfx_collections (
    collection_id INT AUTO_INCREMENT PRIMARY KEY,
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
    delay INT DEFAULT 0,
    volume FLOAT DEFAULT 1.0,
    CONSTRAINT pk_sfx_macro_files PRIMARY KEY (macro_id, audio_file_id),
    CONSTRAINT fk_macro_id FOREIGN KEY (macro_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE,
    CONSTRAINT fk_macro_audio_file FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

-- SFX collections contain files and macros.
CREATE TABLE
  IF NOT EXISTS sfx_collection_files (
    sfx_collection_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    position INT NOT NULL,
    default_volume FLOAT DEFAULT 1.0,
    PRIMARY KEY (sfx_collection_id, audio_file_id),
    FOREIGN KEY (sfx_collection_id) REFERENCES sfx_collections (collection_id) ON DELETE CASCADE,
    FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS sfx_collection_macros (
    sfx_collection_id INT NOT NULL,
    macro_id INT NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (sfx_collection_id, macro_id),
    FOREIGN KEY (sfx_collection_id) REFERENCES sfx_collections (collection_id) ON DELETE CASCADE,
    FOREIGN KEY (macro_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE
  );

-- Ambience collections
CREATE TABLE
  IF NOT EXISTS ambience_collections (
    collection_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT
  );

CREATE TABLE
  IF NOT EXISTS ambience_collection_files (
    ambience_collection_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    position INT NOT NULL,
    default_volume FLOAT DEFAULT 1.0,
    PRIMARY KEY (ambience_collection_id, audio_file_id),
    FOREIGN KEY (ambience_collection_id) REFERENCES ambience_collections (collection_id) ON DELETE CASCADE,
    FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

-- Audio packs - contain playlists, sfx macros, and ambience collections
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
    CONSTRAINT fk_playlist_id FOREIGN KEY (playlist_id) REFERENCES playlists (playlist_id) ON DELETE CASCADE
  );

CREATE TABLE 
  IF NOT EXISTS audio_pack_ambience_collections (
    pack_id INT NOT NULL,
    ambience_collection_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_ambience_collections PRIMARY KEY (pack_id, ambience_collection_id),
    CONSTRAINT fk_pack_ambience FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_ambience_collection_id FOREIGN KEY (ambience_collection_id) REFERENCES ambience_collections (collection_id) ON DELETE CASCADE
  );

CREATE TABLE 
  IF NOT EXISTS audio_pack_sfx_collections (
    pack_id INT NOT NULL,
    sfx_collection_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_sfx_collections PRIMARY KEY (pack_id, sfx_collection_id),
    CONSTRAINT fk_pack_sfx FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_sfx_collection_id FOREIGN KEY (sfx_collection_id) REFERENCES sfx_collections (collection_id) ON DELETE CASCADE
  );

-- Create base folders
INSERT INTO folders (name, folder_type) VALUES ('audio', 'root');
INSERT INTO folders (name, folder_type, parent_folder_id) VALUES ('music', 'music', 1);
INSERT INTO folders (name, folder_type, parent_folder_id) VALUES ('sfx', 'sfx', 1);
INSERT INTO folders (name, folder_type, parent_folder_id) VALUES ('ambience', 'ambience', 1);