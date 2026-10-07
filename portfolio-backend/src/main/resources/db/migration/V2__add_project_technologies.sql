-- Create join table for projects and technologies
CREATE TABLE IF NOT EXISTS project_technologies (
    project_id VARCHAR(64) REFERENCES projects(id) ON DELETE CASCADE,
    technology_id VARCHAR(64) REFERENCES technologies(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, technology_id)
);
