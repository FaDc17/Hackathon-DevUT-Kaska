import { getDatabase } from '../connection';
import { readRemoteList } from '../../services/remoteRead';

export type HelpChannel = {
  id: string;
  name: string;
  type: string;
  phone: string;
  description: string;
  address?: string;
  coverage: string;
};

type RemoteHelpChannel = {
  id: string;
  nombreInstitucion: string;
  tipoAyuda: string;
  telefono: string;
  descripcion: string | null;
  direccion: string | null;
  cobertura: string;
};

export async function listChannels(district?: string): Promise<HelpChannel[]> {
  const db = await getDatabase();
  let districtId: number | undefined;
  if (district) {
    const localDistrict = await db.query(
      'SELECT IdDistrito FROM Distritos WHERE NombreDistrito COLLATE NOCASE = ? LIMIT 1;',
      [district],
    );
    const id = localDistrict.values?.[0]?.IdDistrito;
    if (id !== undefined) districtId = Number(id);
  }
  if (!district || districtId !== undefined) {
    const query = districtId === undefined ? '' : `?distritoId=${districtId}`;
    const remoteChannels = await readRemoteList<RemoteHelpChannel>(
      `/api/catalogos/canales-ayuda${query}`,
    );
    if (remoteChannels) {
      return remoteChannels.map((channel) => ({
        id: channel.id,
        name: channel.nombreInstitucion,
        type: channel.tipoAyuda,
        phone: channel.telefono,
        description: channel.descripcion || '',
        address: channel.direccion || undefined,
        coverage: channel.cobertura,
      }));
    }
  }

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
