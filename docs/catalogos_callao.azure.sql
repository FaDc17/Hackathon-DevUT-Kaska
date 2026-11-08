/* Propuesta aditiva para revisión; NO ejecutada contra Azure SQL.
   Fuente oficial consultada el 2026-11-08:
   https://identidad.reniec.gob.pe/b/reniec-provincia-constitucional-del-callao-registra-867-525-electores-para-las-elecciones-regionales-y-municipales
   Contraste INEI: https://www.inei.gob.pe/media/MenuRecursivo/publicaciones_digitales/Est/Lib1696/libro.pdf (tabla 1.2).
   No modifica schema, no elimina registros y conserva todos los IDs existentes.
   @Aplicar=0 solamente presenta faltantes. Cambiar a 1 después de revisión del equipo.
   Aplicar primero al catálogo central; Android recibe los mismos IDs mediante /api/catalogos/distritos.
   NO copiar IDs inventados ni ejecutar una semilla SQLite independiente.
*/
SET XACT_ABORT ON;
DECLARE @Aplicar bit = 0;
DECLARE @IdCallao int;
IF (SELECT COUNT(*) FROM dbo.Departamentos WHERE NombreDepartamento COLLATE Latin1_General_100_CI_AI = N'Callao') <> 1
    THROW 50001, 'El departamento Callao debe existir exactamente una vez. Revisar antes de cargar.', 1;
SELECT @IdCallao = IdDepartamento FROM dbo.Departamentos WHERE NombreDepartamento COLLATE Latin1_General_100_CI_AI = N'Callao';
DECLARE @Distritos table (Nombre nvarchar(100) PRIMARY KEY);
INSERT INTO @Distritos (Nombre) VALUES
    (N'Callao'), (N'Bellavista'), (N'Carmen de la Legua Reynoso'),
    (N'La Perla'), (N'La Punta'), (N'Ventanilla'), (N'Mi Perú');
-- No crear una segunda provincia si el equipo ya utiliza otra denominación para Callao.
IF EXISTS (SELECT 1 FROM dbo.Distritos d JOIN @Distritos v ON d.NombreDistrito COLLATE Latin1_General_100_CI_AI = v.Nombre COLLATE Latin1_General_100_CI_AI
           WHERE d.IdDepartamento = @IdCallao AND d.NombreProvincia COLLATE Latin1_General_100_CI_AI <> N'Callao')
    THROW 50002, 'Hay distritos de Callao registrados con otra provincia. Conciliar la denominacion antes de aplicar.', 1;
SELECT @IdCallao AS IdDepartamento, N'Callao' AS NombreProvincia, v.Nombre AS DistritoFaltante
FROM @Distritos v WHERE NOT EXISTS (
    SELECT 1 FROM dbo.Distritos d WHERE d.IdDepartamento=@IdCallao
    AND d.NombreProvincia COLLATE Latin1_General_100_CI_AI=N'Callao'
    AND d.NombreDistrito COLLATE Latin1_General_100_CI_AI=v.Nombre COLLATE Latin1_General_100_CI_AI);
IF @Aplicar = 1
BEGIN
    IF ISNULL(COLUMNPROPERTY(OBJECT_ID(N'dbo.Distritos'), N'IdDistrito', 'IsIdentity'), 0) <> 1
        THROW 50003, 'IdDistrito no tiene IDENTITY confirmado. Revisar el esquema central; no se asignaran IDs manuales.', 1;
    BEGIN TRANSACTION;
    INSERT INTO dbo.Distritos (IdDepartamento, NombreProvincia, NombreDistrito)
    SELECT @IdCallao, N'Callao', v.Nombre FROM @Distritos v WHERE NOT EXISTS (
        SELECT 1 FROM dbo.Distritos d WITH (UPDLOCK, HOLDLOCK) WHERE d.IdDepartamento=@IdCallao
        AND d.NombreProvincia COLLATE Latin1_General_100_CI_AI=N'Callao'
        AND d.NombreDistrito COLLATE Latin1_General_100_CI_AI=v.Nombre COLLATE Latin1_General_100_CI_AI);
    COMMIT TRANSACTION;
END;
SELECT IdDistrito, IdDepartamento, NombreProvincia, NombreDistrito
FROM dbo.Distritos WHERE IdDepartamento=@IdCallao ORDER BY NombreProvincia, NombreDistrito;
