-- Create base folders (seed data)
INSERT IGNORE INTO audio.folders (id, name, folder_type) VALUES (1, 'audio', 'root');
INSERT IGNORE INTO audio.folders (id, name, folder_type, parent_id) VALUES (2, 'music', 'music', 1);
INSERT IGNORE INTO audio.folders (id, name, folder_type, parent_id) VALUES (3, 'sfx', 'sfx', 1);
INSERT IGNORE INTO audio.folders (id, name, folder_type, parent_id) VALUES (4, 'ambience', 'ambience', 1);
INSERT IGNORE INTO audio.folders (id, name, folder_type, parent_id) VALUES (5, 'upload', 'any', 1);
