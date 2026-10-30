/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Lock,
  LogOut,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthorityDashboardView } from './components/AuthorityDashboardView.tsx';
import { CitizenReportView } from './components/CitizenReportView.tsx';
import { CitizenTrackingView } from './components/CitizenTrackingView.tsx';
import { ComplaintDetailView } from './components/ComplaintDetailView.tsx';
import { GeographicMapView } from './components/GeographicMapView.tsx';
import { LandingView } from './components/LandingView.tsx';
import {
  ActionBrief,
  AnalyticsSummary,
  Complaint,
  HotspotCluster,
} from './shared/types.ts';

type ActiveRoute =
  | { view: 'overview' }
  | { view: 'report' }
  | { view: 'track'; publicId?: string | null }
  | { view: 'dashboard' }
  | { view: 'detail'; publicId: string }
  | { view: 'map' }
  | { view: 'not_found'; path: string };

function parseRouteFromPathname(pathname: string): ActiveRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/') return { view: 'overview' };
  if (clean === '/report') return { view: 'report' };
  if (clean === '/track') return { view: 'track', publicId: null };
  if (clean.startsWith('/track/')) {
    const id = decodeURIComponent(clean.slice('/track/'.length));
    return { view: 'track', publicId: id };
  }
  if (clean === '/dashboard') return { view: 'dashboard' };
  if (clean.startsWith('/complaints/')) {
    const id = decodeURIComponent(clean.slice('/complaints/'.length));
    return { view: 'detail', publicId: id };
  }
  if (clean === '/map') return { view: 'map' };
  return { view: 'not_found', path: clean };
}

export default function App() {
  const [route, setRoute] = useState<ActiveRoute>(() =>
    parseRouteFromPathname(window.location.pathname)
  );

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [hotspots, setHotspots] = useState<HotspotCluster[]>([]);
  const [actionBrief, setActionBrief] = useState<ActionBrief | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  // Admin auth state
  const [adminAuth, setAdminAuth] = useState<{
    authenticated: boolean;
    username: string | null;
    csrfToken: string | null;
    sessionToken: string | null;
  }>({
    authenticated: false,
    username: null,
    csrfToken: null,
    sessionToken: null,
  });

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginUsername, setLoginUsername] = useState('admin');
  const [loginPassword, setLoginPassword] = useState('civicpulse-admin-2026');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Real-time WebSocket state
  const [wsConnected, setWsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState(1);
  const [liveUpdateTick, setLiveUpdateTick] = useState(0);
  const [realtimeNotice, setRealtimeNotice] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const navigateTo = useCallback((nextPath: string, nextRoute: ActiveRoute) => {
    try {
      window.history.pushState({}, '', nextPath);
    } catch {
      // Ignore history pushState restriction in sandboxed iframe
    }
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setRoute(parseRouteFromPathname(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const fetchAllData = useCallback(async () => {
    try {
      const [compRes, anaRes, hsRes, briefRes] = await Promise.all([
        fetch('/api/complaints?limit=250'),
        fetch('/api/analytics'),
        fetch('/api/hotspots'),
        fetch('/api/action-brief'),
      ]);

      if (compRes.ok) {
        const compData = await compRes.json();
        setComplaints(compData.complaints || []);
      }
      if (anaRes.ok) {
        setAnalytics(await anaRes.json());
      }
      if (hsRes.ok) {
        const hsData = await hsRes.json();
        setHotspots(hsData.hotspots || []);
      }
      if (briefRes.ok) {
        setActionBrief(await briefRes.json());
      }
    } catch {
      // Ignore transient network errors
    }
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/session');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setAdminAuth((prev) => ({
            authenticated: true,
            username: data.username,
            csrfToken: data.csrf_token,
            sessionToken: prev.sessionToken,
          }));
        }
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    fetchAllData();
    checkSession();
  }, [fetchAllData, checkSession]);

  // Real-time multi-user state syncing via Server-Sent Events (/api/events)
  useEffect(() => {
    let reconnectTimer: number | null = null;
    let isUnmounted = false;
    let eventSource: EventSource | null = null;

    const connectRealtimeStream = () => {
      if (isUnmounted) return;
      try {
        const role = adminAuth.authenticated ? 'officer' : 'citizen';
        eventSource = new EventSource(
          `/api/events?role=${encodeURIComponent(role)}&view=${encodeURIComponent(route.view)}`
        );

        eventSource.onopen = () => {
          if (isUnmounted) return;
          setWsConnected(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'presence:update') {
              setConnectedUsers(msg.payload?.connected_count || 1);
            } else if (msg.type === 'complaint:created') {
              const newComp: Complaint | undefined = msg.payload?.complaint;
              if (newComp) {
                setComplaints((prev) => {
                  if (prev.some((item) => item.id === newComp.id)) {
                    return prev;
                  }
                  return [newComp, ...prev];
                });
                setRealtimeNotice(
                  `New complaint logged: ${newComp.public_id} (${newComp.category} · ${newComp.priority_level})`
                );
                setTimeout(() => setRealtimeNotice(null), 5000);
              }
              setLiveUpdateTick((t) => t + 1);
              fetchAllData();
            } else if (msg.type === 'complaint:updated') {
              const updatedComp: Complaint | undefined = msg.payload?.complaint;
              if (updatedComp) {
                setComplaints((prev) =>
                  prev.map((item) => (item.id === updatedComp.id ? updatedComp : item))
                );
                setRealtimeNotice(
                  `Live update: ${updatedComp.public_id} → ${updatedComp.status}${
                    updatedComp.assigned_team ? ` (${updatedComp.assigned_team})` : ''
                  }`
                );
                setTimeout(() => setRealtimeNotice(null), 5000);
              }
              setLiveUpdateTick((t) => t + 1);
              fetchAllData();
            } else if (msg.type === 'dataset:seeded') {
              setLiveUpdateTick((t) => t + 1);
              fetchAllData();
            }
          } catch {
            // Ignore malformed message
          }
        };

        eventSource.onerror = () => {
          if (isUnmounted) return;
          setWsConnected(false);
          eventSource?.close();
          reconnectTimer = window.setTimeout(connectRealtimeStream, 4000);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connectRealtimeStream();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [fetchAllData, adminAuth.authenticated]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginUsername.trim(),
          password: loginPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }
      setAdminAuth({
        authenticated: true,
        username: data.username,
        csrfToken: data.csrf_token,
        sessionToken: data.session_token,
      });
      setShowLoginModal(false);
    } catch (err: any) {
      setLoginError(err?.message || 'Invalid credentials.');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore
    }
    setAdminAuth({
      authenticated: false,
      username: null,
      csrfToken: null,
      sessionToken: null,
    });
  };

  const handleSeedSampleData = async () => {
    setIsSeeding(true);
    try {
      await fetch('/api/admin/seed', { method: 'POST' });
      await fetchAllData();
    } finally {
      setIsSeeding(false);
    }
  };

  const sampleIds = complaints.slice(0, 8).map((c) => c.public_id);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: Strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-8">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigateTo('/', { view: 'overview' });
          }}
          className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          CivicPulse AI
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/', { view: 'overview' });
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              route.view === 'overview'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-600'
                : ''
            }`}
          >
            Overview
          </a>
          <a
            href="/report"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/report', { view: 'report' });
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              route.view === 'report'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-600'
                : ''
            }`}
          >
            Report Issue
          </a>
          <a
            href="/track"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/track', { view: 'track', publicId: null });
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              route.view === 'track'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-600'
                : ''
            }`}
          >
            Track Status
          </a>
          <a
            href="/dashboard"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/dashboard', { view: 'dashboard' });
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              route.view === 'dashboard' || route.view === 'detail'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-600'
                : ''
            }`}
          >
            Operations
          </a>
          <a
            href="/map"
            onClick={(e) => {
              e.preventDefault();
              navigateTo('/map', { view: 'map' });
            }}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 ${
              route.view === 'map'
                ? 'text-slate-900 underline underline-offset-8 decoration-2 decoration-teal-600'
                : ''
            }`}
          >
            Live Map
          </a>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigateTo('/report', { view: 'report' })}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Report an Issue
          </button>
        </div>
      </header>

      {/* Secondary Contextual Workspace Bar (Mobile Nav + Real-time WebSocket Sync + Officer Auth) */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Mobile Navigation Links */}
        <div className="flex md:hidden items-center gap-3 overflow-x-auto py-0.5">
          <button
            type="button"
            onClick={() => navigateTo('/', { view: 'overview' })}
            className={`whitespace-nowrap shrink-0 ${
              route.view === 'overview' ? 'font-bold text-teal-800' : 'text-slate-600'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/report', { view: 'report' })}
            className={`whitespace-nowrap shrink-0 ${
              route.view === 'report' ? 'font-bold text-teal-800' : 'text-slate-600'
            }`}
          >
            Report
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/track', { view: 'track', publicId: null })}
            className={`whitespace-nowrap shrink-0 ${
              route.view === 'track' ? 'font-bold text-teal-800' : 'text-slate-600'
            }`}
          >
            Track
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/dashboard', { view: 'dashboard' })}
            className={`whitespace-nowrap shrink-0 ${
              route.view === 'dashboard' ? 'font-bold text-teal-800' : 'text-slate-600'
            }`}
          >
            Operations
          </button>
          <button
            type="button"
            onClick={() => navigateTo('/map', { view: 'map' })}
            className={`whitespace-nowrap shrink-0 ${
              route.view === 'map' ? 'font-bold text-teal-800' : 'text-slate-600'
            }`}
          >
            Map
          </button>
        </div>

        {/* Real-Time Sync Telemetry */}
        <div className="flex items-center gap-3 text-slate-600 font-mono-tabular">
          <span className="inline-flex items-center gap-1.5">
            {wsConnected ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-700" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-700" />
            )}
            <span>
              {wsConnected
                ? `Real-Time Sync Active (${connectedUsers} session${
                    connectedUsers === 1 ? '' : 's'
                  })`
                : 'Reconnecting sync...'}
            </span>
          </span>
        </div>

        {/* Officer Authentication Controls */}
        <div className="flex items-center gap-3 ml-auto">
          {adminAuth.authenticated ? (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1 text-emerald-800 font-medium">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Officer Session ({adminAuth.username})</span>
              </span>
              <button
                type="button"
                onClick={handleAdminLogout}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 font-medium cursor-pointer"
              >
                <LogOut className="w-3 h-3" />
                <span>Sign Out</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowLoginModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-slate-700 font-medium cursor-pointer"
            >
              <Lock className="w-3 h-3 text-slate-500" />
              <span>Officer Sign-In</span>
            </button>
          )}
        </div>
      </div>

      {/* Live WebSocket Broadcast Toast */}
      {realtimeNotice && (
        <div className="bg-slate-900 text-white px-4 py-2 text-xs text-center font-medium">
          {realtimeNotice}
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1">
        {route.view === 'overview' && (
          <LandingView
            analytics={analytics}
            hotspots={hotspots}
            onNavigateReport={() => navigateTo('/report', { view: 'report' })}
            onNavigateTrack={() => navigateTo('/track', { view: 'track', publicId: null })}
            onNavigateDashboard={() => navigateTo('/dashboard', { view: 'dashboard' })}
            onNavigateMap={() => navigateTo('/map', { view: 'map' })}
            onSelectComplaint={(publicId) =>
              navigateTo(`/complaints/${publicId}`, { view: 'detail', publicId })
            }
          />
        )}

        {route.view === 'report' && (
          <CitizenReportView
            onSubmitted={() => {
              fetchAllData();
            }}
            onNavigateTrack={(publicId) =>
              navigateTo(`/track/${publicId}`, { view: 'track', publicId })
            }
            onNavigateDetail={(publicId) =>
              navigateTo(`/complaints/${publicId}`, { view: 'detail', publicId })
            }
          />
        )}

        {route.view === 'track' && (
          <CitizenTrackingView
            initialPublicId={route.publicId}
            sampleIds={sampleIds}
            liveUpdateTick={liveUpdateTick}
          />
        )}

        {route.view === 'dashboard' && (
          <AuthorityDashboardView
            complaints={complaints}
            analytics={analytics}
            actionBrief={actionBrief}
            onSelectComplaint={(publicId) =>
              navigateTo(`/complaints/${publicId}`, { view: 'detail', publicId })
            }
            onNavigateMap={() => navigateTo('/map', { view: 'map' })}
            onRefreshAll={fetchAllData}
            onSeedSampleData={handleSeedSampleData}
            isSeeding={isSeeding}
          />
        )}

        {route.view === 'detail' && (
          <ComplaintDetailView
            publicId={route.publicId}
            adminAuth={adminAuth}
            onAdminLoginRequest={() => setShowLoginModal(true)}
            onBack={() => navigateTo('/dashboard', { view: 'dashboard' })}
            onSelectComplaint={(publicId) =>
              navigateTo(`/complaints/${publicId}`, { view: 'detail', publicId })
            }
            onNavigateTrack={(publicId) =>
              navigateTo(`/track/${publicId}`, { view: 'track', publicId })
            }
            liveUpdateTick={liveUpdateTick}
          />
        )}

        {route.view === 'map' && (
          <GeographicMapView
            complaints={complaints}
            onSelectComplaint={(publicId) =>
              navigateTo(`/complaints/${publicId}`, { view: 'detail', publicId })
            }
            liveUpdateTick={liveUpdateTick}
          />
        )}

        {route.view === 'not_found' && (
          <div className="max-w-xl mx-auto py-16 px-4 text-center space-y-4">
            <div className="text-xs font-mono-tabular text-slate-500">HTTP 404</div>
            <h1 className="text-2xl font-bold text-slate-900">Page Not Found</h1>
            <p className="text-sm text-slate-600">
              The requested path <span className="font-mono-tabular">{route.path}</span> does not exist in CivicPulse AI.
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigateTo('/', { view: 'overview' })}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg cursor-pointer"
              >
                Return to Overview
              </button>
              <button
                type="button"
                onClick={() => navigateTo('/dashboard', { view: 'dashboard' })}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Open Authority Dashboard
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="bg-white border-t border-slate-200 px-6 py-5 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            CivicPulse AI — From Complaints to Action · Report Problems. Discover Patterns. Prioritize Action.
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigateTo('/report', { view: 'report' })}
              className="hover:text-slate-900 cursor-pointer"
            >
              Report Issue
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/track', { view: 'track', publicId: null })}
              className="hover:text-slate-900 cursor-pointer"
            >
              Track Complaint
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/dashboard', { view: 'dashboard' })}
              className="hover:text-slate-900 cursor-pointer"
            >
              Authority Dashboard
            </button>
            <button
              type="button"
              onClick={() => navigateTo('/map', { view: 'map' })}
              className="hover:text-slate-900 cursor-pointer"
            >
              Geographic Map
            </button>
          </div>
        </div>
      </footer>

      {/* Officer Authentication Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-teal-700" />
                <h2 className="text-base font-bold text-slate-900">
                  Municipal Authority Authentication
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              Administrative write operations (team assignment, workflow status transitions, and duplicate confirmation) require officer authentication and CSRF token verification.
            </p>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="font-semibold text-slate-800">
                Local Development / Hackathon Demo Credentials:
              </div>
              <div className="font-mono-tabular">
                Username: <strong>admin</strong> · Password: <strong>civicpulse-admin-2026</strong>
              </div>
            </div>

            {loginError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                {loginError}
              </div>
            )}

            <form onSubmit={handleAdminLogin} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Officer Username
                </label>
                <input
                  type="text"
                  required
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-800 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  {loggingIn ? 'Verifying...' : 'Sign In & Issue CSRF Token'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
