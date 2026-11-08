import { describe, expect, it } from 'vitest';
import { defaultPriceRange } from '../data/demo';
import type { Service } from '../types';
import { getServiceCategoryIcon, getServicePriceLabel } from './services';

describe('getServiceCategoryIcon', () => {
  it('matches gasfitería regardless of accent or catalog spelling', () => {
    expect(getServiceCategoryIcon('Gasfitería')).toBe('drop');
    expect(getServiceCategoryIcon('Gasfiteria')).toBe('drop');
  });

  it('matches electricity to its own icon', () => {
    expect(getServiceCategoryIcon('Electricidad')).toBe('bolt');
  });

  it('recognizes common category variants', () => {
    expect(getServiceCategoryIcon('Servicios de plomería')).toBe('drop');
    expect(getServiceCategoryIcon('Mascotas y veterinaria')).toBe('paw');
  });
});

describe('getServicePriceLabel', () => {
  it('preserves a valid displayed price label', () => {
    const service = { priceLabel: '15 Bs' } as Service;
    expect(getServicePriceLabel(service)).toBe('15 Bs');
  });

  it('uses the default range when the service has no final price', () => {
    const service = { priceLabel: 'Actualizar precio' } as Service;
    expect(getServicePriceLabel(service)).toBe(defaultPriceRange.label);
  });
});
