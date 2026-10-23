import * as React from 'react';
import { render } from '@testing-library/react';
import Plotly from 'plotly.js-basic-dist-min';
import PlotView from '../src/plot-plugin/ui/PlotView';

describe('Plot axes', () => {
  it('Given Plotly changed the layout it was given (e.g. after a zoom), when the formula changes, then x still runs from -10 to 10', () => {
    const react = Plotly.react as jest.Mock;
    react.mockClear();
    const { rerender } = render(<PlotView expr="x" />);
    // Plotly writes into the layout object it receives.
    react.mock.calls[0][2].xaxis.range = [2, 3];
    rerender(<PlotView expr="x^2" />);
    expect(react.mock.calls[1][2].xaxis.range).toEqual([-10, 10]);
  });
});
