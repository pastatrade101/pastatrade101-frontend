// Tree-shaken ECharts barrel.
//
// Importing all of `echarts` costs ~1.0 MB raw / ~328 KB gzip — it was the
// single largest chunk in the client build. Every dashboard chart in this app
// is a cartesian LINE chart, so we register only the pieces we actually use.
//
// If you add a new chart type (bar, candlestick, gauge, pie, heatmap…) or a new
// component (toolbox, visualMap, graphic…), REGISTER IT HERE — otherwise the
// chart silently renders blank. That single line is the whole cost of the diet.

import * as echarts from 'echarts/core';
import { LineChart, GaugeChart, BarChart, RadarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  MarkLineComponent,
  MarkAreaComponent,
  MarkPointComponent,
  AxisPointerComponent,
  DataZoomComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  // charts
  LineChart, // every time-series chart in the app
  GaugeChart, // the speedometer risk gauges (Gauge.svelte)
  BarChart, // DCA-by-weekday, seasonality, diverging + ranked horizontal bars
  RadarChart, // multi-factor risk shape (exit strategy, token radar)
  // components, per the call-site inventory
  GridComponent, // cartesian grid + xAxis/yAxis (incl. time & log axes)
  TooltipComponent,
  AxisPointerComponent, // tooltip trigger: 'axis'
  LegendComponent,
  TitleComponent,
  MarkLineComponent, // threshold lines (risk bands, fair value)
  MarkAreaComponent, // regime shading (altcoin season, cycle zones)
  MarkPointComponent, // the "Now" dot on log regression
  DataZoomComponent, // range brushing on long time series
  CanvasRenderer
]);

export default echarts;
export type { EChartsCoreOption } from 'echarts/core';
