import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import PlotPlugin from './plot-plugin/component';

const uuid = document.currentScript?.getAttribute('uuid') || 'root';

const root = ReactDOM.createRoot(document.getElementById(uuid)!);
root.render(<PlotPlugin pluginUuid={uuid} />);
