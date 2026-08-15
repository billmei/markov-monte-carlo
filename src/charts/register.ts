/**
 * Chart.js registration. Imported once from `main.tsx`.
 *
 * Registering explicitly rather than pulling in `chart.js/auto` keeps the
 * bundle to the controllers and scales actually used.
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Decimation,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Decimation,
  Tooltip,
  Legend,
);
