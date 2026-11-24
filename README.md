# Bengaluru gate demo

Explore how a simulated sluice gate responds to water levels on both sides of a lake outlet. All inputs are illustrative. The demo runs entirely in your browser.

[Open the live simulator](https://rehancodes-web.github.io/bengaluru-gate-demo/)

Select **Lake rising**, then **Advance 1 second**. The controller requests about 42% opening. Actual travel reaches 2% in the first second. Select **Run** to watch the gate move and the water levels change.

| Flood case | What to observe |
|---|---|
| Ordinary rain | The lake starts below the opening threshold. |
| Lake rising | The actuator moves toward the calculated opening. |
| Cloudburst | Compare incoming flow with the outlet’s ability to release it. |
| High downstream / backflow | The controller requests closure when the receiving water is high. |
| Blocked outlet | Lower downstream conveyance reduces the available release allowance. |
| Both sides near overflow | Track spill and the high-water alarm as storage runs out. |

Each case supports healthy equipment, an invalid stage sensor, a jammed gate, loss of telemetry and a local stop. Export a run to CSV before resetting to compare results.

**Offline:** Download the repository ZIP, extract it and open `index.html`. Keep `controller.js` alongside it. Run `node verify.cjs` to run 448 checks, including all 196 scenario, equipment-condition and controller combinations and all 100 gate-type combinations with an exact water balance.

## Gate types compared

`gate-types.html` runs five working models side by side: a vertical lift gate (lake outlet), a radial gate (lake-chain regulator), a flap gate with a motorised penstock and pump (storm-drain outfall), a crest gate (lake waste weir) and a float-operated gate (no power). Each has its own hydraulics and automatic control. Run them through four flood cases (monsoon storm, cloudburst, high river with backflow, lake already full) and five equipment conditions (healthy, power cut, level sensor failure, gate jam, debris), then compare peak levels, spill, reverse flow and pumping for all five. Dimensions are illustrative and storage is simplified to a constant plan area.

## Street flooding cases

Eight additional scenarios model runoff entering road storage. Compare blocked and reopened grates or an underpass with its pump unavailable and restored. Also test a flooded arterial, a disconnected layout, a work-zone restriction and reverse flow from a surcharged drain. Signed exchange transfers water between road and drain in each simulation step. Ponded area grows with depth, and the drawing compresses deep water instead of capping it.

## What the model includes

- **Stage-storage curves:** the lake and drain widen as they fill. Water is tracked as volume, so the balance is exact.
- **Free and submerged gate flow** with a smooth transition, and reverse flow when the drain is higher.
- **Rainfall input:** steady, design storm, cloudburst burst, or an imported inflow series.
- **Two controllers:** the original rule-based logic and a PI controller with anti-windup, to compare on the same storm.
- **Realistic actuator:** slows above 1 m head across the gate and trips on torque above 1.5 m.
- **Fault detection:** lake-sensor drift caught against the controller's own water balance; partial jams caught by commanded versus actual travel.
- **Site data import:** paste surveyed stage-area curves, a calibrated discharge coefficient, measured inflow, and the gate width, travel, crest, control levels, alarm levels and torque-trip head. The status line shows whether illustrative or imported data is in use.
- **Bench rig link:** `GateCommissioning.ino` takes `ARM`, `POS 0-100`, `CAL`, `PULSE` and `OFF` over USB. The simulator drives it through Web Serial (desktop Chrome or Edge). Speed is limited to 2% per second, and the rig holds position if the link is silent for 3 seconds.

## Still needed before field use

Surveyed outlet levels on one datum, the lake's measured stage-storage curve, downstream capacity, measured gate discharge curves, actuator data sheets, the authority's approved operating and emergency rules, PLC logic designed and signed off by a qualified engineer, and witnessed commissioning tests. The simulator accepts the survey and discharge data; the rest is engineering and approval work outside this repo.
