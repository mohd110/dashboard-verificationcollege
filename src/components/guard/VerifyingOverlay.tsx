'use client';

import React from 'react';

interface VerifyingOverlayProps {
  statusText?: string;
}

export function VerifyingOverlay({ statusText = 'Validating Cryptographic Signature...' }: VerifyingOverlayProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(14, 41, 75, 0.95)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff',
        textAlign: 'center',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Animated Pulse Ring */}
      <div style={{ position: 'relative', width: '120px', height: '120px', marginBottom: '32px' }}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            border: '4px solid #88CFF8',
            opacity: 0.2,
            animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '10px',
            borderRadius: '50%',
            border: '4px solid #C89D42',
            opacity: 0.4,
            animation: 'spin 3s linear infinite',
          }}
        />
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #13335f 0%, #0E294B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 30px rgba(136, 207, 248, 0.4)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '48px', color: '#88CFF8' }}>
            security
          </span>
        </div>
      </div>

      <h2 style={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '-0.02em', marginBottom: '8px', color: '#f8f9ff' }}>
        Verifying GBPUAT Identity
      </h2>
      <p style={{ fontSize: '14px', color: '#88CFF8', maxWidth: '280px', margin: '0 auto 24px', lineHeight: '1.4' }}>
        {statusText}
      </p>

      {/* Verification Steps Indicator */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '16px',
          padding: '16px 20px',
          width: '100%',
          maxWidth: '320px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          textAlign: 'left',
          fontSize: '13px',
          border: '1px solid rgba(255, 255, 255, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#a6f4b3' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            check_circle
          </span>
          <span>Reading JWS QR Payload...</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#88CFF8' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px', animation: 'spin 1.5s linear infinite' }}>
            sync
          </span>
          <span>Checking Ed25519 Public Key Registry...</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'rgba(255, 255, 255, 0.5)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            radio_button_unchecked
          </span>
          <span>Checking Revocation Status...</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ping {
          75%, 100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
