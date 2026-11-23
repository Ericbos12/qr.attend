import React, { useEffect, useMemo, useState } from 'react';
import { Download, Search, FileSpreadsheet, RotateCcw } from 'lucide-react';
import { api } from '../api';

export default function ReportsView({ classes = [] }) {
  const [classId, setClassId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [studentSearch, setStudentSearch] = useState('');

  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = useMemo(
    () => ({
      classId: classId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    }),
    [classId, fromDate, toDate]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api
      .getReportSummary(filters)
      .then((data) => {
        if (active) setReport(data);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filters]);

  const filteredStudents = useMemo(() => {
    const list = report?.students || [];
    const q = studentSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        s.studentId.toLowerCase().includes(q) ||
        s.courses.some((c) => c.toLowerCase().includes(q))
    );
  }, [report?.students, studentSearch]);

  const summary = report?.summary || {
    totalSessions: 0,
    totalCheckIns: 0,
    uniqueStudents: 0,
    presentCount: 0,
    lateCount: 0,
    onTimeRate: 100,
    avgPerSession: 0,
  };

  const hasFilters = Boolean(classId || fromDate || toDate);

  return (
    <div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="page-header">
        <div>
          <h1 className="page-title">Attendance Reports</h1>
          <p className="page-sub">
            Review course summaries, track late arrivals, and export consolidated attendance sheets.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a
            className="btn btn-secondary btn-sm"
            href={api.getReportSummaryCsvUrl(filters)}
            download
          >
            <Download size={14} /> Summary CSV
          </a>
          <a
            className="btn btn-primary btn-sm"
            href={api.getReportRecordsCsvUrl(filters)}
            download
          >
            <FileSpreadsheet size={14} /> Bulk Register CSV
          </a>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="panel filter-bar">
        <div className="filter-field" style={{ minWidth: 200, flex: 1 }}>
          <label className="form-label" style={{ fontSize: '0.74rem' }}>
            Course
          </label>
          <select
            className="select"
            style={{ padding: '7px 10px', fontSize: '0.84rem' }}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
          >
            <option value="">All Courses</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.code} — {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-field">
          <label className="form-label" style={{ fontSize: '0.74rem' }}>
            From Date
          </label>
          <input
            type="date"
            className="input"
            style={{ padding: '6px 10px', fontSize: '0.84rem' }}
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
          />
        </div>

        <div className="filter-field">
          <label className="form-label" style={{ fontSize: '0.74rem' }}>
            To Date
          </label>
          <input
            type="date"
            className="input"
            style={{ padding: '6px 10px', fontSize: '0.84rem' }}
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-end', height: 35 }}
            onClick={() => {
              setClassId('');
              setFromDate('');
              setToDate('');
            }}
          >
            <RotateCcw size={13} /> Clear
          </button>
        )}
      </div>

      {/* KPI Strip */}
      <div className="summary-strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        <div className="summary-cell">
          <div className="summary-label">Sessions Held</div>
          <div className="summary-value">{summary.totalSessions}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Unique Students</div>
          <div className="summary-value">{summary.uniqueStudents}</div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">On-Time Rate</div>
          <div className="summary-value" style={{ color: 'var(--ok)' }}>
            {summary.totalCheckIns > 0 ? `${summary.onTimeRate}%` : '—'}
          </div>
        </div>
        <div className="summary-cell">
          <div className="summary-label">Late Arrivals</div>
          <div
            className="summary-value"
            style={{ color: summary.lateCount > 0 ? 'var(--warn)' : 'var(--ink)' }}
          >
            {summary.lateCount}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="panel" style={{ padding: 34, textAlign: 'center', color: 'var(--ink-muted)' }}>
          Loading report...
        </div>
      ) : (
        <>
          {/* Course Summary Table */}
          {report?.courses?.length > 0 && (
            <div style={{ marginBottom: 26 }}>
              <div className="section-header">
                <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Course Breakdown</h2>
                <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                  Avg {summary.avgPerSession} students / session
                </span>
              </div>
              <div className="panel">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Course</th>
                        <th>Sessions</th>
                        <th>Unique Students</th>
                        <th>Total Check-Ins</th>
                        <th>On Time</th>
                        <th>Late</th>
                        <th>Avg / Session</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.courses.map((c) => (
                        <tr key={c.classId}>
                          <td>
                            <span className="course-code-label mono" style={{ marginRight: 8 }}>
                              {c.code}
                            </span>
                            <span style={{ fontWeight: 600 }}>{c.name}</span>
                          </td>
                          <td className="mono">{c.sessionCount}</td>
                          <td className="mono">{c.uniqueStudents}</td>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {c.totalCheckIns}
                          </td>
                          <td className="mono" style={{ color: 'var(--ok)' }}>
                            {c.presentCount}
                          </td>
                          <td
                            className="mono"
                            style={{ color: c.lateCount > 0 ? 'var(--warn)' : 'var(--ink-muted)' }}
                          >
                            {c.lateCount}
                          </td>
                          <td className="mono">{c.avgPerSession}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Student Attendance Summary Table */}
          <div>
            <div className="section-header">
              <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>
                Student Attendance Summary ({filteredStudents.length})
              </h2>
              <div style={{ position: 'relative', width: 260 }}>
                <Search
                  size={14}
                  color="var(--ink-muted)"
                  style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
                />
                <input
                  className="input"
                  style={{ paddingLeft: 32, paddingTop: 7, paddingBottom: 7, fontSize: '0.84rem' }}
                  placeholder="Search student ID or name..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="panel">
              {filteredStudents.length === 0 ? (
                <div style={{ padding: 34, textAlign: 'center', color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
                  {summary.totalCheckIns === 0
                    ? 'No attendance records found for this selection.'
                    : 'No students match your search.'}
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Student ID</th>
                        <th>Full Name</th>
                        <th>Courses</th>
                        <th>Attended</th>
                        <th>Rate</th>
                        <th>On Time / Late</th>
                        <th>Last Recorded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((st) => (
                        <tr key={st.studentId}>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {st.studentId}
                          </td>
                          <td style={{ fontWeight: 500 }}>{st.studentName}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {st.courses.map((code) => (
                                <span key={code} className="course-code-label mono">
                                  {code}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="mono">
                            {st.sessionsAttended} / {st.totalSessions}
                          </td>
                          <td style={{ minWidth: 110 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="rate-track">
                                <div className="rate-fill" style={{ width: `${st.attendanceRate}%` }} />
                              </div>
                              <span className="mono" style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                                {st.attendanceRate}%
                              </span>
                            </div>
                          </td>
                          <td className="mono" style={{ fontSize: '0.82rem' }}>
                            <span style={{ color: 'var(--ok)', fontWeight: 600 }}>{st.presentCount}</span>
                            <span style={{ color: 'var(--ink-muted)' }}> / </span>
                            <span style={{ color: st.lateCount > 0 ? 'var(--warn)' : 'var(--ink-muted)', fontWeight: 600 }}>
                              {st.lateCount}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                            {new Date(st.lastCheckedInAt).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
