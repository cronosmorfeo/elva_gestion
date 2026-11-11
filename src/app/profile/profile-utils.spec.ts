import { seniority, toProfile } from './profile-utils';

describe('profile', () => {
  it('shows the saved data with readable labels', () => {
    expect(
      toProfile({
        nombre: 'Jimmy',
        correo: 'jimmy1@gmail.com',
        tipo_colaborador: 'regular',
        pais: 'CR',
        fechaIngreso: '2025-12-01',
        jornada: 'medio',
        horarioLaborado: '7:00 a. m. - 4:00 p. m.',
        salario: 1000000,
        moneda: 'CRC',
        activo: true,
      }),
    ).toEqual({
      name: 'Jimmy',
      email: 'jimmy1@gmail.com',
      role: 'Trabajador',
      country: 'Costa Rica',
      startDate: '2025-12-01',
      schedule: 'Medio tiempo',
      hours: '7:00 a. m. - 4:00 p. m.',
      salary: '₡1.000.000',
      active: true,
    });
  });

  it('fills missing data with a dash', () => {
    const p = toProfile({});
    expect(p?.name).toBe('—');
    expect(p?.salary).toBe('—');
    expect(p?.startDate).toBe('');
    expect(toProfile(undefined)).toBeNull();
  });

  it('says how long the person has worked at ELVA', () => {
    expect(seniority('2025-09-15', '2026-11-11')).toBe('1 año y 1 mes');
    expect(seniority('2026-08-11', '2026-11-11')).toBe('3 meses');
    expect(seniority('2026-11-01', '2026-11-11')).toBe('Menos de un mes');
    expect(seniority('2026-12-01', '2026-11-11')).toBe('Empieza el martes 1 de diciembre de 2026');
    expect(seniority('', '2026-11-11')).toBe('');
  });
});
