'use client';

import React, { useState } from 'react';

interface GuardProfileViewProps {
  officerName: string;
  officerShield: string;
  /** The posting, as the administrator set it on the Users screen. */
  gateName: string;
  laneName: string;
  /** Duty lanes at this gate. A lane is a label on the event, not a location. */
  lanes: string[];
  onSyncKeys: () => void;
  onLogout: () => void;
  onSelectLane: (lane: string) => void;
}

export function GuardProfileView({
  officerName,
  officerShield,
  gateName,
  laneName,
  lanes,
  onSyncKeys,
  onLogout,
  onSelectLane,
}: GuardProfileViewProps) {
  const selectedGate = gateName;
  const [selectedLane, setSelectedLane] = useState(laneName);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    await onSyncKeys();
    setTimeout(() => {
      setSyncing(false);
      setSyncMsg('Public verification keys synchronized with central registry.');
    }, 1000);
  };

  const handleSaveStation = (lane: string) => {
    setSelectedLane(lane);
    onSelectLane(lane);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '32px', fontFamily: "'Inter', sans-serif" }}>
      {/* Header Profile Badge Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0E294B 0%, #13335f 100%)',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 8px 24px rgba(14, 41, 75, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: '#C89D42',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            fontWeight: 'bold',
            color: '#001e42',
            border: '3px solid #88CFF8',
            flexShrink: 0,
          }}
        >
          {officerName.charAt(0)}
        </div>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 2px', color: '#ffffff' }}>
            {officerName}
          </h2>
          <div style={{ fontSize: '12px', color: '#88CFF8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>Security Officer</span>
            <span>•</span>
            <span style={{ fontFamily: "'IBM Plex Sans', monospace", fontWeight: 'bold' }}>{officerShield}</span>
          </div>
          <div style={{ fontSize: '11px', color: '#a6f4b3', marginTop: '6px', fontWeight: '600' }}>
            Stationed at {selectedGate} ({selectedLane})
          </div>
        </div>
      </div>

      {/* Gate Station Selection */}
      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0E294B', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#001e42' }}>
            door_front
          </span>
          <span>Assigned Gate &amp; Duty Lane</span>
        </h3>

        <p style={{ fontSize: '11px', color: '#747780', margin: '0 0 12px', lineHeight: 1.5 }}>
          Your gate is set by an administrator on the Users screen, and every scan is
          recorded against it. The duty lane is a label on the event and you can change it here.
        </p>

        <div
          style={{
            padding: '12px',
            borderRadius: '10px',
            border: '1px solid #c4c6d0',
            background: '#eef4ff',
            marginBottom: '10px',
          }}
        >
          <div style={{ fontSize: '11px', color: '#747780', marginBottom: '2px' }}>Posted to</div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#0E294B' }}>{selectedGate}</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {lanes.map((lane) => {
            const isSelected = selectedLane === lane;
            return (
              <button
                key={lane}
                type="button"
                onClick={() => handleSaveStation(lane)}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  border: isSelected ? '2px solid #16A34A' : '1px solid #c4c6d0',
                  background: isSelected ? '#a6f4b3' : '#ffffff',
                  color: isSelected ? '#005225' : '#0f1c2c',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontWeight: isSelected ? 'bold' : 'normal',
                  width: '100%',
                  textAlign: 'left',
                  font: 'inherit',
                }}
              >
                <div style={{ fontSize: '13px' }}>Duty {lane}</div>
                {isSelected && (
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    check_circle
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Offline Key Cache & Sync Status */}
      <div style={{ background: '#ffffff', borderRadius: '16px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 'bold', color: '#0E294B', margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '20px', color: '#001e42' }}>
            key
          </span>
          <span>Cryptographic Key Cache</span>
        </h3>
        <p style={{ fontSize: '13px', color: '#747780', margin: '0 0 12px' }}>
          Active Signing Key: <strong style={{ color: '#0E294B' }}>nf-2026-01 (Ed25519)</strong>
        </p>

        {syncMsg && (
          <div style={{ padding: '8px 12px', background: '#a6f4b3', color: '#005225', borderRadius: '8px', fontSize: '12px', fontWeight: '600', marginBottom: '12px' }}>
            {syncMsg}
          </div>
        )}

        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            width: '100%',
            padding: '12px',
            background: '#001e42',
            color: '#ffffff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 'bold',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: syncing ? 'spin 1s linear infinite' : 'none' }}>
            sync
          </span>
          <span>{syncing ? 'Synchronizing Keys...' : 'Force Re-sync Public Keys'}</span>
        </button>
      </div>

      {/* Logout Action */}
      <button
        onClick={onLogout}
        style={{
          width: '100%',
          padding: '14px',
          background: '#ffdad6',
          color: '#8B2317',
          border: '1px solid #ffdad6',
          borderRadius: '12px',
          fontSize: '14px',
          fontWeight: 'bold',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
          logout
        </span>
        <span>Logout Security Officer</span>
      </button>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
