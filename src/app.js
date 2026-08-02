(function () {
  const state = {
    design: null,
    files: {}
  };

  const elements = {
    chatForm: document.getElementById("chatForm"),
    promptInput: document.getElementById("promptInput"),
    chatLog: document.getElementById("chatLog"),
    statusPill: document.getElementById("statusPill"),
    fabricatedCanvas: document.getElementById("fabricatedCanvas"),
    schematicCanvas: document.getElementById("schematicCanvas"),
    designPanel: document.querySelector(".design-panel"),
    metricQubits: document.getElementById("metricQubits"),
    metricCouplers: document.getElementById("metricCouplers"),
    metricArea: document.getElementById("metricArea"),
    designSubtitle: document.getElementById("designSubtitle"),
    summaryPanel: document.getElementById("summaryPanel")
  };

  function parsePrompt(prompt) {
    const lower = prompt.toLowerCase();
    const numberMatch = lower.match(/(\d+)\s*(qubit|q\b)/);
    const q = numberMatch ? clamp(parseInt(numberMatch[1], 10), 2, 128) : 4;
    const topology = ["heavy-hex", "linear", "grid", "star"].find((item) => lower.includes(item.replace("-", " "))) ||
      (lower.includes("chain") ? "linear" : "heavy-hex");
    const qubitType = lower.includes("fluxonium") ? "fluxonium" : "transmon";
    const useResonators = lower.includes("readout") || lower.includes("resonator") || qubitType !== "photonic";
    const lowLoss = lower.includes("low loss") || lower.includes("high coherence") || lower.includes("coherence");
    return {
      qubits: q,
      topology,
      qubitType,
      frequencyBand: lower.includes("6 ghz") ? "5.0-6.0 GHz" : "4.8-5.4 GHz",
      useResonators,
      lowLoss
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function generateDesign(options) {
    const nodes = layoutNodes(options.qubits, options.topology);
    const couplers = generateCouplers(nodes, options.topology);
    const pitch = options.qubits > 32 ? 0.9 : 1.2;
    const area = Math.max(16, Math.round((options.qubits * pitch * 1.8 + couplers.length * 0.18) * 10) / 10);
    const resonatorCount = options.useResonators ? options.qubits : Math.ceil(options.qubits / 2);
    const name = `qchip-${options.qubits}q-${options.topology}`;

    return {
      name,
      generatedAt: new Date().toISOString(),
      summary: `${options.qubits}-qubit ${options.qubitType} chip using ${options.topology} connectivity, ${resonatorCount} readout resonators, and ${couplers.length} tunable couplers.`,
      specs: {
        qubits: options.qubits,
        qubitType: options.qubitType,
        topology: options.topology,
        frequencyBand: options.frequencyBand,
        couplers: couplers.length,
        resonators: resonatorCount,
        estimatedAreaMm2: area,
        substrate: "high-resistivity silicon",
        process: options.qubitType === "fluxonium" ? "Nb/AlOx/Nb superconducting junction process" : "Al/AlOx/Al Josephson junction process",
        metalComponents: "DesignPlanar, TransmonPocket-style qubits, LaunchpadWirebond pads, RouteMeander CPW traces",
        objective: options.lowLoss ? "maximize coherence and reduce dielectric participation" : "balanced research prototype"
      },
      nodes,
      couplers,
      validation: [
        "Run electromagnetic extraction for resonator and coupler cross-talk.",
        "Verify qubit frequency allocation avoids nearest-neighbor collisions.",
        "Simulate control pulse schedules before tape-out.",
        "Review fabrication rules with the selected foundry process."
      ]
    };
  }

  function layoutNodes(count, topology) {
    if (topology === "grid") {
      const cols = Math.ceil(Math.sqrt(count));
      return Array.from({ length: count }, (_, i) => ({
        id: `Q${i}`,
        x: (i % cols) / Math.max(cols - 1, 1),
        y: Math.floor(i / cols) / Math.max(Math.ceil(count / cols) - 1, 1)
      }));
    }

    if (topology === "star") {
      return Array.from({ length: count }, (_, i) => {
        if (i === 0) return { id: "Q0", x: 0.5, y: 0.5 };
        const angle = ((i - 1) / Math.max(count - 1, 1)) * Math.PI * 2;
        return { id: `Q${i}`, x: 0.5 + Math.cos(angle) * 0.4, y: 0.5 + Math.sin(angle) * 0.36 };
      });
    }

    if (topology === "linear") {
      return Array.from({ length: count }, (_, i) => ({
        id: `Q${i}`,
        x: count === 1 ? 0.5 : i / (count - 1),
        y: 0.5 + Math.sin(i * 0.9) * 0.08
      }));
    }

    const cols = Math.ceil(Math.sqrt(count * 1.35));
    return Array.from({ length: count }, (_, i) => {
      const row = Math.floor(i / cols);
      const col = i % cols;
      return {
        id: `Q${i}`,
        x: (col + (row % 2 ? 0.5 : 0)) / cols,
        y: row / Math.max(Math.ceil(count / cols), 1)
      };
    });
  }

  function generateCouplers(nodes, topology) {
    const edges = [];
    const add = (a, b) => {
      if (a < nodes.length && b < nodes.length) edges.push({ id: `C${edges.length}`, from: `Q${a}`, to: `Q${b}` });
    };

    if (topology === "star") {
      for (let i = 1; i < nodes.length; i += 1) add(0, i);
      return edges;
    }

    if (topology === "linear") {
      for (let i = 0; i < nodes.length - 1; i += 1) add(i, i + 1);
      return edges;
    }

    if (topology === "grid") {
      const cols = Math.ceil(Math.sqrt(nodes.length));
      for (let i = 0; i < nodes.length; i += 1) {
        if ((i + 1) % cols !== 0) add(i, i + 1);
        add(i, i + cols);
      }
      return edges;
    }

    for (let i = 0; i < nodes.length - 1; i += 1) add(i, i + 1);
    for (let i = 0; i < nodes.length - 2; i += 3) add(i, i + 2);
    return edges;
  }

  function generateFiles(design) {
    const json = JSON.stringify(design, null, 2);
    const python = generatePython(design);
    const control = generateControl(design);
    const workflow = [
      "name: validate-design",
      "on: [push, pull_request]",
      "jobs:",
      "  lint-design:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - uses: actions/checkout@v4",
      "      - uses: actions/setup-python@v5",
      "        with:",
      "          python-version: '3.11'",
      "      - run: python -m py_compile src/generate_chip.py"
    ].join("\n");

    const readme = [
      `# ${design.name}`,
      "",
      design.summary,
      "",
      "## Contents",
      "- `design/chip.json` stores the generated architecture.",
      "- `src/generate_chip.py` creates a Quantum Metal / Qiskit Metal `DesignPlanar` layout with transmons, launchpads, meandered CPW routes, preview export, and optional GDS export.",
      "- `hdl/control_map.sv` sketches register addresses for control electronics.",
      "- `requirements.txt` lists the Quantum Metal dependency.",
      "- `.github/workflows/validate.yml` validates the Python generator.",
      "",
      "## Qiskit Metal Reference",
      "This scaffold follows the Quantum Metal documentation flow: create a `DesignPlanar`, add QComponents such as `TransmonPocket`, connect pins with `RouteMeander`, preview headlessly with `qm.view`, and export with `design.renderers.gds.export_to_gds(...)`.",
      "",
      "## Push to GitHub",
      "```bash",
      "git init",
      "git add .",
      "git commit -m \"Add quantum chip design\"",
      "gh repo create " + design.name + " --public --source=. --push",
      "```",
      "",
      "## Engineering note",
      "This is a conceptual design scaffold. Fabrication requires process design kit rules, EM simulation, cryogenic package review, and lab validation."
    ].join("\n");

    return {
      "README.md": readme,
      "design/chip.json": json,
      "src/generate_chip.py": python,
      "hdl/control_map.sv": control,
      ".github/workflows/validate.yml": workflow,
      "requirements.txt": "quantum-metal>=0.7\nmatplotlib>=3.8\n",
      ".gitignore": "__pycache__/\n.env\n*.log\n"
    };
  }

  function generatePython(design) {
    const limitedNodes = design.nodes.slice(0, 24);
    const qubitRows = limitedNodes.map((node) => {
      const x = ((node.x - 0.5) * 7.2).toFixed(3);
      const y = ((0.5 - node.y) * 5.2).toFixed(3);
      return `    ("${node.id}", "${x}mm", "${y}mm"),`;
    }).join("\n");
    const routeRows = design.couplers.slice(0, 32).map((edge, index) => {
      const from = parseInt(edge.from.slice(1), 10);
      const to = parseInt(edge.to.slice(1), 10);
      const startPin = from % 2 === 0 ? "b" : "c";
      const endPin = to % 2 === 0 ? "c" : "b";
      const length = (7.2 + (index % 4) * 0.45).toFixed(2);
      const asymmetry = ((index % 2 === 0 ? 1 : -1) * (120 + index * 12)).toFixed(0);
      return `    ("cpw_${edge.from}_${edge.to}", "${edge.from}", "${startPin}", "${edge.to}", "${endPin}", "${length}mm", "${asymmetry}um"),`;
    }).join("\n");

    return [
      '"""Quantum Metal / Qiskit Metal chip generator.',
      "",
      "Generated by QuantaChip. It follows the documented Metal flow:",
      "DesignPlanar -> QComponents -> RouteMeander -> headless preview -> optional GDS.",
      '"""',
      "",
      "from __future__ import annotations",
      "",
      "from pathlib import Path",
      "",
      "",
      "CHIP = {",
      `    "name": "${design.name}",`,
      `    "qubits": ${design.specs.qubits},`,
      `    "qubit_type": "${design.specs.qubitType}",`,
      `    "topology": "${design.specs.topology}",`,
      `    "frequency_band": "${design.specs.frequencyBand}",`,
      `    "estimated_area_mm2": ${design.specs.estimatedAreaMm2},`,
      `    "substrate": "${design.specs.substrate}",`,
      `    "process": "${design.specs.process}",`,
      "}",
      "",
      "QUBIT_PLACEMENTS = [",
      qubitRows || "    # Add qubit placements here.",
      "]",
      "",
      "CPW_ROUTES = [",
      routeRows || "    # Add CPW routes here.",
      "]",
      "",
      "",
      "def build_design():",
      "    import qiskit_metal as qm",
      "    from qiskit_metal import Dict, designs",
      "    from qiskit_metal.qlibrary.qubits.transmon_pocket import TransmonPocket",
      "    from qiskit_metal.qlibrary.terminations.launchpad_wb import LaunchpadWirebond",
      "    from qiskit_metal.qlibrary.terminations.launchpad_wb_coupled import LaunchpadWirebondCoupled",
      "    from qiskit_metal.qlibrary.tlines.meandered import RouteMeander",
      "",
      "    design = designs.DesignPlanar()",
      "    design.overwrite_enabled = True",
      "    design.chips.main.size.size_x = '9mm'",
      "    design.chips.main.size.size_y = '7mm'",
      "",
      "    qubits = {}",
      "    for name, pos_x, pos_y in QUBIT_PLACEMENTS:",
      "        qubits[name] = TransmonPocket(",
      "            design,",
      "            name,",
      "            options=Dict(",
      "                pos_x=pos_x,",
      "                pos_y=pos_y,",
      "                pad_width='250um',",
      "                pad_height='225um',",
      "                pad_gap='50um',",
      "                pocket_width='650um',",
      "                pocket_height='650um',",
      "                connection_pads=Dict(",
      "                    a=Dict(loc_W=+1, loc_H=0, pad_width='70um'),",
      "                    b=Dict(loc_W=-1, loc_H=0, pad_width='70um'),",
      "                    c=Dict(loc_W=0, loc_H=+1, pad_width='70um'),",
      "                    d=Dict(loc_W=0, loc_H=-1, pad_width='70um'),",
      "                ),",
      "            ),",
      "        )",
      "",
      "    launchpads = {",
      "        'P_E': LaunchpadWirebondCoupled(design, 'P_E', options=Dict(pos_x='4.2mm', pos_y='0mm', orientation='180', lead_length='30um')),",
      "        'P_W': LaunchpadWirebondCoupled(design, 'P_W', options=Dict(pos_x='-4.2mm', pos_y='0mm', orientation='0', lead_length='30um')),",
      "        'P_N': LaunchpadWirebond(design, 'P_N', options=Dict(pos_x='0mm', pos_y='3.1mm', orientation='270', lead_length='0um')),",
      "        'P_S': LaunchpadWirebond(design, 'P_S', options=Dict(pos_x='0mm', pos_y='-3.1mm', orientation='90', lead_length='0um')),",
      "    }",
      "",
      "    route_options = Dict(",
      "        lead=Dict(start_straight='100um', end_straight='250um'),",
      "        fillet='99.99um',",
      "        trace_width='10um',",
      "        meander=Dict(spacing='200um', asymmetry='0um'),",
      "    )",
      "",
      "    routes = {}",
      "    for route_name, start_comp, start_pin, end_comp, end_pin, total_length, asymmetry in CPW_ROUTES:",
      "        options = Dict(",
      "            pin_inputs=Dict(",
      "                start_pin=Dict(component=start_comp, pin=start_pin),",
      "                end_pin=Dict(component=end_comp, pin=end_pin),",
      "            ),",
      "            total_length=total_length,",
      "        )",
      "        options.update(route_options)",
      "        options.meander.asymmetry = asymmetry",
      "        routes[route_name] = RouteMeander(design, route_name, options)",
      "",
      "    if QUBIT_PLACEMENTS:",
      "        RouteMeander(",
      "            design,",
      "            'readout_bus',",
      "            Dict(",
      "                pin_inputs=Dict(",
      "                    start_pin=Dict(component='P_W', pin='tie'),",
      "                    end_pin=Dict(component='P_E', pin='tie'),",
      "                ),",
      "                total_length='8.6mm',",
      "                lead=Dict(start_straight='430um', end_straight='430um'),",
      "                fillet='99.99um',",
      "                meander=Dict(spacing='180um', asymmetry='150um'),",
      "            ),",
      "        )",
      "",
      "    design.rebuild()",
      "    return design, qm, qubits, routes, launchpads",
      "",
      "",
      "def save_preview(path='outputs/chip_preview.png'):",
      "    design, qm, *_ = build_design()",
      "    output = Path(path)",
      "    output.parent.mkdir(parents=True, exist_ok=True)",
      "    fig = qm.view(design, title=CHIP['name'])",
      "    fig.savefig(output, dpi=200, bbox_inches='tight')",
      "    return output",
      "",
      "",
      "def export_gds(path='outputs/chip_layout.gds'):",
      "    design, *_ = build_design()",
      "    output = Path(path)",
      "    output.parent.mkdir(parents=True, exist_ok=True)",
      "    design.renderers.gds.export_to_gds(str(output))",
      "    return output",
      "",
      "",
      "def describe():",
      "    print(f\"{CHIP['name']}: {CHIP['qubits']} qubits, {len(CPW_ROUTES)} meandered CPW routes\")",
      "    print(f\"Process: {CHIP['process']} on {CHIP['substrate']}\")",
      "",
      "",
      "if __name__ == '__main__':",
      "    describe()",
      "    preview = save_preview()",
      "    print(f'Saved preview to {preview}')",
      "    # Uncomment after installing full GDS dependencies and configuring junction assets:",
      "    # print(f'Exported GDS to {export_gds()}')"
    ].join("\n");
  }

  function generateControl(design) {
    const lines = [
      "module control_map;",
      `  localparam int QUBITS = ${design.specs.qubits};`,
      `  localparam int COUPLERS = ${design.specs.couplers};`,
      "",
      "  typedef struct packed {",
      "    logic [15:0] drive_addr;",
      "    logic [15:0] readout_addr;",
      "    logic [15:0] flux_addr;",
      "  } qubit_registers_t;",
      "",
      "  qubit_registers_t registers [QUBITS];",
      "",
      "  initial begin"
    ];

    for (let i = 0; i < design.specs.qubits; i += 1) {
      const base = 4096 + i * 16;
      lines.push(`    registers[${i}] = '{16'h${hex(base)}, 16'h${hex(base + 4)}, 16'h${hex(base + 8)}};`);
    }

    lines.push("  end", "endmodule");
    return lines.join("\n");
  }

  function hex(value) {
    return value.toString(16).toUpperCase().padStart(4, "0");
  }

  function renderDesign(design) {
    state.design = design;
    state.files = generateFiles(design);
    elements.designPanel.classList.remove("awaiting");
    elements.metricQubits.textContent = `${design.specs.qubits} qubits`;
    elements.metricCouplers.textContent = `${design.specs.couplers} couplers`;
    elements.metricArea.textContent = `${design.specs.estimatedAreaMm2} mm2`;
    elements.designSubtitle.textContent = `${design.specs.topology} ${design.specs.qubitType} design using Qiskit Metal-style components - layout renderer v4Q`;
    elements.summaryPanel.innerHTML = renderSummary(design);
    drawChip(design);
  }

  function renderSummary(design) {
    const items = [
      ["Architecture", design.summary],
      ["Qiskit Metal", design.specs.metalComponents],
      ["Fabrication", `${design.specs.process} on ${design.specs.substrate}.`],
      ["Microwave Layout", `${design.specs.resonators} readout resonators, ${design.specs.couplers} coupler channels, ${design.specs.frequencyBand} allocation.`],
      ["Design Goal", design.specs.objective],
      ["Validation", design.validation.join(" ")]
    ];
    return `<div class="summary-grid">${items.map(([title, body]) => `<div class="summary-item"><strong>${title}</strong><span>${body}</span></div>`).join("")}</div>`;
  }

  function renderRepoBundle(files) {
    return Object.entries(files).map(([path, body]) => `--- ${path} ---\n${body}`).join("\n\n");
  }

  function drawChip(design) {
    drawCanvas(elements.fabricatedCanvas, (ctx, width, height) => {
      drawFabricatedChip(ctx, width, height, design);
    });
    drawCanvas(elements.schematicCanvas, (ctx, width, height) => {
      drawSchematicChip(ctx, width, height, design);
    });
  }

  function drawCanvas(canvas, render) {
    const ctx = canvas.getContext("2d");
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(360, Math.floor(rect.width * scale));
    canvas.height = Math.max(280, Math.floor(rect.height * scale));
    ctx.scale(scale, scale);
    const width = canvas.width / scale;
    const height = canvas.height / scale;
    ctx.clearRect(0, 0, width, height);
    render(ctx, width, height);
  }

  function drawFabricatedChip(ctx, width, height, design) {
    const background = ctx.createLinearGradient(0, 0, width, height);
    background.addColorStop(0, "#05162d");
    background.addColorStop(0.45, "#0c3f5d");
    background.addColorStop(1, "#061a2b");
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const dieSize = Math.min(width * 0.78, height * 0.86);
    const die = {
      x: (width - dieSize) / 2,
      y: (height - dieSize) / 2,
      w: dieSize,
      h: dieSize
    };

    ctx.save();
    const dieGradient = ctx.createLinearGradient(die.x, die.y, die.x + die.w, die.y + die.h);
    dieGradient.addColorStop(0, "#0b3150");
    dieGradient.addColorStop(0.52, "#155a73");
    dieGradient.addColorStop(1, "#08223a");
    ctx.fillStyle = dieGradient;
    roundRect(ctx, die.x, die.y, die.w, die.h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(185, 238, 255, 0.36)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawDieTexture(ctx, die);
    drawFabricatedFrame(ctx, die);
    drawFabricatedQubits(ctx, die, design);
    drawCornerMarkers(ctx, die);
    ctx.restore();
  }

  function drawFabricatedFrame(ctx, die) {
    const metal = "#b9efff";
    const glow = "rgba(122, 226, 255, 0.46)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = glow;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = metal;
    ctx.lineWidth = Math.max(2.5, die.w * 0.012);
    drawRectTrace(ctx, die.x + die.w * 0.18, die.y + die.h * 0.16, die.w * 0.64, die.h * 0.68);
    drawRectTrace(ctx, die.x + die.w * 0.31, die.y + die.h * 0.3, die.w * 0.38, die.h * 0.4);

    const pads = [
      [0.08, 0.14], [0.28, 0.08], [0.5, 0.07], [0.72, 0.08], [0.92, 0.14],
      [0.08, 0.86], [0.28, 0.92], [0.5, 0.93], [0.72, 0.92], [0.92, 0.86],
      [0.06, 0.36], [0.06, 0.64], [0.94, 0.36], [0.94, 0.64]
    ];
    pads.forEach(([px, py]) => drawPad(ctx, die.x + die.w * px, die.y + die.h * py, die.w * 0.065));

    ctx.lineWidth = Math.max(2, die.w * 0.008);
    ctx.strokeStyle = "#9ee6fb";
    drawFabricatedRoute(ctx, die, 0.08, 0.36, 0.33, 0.36);
    drawFabricatedRoute(ctx, die, 0.92, 0.36, 0.67, 0.36);
    drawFabricatedRoute(ctx, die, 0.08, 0.64, 0.33, 0.64);
    drawFabricatedRoute(ctx, die, 0.92, 0.64, 0.67, 0.64);

    drawResonatorBank(ctx, die.x + die.w * 0.23, die.y + die.h * 0.24, die.w * 0.18, die.h * 0.16, 6);
    drawResonatorBank(ctx, die.x + die.w * 0.59, die.y + die.h * 0.24, die.w * 0.18, die.h * 0.16, 6);
    drawResonatorBank(ctx, die.x + die.w * 0.23, die.y + die.h * 0.6, die.w * 0.18, die.h * 0.16, 6);
    drawResonatorBank(ctx, die.x + die.w * 0.59, die.y + die.h * 0.6, die.w * 0.18, die.h * 0.16, 6);
    ctx.shadowBlur = 0;
  }

  function drawFabricatedQubits(ctx, die, design) {
    const slots = [
      [0.38, 0.38], [0.62, 0.38], [0.38, 0.62], [0.62, 0.62],
      [0.5, 0.5], [0.28, 0.5], [0.72, 0.5], [0.5, 0.76]
    ];
    const count = Math.min(design.specs.qubits, 8);
    ctx.shadowColor = "rgba(191, 240, 255, 0.6)";
    ctx.shadowBlur = 12;

    for (let i = 0; i < count; i += 1) {
      const [sx, sy] = slots[i % slots.length];
      const x = die.x + die.w * sx;
      const y = die.y + die.h * sy;
      const size = die.w * 0.105;
      ctx.strokeStyle = "#d7f6ff";
      ctx.lineWidth = Math.max(2, die.w * 0.008);
      drawRectTrace(ctx, x - size / 2, y - size / 2, size, size);
      drawCapacitorComb(ctx, x - size * 0.25, y, size * 0.42, size * 0.72, "#d7f6ff", 1);
      drawCapacitorComb(ctx, x + size * 0.25, y, size * 0.42, size * 0.72, "#d7f6ff", -1);
      drawLine(ctx, x - size * 0.18, y, x + size * 0.18, y);
      drawLine(ctx, x, y - size * 0.58, x, y - size * 0.86);
      drawLine(ctx, x, y + size * 0.58, x, y + size * 0.86);
    }
    ctx.shadowBlur = 0;
  }

  function drawSchematicChip(ctx, width, height, design) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, width, height);

    const cx = width / 2;
    const cy = height / 2;
    if (design.specs.qubits <= 4) {
      drawFourQubitReferenceSchematic(ctx, width, height, design, cx, cy);
      return;
    }

    const span = Math.min(width * 0.72, 650);
    const amp = Math.min(height * 0.07, 34);
    const step = span / 22;

    drawSchematicPad(ctx, cx - span / 2 - 58, cy, "LP_IN");
    drawSchematicPad(ctx, cx + span / 2 + 58, cy, "LP_OUT");

    ctx.strokeStyle = "#8c9aa3";
    ctx.lineWidth = 4.5;
    ctx.lineCap = "round";
    drawLine(ctx, cx - span / 2 - 24, cy, cx - span / 2, cy);
    drawMeander(ctx, cx - span / 2, cy, step, amp, 22);
    drawLine(ctx, cx + span / 2, cy, cx + span / 2 + 24, cy);
    ctx.strokeStyle = "#f7fafb";
    ctx.lineWidth = 1.4;
    drawMeander(ctx, cx - span / 2, cy, step, amp, 22);

    const qubitSlots = [
      [cx - span * 0.24, cy - amp * 2.8],
      [cx + span * 0.24, cy - amp * 2.8],
      [cx - span * 0.24, cy + amp * 2.8],
      [cx + span * 0.24, cy + amp * 2.8],
      [cx, cy - amp * 4.3],
      [cx, cy + amp * 4.3]
    ];
    qubitSlots.slice(0, Math.min(6, design.specs.qubits)).forEach(([x, y], index) => {
      const couplerY = y < cy ? cy - amp * 0.95 : cy + amp * 0.95;
      ctx.strokeStyle = "#8c9aa3";
      ctx.lineWidth = 3;
      drawLine(ctx, x, y < cy ? y + 34 : y - 34, x, couplerY);
      drawQubitIsland(ctx, x, y, `Q${index}`);
    });

    ctx.fillStyle = "#415262";
    ctx.font = "12px Segoe UI, Arial";
    ctx.textAlign = "left";
    ctx.fillText(`${design.specs.qubits}Q ${design.specs.topology} Qiskit Metal CPW + TransmonPocket layout`, 18, 24);
  }

  function drawFourQubitReferenceSchematic(ctx, width, height, design, cx, cy) {
    const span = Math.min(width * 0.74, 650);
    const startX = cx - span / 2;
    const endX = cx + span / 2;
    const amp = Math.min(height * 0.055, 25);
    const step = span / 18;

    ctx.fillStyle = "#445866";
    ctx.font = "12px Segoe UI, Arial";
    ctx.textAlign = "left";
    ctx.fillText("4Q reference: launchpad - meandered resonator - launchpad", 18, 24);

    drawSchematicPad(ctx, startX - 70, cy, "IN");
    drawSchematicPad(ctx, endX + 70, cy, "OUT");

    ctx.strokeStyle = "#7f8d95";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    drawLine(ctx, startX - 32, cy, startX, cy);
    drawMeander(ctx, startX, cy, step, amp, 18);
    drawLine(ctx, endX, cy, endX + 32, cy);

    ctx.strokeStyle = "#f7fafb";
    ctx.lineWidth = 1.3;
    drawMeander(ctx, startX, cy, step, amp, 18);

    const top = [cx, cy - amp * 3.45, "Q0"];
    const bottom = [cx, cy + amp * 3.45, "Q1"];
    const left = [cx - span * 0.28, cy, "Q2"];
    const right = [cx + span * 0.28, cy, "Q3"];

    [top, bottom, left, right].forEach(([x, y, label]) => {
      if (label === "Q0") {
        drawCouplingStub(ctx, x, y + 34, x, cy - amp * 0.95);
      } else if (label === "Q1") {
        drawCouplingStub(ctx, x, y - 34, x, cy + amp * 0.95);
      }
      drawReferenceQubitBlock(ctx, x, y, label);
    });

    ctx.strokeStyle = "#8c9aa3";
    ctx.lineWidth = 3;
    drawLine(ctx, left[0] + 38, cy, left[0] + 72, cy);
    drawLine(ctx, right[0] - 38, cy, right[0] - 72, cy);
  }

  function drawCouplingStub(ctx, x1, y1, x2, y2) {
    ctx.strokeStyle = "#8c9aa3";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    drawLine(ctx, x1, y1, x2, y2);
  }

  function drawReferenceQubitBlock(ctx, x, y, label) {
    ctx.save();
    ctx.fillStyle = "rgba(196, 205, 207, 0.9)";
    ctx.strokeStyle = "#8f9da3";
    ctx.lineWidth = 2;
    ctx.fillRect(x - 36, y - 30, 72, 60);
    ctx.strokeRect(x - 36, y - 30, 72, 60);
    drawCapacitorComb(ctx, x - 14, y, 24, 48, "#5aa5bb", 1);
    drawCapacitorComb(ctx, x + 14, y, 24, 48, "#5aa5bb", -1);
    ctx.fillStyle = "#526371";
    ctx.font = "13px Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 5);
    ctx.restore();
  }

  function drawMeander(ctx, startX, midY, step, amp, turns) {
    ctx.beginPath();
    ctx.moveTo(startX, midY);
    for (let i = 0; i < turns; i += 1) {
      const x = startX + step * (i + 0.5);
      const nextX = startX + step * (i + 1);
      const y = i % 2 === 0 ? midY - amp : midY + amp;
      ctx.quadraticCurveTo(x, y, nextX, midY);
    }
    ctx.stroke();
  }

  function drawSchematicPad(ctx, x, y, label) {
    ctx.fillStyle = "#d9e2e5";
    ctx.strokeStyle = "#8fa0a8";
    ctx.lineWidth = 2;
    ctx.fillRect(x - 38, y - 28, 76, 56);
    ctx.strokeRect(x - 38, y - 28, 76, 56);
    ctx.strokeStyle = "#5aa5bb";
    ctx.lineWidth = 1.5;
    for (let i = -16; i <= 16; i += 8) drawLine(ctx, x - 24, y + i, x + 24, y + i);
    ctx.fillStyle = "#607078";
    ctx.font = "11px Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 4);
  }

  function drawQubitIsland(ctx, x, y, label) {
    ctx.fillStyle = "rgba(207, 217, 220, 0.92)";
    ctx.strokeStyle = "#879aa3";
    ctx.lineWidth = 2;
    ctx.fillRect(x - 34, y - 34, 68, 68);
    ctx.strokeRect(x - 34, y - 34, 68, 68);
    drawCapacitorComb(ctx, x - 12, y, 22, 52, "#5aa5bb", 1);
    drawCapacitorComb(ctx, x + 12, y, 22, 52, "#5aa5bb", -1);
    ctx.strokeStyle = "#5f727c";
    ctx.lineWidth = 2;
    drawLine(ctx, x - 4, y, x + 4, y);
    ctx.fillStyle = "#586872";
    ctx.font = "12px Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 4);
  }

  function drawDieTexture(ctx, die) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#70b9cf";
    ctx.lineWidth = 0.7;
    for (let x = die.x + die.w * 0.08; x < die.x + die.w * 0.94; x += die.w * 0.075) {
      drawLine(ctx, x, die.y + die.h * 0.08, x, die.y + die.h * 0.92);
    }
    for (let y = die.y + die.h * 0.08; y < die.y + die.h * 0.94; y += die.h * 0.075) {
      drawLine(ctx, die.x + die.w * 0.08, y, die.x + die.w * 0.92, y);
    }
    ctx.restore();
  }

  function drawFabricatedRoute(ctx, die, x1, y1, x2, y2) {
    const ax = die.x + die.w * x1;
    const ay = die.y + die.h * y1;
    const bx = die.x + die.w * x2;
    const by = die.y + die.h * y2;
    const bend = die.x + die.w * ((x1 + x2) / 2);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bend, ay);
    ctx.lineTo(bend, by);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function drawResonatorBank(ctx, x, y, w, h, fingers) {
    ctx.save();
    ctx.strokeStyle = "#aeeaff";
    ctx.lineWidth = Math.max(2, w * 0.035);
    const gap = w / Math.max(fingers - 1, 1);
    for (let i = 0; i < fingers; i += 1) {
      const fx = x + i * gap;
      const top = i % 2 === 0 ? y : y + h * 0.18;
      const bottom = i % 2 === 0 ? y + h * 0.82 : y + h;
      drawLine(ctx, fx, top, fx, bottom);
    }
    drawLine(ctx, x - w * 0.08, y + h * 0.5, x + w * 1.08, y + h * 0.5);
    ctx.restore();
  }

  function drawCapacitorComb(ctx, x, y, w, h, color, direction) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, w * 0.08);
    drawLine(ctx, x, y - h / 2, x, y + h / 2);
    const fingerLength = w * 0.85;
    for (let i = -2; i <= 2; i += 1) {
      const fy = y + i * h * 0.18;
      drawLine(ctx, x, fy, x + fingerLength * direction, fy);
    }
    ctx.restore();
  }

  function drawGrid(ctx, width, height) {
    ctx.strokeStyle = "rgba(90, 105, 116, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 32; x < width; x += 44) drawLine(ctx, x, 0, x, height);
    for (let y = 32; y < height; y += 44) drawLine(ctx, 0, y, width, y);
  }

  function drawCornerMarkers(ctx, die) {
    ctx.strokeStyle = "#d6f8ff";
    ctx.lineWidth = 3;
    const m = die.w * 0.045;
    const corners = [
      [die.x + m, die.y + m, 1, 1],
      [die.x + die.w - m, die.y + m, -1, 1],
      [die.x + m, die.y + die.h - m, 1, -1],
      [die.x + die.w - m, die.y + die.h - m, -1, -1]
    ];
    corners.forEach(([x, y, sx, sy]) => {
      drawLine(ctx, x, y, x + sx * 12, y);
      drawLine(ctx, x, y, x, y + sy * 12);
    });
  }

  function drawPad(ctx, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(30, 75, 102, 0.9)";
    ctx.strokeStyle = "#aeeaff";
    ctx.lineWidth = 2;
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function drawRectTrace(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
  }

  function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function addMessage(role, text) {
    const message = document.createElement("div");
    message.className = `message ${role}`;
    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.textContent = role === "user" ? "You" : "ChipBot";
    const body = document.createElement("div");
    body.textContent = text;
    message.append(meta, body);
    elements.chatLog.appendChild(message);
    elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
  }

  function runPrompt(prompt) {
    elements.statusPill.textContent = "Designing";
    const options = parsePrompt(prompt);
    const design = generateDesign(options);
    renderDesign(design);
    addMessage("bot", `${design.summary} The right panel now shows the fabricated preview and the Qiskit Metal schematic.`);
    elements.statusPill.textContent = "Ready";
  }

  elements.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const prompt = elements.promptInput.value.trim();
    if (!prompt) return;
    addMessage("user", prompt);
    elements.promptInput.value = "";
    runPrompt(prompt);
  });

  window.addEventListener("resize", () => {
    if (state.design) drawChip(state.design);
  });

  addMessage("bot", "Ask me for a chip design. I will return the fabricated preview and the Qiskit Metal schematic.");
  elements.designPanel.classList.add("awaiting");
}());
