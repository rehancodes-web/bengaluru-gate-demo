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

**Offline:** Download the repository ZIP, extract it and open `index.html`. Keep `controller.js` alongside it. Run `node verify.cjs` to run 1018 checks, including all 196 scenario, equipment-condition and controller combinations and all 100 gate-type combinations with an exact water balance.

## Control board (training simulator)

`control.html` is a control-room style board for operating gates across Bengaluru, built on the Bengaluru Water Map data (MOD Foundation, May 2026: 205 lakes, 111 lost water bodies, main streams, valleys and the city boundary). It places an illustrative planning layout of 208 gates (vertical lift, radial, crest, flap with penstock and pump, float) by lake size and valley, shown as coloured, shaped markers with a legend. Select a lake or gate to see its faceplate and a live mimic of that gate moving. Operators can switch Auto, Manual or Local, open or close fully, set any percentage, stop, start or stop pumps and override process interlocks; every command needs an operator name, is confirmed before sending (with a reason for manual and override), is supervised for execution and is logged. Alarms follow priority and acknowledgement rules, and each fault has troubleshooting steps and field actions. The display follows ISA-101 high-performance HMI practice (neutral greys, colour for abnormal states). It is not connected to field equipment: a real system needs authenticated access on a closed network, PLC interlocks at each gate that the screen cannot bypass and witnessed commissioning.

## Gate types compared

`gate-types.html` runs five working models side by side: a vertical lift gate (lake outlet), a radial gate (lake-chain regulator), a flap gate with a motorised penstock and pump (storm-drain outfall), a crest gate (lake waste weir) and a float-operated gate (no power). Each has its own hydraulics and automatic control. Run them through four flood cases (monsoon storm, cloudburst, high river with backflow, lake already full) and five equipment conditions (healthy, power cut, level sensor failure, gate jam, debris), then compare peak levels, spill, reverse flow and pumping for all five.

Each gate type has a labelled cross-section of its mechanism (hoist, spindle, gearbox, guides and seals; trunnion, arms and winch; flap hinge, penstock, pump and non-return valve; hinged leaf and hydraulic cylinder; float, stilling well, chain and counterweight) with water moving through it at speeds taken from the flow calculation. Live panels show the forces and power on each component, the flow regime at the gate (free jet and hydraulic jump, submerged, weir overflow or reverse), velocity, contracted jet depth and Froude number, and each step from sensor to gate. Masses, friction and efficiencies are illustrative; replace them with manufacturer data for a real gate.

Six further failures from the failure analysis can be selected: seal leakage, brake creep, a crest-gate hydraulic leak, a backup level sensor that takes over by voting, a backup generator that starts after 90 seconds, and an upstream lake releasing at the local peak.

## Gate assemblies and materials

`gate-assembly.html` shows an exploded 3D assembly of each gate type. Drag to rotate it (or use the 3D, Front, Side and Top views), Ctrl + scroll to zoom, double-click a part to zoom to it, scroll to separate the parts. Drives are broken down to gears, worms, bearings, couplings, motor internals, brakes, limit gear trains and every bolt row; a sixth tab shows the bench prototype and select one to see its material and grade, size, protection, purpose and maintenance. Each type has a full bill of materials and an installation sequence, and a materials guide explains the choices for Bengaluru's sewage-polluted water (stainless 304, 316L, 431 and duplex; coated IS 2062 steel; EPDM and neoprene seals; bronze and self-lubricating bushes; UHMW-PE; A4-70 fasteners; M30 concrete) with the Indian Standards commonly used. Sizes are illustrative; the gate designer confirms grades and sections. Dimensions are illustrative and storage is simplified to a constant plan area.

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
