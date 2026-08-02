# QuantaChip

A self-contained two-panel web application for designing conceptual superconducting quantum chips from natural language. Users describe the chip on the left, and the AI-style generator creates the fabricated preview, Qiskit Metal schematic, and design summary on the right.

## Run

Open `index.html` in a browser, then type a request such as:

```text
Design a 6 qubit superconducting transmon chip in heavy-hex topology with meandered readout resonators, launchpads, and low crosstalk.
```

## What It Generates

- Superconducting transmon or fluxonium chip design metadata.
- Qubit layout and coupler topology for linear, grid, star, and heavy-hex-style designs.
- Fabricated-chip preview on the right side of the app.
- Qiskit Metal-style schematic using launchpads, CPW meanders, qubit islands, and readout resonators.
- Python code that follows the Quantum Metal / Qiskit Metal flow: `DesignPlanar`, `TransmonPocket`, `LaunchpadWirebond`, `RouteMeander`, headless `qm.view`, and optional GDS export.

## Reference

The generator is based on the current Quantum Metal documentation at <https://qiskit-community.github.io/qiskit-metal/>, especially the quick-start design flow, the four-qubit full-chip routing example, and the GDS export renderer workflow.

## Notes

This is a conceptual design assistant. Real chip fabrication needs a process design kit, foundry design-rule checks, electromagnetic simulation, cryogenic packaging analysis, and lab validation.
