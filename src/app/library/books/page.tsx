'use client';

import { useState, useTransition, useEffect } from 'react';
import { Search, BookOpen, CheckCircle, AlertTriangle, Filter } from 'lucide-react';
import { searchBooks } from '@/actions/library/books';

type Book = {
  id: string; book_code: string; title: string; author: string;
  isbn: string | null; genre: string | null; status: string;
  total_copies: number; available_copies: number; created_at: string;
};

function BookStatusBadge({ book }: { book: Book }) {
  if (book.available_copies === 0) return <span className="badge badge--issued">All Issued</span>;
  if (book.status === 'reserved') return <span className="badge badge--reserved">Reserved</span>;
  return <span className="badge badge--available">Available</span>;
}

export default function BooksPage() {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | 'available' | 'issued' | 'reserved'>('all');
  const [books, setBooks] = useState<Book[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function doSearch(q: string, s: typeof status) {
    setError('');
    startTransition(async () => {
      try {
        const result = await searchBooks({ query: q, status: s });
        setBooks(result as Book[]);
        setLoaded(true);
      } catch (e) {
        setError('Could not load books. Check your connection.');
      }
    });
  }

  // Load on mount
  useEffect(() => {
    if (!loaded && !isPending) {
      doSearch('', 'all');
    }
  }, [loaded, isPending]);

  return (
    <div className="lib-content">
      <div className="lib-page-header">
        <h1 className="lib-page-title">Books</h1>
        <p className="lib-page-sub">Search and manage the university library book collection.</p>
      </div>

      {/* Search + Filter */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ paddingTop: 16, paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="search-box" style={{ flex: 1 }}>
              <Search size={15} />
              <input
                type="text"
                className="form-input"
                placeholder="Search by title, author, ISBN or book code…"
                value={query}
                onChange={e => { setQuery(e.target.value); doSearch(e.target.value, status); }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['all', 'available', 'issued', 'reserved'] as const).map(s => (
                <button
                  key={s}
                  className={`btn btn-sm ${status === s ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => { setStatus(s); doSearch(query, s); }}
                  style={{ textTransform: 'capitalize' }}
                >
                  {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert--danger">
          <AlertTriangle size={14} /><span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            {isPending ? 'Loading…' : `${books.length} book${books.length !== 1 ? 's' : ''} found`}
          </h3>
        </div>

        {isPending ? (
          <div style={{ padding: '20px' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div className="skeleton" style={{ flex: 3, height: 14, borderRadius: 4 }} />
                <div className="skeleton" style={{ flex: 2, height: 14, borderRadius: 4 }} />
                <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
                <div className="skeleton" style={{ flex: 1, height: 14, borderRadius: 4 }} />
              </div>
            ))}
          </div>
        ) : books.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon"><BookOpen size={20} /></div>
            <p className="empty-state__title">No books found</p>
            <p className="empty-state__sub">Try changing your search or filters.</p>
            <button className="btn btn-secondary btn-sm" onClick={() => { setQuery(''); setStatus('all'); doSearch('', 'all'); }}>
              Clear Filters
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="lib-table">
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Book Code</th>
                  <th>Author</th>
                  <th>ISBN</th>
                  <th style={{ textAlign: 'center' }}>Total</th>
                  <th style={{ textAlign: 'center' }}>Available</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {books.map(book => (
                  <tr key={book.id}>
                    <td>
                      <p className="cell-primary">{book.title}</p>
                      {book.genre && <p className="cell-secondary">{book.genre}</p>}
                    </td>
                    <td>
                      <code style={{ fontSize: 12, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>
                        {book.book_code}
                      </code>
                    </td>
                    <td style={{ color: 'var(--gray-600)' }}>{book.author}</td>
                    <td style={{ color: 'var(--gray-400)', fontSize: 12 }}>{book.isbn ?? '—'}</td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>{book.total_copies}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 700,
                        color: book.available_copies === 0 ? 'var(--danger)' : 'var(--success)',
                      }}>
                        {book.available_copies}
                      </span>
                      <span style={{ color: 'var(--gray-400)', fontSize: 12 }}> / {book.total_copies}</span>
                    </td>
                    <td><BookStatusBadge book={book} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
