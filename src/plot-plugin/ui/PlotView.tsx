import * as React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import Plotly from 'plotly.js-basic-dist-min';
import {
  plotFormula, stripYPrefix, X_MIN, X_MAX,
} from '../math/evaluator';

interface PlotViewProps {
  expr: string;
}

// A new object per call: Plotly writes into the layout it is given (e.g. on zoom).
const makeLayout = () => ({
  margin: {
    l: 40, r: 16, t: 16, b: 32,
  },
  xaxis: { range: [X_MIN, X_MAX], zeroline: true },
  yaxis: { zeroline: true },
  showlegend: false,
  autosize: true,
});

const CONFIG = { displayModeBar: false, responsive: true };

function PlotView({ expr }: PlotViewProps): React.ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const result = useMemo(() => plotFormula(expr), [expr]);

  useEffect(() => {
    if (!container.current || !result.ok) return;
    Plotly.react(container.current, [{
      x: result.x, y: result.y, type: 'scatter', mode: 'lines', connectgaps: false,
    }], makeLayout(), CONFIG);
  }, [result]);

  useEffect(() => {
    const element = container.current;
    return () => { if (element) Plotly.purge(element); };
  }, []);

  return (
    <figure style={{ margin: 0, flex: 1, minHeight: 0 }}>
      <div
        ref={container}
        style={{ width: '100%', height: '100%', display: result.ok ? 'block' : 'none' }}
      />
      {result.ok
        ? <figcaption>{`y = ${stripYPrefix(expr)}`}</figcaption>
        : <p role="alert" style={{ color: '#b00020' }}>{result.error}</p>}
    </figure>
  );
}

export default PlotView;
