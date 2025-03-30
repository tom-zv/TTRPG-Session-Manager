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
    CONSTRAINT fk_dm_creatures_dm_user_id FOREIGN KEY (dm_user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_dm_creatures_creature_id FOREIGN KEY (creature_id) REFERENCES creatures (creature_id) ON DELETE CASCADE
  );

-- -------- --
-- Audio DB --
-- -------- --
CREATE TABLE
  IF NOT EXISTS folders (
    folder_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    parent_folder_id INT,
    folder_type ENUM ('music', 'sfx', 'ambience', 'root') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_folders_parent_folder_id FOREIGN KEY (parent_folder_id) REFERENCES folders (folder_id) ON DELETE CASCADE
  );

CREATE TABLE
  IF NOT EXISTS audio_files (
    audio_file_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    audio_type ENUM ('music', 'sfx', 'ambience') NOT NULL DEFAULT 'music',
    duration INT,
    file_url VARCHAR(256),
    file_path VARCHAR(256),
    folder_id INT,
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audio_files_folder_id FOREIGN KEY (folder_id) REFERENCES folders (folder_id) ON DELETE SET NULL
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
    collection_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    tag VARCHAR(64) NOT NULL,
    delay INT DEFAULT 0,
    volume FLOAT DEFAULT 1.0,
    CONSTRAINT pk_sfx_macro_files PRIMARY KEY (collection_id, audio_file_id),
    CONSTRAINT fk_sfx_macro_files_macro_id FOREIGN KEY (collection_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE,
    CONSTRAINT fk_sfx_macro_files_audio_file_id FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

-- Collections
CREATE TABLE
  collections (
    collection_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    description TEXT,
    type ENUM ('playlist', 'sfx', 'ambience') NOT NULL
  );

CREATE TABLE
  collection_files (
    collection_id INT NOT NULL,
    audio_file_id INT NOT NULL,
    active BOOLEAN DEFAULT TRUE,
    position INT NOT NULL,
    volume FLOAT DEFAULT 1,  
    PRIMARY KEY (collection_id, audio_file_id),
    FOREIGN KEY (collection_id) REFERENCES collections (collection_id) ON DELETE CASCADE,
    FOREIGN KEY (audio_file_id) REFERENCES audio_files (audio_file_id) ON DELETE CASCADE
  );

CREATE TABLE 
  collection_sfx_macros (
    collection_id INT NOT NULL,
    macro_id INT NOT NULL,
    position INT NOT NULL,
    PRIMARY KEY (collection_id, macro_id),
    FOREIGN KEY (collection_id) REFERENCES collections (collection_id) ON DELETE CASCADE,
    FOREIGN KEY (macro_id) REFERENCES sfx_macros (macro_id) ON DELETE CASCADE
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
  IF NOT EXISTS audio_pack_collections (
    pack_id INT NOT NULL,
    collection_id INT NOT NULL,
    CONSTRAINT pk_audio_pack_collections PRIMARY KEY (pack_id, collection_id),
    CONSTRAINT fk_audio_pack_id FOREIGN KEY (pack_id) REFERENCES audio_packs (pack_id) ON DELETE CASCADE,
    CONSTRAINT fk_audio_collection_id FOREIGN KEY (collection_id) REFERENCES collections (collection_id) ON DELETE CASCADE
  );

-- Create base folders
INSERT INTO
  folders (name, folder_type)
VALUES
  ('audio', 'root');

INSERT INTO
  folders (name, folder_type, parent_folder_id)
VALUES
  ('music', 'music', 1);

INSERT INTO
  folders (name, folder_type, parent_folder_id)
VALUES
  ('sfx', 'sfx', 1);

INSERT INTO
  folders (name, folder_type, parent_folder_id)
VALUES
  ('ambience', 'ambience', 1);