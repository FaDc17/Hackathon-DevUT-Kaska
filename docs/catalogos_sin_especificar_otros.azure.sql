/* PREPARADO, NO EJECUTADO. Revisar y autorizar antes de @Aplicar=1.
   No cambia esquema ni IDs existentes. La provincia es texto, no tiene PK propia.
   Cada distrito especial recibe el IDENTITY central; SQLite lo recibe por la API.
   Las provincias se derivan de Distritos. Provincias que nunca tuvieron ninguna fila no
   pueden descubrirse con el esquema actual; solo se puede crear el valor parcial por departamento.
*/
SET XACT_ABORT ON;
DECLARE @Aplicar bit = 0;
DECLARE @Especial nvarchar(100) = N'Sin especificar';
DECLARE @Objetivos table (IdDepartamento int, NombreProvincia nvarchar(100));
INSERT INTO @Objetivos (IdDepartamento, NombreProvincia)
SELECT DISTINCT IdDepartamento, LTRIM(RTRIM(NombreProvincia))
FROM dbo.Distritos
WHERE NULLIF(LTRIM(RTRIM(NombreProvincia)), N'') IS NOT NULL
UNION
SELECT IdDepartamento, @Especial FROM dbo.Departamentos;

SELECT o.*, @Especial AS NombreDistrito FROM @Objetivos o
WHERE NOT EXISTS (SELECT 1 FROM dbo.Distritos d WHERE d.IdDepartamento=o.IdDepartamento
 AND LTRIM(RTRIM(d.NombreProvincia))=o.NombreProvincia
 AND LTRIM(RTRIM(d.NombreDistrito))=@Especial);
SELECT N'Otros' AS CategoriaFaltante WHERE NOT EXISTS
 (SELECT 1 FROM dbo.CategoriasServicio WHERE NombreCategoria=N'Otros');

IF @Aplicar=1
BEGIN
 IF ISNULL(COLUMNPROPERTY(OBJECT_ID(N'dbo.Distritos'),N'IdDistrito','IsIdentity'),0)<>1
 OR ISNULL(COLUMNPROPERTY(OBJECT_ID(N'dbo.CategoriasServicio'),N'IdCategoria','IsIdentity'),0)<>1
  THROW 50001, 'Revisar IDENTITY central: no se asignaran IDs manuales.', 1;
 BEGIN TRANSACTION;
 INSERT INTO dbo.Distritos (IdDepartamento,NombreProvincia,NombreDistrito)
 SELECT DISTINCT o.IdDepartamento,o.NombreProvincia,@Especial FROM @Objetivos o
 WHERE NOT EXISTS (SELECT 1 FROM dbo.Distritos d WITH (UPDLOCK,HOLDLOCK)
  WHERE d.IdDepartamento=o.IdDepartamento
  AND LTRIM(RTRIM(d.NombreProvincia))=o.NombreProvincia
  AND LTRIM(RTRIM(d.NombreDistrito))=@Especial);
 IF EXISTS (
  SELECT 1 FROM @Objetivos o
  WHERE (SELECT COUNT(*) FROM dbo.Distritos d
   WHERE d.IdDepartamento=o.IdDepartamento
    AND LTRIM(RTRIM(d.NombreProvincia))=o.NombreProvincia
    AND LTRIM(RTRIM(d.NombreDistrito))=@Especial)<>1
 )
  THROW 50002, 'El catálogo especial no quedó único; se revierte la operación.', 1;
 INSERT INTO dbo.CategoriasServicio (NombreCategoria,Descripcion)
 SELECT N'Otros',N'Servicios que no corresponden a las demás categorías'
 WHERE NOT EXISTS (SELECT 1 FROM dbo.CategoriasServicio WITH (UPDLOCK,HOLDLOCK)
  WHERE NombreCategoria=N'Otros');
 COMMIT TRANSACTION;
END;
SELECT IdDistrito,IdDepartamento,NombreProvincia,NombreDistrito FROM dbo.Distritos
WHERE NombreDistrito=@Especial ORDER BY IdDepartamento,NombreProvincia;
SELECT IdCategoria,NombreCategoria FROM dbo.CategoriasServicio WHERE NombreCategoria=N'Otros';
