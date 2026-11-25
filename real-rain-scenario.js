// Registers the real NASA POWER storm (26 Aug – 8 Sep 2022) as a flood case in gate-types.js.
// Inflow = hourly rain (mm/h) × catchment area × runoff coefficient, linearly interpolated between hours.
(function (root) {
  function register(GT, RAIN) {
    const name = 'Real rain: 26 Aug – 8 Sep 2022 (NASA POWER)';
    const f = RAIN.catchment.km2 * 1e6 * RAIN.catchment.runoff / 1000 / 3600; // m³/s per mm/h
    const rainAt = t => { const h = t / 3600, i = Math.floor(h), u = h - i, a = RAIN.hourly[i] || 0, b = RAIN.hourly[i + 1] || 0; return a + (b - a) * u; };
    GT.SCENARIOS[name] = {
      note: 'Real hourly rainfall from NASA POWER (MERRA-2, satellite-assimilated) for east Bengaluru, after a record-wet August. Lakes start full. Runs 14 days of simulated time.',
      lakeStart: 1.55, drainStart: 0.5, dur: RAIN.hourly.length * 3600, real: true,
      inflow: t => 0.15 + f * rainAt(t), lateral: t => 0.1 + 0.3 * f * rainAt(t), river: () => 0.6
    };
    GT.REAL_SCENARIO = name;
    return name;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = register; else root.RealRainScenario = register;
})(typeof globalThis !== 'undefined' ? globalThis : this);
