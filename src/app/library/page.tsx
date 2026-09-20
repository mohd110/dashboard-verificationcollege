import { Suspense } from 'react';
import Link from 'next/link';
import {
  BookOpen, Users, BookPlus, CornerDownLeft,
  Search, TrendingUp, BookMarked, AlertTriangle, Clock, ArrowRight,
  CheckCircle,
} from 'lucide-react';
import { getDashboardStats, getRecentTransactions } from '@/actions/library/books';
import { searchBooks } from '@/actions/library/books';
import { formatDate, formatTime, isToday } from '@/lib/library/format';
import { one, type BookRow, type TransactionRow } from '@/lib/library/rows';

// ─── Stat Card Component ──────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string; value: number; sub: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-card__icon stat-card__icon--${color}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="stat-card__value">{value.toLocaleString()}</p>
        <p className="stat-card__label">{label}</p>
        <p className="stat-card__sub">{sub}</p>
      </div>
    </div>
  );
}

// ─── Quick Action Card ────────────────────────────────────────────────────
function QuickAction({
  href, icon: Icon, iconBg, title, desc,
}: {
  href: string; icon: React.ElementType; iconBg: string; title: string; desc: string;
}) {
  return (
    <Link href={href} className="quick-action-card">
      <div className="quick-action-card__icon" style={{ background: iconBg }}>
        <Icon size={18} />
      </div>
      <div>
        <p className="quick-action-card__title">{title}</p>
        <p className="quick-action-card__desc">{desc}</p>
      </div>
    </Link>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────
function TxnBadge({ txn }: { txn: TransactionRow }) {
  const isOverdue = !txn.returned_at && txn.due_date && new Date(txn.due_date) < new Date();
  if (isOverdue) return <span className="badge badge--overdue">Overdue</span>;
  if (txn.returned_at) return <span className="badge badge--success">Returned</span>;
  return <span className="badge badge--info">Issued</span>;
}

// ─── Stats Section ─────────────────────────────────────────────────────────
async function DashboardStats() {
  try {
    const stats = await getDashboardStats();
    return (
      <div className="stat-grid">
        <StatCard label="Total Books" value={stats.totalBooks} sub="Library collection" icon={BookMarked} color="blue" />
        <StatCard label="Available" value={stats.availableBooks} sub="Ready to issue" icon={CheckCircle} color="green" />
        <StatCard label="Issued" value={stats.issuedBooks} sub="Currently with students" icon={BookOpen} color="orange" />
        <StatCard label="Overdue" value={stats.overdueBooks} sub="Requires attention" icon={AlertTriangle} color="red" />
        <StatCard label="Today" value={stats.todayTransactions} sub="Transactions today" icon={TrendingUp} color="purple" />
      </div>
    );
  } catch {
    return (
      <div className="alert alert--warning">
        <AlertTriangle size={15} />
        <span>Could not load statistics. Please check your database connection.</span>
      </div>
    );
  }
}

// ─── Recent Transactions Section ──────────────────────────────────────────
async function RecentTransactions() {
  try {
    const transactions = await getRecentTransactions(8);

    if (!transactions.length) {
      return (
        <div className="empty-state">
          <div className="empty-state__icon"><ArrowRight size={20} /></div>
          <p className="empty-state__title">No transactions yet</p>
          <p className="empty-state__sub">Issue a book to get started.</p>
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="lib-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Book</th>
              <th>Action</th>
              <th>Librarian</th>
              <th>Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t: TransactionRow) => {
              const person = one(t.people);
              const book = one(t.books);
              const actor = one(t.actors);
              // Today reads as a time, because on the day itself the date is
              // noise. Everything older is a plain DD/MM/YYYY date.
              const dateStr = isToday(t.created_at)
                ? `Today, ${formatTime(t.created_at)}`
                : formatDate(t.created_at);

              return (
                <tr key={t.id}>
                  <td>
                    <p className="cell-primary">{person?.full_name ?? '—'}</p>
                    <p className="cell-secondary">{person?.student_id ?? ''}</p>
                  </td>
                  <td>
                    <p className="cell-primary">{book?.title ?? '—'}</p>
                    <p className="cell-secondary">{book?.book_code ?? ''}</p>
                  </td>
                  <td>
                    <span style={{ textTransform: 'capitalize' }}>{t.action}</span>
                  </td>
                  <td>{actor?.full_name ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--gray-500)' }}>{dateStr}</td>
                  <td><TxnBadge txn={t} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  } catch {
    return (
      <div className="alert alert--danger">
        <AlertTriangle size={15} />
        <span>Could not load transactions.</span>
      </div>
    );
  }
}

// ─── Recently Added Books ─────────────────────────────────────────────────
async function RecentBooks() {
  try {
    const books = await searchBooks({ query: '', status: 'all' });
    const recent = books.slice(0, 5);

    if (!recent.length) {
      return (
        <div className="empty-state">
          <div className="empty-state__icon"><BookOpen size={20} /></div>
          <p className="empty-state__title">No books in library</p>
          <p className="empty-state__sub">Add books to get started.</p>
        </div>
      );
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table className="lib-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Author</th>
              <th>Copies</th>
              <th>Available</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((book: BookRow) => (
              <tr key={book.id}>
                <td>
                  <p className="cell-primary">{book.title}</p>
                  <p className="cell-secondary">{book.book_code}</p>
                </td>
                <td style={{ color: 'var(--gray-600)' }}>{book.author}</td>
                <td style={{ textAlign: 'center' }}>{book.total_copies}</td>
                <td style={{ textAlign: 'center' }}>{book.available_copies}</td>
                <td>
                  <span className={`badge badge--${book.available_copies > 0 ? 'available' : 'issued'}`}>
                    {book.available_copies > 0 ? 'Available' : 'All Issued'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } catch {
    return <div className="alert alert--danger"><span>Could not load books.</span></div>;
  }
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────
function StatsSkeleton() {
  return (
    <div className="stat-grid">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="stat-card">
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ width: '60%', height: 28, borderRadius: 4 }} />
          <div className="skeleton" style={{ width: '80%', height: 12, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div style={{ padding: '16px 20px' }}>
      {[...Array(5)].map((_, i) => (
        <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div className="skeleton" style={{ flex: 2, height: 14, borderRadius: 4 }} />
          <div className="skeleton" style={{ flex: 2, height: 14, borderRadius: 4 }} />
          <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
          <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
          <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard Page ────────────────────────────────────────────────────────
export default function LibraryDashboardPage() {
  return (
    <div className="lib-content">
      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div className="lib-page-header" style={{ margin: 0 }}>
          <h1 className="lib-page-title">Library Dashboard</h1>
          <p className="lib-page-sub">Manage books, students and library transactions from one place.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link href="/library/return" className="btn btn-secondary btn-sm">
            <CornerDownLeft size={14} /> Return Book
          </Link>
          <Link href="/library/issue" className="btn btn-primary">
            <BookPlus size={15} /> Issue Book
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>

      {/* Quick Actions */}
      <div style={{ marginBottom: 8 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-900)', margin: '0 0 12px' }}>Quick Actions</h2>
      </div>
      <div className="quick-actions" style={{ marginBottom: 24 }}>
        <QuickAction
          href="/library/students"
          icon={Users}
          iconBg="var(--brand-50)"
          title="Find Student"
          desc="Search or look up a student"
        />
        <QuickAction
          href="/library/issue"
          icon={BookPlus}
          iconBg="var(--success-bg)"
          title="Issue Book"
          desc="Issue a book to a verified student"
        />
        <QuickAction
          href="/library/return"
          icon={CornerDownLeft}
          iconBg="var(--warning-bg)"
          title="Return Book"
          desc="Process an active book return"
        />
        <QuickAction
          href="/library/books"
          icon={Search}
          iconBg="var(--info-bg)"
          title="Search Books"
          desc="Find books by title, author or ISBN"
        />
      </div>

      {/* Two-column lower section */}
      <div className="section-row">
        {/* Recent Transactions */}
        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <div className="card-header">
            <h3 className="card-title">Recent Transactions</h3>
            <Link href="/library/transactions" className="btn btn-ghost btn-sm" style={{ gap: 4, color: 'var(--brand-600)' }}>
              View All <ArrowRight size={13} />
            </Link>
          </div>
          <Suspense fallback={<TableSkeleton />}>
            <RecentTransactions />
          </Suspense>
        </div>
      </div>

      {/* Recent Books */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Library Collection (Preview)</h3>
          <Link href="/library/books" className="btn btn-ghost btn-sm" style={{ gap: 4, color: 'var(--brand-600)' }}>
            View All Books <ArrowRight size={13} />
          </Link>
        </div>
        <Suspense fallback={<TableSkeleton />}>
          <RecentBooks />
        </Suspense>
      </div>
    </div>
  );
}
