import {
  plotFormula, MAX_FORMULA_LENGTH, SAMPLE_COUNT,
} from '../src/plot-plugin/math/evaluator';

describe('Formula evaluation', () => {
  // Behaviour 1
  describe('Given a valid formula', () => {
    it('When sin(x) is evaluated, then it returns 500 points with finite y-values', () => {
      const result = plotFormula('sin(x)');
      if (!result.ok) throw new Error(result.error);
      expect(result.x).toHaveLength(SAMPLE_COUNT);
      expect(result.y).toHaveLength(SAMPLE_COUNT);
      expect(result.y.every((y) => typeof y === 'number' && Number.isFinite(y))).toBe(true);
      expect(result.x[0]).toBe(-10);
      expect(result.x[SAMPLE_COUNT - 1]).toBe(10);
    });

    it('When the formula is written as "y = ...", then the "y =" prefix is accepted', () => {
      const result = plotFormula('y = 2x^2 + 1');
      if (!result.ok) throw new Error(result.error);
      expect(result.y[0]).toBeCloseTo(201);
    });

    it('When the formula uses every allowed function and constant, then it evaluates', () => {
      const result = plotFormula('sin(x) + cos(x) + tan(x) + log(abs(x) + 1) + exp(x / 10) + sqrt(abs(x)) + pow(x, 2) + pi + e');
      expect(result.ok).toBe(true);
    });

    it('When the formula is undefined at some x, then those points become gaps (null)', () => {
      const result = plotFormula('sqrt(x)');
      if (!result.ok) throw new Error(result.error);
      expect(result.y[0]).toBeNull();
      expect(result.y[SAMPLE_COUNT - 1]).toBeCloseTo(Math.sqrt(10));
    });

    it('When the result divides by zero, then that point becomes a gap', () => {
      const result = plotFormula('1 / (x - 10)');
      if (!result.ok) throw new Error(result.error);
      expect(result.y[SAMPLE_COUNT - 1]).toBeNull();
    });
  });

  // Behaviour 2
  describe('Given an unsafe or invalid formula', () => {
    it.each([
      ['import({}, {override: true})'],
      ['createUnit("foo")'],
      ['evaluate("1+1")'],
      ['parse("x")'],
      ['simplify("x")'],
    ])('When %s is evaluated, then it is rejected', (input) => {
      const result = plotFormula(input);
      expect(result.ok).toBe(false);
    });

    it(`When the formula is longer than ${MAX_FORMULA_LENGTH} characters, then it is rejected`, () => {
      const result = plotFormula('x+'.repeat(MAX_FORMULA_LENGTH));
      expect(result).toEqual({ ok: false, error: expect.stringMatching(/too long/i) });
    });

    it('When the formula uses an unknown variable, then it is rejected with a message naming it', () => {
      const result = plotFormula('x + z');
      expect(result).toEqual({ ok: false, error: expect.stringContaining('z') });
    });

    it('When the formula is empty, then it is rejected', () => {
      expect(plotFormula('   ').ok).toBe(false);
    });

    it('When the formula has a syntax error, then it is rejected with a message', () => {
      const result = plotFormula('sin(x');
      expect(result.ok).toBe(false);
    });

    it('When the input is not a string, then it is rejected instead of throwing', () => {
      expect(plotFormula(42 as unknown as string).ok).toBe(false);
    });

    it('When the formula tries property access, then it is rejected', () => {
      expect(plotFormula('x.constructor').ok).toBe(false);
    });
  });

  // Behaviour 3 (revised: heavy formulas are rejected before evaluation)
  describe('Given a formula that could cause heavy computation', () => {
    it.each([
      ['range', '1:1e9'],
      ['matrix', '[1, 2, 3] * x'],
      ['function definition', 'f(x) = f(x)'],
      ['variable assignment', 'a = 5'],
      ['multiple statements', 'x; x'],
      ['conditional', 'x > 0 ? x : -x'],
    ])('When it contains a %s, then it is rejected without running', (_label, input) => {
      expect(plotFormula(input).ok).toBe(false);
    });
  });
});
