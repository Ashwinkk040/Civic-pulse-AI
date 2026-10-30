import crypto from 'crypto';
import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { WebSocket, WebSocketServer } from 'ws';
import { generateActionBriefWithFallback } from './src/server/action_brief.ts';
import {
  assignComplaintTeam,
  createComplaint,
  getAnalyticsSummary,
  getComplaintById,
  getComplaintByPublicId,
  listComplaints,
  reviewDuplicateRelationship,
  updateComplaintStatus,
} from './src/server/complaint_service.ts';
import { getDb, initDatabase, verifyPassword } from './src/server/database.ts';
import { detectGeographicHotspots } from './src/server/hotspot_engine.ts';
import { seedSyntheticComplaints } from './src/server/seed_data.ts';

interface AdminSession {
  token: string;
  csrfToken: string;
  username: string;
  role: string;
  createdAt: number;
}

const activeSessions = new Map<string, AdminSession>();

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift()?.trim();
    if (key) {
      list[key] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

function getSessionFromRequest(req: Request): AdminSession | null {
  const authHeader = req.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies['civicpulse_session'] || '';
  }

  if (!token) return null;
  const session = activeSessions.get(token);
  if (!session) return null;

  // 12-hour session expiry
  if (Date.now() - session.createdAt > 12 * 60 * 60 * 1000) {
    activeSessions.delete(token);
    return null;
  }
  return session;
}

function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.status(401).json({
      error: 'Unauthorized: Administrative authentication is required for this action.',
      code: 'AUTH_REQUIRED',
    });
    return;
  }

  const csrfHeader =
    (req.headers['x-csrf-token'] as string) ||
    (req.body && req.body.csrf_token);

  if (!csrfHeader || csrfHeader !== session.csrfToken) {
    res.status(403).json({
      error: 'Forbidden: Missing or invalid CSRF token.',
      code: 'CSRF_INVALID',
    });
    return;
  }

  (req as any).adminSession = session;
  next();
}

export function createApp(options: { customDbPath?: string; autoSeed?: boolean } = {}) {
  initDatabase(options.customDbPath);

  const app = express();
  app.use(express.json({ limit: '6mb' }));
  app.use(express.urlencoded({ extended: true, limit: '6mb' }));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch {
      socket.destroy();
    }
  });

  interface ConnectedClient {
    ws?: WebSocket;
    sseRes?: Response;
    clientId: string;
    role: string;
    activeView: string;
  }

  const wsClients = new Map<WebSocket, ConnectedClient>();
  const sseClients = new Map<string, ConnectedClient>();

  function getActiveSessionCount(): number {
    return Math.max(1, wsClients.size + sseClients.size);
  }

  function broadcastEvent(type: string, payload: unknown) {
    const message = JSON.stringify({
      type,
      payload,
      timestamp: new Date().toISOString(),
    });

    for (const [clientWs] of wsClients.entries()) {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(message);
        } catch {
          // Ignore send error
        }
      }
    }

    for (const [clientId, client] of sseClients.entries()) {
      if (client.sseRes && !client.sseRes.writableEnded) {
        try {
          client.sseRes.write(`data: ${message}\n\n`);
        } catch {
          sseClients.delete(clientId);
        }
      } else {
        sseClients.delete(clientId);
      }
    }
  }

  function broadcastPresence() {
    const activeUsers = [
      ...Array.from(wsClients.values()),
      ...Array.from(sseClients.values()),
    ].map((c) => ({
      clientId: c.clientId,
      role: c.role,
      activeView: c.activeView,
    }));
    broadcastEvent('presence:update', {
      connected_count: Math.max(1, activeUsers.length),
      clients: activeUsers,
    });
  }

  // Server-Sent Events (SSE) endpoint for rock-solid real-time syncing across all proxies
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = `sse-${crypto.randomBytes(3).toString('hex')}`;
    const role = req.query.role === 'officer' ? 'officer' : 'citizen';
    const activeView = String(req.query.view || 'overview').slice(0, 32);

    sseClients.set(clientId, {
      sseRes: res,
      clientId,
      role,
      activeView,
    });

    const initMsg = JSON.stringify({
      type: 'presence:update',
      payload: {
        connected_count: getActiveSessionCount(),
      },
      timestamp: new Date().toISOString(),
    });
    res.write(`data: ${initMsg}\n\n`);
    broadcastPresence();

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(clientId);
      broadcastPresence();
    });
  });

  wss.on('connection', (ws: WebSocket) => {
    const clientId = `user-${crypto.randomBytes(3).toString('hex')}`;
    wsClients.set(ws, {
      ws,
      clientId,
      role: 'citizen',
      activeView: 'overview',
    });

    broadcastPresence();

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const current = wsClients.get(ws);
        if (current && msg.type === 'presence:identify') {
          current.role = msg.role === 'officer' ? 'officer' : 'citizen';
          current.activeView = String(msg.activeView || 'overview').slice(0, 32);
          broadcastPresence();
        }
      } catch {
        // Ignore malformed client socket message
      }
    });

    ws.on('close', () => {
      wsClients.delete(ws);
      broadcastPresence();
    });
  });

  // --- AUTHENTICATION & CSRF ROUTES ---

  app.get('/api/auth/session', (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      res.json({
        authenticated: false,
        username: null,
        csrf_token: null,
      });
      return;
    }
    res.json({
      authenticated: true,
      username: session.username,
      role: session.role,
      csrf_token: session.csrfToken,
    });
  });

  app.post('/api/auth/login', (req: Request, res: Response) => {
    try {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');

      if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required.' });
        return;
      }

      const db = getDb();
      const userRow = db
        .prepare('SELECT username, password_hash, role FROM admin_users WHERE username = ?')
        .get(username) as { username: string; password_hash: string; role: string } | undefined;

      if (!userRow || !verifyPassword(password, userRow.password_hash)) {
        res.status(401).json({ error: 'Invalid administrative credentials.' });
        return;
      }

      const token = crypto.randomBytes(24).toString('hex');
      const csrfToken = crypto.randomBytes(20).toString('hex');

      const session: AdminSession = {
        token,
        csrfToken,
        username: userRow.username,
        role: userRow.role,
        createdAt: Date.now(),
      };
      activeSessions.set(token, session);

      res.setHeader(
        'Set-Cookie',
        `civicpulse_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=43200`
      );

      res.json({
        authenticated: true,
        username: session.username,
        role: session.role,
        session_token: token,
        csrf_token: csrfToken,
      });
    } catch (err: any) {
      console.error('[Auth Login Error]', err?.message);
      res.status(500).json({ error: 'Authentication service error.' });
    }
  });

  app.post('/api/auth/logout', (req: Request, res: Response) => {
    const session = getSessionFromRequest(req);
    if (session) {
      activeSessions.delete(session.token);
    }
    res.setHeader(
      'Set-Cookie',
      'civicpulse_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0'
    );
    res.json({ authenticated: false });
  });

  // --- CITIZEN REPORTING & PUBLIC TRACKING ---

  const handleReportSubmission = async (req: Request, res: Response) => {
    try {
      const {
        description,
        category,
        citizen_category,
        location_name,
        latitude,
        longitude,
        image_data_url,
        enable_external_ai,
      } = req.body || {};

      const created = await createComplaint({
        description,
        citizen_category: citizen_category || category || null,
        location_name,
        latitude,
        longitude,
        image_data_url: image_data_url || null,
        enableExternalAI: enable_external_ai !== false,
      });

      broadcastEvent('complaint:created', {
        complaint: created,
      });

      res.status(201).json({
        message: 'Complaint submitted and processed successfully.',
        complaint: created,
      });
    } catch (err: any) {
      const msg = err?.message || 'Unable to process complaint submission.';
      const isValidation =
        msg.includes('required') ||
        msg.includes('must') ||
        msg.includes('Invalid') ||
        msg.includes('Latitude') ||
        msg.includes('Longitude') ||
        msg.includes('Duplicate submission') ||
        msg.includes('Both latitude');

      res.status(isValidation ? 400 : 500).json({
        error: msg,
      });
    }
  };

  app.post('/api/report', handleReportSubmission);
  app.post('/report', handleReportSubmission);

  const handlePublicTracking = (req: Request, res: Response) => {
    try {
      const publicId = String(req.params.publicId || '').trim();
      if (!publicId) {
        res.status(400).json({ error: 'Tracking ID is required.' });
        return;
      }

      const complaint = getComplaintByPublicId(publicId);
      if (!complaint) {
        res.status(404).json({
          error: `No complaint found matching tracking ID "${publicId}". Please check the ID and try again.`,
        });
        return;
      }

      // Return strictly public-safe fields (never expose internal credentials or private contact data)
      res.json({
        public_id: complaint.public_id,
        category: complaint.category,
        location_name: complaint.location_name,
        summary: complaint.summary,
        priority_level: complaint.priority_level,
        priority_score: complaint.priority_score,
        priority_reason: complaint.priority_reason,
        status: complaint.status,
        assigned_team: complaint.assigned_team,
        created_at: complaint.created_at,
        updated_at: complaint.updated_at,
        resolved_at: complaint.resolved_at,
        is_synthetic: complaint.is_synthetic,
        history: (complaint.history || []).map((h) => ({
          id: h.id,
          previous_status: h.previous_status,
          new_status: h.new_status,
          timestamp: h.timestamp,
          actor: h.actor,
          public_message: h.public_message,
        })),
      });
    } catch (err: any) {
      console.error('[Track Error]', err?.message);
      res.status(500).json({ error: 'Unable to retrieve complaint tracking status.' });
    }
  };

  app.get('/api/track/:publicId', handlePublicTracking);

  // --- DASHBOARD, COMPLAINTS, ANALYTICS, HOTSPOTS, ACTION BRIEF API ---

  app.get('/api/complaints', (req: Request, res: Response) => {
    try {
      const complaints = listComplaints({
        search: req.query.search as string,
        category: req.query.category as string,
        priority_level: req.query.priority as string,
        status: req.query.status as string,
        location: req.query.location as string,
        duplicate_only: req.query.duplicate_only === 'true',
        sort_by: (req.query.sort_by as any) || 'priority_desc',
        limit: req.query.limit ? Number(req.query.limit) : 200,
      });

      res.json({
        count: complaints.length,
        complaints,
      });
    } catch (err: any) {
      console.error('[List Complaints Error]', err?.message);
      res.status(500).json({ error: 'Failed to retrieve complaints list.' });
    }
  });

  app.get('/api/complaints/:publicId', (req: Request, res: Response) => {
    try {
      const param = String(req.params.publicId || '').trim();
      const complaint = /^\d+$/.test(param)
        ? getComplaintById(Number(param))
        : getComplaintByPublicId(param);

      if (!complaint) {
        res.status(404).json({ error: `Complaint "${param}" not found.` });
        return;
      }

      res.json({ complaint });
    } catch (err: any) {
      console.error('[Get Complaint Detail Error]', err?.message);
      res.status(500).json({ error: 'Failed to retrieve complaint details.' });
    }
  });

  app.get('/api/analytics', (_req: Request, res: Response) => {
    try {
      const analytics = getAnalyticsSummary();
      res.json(analytics);
    } catch (err: any) {
      console.error('[Analytics Error]', err?.message);
      res.status(500).json({ error: 'Failed to compute analytics metrics.' });
    }
  });

  app.get('/api/hotspots', (req: Request, res: Response) => {
    try {
      const epsMeters = req.query.eps_meters ? Number(req.query.eps_meters) : 450;
      const minSamples = req.query.min_samples ? Number(req.query.min_samples) : 3;
      const includeResolved = req.query.include_resolved !== 'false';

      const allComplaints = listComplaints({ limit: 500 });
      const hotspots = detectGeographicHotspots(allComplaints, {
        epsMeters: Number.isFinite(epsMeters) && epsMeters > 50 ? epsMeters : 450,
        minSamples: Number.isFinite(minSamples) && minSamples >= 2 ? minSamples : 3,
        includeResolved,
      });

      res.json({
        count: hotspots.length,
        config: {
          eps_meters: epsMeters,
          min_samples: minSamples,
          include_resolved: includeResolved,
        },
        hotspots,
      });
    } catch (err: any) {
      console.error('[Hotspots Error]', err?.message);
      res.status(500).json({ error: 'Failed to calculate geographic hotspots.' });
    }
  });

  app.get('/api/action-brief', async (req: Request, res: Response) => {
    try {
      const useExternal = req.query.external_ai === 'true';
      const complaints = listComplaints({ limit: 500 });
      const analytics = getAnalyticsSummary();
      const hotspots = detectGeographicHotspots(complaints);
      const brief = await generateActionBriefWithFallback(
        complaints,
        analytics,
        hotspots,
        useExternal
      );
      res.json(brief);
    } catch (err: any) {
      console.error('[Action Brief Error]', err?.message);
      res.status(500).json({ error: 'Failed to generate operational action brief.' });
    }
  });

  // --- PROTECTED ADMINISTRATIVE ENDPOINTS ---

  const handleAssignComplaint = (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Valid numeric complaint ID is required.' });
        return;
      }

      const { assigned_team, public_message } = req.body || {};
      const session = (req as any).adminSession as AdminSession;

      const updated = assignComplaintTeam(
        id,
        assigned_team,
        session?.username || 'Officer',
        public_message
      );

      broadcastEvent('complaint:updated', { complaint: updated });
      res.json({
        message: `Complaint ${updated.public_id} assigned to ${updated.assigned_team}.`,
        complaint: updated,
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to assign complaint.';
      const status = msg.includes('not found') ? 404 : 400;
      res.status(status).json({ error: msg });
    }
  };

  app.post('/admin/complaints/:id/assign', requireAdminAuth, handleAssignComplaint);
  app.post('/api/admin/complaints/:id/assign', requireAdminAuth, handleAssignComplaint);

  const handleUpdateStatus = (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Valid numeric complaint ID is required.' });
        return;
      }

      const { status, public_message, category } = req.body || {};
      const session = (req as any).adminSession as AdminSession;

      const updated = updateComplaintStatus(
        id,
        status,
        session?.username || 'Officer',
        public_message,
        category
      );

      broadcastEvent('complaint:updated', { complaint: updated });
      res.json({
        message: `Complaint ${updated.public_id} status updated to ${updated.status}.`,
        complaint: updated,
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to update complaint status.';
      const code = msg.includes('not found') ? 404 : 400;
      res.status(code).json({ error: msg });
    }
  };

  app.post('/admin/complaints/:id/status', requireAdminAuth, handleUpdateStatus);
  app.post('/api/admin/complaints/:id/status', requireAdminAuth, handleUpdateStatus);

  const handleDuplicateDecision = (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Valid numeric complaint ID is required.' });
        return;
      }

      const { action, duplicate_of_id } = req.body || {};
      const session = (req as any).adminSession as AdminSession;

      const updated = reviewDuplicateRelationship(
        id,
        action,
        duplicate_of_id ? Number(duplicate_of_id) : null,
        session?.username || 'Officer'
      );

      broadcastEvent('complaint:updated', { complaint: updated });
      res.json({
        message: `Duplicate status updated to ${updated.duplicate_status}.`,
        complaint: updated,
      });
    } catch (err: any) {
      const msg = err?.message || 'Failed to update duplicate relationship.';
      const code = msg.includes('not found') || msg.includes('does not exist') ? 404 : 400;
      res.status(code).json({ error: msg });
    }
  };

  app.post('/admin/complaints/:id/duplicate', requireAdminAuth, handleDuplicateDecision);
  app.post('/api/admin/complaints/:id/duplicate', requireAdminAuth, handleDuplicateDecision);

  app.post('/api/admin/seed', async (_req: Request, res: Response) => {
    try {
      const result = await seedSyntheticComplaints({ forceIfNonEmpty: true });
      broadcastEvent('dataset:seeded', result);
      res.json({
        message: `Synthetic demonstration dataset verified (${result.inserted} inserted, ${result.skipped} already present).`,
        ...result,
      });
    } catch (err: any) {
      console.error('[Seed Endpoint Error]', err?.message);
      res.status(500).json({ error: 'Failed to load synthetic seed dataset.' });
    }
  });

  // Auto-seed on initial startup if database is empty and autoSeed !== false
  if (options.autoSeed !== false) {
    seedSyntheticComplaints({ forceIfNonEmpty: false }).catch((err) => {
      console.error('[Startup Seed Error]', err);
    });
  }

  return { app, server };
}

async function startServer() {
  const { app, server } = createApp({ autoSeed: true });
  const PORT = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`CivicPulse AI Server running on http://0.0.0.0:${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startServer();
}
