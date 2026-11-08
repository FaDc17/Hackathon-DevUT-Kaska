import { getDatabase } from '../connection';

export type HelpChannel = {
  id: string;
  name: string;
  type: string;
  phone: string;
  description: string;
  address?: string;
  coverage: string;
};

export async function listChannels(district?: string): Promise<HelpChannel[]> {
  const db = await getDatabase();
  const whereDistrict = district ? `
    AND (
      c.Cobertura = 'Nacional'
      OR d.NombreDistrito COLLATE NOCASE = ?
      OR d.NombreDistrito COLLATE NOCASE LIKE '%' || ? || '%'
    )` : '';
  const result = await db.query(`
    SELECT c.IdCanal, c.NombreInstitucion, c.TipoAyuda, c.Telefono, c.Descripcion,
           c.Direccion, c.Cobertura, d.NombreDistrito
    FROM CanalesAyuda c
    LEFT JOIN Distritos d ON d.IdDistrito = c.IdDistrito
    WHERE c.Eliminado = 0 AND c.Estado = 1
    ${whereDistrict}
    ORDER BY c.NombreInstitucion;
  `, district ? [district, district] : []);
  return (result.values ?? []).map((row) => ({
    id: String(row.IdCanal),
    name: String(row.NombreInstitucion),
    type: String(row.TipoAyuda),
    phone: String(row.Telefono),
    description: String(row.Descripcion || ''),
    address: row.Direccion ? String(row.Direccion) : undefined,
    coverage: String(row.Cobertura),
  }));
}
