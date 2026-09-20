'use client';

import React, { useState } from 'react';
import type { ClearanceItem } from './GuardHomeView';

interface VerificationHistoryViewProps {
  historyItems: ClearanceItem[];
  officerName?: string;
  stationName?: string;
  onSelectItem: (item: ClearanceItem) => void;
}

export function VerificationHistoryView({
  historyItems,
  officerName = 'Officer Amit Kumar',
  stationName = 'Station Alpha',
  onSelectItem,
}: VerificationHistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'verified' | 'denied'>('all');

  const filteredItems = historyItems.filter((item) => {
    const matchesFilter = filterMode === 'all' || item.status.toLowerCase() === filterMode;
    const q = searchQuery.toLowerCase().trim();
    const matchesQuery =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.studentId.toLowerCase().includes(q) ||
      item.dept.toLowerCase().includes(q);

    return matchesFilter && matchesQuery;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '32px', fontFamily: "'Inter', sans-serif" }}>
      {/* Title & Gate Sub-header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0E294B', margin: 0 }}>
            Verification History
          </h1>
          <p style={{ fontSize: '12px', color: '#43474f', margin: '2px 0 0' }}>
            {officerName} · {stationName}
          </p>
        </div>
        <div
          style={{
            background: '#eef4ff',
            padding: '4px 10px',
            borderRadius: '16px',
            fontSize: '11px',
            fontWeight: 'bold',
            color: '#1f6c39',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>
            sensor_door
          </span>
          <span>Gate 1 Entry Log</span>
        </div>
      </div>

      {/* Search Input Bar */}
      <div
        style={{
          position: 'relative',
          background: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 2px 6px rgba(0,0,0,0.04)',
          overflow: 'hidden',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#747780',
            fontSize: '20px',
          }}
        >
          search
        </span>
        <input
          type="text"
          placeholder="Search by Student Name or ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 12px 12px 40px',
            border: 'none',
            outline: 'none',
            fontSize: '14px',
            background: 'transparent',
            color: '#0f1c2c',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: '#747780',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
              cancel
            </span>
          </button>
        )}
      </div>

      {/* Filter Pills Bar */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        <button
          onClick={() => setFilterMode('all')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            background: filterMode === 'all' ? '#001e42' : '#ffffff',
            color: filterMode === 'all' ? '#ffffff' : '#43474f',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            whiteSpace: 'nowrap',
          }}
        >
          All Scans ({historyItems.length})
        </button>
        <button
          onClick={() => setFilterMode('verified')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            background: filterMode === 'verified' ? '#16A34A' : '#ffffff',
            color: filterMode === 'verified' ? '#ffffff' : '#1f6c39',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            whiteSpace: 'nowrap',
          }}
        >
          Verified Only ({historyItems.filter((i) => i.status === 'VERIFIED').length})
        </button>
        <button
          onClick={() => setFilterMode('denied')}
          style={{
            padding: '6px 14px',
            borderRadius: '20px',
            border: 'none',
            fontSize: '12px',
            fontWeight: 'bold',
            cursor: 'pointer',
            background: filterMode === 'denied' ? '#DC2626' : '#ffffff',
            color: filterMode === 'denied' ? '#ffffff' : '#8B2317',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            whiteSpace: 'nowrap',
          }}
        >
          Denied Only ({historyItems.filter((i) => i.status === 'DENIED').length})
        </button>
      </div>

      {/* History Log Stream Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredItems.length === 0 ? (
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '32px 16px', textAlign: 'center', color: '#747780' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '40px', marginBottom: '8px', color: '#0E294B' }}>
              manage_search
            </span>
            <h4 style={{ fontSize: '16px', fontWeight: 'bold', color: '#0E294B', margin: '0 0 4px' }}>
              No Matching Records
            </h4>
            <p style={{ fontSize: '13px', margin: 0 }}>Try clearing your search or switching filter mode.</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onSelectItem(item)}
              style={{
                background: '#ffffff',
                borderRadius: '12px',
                padding: '14px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: item.status === 'VERIFIED' ? '#eef4ff' : '#ffdad6',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {item.photoUrl ? (
                      <img src={item.photoUrl} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: '24px', color: item.status === 'VERIFIED' ? '#001e42' : '#8B2317' }}>
                        {item.status === 'VERIFIED' ? 'person' : 'block'}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: item.status === 'VERIFIED' ? '#0E294B' : '#8B2317', margin: 0 }}>
                      {item.name}
                    </h3>
                    <span style={{ fontFamily: "'IBM Plex Sans', monospace", fontSize: '12px', color: '#43474f' }}>
                      {item.studentId}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      background: item.status === 'VERIFIED' ? '#a6f4b3' : '#DC2626',
                      color: item.status === 'VERIFIED' ? '#005225' : '#ffffff',
                      padding: '2px 8px',
                      borderRadius: '12px',
                    }}
                  >
                    {item.status}
                  </span>
                  <span style={{ fontFamily: "'IBM Plex Sans', monospace", fontSize: '11px', color: '#747780', marginTop: '4px' }}>
                    {item.time}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F5F8FA', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
                <span style={{ color: '#0E294B', fontWeight: '500' }}>{item.dept}</span>
                <span style={{ color: '#747780', fontSize: '11px' }}>{item.lane}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
