import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import jsPDF from "jspdf";
import "jspdf-autotable";

function parseNumber(x) {
  if (x === null || x === undefined) return NaN;
  if (typeof x === "number") return x;
  const s = String(x).trim().replace(/,/g, "").replace(/%/g, "");
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : NaN;
}

export default function App() {
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [data, setData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [gradeCol, setGradeCol] = useState("");
  const [groupCol, setGroupCol] = useState("");
  const [title, setTitle] = useState("");

  // Adjustable thresholds (drive “Rate (%)” columns and charts)
  const [passing, setPassing] = useState(40);
  const [merit, setMerit] = useState(60);
  const [distinction, setDistinction] = useState(70);

  const [overallSummary, setOverallSummary] = useState([]);
  const [groupSummary, setGroupSummary] = useState([]);
  const [reportGenerated, setReportGenerated] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: "binary" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const json = XLSX.utils.sheet_to_json(ws, { defval: null });
      setData(json);

      const cols = Object.keys(json[0] || {});
      setColumns(cols);

      const gradeCandidate = cols.find((c) => /grade|score|marks?/i.test(c));
      const groupCandidate = cols.find((c) => /group|section|class|cohort/i.test(c));

      setGradeCol(gradeCandidate || cols[0] || "");
      setGroupCol(groupCandidate || cols[1] || "");
      setOverallSummary([]);
      setGroupSummary([]);
      setReportGenerated(false);
    };
    reader.readAsBinaryString(file);
  };

  // Validate and normalize thresholds (keep logical order)
  const coerceThresholds = () => {
    let p = Number.isFinite(passing) ? passing : 40;
    let m = Number.isFinite(merit) ? merit : 60;
    let d = Number.isFinite(distinction) ? distinction : 70;
    p = Math.max(0, Math.min(100, p));
    m = Math.max(p, Math.min(100, m));
    d = Math.max(m, Math.min(100, d));
    return { p, m, d };
  };

  const generateReport = () => {
    if (!data.length) return alert("Please upload a data file first.");
    if (!gradeCol) return alert("Please select a Grade column.");
    if (!groupCol) return alert("Please select a Group column.");
    if (!title.trim()) {
      const ok = window.confirm("Title is empty. Use default title 'Mid-Term Politics Grades Report'?");
      if (!ok) return;
      setTitle("Mid-Term Politics Grades Report");
    }

    const { p, m, d } = coerceThresholds();

    // Prepare rows
    const rows = data
      .map((r) => ({
        grade: parseNumber(r[gradeCol]),
        group: r[groupCol] === null || r[groupCol] === undefined ? "(missing)" : String(r[groupCol]),
      }))
      .filter((r) => !Number.isNaN(r.grade));

    const N = rows.length;
    if (N === 0) return alert("No numeric grades found in selected Grade column.");

    // Dynamic (threshold-driven) metrics
    const passCount = rows.filter((r) => r.grade >= p).length;
    const meritCount = rows.filter((r) => r.grade >= m && r.grade < d).length;
    const distCount = rows.filter((r) => r.grade >= d).length;
    const failCount = N - passCount;

    // Fixed band counts (as requested)
    const passBandCount = rows.filter((r) => r.grade >= 40 && r.grade < 60).length; // 40–59
    const meritBandCount = rows.filter((r) => r.grade >= 60 && r.grade < 70).length; // 60–69
    const distBandCount = rows.filter((r) => r.grade >= 70).length;                // ≥70
    const overallPassingRateFixed = ((rows.filter((r) => r.grade >= 40).length / N) * 100).toFixed(1);

    const grades = rows.map((r) => r.grade);
    const mean = grades.reduce((a, b) => a + b, 0) / grades.length;
    const sd = Math.sqrt(grades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / grades.length);

    setOverallSummary([
      {
        N,
        "Passing Count (≥ current Passing)": passCount,
        "Failed Count": failCount,
        "Passing Rate (%)": ((passCount / N) * 100).toFixed(1),
        "Merit Rate (%)": ((meritCount / N) * 100).toFixed(1),
        "Distinction Rate (%)": ((distCount / N) * 100).toFixed(1),
        "Overall Passing Rate (≥40) (%)": overallPassingRateFixed,
        "Pass (40–59) Count": passBandCount,
        "Merit (60–69) Count": meritBandCount,
        "Distinction (≥70) Count": distBandCount,
        Mean: mean.toFixed(2),
        SD: sd.toFixed(2),
        Max: Math.max(...grades),
        Min: Math.min(...grades),
      },
    ]);

    // Group summary
    const groups = {};
    rows.forEach((r) => {
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r.grade);
    });

    const groupArr = Object.keys(groups)
      .sort()
      .map((g) => {
        const arr = groups[g];
        const n = arr.length;

        // dynamic
        const pass = arr.filter((x) => x >= p).length;
        const meritN = arr.filter((x) => x >= m && x < d).length;
        const dist = arr.filter((x) => x >= d).length;
        const fail = n - pass;

        // fixed bands
        const passBand = arr.filter((x) => x >= 40 && x < 60).length;
        const meritBand = arr.filter((x) => x >= 60 && x < 70).length;
        const distBand = arr.filter((x) => x >= 70).length;
        const overallPassFixed = ((arr.filter((x) => x >= 40).length / n) * 100).toFixed(1);

        const mval = arr.reduce((a, b) => a + b, 0) / n;
        const s = Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mval, 2), 0) / n);

        return {
          Group: g,
          N: n,
          "Passing Count (≥ current Passing)": pass,
          "Failed Count": fail,
          "Passing Rate (%)": ((pass / n) * 100).toFixed(1),
          "Merit Rate (%)": ((meritN / n) * 100).toFixed(1),
          "Distinction Rate (%)": ((dist / n) * 100).toFixed(1),
          "Overall Passing Rate (≥40) (%)": overallPassFixed,
          "Pass (40–59) Count": passBand,
          "Merit (60–69) Count": meritBand,
          "Distinction (≥70) Count": distBand,
          Mean: mval.toFixed(2),
          SD: s.toFixed(2),
          Max: Math.max(...arr),
          Min: Math.min(...arr),
        };
      });

    setGroupSummary(groupArr);
    setReportGenerated(true);

    setTimeout(() => {
      const el = document.getElementById("results");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    }, 150);
  };

  // PDF export (includes all columns currently shown in summaries)
  const downloadPDF = () => {
    if (!reportGenerated) return alert("Generate report first.");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // Cover page (centered)
    doc.setFillColor(240, 248, 255);
    doc.rect(0, 0, pageWidth, pageHeight, "F");

    doc.setFont("Times", "bold");
    doc.setFontSize(28);
    doc.setTextColor(0, 51, 102);

    let y = pageHeight / 2 - 30;
    doc.text(title || "Mid-Term Politics Grades Report", pageWidth / 2, y, { align: "center" });

    doc.setDrawColor(0, 102, 204);
    doc.setLineWidth(1);
    doc.line(pageWidth / 2 - 70, y + 6, pageWidth / 2 + 70, y + 6);

    doc.setFont("Times", "italic");
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, pageWidth / 2, y + 26, { align: "center" });

    doc.setFont("Times", "normal");
    doc.setFontSize(14);
    doc.text("Prepared by: Youssef Lafy", pageWidth / 2, y + 46, { align: "center" });

    // Tables
    doc.addPage();

    doc.setFont("Times", "bold");
    doc.setFontSize(18);
    doc.setTextColor(0, 51, 102);
    doc.text("Overall Summary", pageWidth / 2, 36, { align: "center" });

    doc.autoTable({
      head: [Object.keys(overallSummary[0])],
      body: overallSummary.map((row) => Object.values(row)),
      startY: 48,
      theme: "grid",
      headStyles: { fillColor: [0, 102, 204], textColor: 255, fontStyle: "bold" },
      bodyStyles: { font: "Times", fontSize: 10, halign: "center", valign: "middle" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { halign: "center" },
      tableWidth: "auto",
      margin: { left: 24, right: 24 },
    });

    let nextY = doc.lastAutoTable.finalY + 24;
    if (nextY > pageHeight - 60) {
      doc.addPage();
      nextY = 36;
    }

    doc.setFont("Times", "bold");
    doc.setFontSize(18);
    doc.text("Group Summary", pageWidth / 2, nextY, { align: "center" });

    doc.autoTable({
      head: [Object.keys(groupSummary[0])],
      body: groupSummary.map((row) => Object.values(row)),
      startY: nextY + 12,
      theme: "grid",
      headStyles: { fillColor: [0, 102, 204], textColor: 255, fontStyle: "bold" },
      bodyStyles: { font: "Times", fontSize: 10, halign: "center", valign: "middle" },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      styles: { halign: "center" },
      tableWidth: "auto",
      margin: { left: 24, right: 24 },
    });

    const safeTitle = (title && title.trim()) ? title.replace(/\s+/g, "_") : "Mid-Term_Politics_Grades_Report";
    const filename = `${safeTitle}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(filename);
  };

  const resetAll = () => {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setFileName("");
    setData([]);
    setColumns([]);
    setGradeCol("");
    setGroupCol("");
    setTitle("");
    setPassing(40);
    setMerit(60);
    setDistinction(70);
    setOverallSummary([]);
    setGroupSummary([]);
    setReportGenerated(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Data for charts
  const gradesForHistogram = reportGenerated ? data.map((r) => parseNumber(r[gradeCol])).filter((x) => Number.isFinite(x)) : [];
  const boxplotDataByGroup = reportGenerated
    ? Object.entries(
        data.reduce((acc, row) => {
          const g = row[groupCol] ?? "(missing)";
          if (!acc[g]) acc[g] = [];
          const val = parseNumber(row[gradeCol]);
          if (!Number.isNaN(val)) acc[g].push(val);
          return acc;
        }, {})
      ).map(([grp, arr]) => ({ y: arr, type: "box", name: String(grp) }))
    : [];

  // Group rates bar chart (dynamic thresholds)
  const groupRatesChart = reportGenerated
    ? (() => {
        const { p, m, d } = coerceThresholds();
        const groupsMap = {};
        data.forEach((row) => {
          const g = row[groupCol] ?? "(missing)";
          const val = parseNumber(row[gradeCol]);
          if (!Number.isFinite(val)) return;
          if (!groupsMap[g]) groupsMap[g] = [];
          groupsMap[g].push(val);
        });
        const groupsSorted = Object.keys(groupsMap).sort();
        const passRates = groupsSorted.map((g) => {
          const arr = groupsMap[g];
          const n = arr.length || 1;
          return (100 * arr.filter((x) => x >= p).length) / n;
        });
        const meritRates = groupsSorted.map((g) => {
          const arr = groupsMap[g];
          const n = arr.length || 1;
          return (100 * arr.filter((x) => x >= m && x < d).length) / n;
        });
        const distRates = groupsSorted.map((g) => {
          const arr = groupsMap[g];
          const n = arr.length || 1;
          return (100 * arr.filter((x) => x >= d).length) / n;
        });
        return {
          x: groupsSorted,
          passRates,
          meritRates,
          distRates,
        };
      })()
    : null;

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-6xl mx-auto bg-white shadow rounded-2xl p-6">
        <h1 className="text-3xl font-semibold mb-6 text-center">Grade Report Generator</h1>

        {/* Controls */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-50 rounded-xl p-4 border">
              <label className="block text-sm font-medium text-gray-700">Upload CSV / XLSX</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
                className="mt-2 block w-full text-sm text-gray-900"
              />
              {fileName && <div className="text-xs text-gray-500 mt-1">Loaded: {fileName}</div>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 border">
                <label className="block text-sm font-medium text-gray-700">Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter report title"
                  className="mt-2 block w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border">
                <label className="block text-sm font-medium text-gray-700">Grade Column</label>
                <select
                  value={gradeCol}
                  onChange={(e) => setGradeCol(e.target.value)}
                  className="mt-2 block w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- select --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-gray-50 rounded-xl p-4 border">
                <label className="block text-sm font-medium text-gray-700">Group Column</label>
                <select
                  value={groupCol}
                  onChange={(e) => setGroupCol(e.target.value)}
                  className="mt-2 block w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- select --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Threshold controls */}
              <div className="bg-gray-50 rounded-xl p-4 border md:col-span-2">
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-sm font-medium text-gray-700">Passing Threshold (drives Passing Rate)</label>
                    <input
                      type="number"
                      value={passing}
                      onChange={(e) => setPassing(Number(e.target.value))}
                      className="mt-2 block w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-sm font-medium text-gray-700">Merit Threshold (drives Merit Rate)</label>
                    <input
                      type="number"
                      value={merit}
                      onChange={(e) => setMerit(Number(e.target.value))}
                      className="mt-2 block w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-sm font-medium text-gray-700">Distinction Threshold (drives Distinction Rate)</label>
                    <input
                      type="number"
                      value={distinction}
                      onChange={(e) => setDistinction(Number(e.target.value))}
                      className="mt-2 block w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Note: Fixed bands for counts use 40/60/70 (Pass 40–59, Merit 60–69, Distinction ≥70), independent of the thresholds above.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-stretch">
            <button onClick={generateReport} className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700">
              Generate Report
            </button>
            <button
              onClick={downloadPDF}
              disabled={!reportGenerated}
              className={`w-full py-2 rounded-lg ${reportGenerated ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-300 text-gray-600 cursor-not-allowed"}`}
            >
              Download PDF
            </button>
            <button onClick={resetAll} className="w-full bg-gray-600 text-white py-2 rounded-lg hover:bg-gray-700">
              Reset
            </button>
          </div>
        </div>

        {/* Results */}
        <div id="results" className="mt-10">
          {overallSummary.length > 0 && (
            <div>
              <h2 className="text-2xl font-semibold text-center mb-3">Overall Summary</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border-collapse rounded-xl overflow-hidden">
                  <thead className="bg-gray-100">
                    <tr>
                      {Object.keys(overallSummary[0]).map((k) => (
                        <th key={k} className="border px-3 py-2 text-sm font-semibold text-center">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {overallSummary.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="border px-3 py-2 text-sm text-center">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {groupSummary.length > 0 && (
            <div className="mt-8">
              <h2 className="text-2xl font-semibold text-center mb-3">Group Summary</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto border-collapse rounded-xl overflow-hidden">
                  <thead className="bg-gray-100">
                    <tr>
                      {Object.keys(groupSummary[0]).map((k) => (
                        <th key={k} className="border px-3 py-2 text-sm font-semibold text-center">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupSummary.map((row, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="border px-3 py-2 text-sm text-center">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Charts */}
          {reportGenerated && (
            <>
              <div className="mt-10">
                <h3 className="text-xl font-semibold mb-2">Grade Distribution</h3>
                <Plot
                  data={[{ x: gradesForHistogram, type: "histogram", name: "Grades" }]}
                  layout={{ autosize: true, title: "Grade Distribution", bargap: 0.02, margin: { t: 40, r: 10, b: 40, l: 40 } }}
                  style={{ width: "100%", height: "380px" }}
                  useResizeHandler
                />
              </div>

              <div className="mt-8">
                <h3 className="text-xl font-semibold mb-2">Boxplot by Group</h3>
                <Plot
                  data={boxplotDataByGroup}
                  layout={{ autosize: true, title: "Boxplot by Group", margin: { t: 40, r: 10, b: 40, l: 40 } }}
                  style={{ width: "100%", height: "380px" }}
                  useResizeHandler
                />
              </div>

              {groupRatesChart && (
                <div className="mt-8">
                  <h3 className="text-xl font-semibold mb-2">Group Rates (Driven by Current Thresholds)</h3>
                  <Plot
                    data={[
                      { x: groupRatesChart.x, y: groupRatesChart.passRates, type: "bar", name: "Passing Rate (%)" },
                      { x: groupRatesChart.x, y: groupRatesChart.meritRates, type: "bar", name: "Merit Rate (%)" },
                      { x: groupRatesChart.x, y: groupRatesChart.distRates, type: "bar", name: "Distinction Rate (%)" },
                    ]}
                    layout={{
                      autosize: true,
                      barmode: "group",
                      title: "Passing / Merit / Distinction Rates by Group",
                      yaxis: { ticksuffix: "%" },
                      margin: { t: 50, r: 10, b: 60, l: 50 },
                    }}
                    style={{ width: "100%", height: "420px" }}
                    useResizeHandler
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
