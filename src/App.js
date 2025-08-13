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

  const generateReport = () => {
    if (!data.length) return alert("Please upload a data file first.");
    if (!gradeCol) return alert("Please select a Grade column.");
    if (!groupCol) return alert("Please select a Group column.");
    if (!title.trim()) {
      const ok = window.confirm("Title is empty. Use default title?");
      if (!ok) return;
      setTitle("Mid-Term Politics Grades Report");
    }

    const rows = data
      .map((r) => ({
        grade: parseNumber(r[gradeCol]),
        group:
          r[groupCol] === null || r[groupCol] === undefined
            ? "(missing)"
            : String(r[groupCol]),
      }))
      .filter((r) => !Number.isNaN(r.grade));

    const N = rows.length;
    if (N === 0) return alert("No numeric grades found.");

    const passCount = rows.filter((r) => r.grade >= passing).length;
    const meritCount = rows.filter(
      (r) => r.grade >= merit && r.grade < distinction
    ).length;
    const distCount = rows.filter((r) => r.grade >= distinction).length;
    const failCount = N - passCount;

    const grades = rows.map((r) => r.grade);
    const mean = grades.reduce((a, b) => a + b, 0) / grades.length;
    const sd = Math.sqrt(
      grades.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / grades.length
    );

    setOverallSummary([
      {
        N,
        "Passing Count": passCount,
        "Failed Count": failCount,
        "Passing Rate (%)": ((passCount / N) * 100).toFixed(1),
        "Merit Rate (%)": ((meritCount / N) * 100).toFixed(1),
        "Distinction Rate (%)": ((distCount / N) * 100).toFixed(1),
        Mean: mean.toFixed(2),
        SD: sd.toFixed(2),
        Max: Math.max(...grades),
        Min: Math.min(...grades),
      },
    ]);

    const groups = {};
    rows.forEach((r) => {
      if (!groups[r.group]) groups[r.group] = [];
      groups[r.group].push(r.grade);
    });

    const groupArr = Object.keys(groups).map((g) => {
      const arr = groups[g];
      const n = arr.length;
      const pass = arr.filter((x) => x >= passing).length;
      const meritN = arr.filter(
        (x) => x >= merit && x < distinction
      ).length;
      const dist = arr.filter((x) => x >= distinction).length;
      const fail = n - pass;
      const m = arr.reduce((a, b) => a + b, 0) / n;
      const s = Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - m, 2), 0) / n);
      return {
        Group: g,
        N: n,
        "Passing Count": pass,
        "Failed Count": fail,
        "Passing Rate (%)": ((pass / n) * 100).toFixed(1),
        "Merit Rate (%)": ((meritN / n) * 100).toFixed(1),
        "Distinction Rate (%)": ((dist / n) * 100).toFixed(1),
        Mean: m.toFixed(2),
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
    }, 200);
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

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-5xl mx-auto bg-white shadow rounded-lg p-6">
        <h1 className="text-2xl font-semibold mb-4">Grade Report Generator</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="col-span-1 md:col-span-2 space-y-3">
            <div>
              <label>Upload CSV / XLSX</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileChange}
              />
              {fileName && <div>Loaded: {fileName}</div>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label>Title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter report title"
                />
              </div>

              <div>
                <label>Grade Column</label>
                <select
                  value={gradeCol}
                  onChange={(e) => setGradeCol(e.target.value)}
                >
                  <option value="">-- select --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Group Column</label>
                <select
                  value={groupCol}
                  onChange={(e) => setGroupCol(e.target.value)}
                >
                  <option value="">-- select --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Passing Threshold</label>
                <input
                  type="number"
                  value={passing}
                  onChange={(e) => setPassing(Number(e.target.value))}
                />
              </div>

              <div>
                <label>Merit Threshold</label>
                <input
                  type="number"
                  value={merit}
                  onChange={(e) => setMerit(Number(e.target.value))}
                />
              </div>

              <div>
                <label>Distinction Threshold</label>
                <input
                  type="number"
                  value={distinction}
                  onChange={(e) => setDistinction(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 items-stretch">
            <button
              onClick={generateReport}
              className="bg-blue-600 text-white py-2"
            >
              Generate Report
            </button>
            <button
              disabled={!reportGenerated}
              className={`py-2 ${
                reportGenerated
                  ? "bg-green-600 text-white"
                  : "bg-gray-300 text-gray-600"
              }`}
            >
              Download PDF
            </button>
            <button onClick={resetAll} className="bg-gray-600 text-white py-2">
              Reset
            </button>
          </div>
        </div>

        <div id="results" className="mt-8">
          {overallSummary.length > 0 && (
            <div>
              <h2>Overall Summary</h2>
              <table>
                <thead>
                  <tr>
                    {Object.keys(overallSummary[0]).map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {overallSummary.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {groupSummary.length > 0 && (
            <div>
              <h2>Group Summary</h2>
              <table>
                <thead>
                  <tr>
                    {Object.keys(groupSummary[0]).map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {groupSummary.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
