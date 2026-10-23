import {
  create, parseDependencies, addDependencies, subtractDependencies, multiplyDependencies,
  divideDependencies, powDependencies, unaryMinusDependencies, unaryPlusDependencies,
  sinDependencies, cosDependencies, tanDependencies, logDependencies, expDependencies,
  sqrtDependencies, absDependencies, piDependencies, eDependencies, MathNode,
} from 'mathjs';

export const MAX_FORMULA_LENGTH = 200;
export const MAX_FORMULA_NODES = 100;
export const SAMPLE_COUNT = 500;
export const X_MIN = -10;
export const X_MAX = 10;

export type PlotResult =
  | { ok: true; x: number[]; y: (number | null)[] }
  | { ok: false; error: string };

// A minimal mathjs instance: only the functions below exist in it, so
// import/createUnit/evaluate/parse etc. cannot be reached from a formula.
const math = create({
  parseDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  powDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  logDependencies,
  expDependencies,
  sqrtDependencies,
  absDependencies,
  piDependencies,
  eDependencies,
});

const ALLOWED_FUNCTIONS = new Set(['sin', 'cos', 'tan', 'log', 'exp', 'sqrt', 'abs', 'pow']);
const ALLOWED_SYMBOLS = new Set(['x', 'pi', 'e']);
const ALLOWED_OPERATORS = new Set(['add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus']);

// Whitelist of expression-tree node types. Anything else (ranges, matrices,
// assignments, function definitions, property access, conditionals, multiple
// statements) is rejected before evaluation, so a formula cannot loop or
// allocate unbounded memory: evaluation cost is nodes x SAMPLE_COUNT.
function checkNode(node: MathNode): string | null {
  switch (node.type) {
    case 'ConstantNode':
      return typeof (node as MathNode & { value: unknown }).value === 'number'
        ? null : 'Only numbers are allowed as constants.';
    case 'SymbolNode': {
      const { name } = node as MathNode & { name: string };
      return ALLOWED_SYMBOLS.has(name) ? null : `Unknown variable "${name}". Use x.`;
    }
    case 'OperatorNode': {
      const { fn } = node as MathNode & { fn: string };
      return ALLOWED_OPERATORS.has(fn) ? null : 'Only + - * / ^ are allowed.';
    }
    case 'ParenthesisNode':
      return null;
    case 'FunctionNode': {
      const { fn } = node as MathNode & { fn: MathNode };
      const name = fn.type === 'SymbolNode' ? (fn as MathNode & { name: string }).name : '';
      return ALLOWED_FUNCTIONS.has(name) ? null : `Function "${name || '?'}" is not allowed.`;
    }
    default:
      return 'This kind of expression is not allowed.';
  }
}

function validate(root: MathNode): string | null {
  let count = 0;
  let error: string | null = null;
  root.traverse((node, path, parent) => {
    count += 1;
    if (error) return;
    // The name of a function call is a SymbolNode child; it is checked by the FunctionNode.
    if (parent?.type === 'FunctionNode' && path === 'fn') return;
    error = checkNode(node);
  });
  if (error) return error;
  if (count > MAX_FORMULA_NODES) return 'Formula is too complex.';
  return null;
}

// Accepts both "sin(x)" and "y = sin(x)".
export function stripYPrefix(input: string): string {
  return input.trim().replace(/^y\s*=\s*/i, '');
}

export function plotFormula(input: string): PlotResult {
  if (typeof input !== 'string') return { ok: false, error: 'Formula must be text.' };
  if (input.length > MAX_FORMULA_LENGTH) {
    return { ok: false, error: `Formula is too long (maximum ${MAX_FORMULA_LENGTH} characters).` };
  }
  const expr = stripYPrefix(input);
  if (!expr) return { ok: false, error: 'Enter a formula in x, for example sin(x).' };

  let root: MathNode;
  try {
    root = math.parse(expr);
  } catch (e) {
    return { ok: false, error: `Could not read formula: ${(e as Error).message}` };
  }

  const problem = validate(root);
  if (problem) return { ok: false, error: problem };

  const compiled = root.compile();
  const x: number[] = [];
  const y: (number | null)[] = [];
  const step = (X_MAX - X_MIN) / (SAMPLE_COUNT - 1);
  for (let i = 0; i < SAMPLE_COUNT; i += 1) {
    const xi = i === SAMPLE_COUNT - 1 ? X_MAX : X_MIN + i * step;
    let yi: unknown;
    try {
      yi = compiled.evaluate({ x: xi });
    } catch {
      yi = null;
    }
    x.push(xi);
    // Complex results (e.g. sqrt of a negative) and infinities become gaps.
    y.push(typeof yi === 'number' && Number.isFinite(yi) ? yi : null);
  }
  return { ok: true, x, y };
}
