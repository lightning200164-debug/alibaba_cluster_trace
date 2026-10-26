(() => {
  "use strict";

  const data = window.dashboardData;
  const $ = (id) => document.getElementById(id);
  const state = { level: "daily", hardware: "H100", pue: "1_56", metric: "power", period: 0 };
  const scenarioKey = () => `${state.hardware}_PUE_${state.pue}`;

  const number = (value, digits = 2) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
  };
  const sum = (rows, key) => rows.reduce((acc, row) => acc + Number(row[key] || 0), 0);
  const mean = (rows, key) => rows.length ? sum(rows, key) / rows.length : 0;

  function sourceRows() {
    if (state.level === "daily") return data.daily.filter((r) => Number(r.day) === Number(state.period) && r.scenario_key === scenarioKey());
    if (state.level === "weekly") return data.weekly.filter((r) => Number(r.week) === Number(state.period) && r.scenario_key === scenarioKey());
    return data.full_period.filter((r) => r.scenario_key === scenarioKey());
  }

  function allLevelRows() {
    if (state.level === "daily") return data.daily;
    if (state.level === "weekly") return data.weekly;
    return data.full_period;
  }

  function populatePeriod() {
    const select = $("period");
    const old = String(state.period);
    select.innerHTML = "";
    if (state.level === "daily") {
      const days = [...new Set(data.daily.map((r) => Number(r.day)))];
      days.forEach((day) => {
        const option = document.createElement("option");
        option.value = day;
        option.textContent = `第 ${day} 天（相对 trace day）`;
        select.appendChild(option);
      });
      $("periodLabel").firstChild.textContent = "选择日期";
      state.period = days.includes(Number(old)) ? Number(old) : days[0];
    } else if (state.level === "weekly") {
      const weeks = [...new Map(data.weekly.map((r) => [Number(r.week), r])).values()].sort((a, b) => a.week - b.week);
      weeks.forEach((week) => {
        const option = document.createElement("option");
        option.value = week.week;
        option.textContent = `第 ${week.week} 周（第 ${week.week_start_day}–${week.week_end_day} 天）`;
        select.appendChild(option);
      });
      $("periodLabel").firstChild.textContent = "选择周次";
      state.period = weeks.some((r) => Number(r.week) === Number(old)) ? Number(old) : Number(weeks[0].week);
    } else {
      const option = document.createElement("option");
      option.value = "full";
      option.textContent = "185 天全周期";
      select.appendChild(option);
      $("periodLabel").firstChild.textContent = "统计范围";
      state.period = "full";
    }
    select.value = String(state.period);
  }

  function currentPeriodTitle() {
    if (state.level === "daily") return `第 ${state.period} 天`;
    if (state.level === "weekly") {
      const row = data.weekly.find((r) => Number(r.week) === Number(state.period));
      return row ? `第 ${row.week} 周（第 ${row.week_start_day}–${row.week_end_day} 天）` : `第 ${state.period} 周`;
    }
    return "185 天全周期";
  }

  function updateCards(rows) {
    const energy = sum(rows, "facility_energy_kwh");
    $("totalEnergy").textContent = `${number(energy / 1000000, 3)} GWh`;
    $("averagePower").textContent = `${number(mean(rows, "facility_power_mw"), 3)} MW`;
    $("peakPower").textContent = `${number(Math.max(...rows.map((r) => Number(r.facility_power_mw || 0))), 3)} MW`;
    $("slotCount").textContent = `${rows.length}`;
  }

  function metricConfig() {
    if (state.metric === "energy") return {
      suffix: "energy_kwh",
      unit: "kWh",
      label: "用电量",
      hover: "%{y:,.0f} kWh",
    };
    return {
      suffix: "power_mw",
      unit: "MW",
      label: "功率",
      hover: "%{y:,.2f} MW",
    };
  }

  // Keep the controls, table and data downloads usable even when a network
  // If the local Plotly file is missing or blocked, keep a compact static SVG
  // chart so the selectors, tables and downloads remain usable.
  function renderFallbackLineChart(containerId, series, xValues, yLabel) {
    const width = 900;
    const height = 390;
    const pad = { left: 72, right: 24, top: 28, bottom: 52 };
    const plotWidth = width - pad.left - pad.right;
    const plotHeight = height - pad.top - pad.bottom;
    const allY = series.flatMap((s) => s.y).map(Number);
    const maxY = Math.max(...allY, 1) * 1.08;
    const minX = Math.min(...xValues, 0);
    const maxX = Math.max(...xValues, 1);
    const xScale = (x) => pad.left + ((Number(x) - minX) / Math.max(maxX - minX, 1)) * plotWidth;
    const yScale = (y) => pad.top + plotHeight - (Number(y) / maxY) * plotHeight;
    const ticks = [0, maxY / 2, maxY];
    const grid = ticks.map((tick) => {
      const y = yScale(tick);
      return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#e7edf5"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" fill="#64748b" font-size="12">${number(tick, 1)}</text>`;
    }).join("");
    const paths = series.map((s) => {
      const points = s.y.map((value, i) => `${xScale(xValues[i])},${yScale(value)}`).join(" ");
      const dots = s.y.map((value, i) => `<circle cx="${xScale(xValues[i])}" cy="${yScale(value)}" r="3" fill="${s.color}"/>`).join("");
      return `<polyline points="${points}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}"/>${dots}`;
    }).join("");
    const legend = series.map((s, i) => `<g transform="translate(${pad.left + i * 155},14)"><line x1="0" y1="0" x2="24" y2="0" stroke="${s.color}" stroke-width="3"/><text x="31" y="4" fill="#334155" font-size="12">${s.label}</text></g>`).join("");
    const svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${yLabel}曲线"><rect width="100%" height="100%" fill="#fff"/>${grid}<line x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${width - pad.right}" y2="${pad.top + plotHeight}" stroke="#9aa8ba"/>${paths}${legend}<text x="${width / 2}" y="${height - 10}" text-anchor="middle" fill="#64748b" font-size="12">时段起始小时</text><text transform="translate(16 ${height / 2}) rotate(-90)" text-anchor="middle" fill="#64748b" font-size="12">${yLabel}</text></svg>`;
    $(containerId).innerHTML = `<div class="plot-fallback-note">交互图表库未加载，已使用静态兼容图；选择器和数据表仍可正常使用。</div>${svg}`;
  }

  function renderPlotOrFallback(containerId, traces, layout, options, fallback) {
    if (typeof Plotly === "undefined" || typeof Plotly.react !== "function") {
      fallback();
      return;
    }
    try {
      const pending = Plotly.react(containerId, traces, layout, options);
      if (pending && typeof pending.catch === "function") {
        pending.catch((error) => {
          console.error(`图表 ${containerId} 渲染失败，已切换为兼容图`, error);
          fallback();
        });
      }
    } catch (error) {
      console.error(`图表 ${containerId} 渲染失败，已切换为兼容图`, error);
      fallback();
    }
  }

  function renderProfile(rows) {
    const config = metricConfig();
    const x = rows.slice().sort((a, b) => Number(a.hour) - Number(b.hour)).map((r) => Number(r.hour));
    const series = [
      ["gpu", "GPU 板卡", "#6b7280"],
      ["server_non_gpu", "服务器非 GPU", "#16a34a"],
      ["it", "IT 侧", "#7c3aed"],
      ["facility", "数据中心侧", "#155eef"],
    ];
    const traces = series.map(([prefix, label, color]) => ({
      x,
      y: rows.slice().sort((a, b) => Number(a.hour) - Number(b.hour)).map((r) => Number(r[`${prefix}_${config.suffix}`] || 0)),
      type: "scatter",
      mode: "lines+markers",
      name: label,
      line: { color, width: prefix === "facility" ? 3 : 1.8 },
      marker: { size: 6 },
      hovertemplate: `${label}<br>时段 %{x}:00–%{customdata}<br>${config.hover}<extra></extra>`,
      customdata: rows.slice().sort((a, b) => Number(a.hour) - Number(b.hour)).map((r) => `${String((Number(r.hour) + 1) % 24).padStart(2, "0")}:00`),
    }));
    const title = `${currentPeriodTitle()} · ${state.hardware} · PUE ${state.pue.replace("_", ".")}`;
    $("profileTitle").textContent = `${title} · 24 时段${config.label}`;
    $("profileUnit").textContent = config.unit;
    const fallback = () => renderFallbackLineChart("profileChart", series.map(([prefix, label, color]) => ({
        label,
        color,
        width: prefix === "facility" ? 3 : 2,
        y: rows.slice().sort((a, b) => Number(a.hour) - Number(b.hour)).map((r) => Number(r[`${prefix}_${config.suffix}`] || 0)),
      })), x, config.unit);
    renderPlotOrFallback("profileChart", traces, {
      margin: { l: 62, r: 20, t: 18, b: 55 },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "#ffffff",
      hovermode: "x unified",
      legend: { orientation: "h", y: 1.12, x: 0 },
      xaxis: { title: "时段起始小时（0 = 00:00–01:00）", dtick: 4, range: [0, 23], gridcolor: "#edf1f6" },
      yaxis: { title: config.unit, rangemode: "tozero", gridcolor: "#edf1f6" },
      font: { family: "Segoe UI, Microsoft YaHei, sans-serif", color: "#334155" },
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }, fallback);
  }

  function renderTrend() {
    const rows = data.daily.filter((r) => r.scenario_key === scenarioKey());
    const groups = new Map();
    rows.forEach((r) => {
      const key = Number(r.day);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    });
    const keys = [...groups.keys()].sort((a, b) => a - b);
    const config = metricConfig();
    const values = keys.map((key) => {
      const group = groups.get(key);
      return state.metric === "energy" ? sum(group, "facility_energy_kwh") : mean(group, "facility_power_mw");
    });
    $("trendTitle").textContent = state.metric === "energy" ? "每日设施侧用电量趋势" : "每日平均数据中心功率趋势";
    const fallback = () => renderFallbackLineChart("trendChart", [{ label: "数据中心侧", color: "#155eef", width: 3, y: values }], keys, config.unit);
    renderPlotOrFallback("trendChart", [{ x: keys, y: values, type: "scatter", mode: "lines", line: { color: "#155eef", width: 2 }, fill: "tozeroy", fillcolor: "rgba(21,94,239,.10)", hovertemplate: state.metric === "energy" ? "第 %{x} 天<br>%{y:,.0f} kWh<extra></extra>" : "第 %{x} 天<br>%{y:,.2f} MW<extra></extra>" }], {
      margin: { l: 62, r: 18, t: 18, b: 50 },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "#fff",
      xaxis: { title: "相对 trace day", gridcolor: "#edf1f6" },
      yaxis: { title: config.unit, rangemode: "tozero", gridcolor: "#edf1f6" },
      font: { family: "Segoe UI, Microsoft YaHei, sans-serif", color: "#334155" },
    }, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ["lasso2d", "select2d"] }, fallback);
  }

  function renderTable(rows) {
    const body = $("detailTable").querySelector("tbody");
    const head = $("detailTable").querySelector("thead");
    head.innerHTML = "<tr><th>时段</th><th>GPU 板卡</th><th>服务器非 GPU</th><th>IT 侧</th><th>数据中心侧</th><th>单位</th></tr>";
    const config = metricConfig();
    body.innerHTML = rows.slice().sort((a, b) => Number(a.hour) - Number(b.hour)).map((r) => {
      const suffix = config.suffix;
      const unit = config.unit;
      return `<tr><td>${r.time_slot}</td><td>${number(r[`gpu_${suffix}`])}</td><td>${number(r[`server_non_gpu_${suffix}`])}</td><td>${number(r[`it_${suffix}`])}</td><td><strong>${number(r[`facility_${suffix}`])}</strong></td><td>${unit}</td></tr>`;
    }).join("");
    $("tableHint").textContent = state.level === "weekly" ? "周表中的用电量是该周同一时段的累计值，功率是该时段跨日期的平均值。" : "功率与用电量分别对应同一个小时段；按周查看时，用电量为该时段的周累计。";
  }

  function update() {
    const rows = sourceRows();
    if (!rows.length) return;
    updateCards(rows);
    renderProfile(rows);
    renderTrend();
    renderTable(rows);
    $("statusText").textContent = `已加载 ${data.meta.trace_days} 天 · ${data.meta.trace_weeks} 周`;
  }

  function setupDownloads() {
    const files = [
      ["每日 24 时段统计", "data/daily_time_slot_stats.csv", "185 天 × 24 时段 × 4 情景"],
      ["每周 24 时段统计", "data/weekly_time_slot_stats.csv", "27 周 × 24 时段 × 4 情景"],
      ["全周期 24 时段统计", "data/full_period_time_slot_stats.csv", "24 时段 × 4 情景"],
      ["数据中心小时级电量", "data/data_center_energy_hourly.csv", "4,440 个小时记录"],
      ["数据中心日级电量", "data/data_center_energy_daily.csv", "185 个 trace day"],
      ["数据中心侧总量汇总", "data/data_center_energy_summary.csv", "H100/B200 × 两种 PUE"],
      ["服务器功率与 PUE 参数", "data/server_power_pue_parameters.csv", "含来源 URL 和推导关系"],
    ];
    $("datasetList").innerHTML = files.map(([title, href, desc]) => `<article class="data-item"><h3>${title}</h3><p>${desc}</p><a href="${href}" download>下载 CSV</a></article>`).join("");
  }

  function setup() {
    ["viewLevel", "hardware", "pue", "metric", "period"].forEach((id) => {
      $(id).addEventListener("change", (event) => {
        if (id === "viewLevel") { state.level = event.target.value; populatePeriod(); }
        else if (id === "hardware") state.hardware = event.target.value;
        else if (id === "pue") state.pue = event.target.value;
        else if (id === "metric") state.metric = event.target.value;
        else if (id === "period") state.period = event.target.value === "full" ? "full" : Number(event.target.value);
        update();
      });
    });
    document.querySelectorAll(".nav-btn").forEach((btn) => btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".page-section").forEach((item) => item.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.section).classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }));
    setupDownloads();
    populatePeriod();
    update();
  }

  if (!data) {
    $("statusText").textContent = "数据文件未加载，请确认 data.js 与 data/ 文件夹都已上传";
  } else {
    setup();
    if (typeof Plotly === "undefined") $("statusText").textContent = "数据已加载（兼容图模式）";
  }
})();
