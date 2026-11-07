import { describe, expect, it } from 'vitest';
import { defaultPriceRange } from '../data/demo';
import type { Service } from '../types';
import { getServicePriceLabel } from './services';

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
