'use client';

import { useState, useTransition } from 'react';
import { Search, User, CheckCircle, BookOpen, Clock, AlertTriangle } from 'lucide-react';
import { lookupStudents } from '@/actions/library/students';
import Link from 'next/link';

type Student = {
  id: string; student_id: string; full_name: string;
  email: string; department: string; status: string;
};

export default function StudentsPage() {
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function doSearch(q: string) {
    if (q.trim().length < 2) {
      setStudents([]);
      setSearched(false);
      return;
    }
    setError('');
    startTransition(async () => {
      try {
        const result = await lookupStudents(q);
        setStudents(result as Student[]);
        setSearched(true);
      } catch {
        setError('Could not search students.');
      }
    });
  }

  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Students</h1>
        <p className="lib-page-sub">Search for a student to view their library profile and transaction history.</p>
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 20, maxWidth: 600 }}>
        <div className="card-body">
          <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
            Find Student
          </label>
          <div className="search-box">
            <Search size={15} />
            <input
              type="text"
              className="form-input"
              placeholder="Search by student name or student ID…"
              value={query}
              onChange={e => { setQuery(e.target.value); doSearch(e.target.value); }}
              autoFocus
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--gray-400)', margin: '8px 0 0' }}>
            Enter at least 2 characters to search
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert--danger">
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}

      {/* Results */}
      {isPending && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ width: '40%', height: 14, borderRadius: 4, marginBottom: 6 }} />
                  <div className="skeleton" style={{ width: '60%', height: 12, borderRadius: 4 }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!isPending && searched && students.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon"><User size={20} /></div>
          <p className="empty-state__title">No students found</p>
          <p className="empty-state__sub">Try a different name or student ID.</p>
        </div>
      )}

      {!isPending && !searched && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 8 }}>
          <div className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="stat-card__icon stat-card__icon--blue" style={{ flexShrink: 0 }}><Search size={16} /></div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Search by Name</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-400)' }}>e.g. Rahul Kumar</p>
            </div>
          </div>
          <div className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="stat-card__icon stat-card__icon--green" style={{ flexShrink: 0 }}><User size={16} /></div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Search by Student ID</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-400)' }}>e.g. 20260042</p>
            </div>
          </div>
          <div className="card card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="stat-card__icon stat-card__icon--orange" style={{ flexShrink: 0 }}><BookOpen size={16} /></div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>View Library Profile</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-400)' }}>Active books & history</p>
            </div>
          </div>
        </div>
      )}

      {!isPending && students.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {students.map(student => (
            <div key={student.id} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {/* Avatar */}
                <div style={{
                  width: 42, height: 42, borderRadius: '50%',
                  background: 'var(--brand-50)', color: 'var(--brand-600)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 14, flexShrink: 0,
                }}>
                  {student.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--gray-900)' }}>{student.full_name}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--gray-500)' }}>
                    {student.student_id} · {student.department}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className={`badge badge--${student.status === 'active' ? 'success' : 'warning'}`}>
                  {student.status}
                </span>
                <Link href={`/library/students/${student.id}`} className="btn btn-primary btn-sm">
                  View Profile
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
