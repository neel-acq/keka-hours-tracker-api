import * as queries from '../db/queries.js';
import { findTodayEntry } from '../attendance-match.js';

const DEFAULT_EOD_MESSAGES = [
  'Good Morning',
  'Going For Break',
  'Back from Break',
  'Leaving for the day',
  'Done for today, see you tomorrow!'
];

const EIGHT_HOURS_SECONDS = 8 * 60 * 60;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseTeamsTokenPayload(token) {
  if (!token || !token.includes('.')) return null;
  try {
    const part = token.split('.')[1];
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

export function extractTeamsFromId(token) {
  const payload = parseTeamsTokenPayload(token);
  if (!payload) return null;

  const cid = payload.cid || payload.CID || payload.skypeId || payload.skypeid;
  if (cid) {
    const normalized = String(cid).replace(/^8:live:\.cid\./i, '');
    return `8:live:.cid.${normalized}`;
  }

  if (payload.oid && String(payload.oid).includes('live:')) {
    return String(payload.oid);
  }

  if (payload.sub && String(payload.sub).startsWith('8:')) {
    return String(payload.sub);
  }

  if (payload.username && String(payload.username).startsWith('8:')) {
    return String(payload.username);
  }

  return payload.fromId || payload.from_id || null;
}

export async function getTeamsCredentials(userId) {
  return queries.getTeamsCredentials(userId);
}

export async function sendTeamsMessage(userId, messageText) {
  const config = await queries.getTeamsCredentials(userId);
  if (!config) {
    return { success: false, error: 'Teams credentials not configured' };
  }

  let fromId = config.fromId;
  if (!fromId && config.skypeToken) {
    fromId = extractTeamsFromId(config.skypeToken);
  }

  if (!config.conversationId || !config.displayName) {
    return {
      success: false,
      error: 'Missing Teams configuration. Set display name and group in the Workspace tab.'
    };
  }
  if (!fromId) {
    return { success: false, error: 'Teams user ID not found' };
  }
  if (!config.skypeToken || new Date(config.tokenExpiry) < new Date()) {
    return { success: false, error: 'Teams token missing or expired' };
  }

  const apiUrl = `https://teams.live.com/api/chatsvc/consumer/v1/users/ME/conversations/${encodeURIComponent(config.conversationId)}/messages`;
  const timestamp = new Date().toISOString();
  const clientMessageId = String(BigInt(Date.now()) * 1000000n + BigInt(Math.floor(Math.random() * 1000000)));

  const payload = {
    type: 'Message',
    conversationid: config.conversationId,
    conversationLink: apiUrl,
    from: fromId,
    fromUserId: fromId,
    composetime: timestamp,
    originalarrivaltime: timestamp,
    content: `<p>${escapeHtml(messageText)}</p>`,
    messagetype: 'RichText/Html',
    contenttype: 'Text',
    imdisplayname: config.displayName,
    clientmessageid: clientMessageId,
    callId: '',
    state: 0,
    version: '0',
    amsreferences: [],
    properties: {
      importance: '',
      subject: '',
      title: '',
      cards: '[]',
      links: '[]',
      mentions: '[]',
      onbehalfof: null,
      files: '[]',
      policyViolation: null,
      formatVariant: 'TEAMS'
    },
    crossPostChannels: []
  };

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authentication: `skypetoken=${config.skypeToken}`,
      behavioroverride: 'redirectAs404'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `HTTP ${response.status}: ${errorText.substring(0, 100)}` };
  }
  return { success: true };
}

function parseKekaTimeStr(timeStr) {
  if (!timeStr || timeStr === 'MISSING') return null;
  const today = new Date();
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)/i);
  if (!timeMatch) return null;
  let hours = parseInt(timeMatch[1]);
  const minutes = parseInt(timeMatch[2]);
  const seconds = parseInt(timeMatch[3]);
  const period = timeMatch[4].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  today.setHours(hours, minutes, seconds, 0);
  return today;
}

function calculateAttendanceStats(inOutArray) {
  const validSwipes = inOutArray.filter((s) => s.time && s.time !== 'MISSING');
  if (validSwipes.length === 0) return null;

  let firstIn = null;
  let totalEffectiveSeconds = 0;

  for (let i = 0; i < validSwipes.length; i++) {
    const swipe = validSwipes[i];
    const swipeTime = parseKekaTimeStr(swipe.time);
    if (!swipeTime) continue;
    if (swipe.type === 'IN') {
      if (!firstIn) firstIn = swipeTime;
      if (i + 1 < validSwipes.length && validSwipes[i + 1].type === 'OUT') {
        const outTime = parseKekaTimeStr(validSwipes[i + 1].time);
        if (outTime) totalEffectiveSeconds += (outTime - swipeTime) / 1000;
      }
    }
  }

  const lastSwipe = validSwipes[validSwipes.length - 1];
  const lastSwipeTime = parseKekaTimeStr(lastSwipe.time);
  if (!lastSwipeTime) return null;
  if (lastSwipe.type === 'IN') {
    totalEffectiveSeconds += (Date.now() - lastSwipeTime.getTime()) / 1000;
  }

  let targetExitTime;
  if (firstIn) {
    const tenAM = new Date(firstIn);
    tenAM.setHours(10, 0, 0, 0);
    if (firstIn < tenAM) {
      targetExitTime = new Date(firstIn);
      targetExitTime.setHours(19, 0, 0, 0);
    } else {
      targetExitTime = new Date(firstIn.getTime() + 9 * 60 * 60 * 1000);
    }
  } else {
    targetExitTime = new Date();
  }

  return {
    effectiveSeconds: totalEffectiveSeconds,
    lastSwipeType: lastSwipe.type,
    minutesSinceLastSwipe: (Date.now() - lastSwipeTime.getTime()) / (1000 * 60),
    targetExitTime
  };
}

export async function computeSmartEodSuggestion(userId, scrapedAttendance, options = {}) {
  const creds = await queries.getTeamsCredentials(userId);
  const presets = creds?.prewrittenMessages?.length ? creds.prewrittenMessages : DEFAULT_EOD_MESSAGES;
  const msg = (index, fallback) => presets[index] || fallback || presets[0];

  const todayEntry = scrapedAttendance?.entries ? findTodayEntry(scrapedAttendance.entries) : null;
  const inOutArray = todayEntry?.inOutArray || [];
  const stats = inOutArray.length ? calculateAttendanceStats(inOutArray) : null;
  const { reason } = options;

  if (reason === 'timer_start') {
    if (!inOutArray.length || !stats || stats.effectiveSeconds < 60) {
      return msg(0, 'Good Morning');
    }
    return msg(2, 'Back from Break');
  }

  if (reason === 'timer_stop') {
    if (stats && stats.effectiveSeconds >= EIGHT_HOURS_SECONDS) {
      return msg(3, 'Leaving for the day');
    }
    return msg(1, 'Going For Break');
  }

  if (!inOutArray.length) {
    const now = new Date();
    return now.getHours() < 10 ? msg(0, 'Good Morning') : msg(3, 'Leaving for the day');
  }

  if (!stats) return presets[0];

  const now = new Date();
  if (stats.lastSwipeType === 'OUT' && stats.minutesSinceLastSwipe < 30) {
    return msg(2, 'Back from Break');
  }
  if (stats.lastSwipeType === 'IN' && stats.effectiveSeconds < EIGHT_HOURS_SECONDS) {
    return msg(1, 'Going For Break');
  }
  if (stats.effectiveSeconds >= EIGHT_HOURS_SECONDS || now >= stats.targetExitTime) {
    return stats.effectiveSeconds >= EIGHT_HOURS_SECONDS
      ? msg(4, 'Done for today, see you tomorrow!')
      : msg(3, 'Leaving for the day');
  }
  return presets[0];
}

export async function fetchTeamsGroups(userId) {
  const config = await queries.getTeamsCredentials(userId);
  if (!config?.skypeToken || new Date(config.tokenExpiry) < new Date()) {
    return { success: false, error: 'Teams token missing or expired' };
  }
  const response = await fetch(
    'https://teams.live.com/api/chatsvc/consumer/v1/users/ME/conversations?view=msnp24Equivalent',
    { headers: { Authentication: `skypetoken=${config.skypeToken}` } }
  );
  if (!response.ok) return { success: false, error: `HTTP ${response.status}` };
  const data = await response.json();
  const groups = (data.conversations || [])
    .filter((conv) => conv.id && conv.threadProperties?.topic)
    .map((conv) => ({ id: conv.id, name: conv.threadProperties.topic }));
  return { success: true, groups };
}
