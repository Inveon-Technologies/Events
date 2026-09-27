import { validateMaxPerBooking, ValidationError } from '../src/services/eventCreation';

describe('validateMaxPerBooking', () => {
  const tier = (maxPerBooking?: number) => ({ name: 'General', price: 100, quantity: 20, maxPerBooking });

  it('accepts a missing value (keeps the default) and whole numbers from 1 to 50', () => {
    expect(() => validateMaxPerBooking(tier())).not.toThrow();
    expect(() => validateMaxPerBooking(tier(1))).not.toThrow();
    expect(() => validateMaxPerBooking(tier(50))).not.toThrow();
  });

  it('rejects zero, fractions, NaN and values above the limit', () => {
    for (const bad of [0, 2.5, NaN, 51, -3]) {
      expect(() => validateMaxPerBooking(tier(bad))).toThrow(ValidationError);
    }
  });
});
