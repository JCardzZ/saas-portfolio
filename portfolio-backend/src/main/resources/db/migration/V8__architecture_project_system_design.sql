-- Diseño de sistema de un proyecto del Estudio: lo que va encima de su infraestructura (la vista
-- de Aplicación, dónde se despliega cada pieza y los requisitos no funcionales). Es opcional: un
-- proyecto anterior, o uno que solo es infraestructura, lo tiene a NULL.
ALTER TABLE architecture_projects ADD COLUMN system_json TEXT;
