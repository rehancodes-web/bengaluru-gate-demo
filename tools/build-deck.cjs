// Builds the Mach-A-Thon presentation for the Bengaluru lake gate project.
const pptxgen = require('pptxgenjs');
const path = require('path');
const RAIN = require(process.argv[2]); // real-rain.js from the demo repo
const OUT = process.argv[3];
const IMG = n => path.join(__dirname, 'img', n);

const C = { bg: '101417', panel: '171C20', panel2: '1E2429', line: '2F383F', ink: 'D6DDE2', mute: '8B98A1', blue: '4AA3FF', green: '9FE0B4', red: 'FF3B3B', amber: 'F0A35E', yellow: 'FFD60A', teal: '2DD4BF', purple: 'C084FC' };
const F = 'Segoe UI', MONO = 'Consolas';
const p = new pptxgen(); p.layout = 'LAYOUT_WIDE'; p.title = 'Bengaluru lake gates: satellite rainfall to gate decisions'; p.company = 'Mach-A-Thon, Aeromania 26';
p.defineSlideMaster({ title: 'M', background: { color: C.bg }, objects: [
  { rect: { x: 0, y: 7.2, w: 13.33, h: 0.3, fill: { color: '0B0E10' } } },
  { text: { text: 'Mach-A-Thon · Aeromania ’26 · Orbit to Economy', options: { x: 0.4, y: 7.2, w: 6, h: 0.3, fontFace: F, fontSize: 9, color: C.mute } } }
], slideNumber: { x: 12.6, y: 7.2, w: 0.5, h: 0.3, fontFace: F, fontSize: 9, color: C.mute } });

const tag = (s, txt, color, x) => s.addText(txt, { x, y: 0.35, w: 1.25, h: 0.32, fontFace: F, fontSize: 10, bold: true, color: '0B0E10', fill: { color }, align: 'center', valign: 'middle', rectRadius: 0.05, shape: p.ShapeType.roundRect });
const title = (s, t, sub) => { s.addText(t, { x: 0.4, y: 0.75, w: 12.5, h: 0.7, fontFace: F, fontSize: 28, bold: true, color: 'FFFFFF' }); if (sub) s.addText(sub, { x: 0.4, y: 1.4, w: 12.5, h: 0.45, fontFace: F, fontSize: 14, color: C.mute }); };
const big = (s, x, y, w, num, label, color) => { s.addShape(p.ShapeType.rect, { x, y, w, h: 1.42, fill: { color: C.panel }, line: { color: C.line } }); s.addText(num, { x: x + 0.15, y: y + 0.08, w: w - 0.3, h: 0.65, fontFace: MONO, fontSize: 28, bold: true, color: color || C.green }); s.addText(label, { x: x + 0.15, y: y + 0.68, w: w - 0.3, h: 0.7, fontFace: F, fontSize: 10.5, color: C.ink, valign: 'top', fit: 'shrink' }); };
const bullets = (s, items, x, y, w, h, size) => s.addText(items.map(t => ({ text: t, options: { bullet: { code: '25A0' }, paraSpaceAfter: 6 } })), { x, y, w, h, fontFace: F, fontSize: size || 14, color: C.ink, valign: 'top', fit: 'shrink' });
const src = (s, t) => s.addText(t, { x: 0.4, y: 6.78, w: 12.5, h: 0.36, fontFace: F, fontSize: 8.5, color: C.mute, valign: 'bottom' });
const shot = (s, img, x, y, w, h) => { s.addShape(p.ShapeType.rect, { x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06, fill: { color: C.line } }); s.addImage({ path: IMG(img), x, y, w, h }); };

// 1. Title
{ const s = p.addSlide({ masterName: 'M' });
  tag(s, 'TRACK A', C.green, 0.4); tag(s, 'TRACK B', C.blue, 1.75); tag(s, 'TRACK C', C.amber, 3.1);
  s.addText('Lake gates that read the sky', { x: 0.4, y: 1.5, w: 12.5, h: 1.1, fontFace: F, fontSize: 44, bold: true, color: 'FFFFFF' });
  s.addText('Satellite-derived rainfall turned into gate decisions for Bengaluru’s 205 lakes: a working control board, physics-based gate models and a build-ready design.', { x: 0.4, y: 2.6, w: 9.2, h: 1.1, fontFace: F, fontSize: 18, color: C.ink });
  big(s, 0.4, 4.2, 2.9, '205', 'lakes mapped, 111 lost water bodies (MOD Foundation data)');
  big(s, 3.45, 4.2, 2.9, '336 h', 'of real hourly rain replayed from NASA POWER (Aug–Sep 2022)', C.blue);
  big(s, 6.5, 4.2, 2.9, '208', 'gates on a live control board (illustrative layout)', C.amber);
  big(s, 9.55, 4.2, 3.35, '1,034', 'automated checks, exact water balance in every run');
  s.addText('Live demo: rehancodes-web.github.io/bengaluru-gate-demo/control.html', { x: 0.4, y: 5.85, w: 12.5, h: 0.4, fontFace: MONO, fontSize: 13, color: C.blue });
  s.addNotes('Bengaluru floods because its lakes, built as a chained tank system, are full when the big storm arrives and their outlets cannot be operated. We built a system that reads satellite rainfall, decides when each lake gate should open, and lets a control room do it safely. All three tracks: real data (A), engineered gate systems (B), and protective control of critical infrastructure (C). ~20 s.'); }

// 2. Problem
{ const s = p.addSlide({ masterName: 'M' });
  title(s, 'Bengaluru floods when full lakes meet a big storm', 'The lakes are connected in chains. When outlets can’t be opened in time, water goes into streets and offices.');
  big(s, 0.4, 2.1, 4.0, '₹225 crore', 'loss claimed by Outer Ring Road companies for one day of flooding, 30 Aug 2022 (association estimate)', C.red);
  big(s, 4.6, 2.1, 4.0, '1,784 acres', 'of recorded lakes already lost to building: about 23% of the water area that once stored storms', C.amber);
  big(s, 8.8, 2.1, 4.1, '~10 lakes', 'had working sluice gates by April 2025, against about 100 proposed; positions are not public', C.yellow);
  bullets(s, ['August 2022 was extremely wet (NASA POWER: 498 mm in the month), so lakes were already full before the September storms.', 'Most outlets are manual or fixed weirs: no level sensing, no remote control, no early release.', 'Releasing too much floods the next lake or ward downstream, so each decision needs data on both sides of the gate.'], 0.4, 3.8, 12.5, 2.4, 15);
  src(s, 'Sources: ORRCA letter to the CM, reported by Deccan Herald / Business Standard (Sep 2022); MOD Foundation “Building a Resilient Bengaluru” (May 2026) via the Bengaluru Water Map; Deccan Herald (Apr 2025); NASA POWER daily PRECTOTCORR, 12.95 N 77.62 E.');
  s.addNotes('Three numbers: one flood day cost the ORR corridor 225 crore by the companies’ own estimate; almost a quarter of recorded lake area is gone; and only about ten lakes have gates. The real issue is timing: lakes were full after a 500 mm August. ~35 s.'); }

// 3. Track A: real data to a decision
{ const s = p.addSlide({ masterName: 'M' }); tag(s, 'TRACK A', C.green, 0.4);
  title(s, 'Read the planet: satellite rainfall → when to open the gates', 'NASA POWER hourly rain (MERRA-2, satellite-assimilated) for east Bengaluru, replayed through a physics model of a lake and its gate.');
  const days = []; for (let d = 0; d < RAIN.hourly.length / 24; d++) days.push(+RAIN.hourly.slice(d * 24, d * 24 + 24).reduce((a, b) => a + b, 0).toFixed(1));
  const labels = days.map((_, d) => (26 + d > 31 ? (26 + d - 31) + ' Sep' : (26 + d) + ' Aug'));
  s.addChart(p.ChartType.bar, [{ name: 'Daily rain (mm)', labels, values: days }], { x: 0.4, y: 2.0, w: 6.4, h: 3.6, barDir: 'col', chartColors: ['3A8DB5'], catAxisLabelColor: C.mute, valAxisLabelColor: C.mute, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, valGridLine: { color: '232B31', size: 0.5 }, catGridLine: { style: 'none' }, showTitle: true, title: 'Daily rain, 26 Aug – 8 Sep 2022 (mm)', titleColor: C.ink, titleFontSize: 12, showLegend: false, plotArea: { fill: { color: C.panel } } });
  const r = RAIN.replay, row = (a, b, c, col) => [{ text: a, options: { color: C.ink } }, { text: b, options: { color: col || C.ink, fontFace: MONO } }, { text: c, options: { color: col || C.ink, fontFace: MONO } }];
  s.addTable([
    [{ text: 'Replay, 6 ha lake', options: { bold: true, color: C.mute } }, { text: 'Peak level 4–6 Sep', options: { bold: true, color: C.mute } }, { text: 'Water over the bank', options: { bold: true, color: C.mute } }],
    row('No operable gate', r.noGate.stormPeak4to6Sep.toFixed(2) + ' m (bank 2.5)', r.noGate.lakeSpill.toLocaleString('en-IN') + ' m³', C.red),
    row('Gate on automatic', r.auto.stormPeak4to6Sep.toFixed(2) + ' m', '0 m³'),
    row('Forecast mode: open 24 h ahead', r.preRelease.stormPeak4to6Sep.toFixed(2) + ' m', '0 m³ + 0.74 m spare', C.green)
  ], { x: 7.1, y: 2.05, w: 5.8, colW: [2.3, 1.75, 1.75], fontFace: F, fontSize: 11, fill: { color: C.panel }, border: { type: 'solid', color: C.line, pt: 0.75 }, rowH: 0.45 });
  s.addText([{ text: 'Decision: ', options: { bold: true, color: C.green } }, { text: 'when lakes are full and heavy rain is forecast, open outlet gates 24 h ahead, within downstream limits. That turns a lake that would overtop into one with 0.74 m of spare storage at the storm peak.', options: { color: C.ink } }], { x: 7.1, y: 4.2, w: 5.8, h: 1.4, fontFace: F, fontSize: 14, valign: 'top' });
  src(s, 'Data: NASA POWER hourly API v2.10, PRECTOTCORR, 12.95 N 77.62 E, retrieved with no account (tools/build-real-rain.cjs). ~50 km grid smooths local cloudbursts. Lake and catchment (3 km², runoff 0.75) are illustrative; replay checked for exact water balance.');
  s.addNotes('This is the Track A core. Real satellite-derived rain, hour by hour, for the 2022 flood period, fed into our gate model. Without an operable gate the lake overtops and spills about 6.5 lakh cubic metres. With automatic control it stays below the bank. Opening a day ahead of the forecast storm leaves three quarters of a metre spare. That is the economic decision: open early, by how much, and for how long. ~45 s.'); }

// 4. Track A demo: the control board
{ const s = p.addSlide({ masterName: 'M' }); tag(s, 'TRACK A', C.green, 0.4);
  title(s, 'Working demo: city-wide gate control board', 'Every mapped lake in Bengaluru, a gate plan by lake size and valley, and the real 2022 storm replayable on all gates.');
  shot(s, 'board.jpg', 0.4, 2.0, 6.6, 4.95);
  bullets(s, ['Map built from real lake, stream, valley and boundary data: 205 lakes, 111 lost water bodies, 382 km of main drains.', '208 gates, one coloured shape per gate type, with legend, filters and search.', 'Alarm banner by priority; live faceplate for each gate with a mimic of it moving.', 'Flood cases include the real NASA POWER storm; time can run at up to 1 simulated hour per second.', 'Dark control-room design following ISA-101 high-performance HMI practice.'], 7.3, 2.0, 5.6, 4.8, 14);
  s.addNotes('Here it is live. Each dot is a gate; colour and shape tell you the type. I can search Bellandur, select its radial gate, and replay the real September 2022 storm across every gate in the city. ~30 s. (Switch to the live demo here if time allows.)'); }

// 5. Track B: engineered system
{ const s = p.addSlide({ masterName: 'M' }); tag(s, 'TRACK B', C.blue, 0.4);
  title(s, 'Build the system: five gate types, modelled and engineered', 'Physics, control, mechanism and materials for each type, so the plan can go to a gate designer.');
  shot(s, 'radial.jpg', 0.4, 2.0, 4.6, 3.5); shot(s, 'assembly.jpg', 5.2, 2.0, 4.6, 3.5);
  bullets(s, ['Vertical lift, radial, crest, flap + pump and float gates, each with its own hydraulics (orifice / weir flow) and automatic control.', 'Live forces and power: a radial gate needs ~33 kN hoist vs ~58 kN for an equal vertical gate.', 'Exploded 3D assemblies: 157 parts with grade, size, coating and maintenance (SS 304/316L/431, IS 2062, EPDM).', '48 failure modes analysed; 13 simulated (power cut, jam, sensor failure, seal leak, hydraulic leak).', 'Bench prototype: Arduino UNO R4 + linear actuator, 2%/s limit and 3 s watchdog.'], 10.0, 2.0, 2.95, 4.75, 11);
  src(s, 'Indian Standards referenced: IS 9349, IS 4622, IS 4623, IS 11855, IS 6938, IS 10210, IS 2062, IS 456. All sizes illustrative pending survey.');
  s.addNotes('Track B: we did not just draw gates. Each type is a working model with real hydraulics, forces and control, and a full parts list a fabricator can price. The failure analysis drove the design: power cuts and debris are the top risks, so flap gates have a penstock behind them and every motorised gate has a manual handwheel. ~45 s.'); }

// 6. Track C: protective control
{ const s = p.addSlide({ masterName: 'M' }); tag(s, 'TRACK C', C.amber, 0.4);
  title(s, 'Guard the city: safe remote control of critical water assets', 'Protective use only: flood prevention, early warning and resilience. No tracking of people.');
  shot(s, 'faceplate.jpg', 0.4, 2.0, 5.6, 4.2);
  bullets(s, ['Select, confirm, execute: every command shows from → to, travel time and warnings, and needs a named operator.', 'Interlocks block opening into a full drain or against reverse flow; an override needs a written reason and is logged.', 'Command supervision: alarm if a gate has not moved 30 s after a command.', 'Sensor voting, fail-safe hold on any fault, local/site control that remote commands cannot bypass.', 'Full audit trail with CSV export; troubleshooting steps and field actions for each fault.'], 6.3, 2.0, 6.6, 4.6, 14);
  src(s, 'Real deployment needs a closed network with individual logins and PLC interlocks at each gate; this board is a training simulator, not connected to field equipment.');
  s.addNotes('Track C, within the protective-use rule. Gates are critical infrastructure, so the board is built like a real control room: confirm before execute, interlocks, a reason for every override, and an audit log. A public website must never move real gates; this is the operator workflow we would put on a secure network. ~40 s.'); }

// 7. Who pays and how much
{ const s = p.addSlide({ masterName: 'M' });
  title(s, 'Who pays, and what it is worth', 'Buyer: the city (Greater Bengaluru Authority / BBMP storm-water drains), funded through existing flood programmes.');
  big(s, 0.4, 2.05, 4.0, '₹22–36 lakh', 'per lake gate, from BBMP sluice-gate budgets (₹33 cr / 148 lakes; ₹36.85 cr / 102 lakes)', C.blue);
  big(s, 4.6, 2.05, 4.0, '₹46–75 crore', 'for our 208-gate plan at those rates, before telemetry and control room', C.amber);
  big(s, 8.8, 2.05, 4.1, '≈ 3–5×', 'payback if it prevents one flood day like 30 Aug 2022 (₹225 crore claimed)', C.green);
  bullets(s, ['Funding already exists: ₹238 crore NDMF grant for 47 BBMP flood works (2025); state and World Bank resilience programmes.', 'Software and control room are a small share of the cost; the value is in using gates the city is already building, at the right time.', 'Other beneficiaries: corridor businesses and insurers (lower losses), residents downstream (fewer flooded homes).'], 0.4, 3.75, 12.5, 2.6, 15);
  src(s, 'Per-lake costs are our arithmetic from reported budgets, not a quotation. Loss figure is the ORRCA association’s own estimate. Sources: Deccan Herald (2022, 2025), Business Standard (2022), keremanju.blogspot.com citing a BBMP tender.');
  s.addNotes('Who pays: the city, through money already allocated for flood works. At reported budgets, gates cost roughly 22 to 36 lakh per lake, so our 208-gate plan is around 50 to 75 crore. One avoided flood day on the ORR, at 225 crore claimed, pays for it three to five times over. These are estimates and we say so. ~40 s.'); }

// 8. Feasibility and next steps
{ const s = p.addSlide({ masterName: 'M' });
  title(s, 'What is real today, and the path to a pilot', 'Honest status after the hackathon.');
  const col = (x, h, items, color) => { s.addText(h, { x, y: 2.0, w: 4.0, h: 0.4, fontFace: F, fontSize: 15, bold: true, color }); bullets(s, items, x, 2.45, 4.0, 3.9, 12.5); };
  col(0.4, 'Working now', ['Real NASA POWER rainfall replay with a clear gate decision', 'Map from real lake data; 208-gate control board', 'Five gate models, failure analysis, assemblies, bench sketch', '1,034 automated checks, published online'], C.green);
  col(4.6, 'Simulated or illustrative', ['Gate positions and sizes (no public BBMP register)', 'Lake catchments and levels (generic per gate type)', 'Bench rig not yet run on hardware', 'AI today: model-based fault detection and control, not trained ML'], C.amber);
  col(8.8, 'Next 90 days', ['Pilot one lake chain (Yelahanka): survey on one datum', 'Swap MERRA-2 for GPM IMERG / INSAT rain and IMD forecasts; ML nowcasting', 'Two sensors per lake; PLC logic signed by an engineer', 'Witnessed commissioning, then supervised monsoon trial'], C.blue);
  s.addText('Ask: a pilot lake chain, survey access and the BBMP gate register.', { x: 0.4, y: 6.3, w: 12.5, h: 0.45, fontFace: F, fontSize: 16, bold: true, color: 'FFFFFF' });
  s.addNotes('Feasibility: we are clear about what is real and what is simulated. The next step is one pilot lake chain with surveyed levels, better satellite rainfall and forecasts, and proper PLC sign-off. Our ask is a pilot chain and access to the gate register. Thank you. ~35 s.'); }

p.writeFile({ fileName: OUT }).then(f => console.log('wrote', f));
