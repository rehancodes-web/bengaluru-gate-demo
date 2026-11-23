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

**Offline:** Download the repository ZIP, extract it and open `index.html`. Keep `controller.js` alongside it. Run `node verify.cjs` to check all 70 scenario and equipment combinations, actuator travel, water balance and sample logging.

## Street flooding cases

Eight additional scenarios model runoff entering road storage. Compare blocked and reopened grates or an underpass with its pump unavailable and restored. Also test a flooded arterial, a disconnected layout, a work-zone restriction and reverse flow from a surcharged drain. Signed exchange transfers water between road and drain in each simulation step. The road drawing caps displayed depth at 50 cm; read the numeric depth for larger events.
