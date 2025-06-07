-- 1) Create each schema
CREATE DATABASE IF NOT EXISTS core;
CREATE DATABASE IF NOT EXISTS dnd5e;
CREATE DATABASE IF NOT EXISTS audio;

USE core;
SOURCE core/01_users.sql;
SOURCE core/02_systems.sql;
SOURCE core/03_characters.sql;
SOURCE core/04_encounters.sql;

USE dnd5e;
SOURCE dnd5e/01_conditions.sql;
SOURCE dnd5e/02_damage_types.sql;
SOURCE dnd5e/03_characters.sql;
SOURCE dnd5e/04_encounters.sql;

USE audio;
SOURCE audio/01_folders.sql;
SOURCE audio/02_files.sql;
SOURCE audio/03_collections.sql;
SOURCE audio/04_sfx_macros.sql;
SOURCE audio/05_packs.sql;
SOURCE audio/06_seed_folders.sql;
