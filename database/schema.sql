CREATE DATABASE IF NOT EXISTS securevoteai;
USE securevoteai;

CREATE TABLE IF NOT EXISTS voters (
    voter_id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT NOT NULL,
    gender VARCHAR(10),
    address TEXT,
    has_voted BOOLEAN DEFAULT FALSE,
    is_eligible BOOLEAN NOT NULL DEFAULT TRUE,
    face_encoding LONGTEXT,              -- ENCRYPTED embedding (never raw images)
    face_registered_at TIMESTAMP NULL,
    registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS candidates (
    candidate_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    party VARCHAR(100) NOT NULL,
    symbol VARCHAR(10),
    vote_count INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    voter_id VARCHAR(20),
    action VARCHAR(200),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT IGNORE INTO candidates (name, party, symbol) VALUES
('Candidate A', 'Party Alpha', '🌟'),
('Candidate B', 'Party Beta', '🌙'),
('Candidate C', 'Party Gamma', '⭐');
