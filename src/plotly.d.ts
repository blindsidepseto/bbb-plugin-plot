// Minimal typing for the parts of the plotly.js basic bundle the plugin uses.
declare module 'plotly.js-basic-dist-min' {
  const Plotly: {
    react: (
      element: HTMLElement,
      data: object[],
      layout?: object,
      config?: object,
    ) => Promise<unknown>;
    purge: (element: HTMLElement) => void;
  };
  export default Plotly;
}
