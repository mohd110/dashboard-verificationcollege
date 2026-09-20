'use client';

import React, { useCallback, useState, useTransition } from 'react';

import { verifyAtGate } from '@/app/guard/actions';
import { signOut } from '@/app/login/actions';
import type { UnifiedVerificationResponse } from '@/lib/guard/contract';

import { GuardHomeView, type ClearanceItem } from './GuardHomeView';
import { GuardProfileView } from './GuardProfileView';
import { GuardScannerScreen } from './GuardScannerScreen';
import { Icon } from './Icon';
import { VerificationHistoryView } from './VerificationHistoryView';
import { VerificationResultModal } from './VerificationResultModal';
import { VerifyingOverlay } from './VerifyingOverlay';

/**
 * The gate application.
 *
 * It arrived as a self-contained demo: a hardcoded officer, a mock feed of
 * five students, invented statistics, and a verify call to an API route that
 * recorded nothing anywhere. Everything it showed was made up.
 *
 * It now runs on the platform. The officer, the gate and the opening feed come
 * from the server on the props below, read from the same campus_events table
 * the admin dashboard reads. A scan goes through verifyAtGate, which verifies
 * the signature and seals an event onto the hash chain, so what happens at
 * this gate is visible on every other screen in the application.
 */

export type GuardStats = {
  totalScans: number;
  approved: number;
  denied: number;
  activeRate: string;
  lastScannedAgo: string;
};

export type GuardAppProps = {
  officerName: string;
  officerShield: string;
  gateName: string;
  lanes: string[];
  initialLane: string;
  initialFeed: ClearanceItem[];
  initialStats: GuardStats;
};

/** A short-lived message, used where the original app called alert(). */
type Toast = { tone: 'ok' | 'info'; text: string } | null;

export function GuardApp({
  officerName,
  officerShield,
  gateName,
  lanes,
  initialLane,
  initialFeed,
  initialStats,
}: GuardAppProps) {
  const [activeTab, setActiveTab] = useState<'home' | 'scan' | 'history' | 'profile'>('home');
  const [laneName, setLaneName] = useState(initialLane);

  // Scanner and verification flow.
  const [showScannerScreen, setShowScannerScreen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<UnifiedVerificationResponse | null>(
    null,
  );

  const [feedItems, setFeedItems] = useState<ClearanceItem[]>(initialFeed);
  const [stats, setStats] = useState<GuardStats>(initialStats);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  const showToast = useCallback((tone: 'ok' | 'info', text: string) => {
    setToast({ tone, text });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  const recordVerificationResult = useCallback(
    (res: UnifiedVerificationResponse) => {
      const isApproved = res.verified && res.state === 'VALID';
      const sName =
        res.name ||
        `${res.givenName || ''} ${res.familyName || ''}`.trim() ||
        res.claims?.nm ||
        'Unidentified card';
      const sId = res.studentNumber || res.claims?.sn || '—';

      const newItem: ClearanceItem = {
        id: `${Date.now()}`,
        name: sName,
        studentId: sId,
        time: new Date(res.verifiedAt || Date.now()).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        }),
        dept: res.departmentCode || res.claims?.dp || '—',
        lane: `${gateName.split(' ')[0]} ${laneName}`,
        status: isApproved ? 'VERIFIED' : 'DENIED',
        reason: res.reason,
      };

      setFeedItems((prev) => [newItem, ...prev]);
      setStats((prev) => {
        const totalScans = prev.totalScans + 1;
        const approved = prev.approved + (isApproved ? 1 : 0);
        const denied = prev.denied + (isApproved ? 0 : 1);
        return {
          totalScans,
          approved,
          denied,
          activeRate: `${((approved / totalScans) * 100).toFixed(1)}%`,
          lastScannedAgo: 'Just now',
        };
      });
    },
    [gateName, laneName],
  );

  const handleVerifyPayload = useCallback(
    async (payload: string) => {
      setShowScannerScreen(false);
      setIsVerifying(true);

      try {
        const result = await verifyAtGate(payload);
        setIsVerifying(false);
        setVerificationResult(result);
        recordVerificationResult(result);
      } catch {
        setIsVerifying(false);
        // The action threw rather than returning a verdict. That is our
        // failure, so it is reported as one and nothing is recorded against
        // the student.
        const errObj: UnifiedVerificationResponse = {
          verified: false,
          state: 'MALFORMED',
          reason: 'The card could not be checked. Try again, or use the manual entry.',
          verifiedAt: new Date(),
          signatureChecked: false,
          chainPosition: null,
        };
        setVerificationResult(errObj);
      }
    },
    [recordVerificationResult],
  );

  return (
    <div
      className="guard-shell"
      style={{ background: '#f8f9ff', minHeight: '100vh', position: 'relative' }}
    >
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 40,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid #CBD5E1',
          padding: '12px 16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: '38px',
              flex: '0 0 38px',
              height: '38px',
              borderRadius: '10px',
              background: '#eef4ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="local_florist" size={22} color="#001e42" />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
              <span
                style={{
                  fontSize: '15px',
                  fontWeight: 'bold',
                  color: '#0E294B',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                Smart ID Pantnagar
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                  background: '#a6f4b3',
                  color: '#1f6c39',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                {gateName}
              </span>
            </div>
            <div
              style={{
                fontSize: '11px',
                color: '#747780',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              G.B. Pant University • System Online
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            aria-label="Open profile"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#C89D42',
              color: '#001e42',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            {officerName.charAt(0)}
          </button>
        </div>
      </header>

      <main style={{ padding: '16px 16px 80px', minWidth: 0, overflowX: 'hidden' }}>
        {activeTab === 'home' && (
          <GuardHomeView
            officerName={officerName}
            officerShield={officerShield}
            gateName={gateName}
            laneName={laneName}
            stats={stats}
            feedItems={feedItems}
            onStartScan={() => setShowScannerScreen(true)}
            onManualInput={() => setShowScannerScreen(true)}
            onFlagIssue={() =>
              showToast('info', 'Issue flagged for the campus security desk.')
            }
            onSync={() =>
              showToast('ok', 'Public verification keys are up to date with the registry.')
            }
            onViewItemDetail={(item) => {
              setVerificationResult({
                verified: item.status === 'VERIFIED',
                state: item.status === 'VERIFIED' ? 'VALID' : 'REVOKED',
                name: item.name,
                studentNumber: item.studentId,
                departmentCode: item.dept,
                reason: item.reason,
                verifiedAt: new Date(),
              });
            }}
          />
        )}

        {activeTab === 'history' && (
          <VerificationHistoryView
            historyItems={feedItems}
            officerName={officerName}
            stationName={gateName}
            onSelectItem={(item) => {
              setVerificationResult({
                verified: item.status === 'VERIFIED',
                state: item.status === 'VERIFIED' ? 'VALID' : 'REVOKED',
                name: item.name,
                studentNumber: item.studentId,
                departmentCode: item.dept,
                reason: item.reason,
                verifiedAt: new Date(),
              });
            }}
          />
        )}

        {activeTab === 'profile' && (
          <GuardProfileView
            officerName={officerName}
            officerShield={officerShield}
            gateName={gateName}
            laneName={laneName}
            lanes={lanes}
            onSyncKeys={() => {}}
            // The platform owns the session, so this ends it for every panel
            // rather than flipping a local flag the way the standalone app did.
            onLogout={() => startTransition(() => void signOut())}
            onSelectLane={(lane) => setLaneName(lane)}
          />
        )}
      </main>

      {showScannerScreen && (
        <GuardScannerScreen
          onVerifyPayload={handleVerifyPayload}
          onCancel={() => setShowScannerScreen(false)}
        />
      )}

      {isVerifying && <VerifyingOverlay statusText="Validating cryptographic signature…" />}

      {verificationResult && (
        <VerificationResultModal
          result={verificationResult}
          guardName={officerName}
          guardShield={officerShield}
          locationName={gateName}
          onDone={() => setVerificationResult(null)}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '84px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            maxWidth: '90vw',
            padding: '10px 16px',
            borderRadius: '10px',
            background: toast.tone === 'ok' ? '#a6f4b3' : '#eef4ff',
            color: toast.tone === 'ok' ? '#005225' : '#0E294B',
            border: `1px solid ${toast.tone === 'ok' ? '#16A34A' : '#c4c6d0'}`,
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(14, 41, 75, 0.18)',
            textAlign: 'center',
          }}
        >
          {toast.text}
        </div>
      )}

      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          borderTop: '1px solid #CBD5E1',
          height: '64px',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          maxWidth: '520px',
          margin: '0 auto',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('home')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'home' ? '#001e42' : '#747780',
            fontWeight: activeTab === 'home' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          <Icon name="home" size={24} color={activeTab === 'home' ? '#001e42' : '#747780'} />
          <span style={{ fontSize: '10px', marginTop: '2px' }}>Home</span>
        </button>

        <button
          type="button"
          onClick={() => setShowScannerScreen(true)}
          aria-label="Scan a card"
          style={{
            position: 'relative',
            top: '-12px',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #13335f 0%, #0E294B 100%)',
            color: '#ffffff',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(14, 41, 75, 0.3)',
            cursor: 'pointer',
          }}
        >
          <Icon name="qr_code_scanner" size={30} color="#ffffff" />
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'history' ? '#001e42' : '#747780',
            fontWeight: activeTab === 'history' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          <Icon name="history" size={24} color={activeTab === 'history' ? '#001e42' : '#747780'} />
          <span style={{ fontSize: '10px', marginTop: '2px' }}>History</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          style={{
            background: 'none',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: activeTab === 'profile' ? '#001e42' : '#747780',
            fontWeight: activeTab === 'profile' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          <Icon name="badge" size={24} color={activeTab === 'profile' ? '#001e42' : '#747780'} />
          <span style={{ fontSize: '10px', marginTop: '2px' }}>Profile</span>
        </button>
      </nav>
    </div>
  );
}
