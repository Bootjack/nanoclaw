#!/usr/bin/env node
/**
 * Co-Ownership Scheduling Validator
 *
 * Validates calendar reservations against co-ownership agreement rules.
 * Sends alerts when violations are detected.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');

// Configuration paths
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const STATE_FILE = path.join(__dirname, 'cardinal-state.json');
const IPC_MESSAGES_DIR = path.join(PROJECT_ROOT, 'data', 'ipc', 'main', 'messages');
const TOKEN_FILE = path.join(require('os').homedir(), '.google-calendar-mcp', 'tokens.json');
const OAUTH_KEYS_FILE = path.join(require('os').homedir(), '.google-calendar-mcp', 'gcp-oauth.keys.json');
const CONFIG_FILE = path.join(__dirname, 'cardinal-owners.json');

// Load configuration from gitignored config file
let OWNER_EMAILS = {};
let CALENDAR_ID = '';
let SLACK_CHANNEL_JID = '';

try {
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  OWNER_EMAILS = config.owner_emails || {};
  CALENDAR_ID = config.calendar_id || '';
  SLACK_CHANNEL_JID = config.slack_channel_jid || '';
  console.log(`Loaded config: ${Object.keys(OWNER_EMAILS).length} owners, calendar: ${CALENDAR_ID ? 'set' : 'missing'}`);
} catch (err) {
  console.warn('Warning: cardinal-owners.json not found. Create it from cardinal-owners.example.json');
  console.warn('Owner identification will fall back to title/description only.');
}

// Rule limits
const MAX_CONCURRENT_RESERVATIONS = 5;
const MAX_ADVANCE_DAYS = 90;
const MAX_EXTENDED_TRIPS_PER_YEAR = 2;
const EXTENDED_TRIP_MIN_DAYS = 4;
const EXTENDED_TRIP_MAX_DAYS = 10;

function refreshAccessToken() {
  return new Promise((resolve, reject) => {
    try {
      const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
      const account = tokens.normal || tokens.primary;

      if (!account || !account.refresh_token) {
        return reject(new Error('No refresh token available'));
      }

      // Read OAuth credentials from MCP config
      const oauthKeys = JSON.parse(fs.readFileSync(OAUTH_KEYS_FILE, 'utf8'));
      const clientId = oauthKeys.installed.client_id;
      const clientSecret = oauthKeys.installed.client_secret;

      console.log('Refreshing access token...');

      const postData = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: account.refresh_token,
        grant_type: 'refresh_token'
      }).toString();

      const options = {
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': postData.length
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            const response = JSON.parse(data);
            // Update token file
            account.access_token = response.access_token;
            account.expiry_date = Date.now() + (response.expires_in * 1000);
            fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
            console.log('Token refreshed successfully');
            resolve(response.access_token);
          } else {
            reject(new Error(`Token refresh failed: ${res.statusCode} ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

function getAccessToken() {
  try {
    const tokens = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    const account = tokens.normal || tokens.primary;

    if (!account) {
      console.error('No account found in tokens');
      return null;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = Date.now();
    if (account.expiry_date && account.expiry_date < now + 5 * 60 * 1000) {
      console.log('Token expired or expiring soon, needs refresh');
      return null; // Signal that refresh is needed
    }

    return account.access_token;
  } catch (err) {
    console.error('Error reading token:', err.message);
    return null;
  }
}

async function fetchCalendarEvents() {
  let token = getAccessToken();

  // If token is expired or missing, try to refresh
  if (!token) {
    try {
      token = await refreshAccessToken();
    } catch (err) {
      throw new Error(`Failed to refresh token: ${err.message}`);
    }
  }

  return new Promise((resolve, reject) => {

    const today = new Date();
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const futureEnd = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);

    const timeMin = yearStart.toISOString();
    const timeMax = futureEnd.toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&maxResults=2500`;

    const options = {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed.items || []);
          }
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

function parseDateTime(dtStr) {
  return new Date(dtStr);
}

function calculateDurationDays(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  if (!start || !end) return 0;

  const startDate = new Date(start);
  const endDate = new Date(end);

  // Count calendar days, not elapsed time
  // Friday 07:00 to Sunday 23:00 = 3 days (Fri, Sat, Sun)
  // Friday 15:00 to Sunday 05:00 = 3 days (Fri, Sat, Sun)
  const startDay = new Date(startDate);
  startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(endDate);
  endDay.setHours(0, 0, 0, 0);

  // Count the number of distinct calendar days
  let count = 0;
  let current = new Date(startDay);
  while (current <= endDay) {
    count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getOwnerName(event) {
  // Priority 1: Check creator email (works for production events)
  const email = event.creator?.email || '';
  const ownerFromEmail = OWNER_EMAILS[email];
  if (ownerFromEmail) {
    return ownerFromEmail;
  }

  // Priority 2: Check summary (title) - fallback for unmatched/unknown emails
  const ownerNames = Object.values(OWNER_EMAILS);
  const summary = event.summary || '';
  for (const name of ownerNames) {
    if (summary.toLowerCase().includes(name.toLowerCase())) {
      return name;
    }
  }

  // Priority 3: Check description field
  const description = event.description || '';
  for (const name of ownerNames) {
    if (description.toLowerCase().includes(name.toLowerCase())) {
      return name;
    }
  }

  return 'Unknown';
}

function validateCalendar(events) {
  const violations = [];
  const today = new Date();
  const yearStart = new Date(today.getFullYear(), 0, 1);
  const yearEnd = new Date(today.getFullYear() + 1, 0, 1);

  // Group by owner
  const eventsByOwner = {};
  for (const event of events) {
    if (event.status !== 'confirmed') continue;

    const owner = getOwnerName(event);
    if (!eventsByOwner[owner]) {
      eventsByOwner[owner] = [];
    }
    eventsByOwner[owner].push(event);
  }

  // Check recurring events
  const recurringCounts = {};
  for (const event of events) {
    if (event.recurringEventId) {
      const rid = event.recurringEventId;
      recurringCounts[rid] = (recurringCounts[rid] || 0) + 1;
    }
  }

  for (const [rid, count] of Object.entries(recurringCounts)) {
    if (count > 10) {
      const recurringInstances = events.filter(e => e.recurringEventId === rid);
      const event = recurringInstances[0];
      const owner = getOwnerName(event);

      // Get start and end dates of the series
      const dates = recurringInstances.map(e => new Date(e.start?.dateTime || e.start?.date));
      const startDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
      const endDate = new Date(Math.max(...dates)).toISOString().split('T')[0];

      violations.push({
        type: 'RECURRING_EVENT',
        owner,
        description: `Open-ended recurring event: '${event.summary}' (${count} instances from ${startDate} to ${endDate})`,
        event_id: rid
      });
      break;
    }
  }

  // Check for double bookings (overlapping events)
  const confirmedEvents = events.filter(e => e.status === 'confirmed');
  for (let i = 0; i < confirmedEvents.length; i++) {
    for (let j = i + 1; j < confirmedEvents.length; j++) {
      const event1 = confirmedEvents[i];
      const event2 = confirmedEvents[j];

      const start1 = new Date(event1.start?.dateTime || event1.start?.date);
      const end1 = new Date(event1.end?.dateTime || event1.end?.date);
      const start2 = new Date(event2.start?.dateTime || event2.start?.date);
      const end2 = new Date(event2.end?.dateTime || event2.end?.date);

      // Check for overlap: events overlap if start1 < end2 AND start2 < end1
      if (start1 < end2 && start2 < end1) {
        const owner1 = getOwnerName(event1);
        const owner2 = getOwnerName(event2);

        violations.push({
          type: 'DOUBLE_BOOKING',
          owner: `${owner1}/${owner2}`,
          description: `Double booking: '${event1.summary}' (${owner1}, ${start1.toISOString().split('T')[0]}) overlaps with '${event2.summary}' (${owner2}, ${start2.toISOString().split('T')[0]})`,
          event_id: `${event1.id}|${event2.id}`
        });
      }
    }
  }

  // Validate each owner
  for (const [owner, ownerEvents] of Object.entries(eventsByOwner)) {
    // Count future reservations (distinct calendar days with events)
    const futureEvents = ownerEvents.filter(e => {
      const startDt = e.start?.dateTime || e.start?.date;
      if (!startDt) return false;
      return new Date(startDt) >= today;
    });

    // Count reservations: each calendar day counts as 1 reservation
    // BUT extended trips (>= 4 days) are exempt from the 5-reservation limit
    const reservationDays = new Set();
    for (const event of futureEvents) {
      const duration = calculateDurationDays(event);

      // Skip extended trips - they don't count toward the 5-reservation limit
      if (duration >= EXTENDED_TRIP_MIN_DAYS) continue;

      // For non-extended trips, count every calendar day the event spans
      const startDt = event.start?.dateTime || event.start?.date;
      const endDt = event.end?.dateTime || event.end?.date;
      const start = new Date(startDt);
      const end = new Date(endDt);

      // Add each calendar day from start to end
      let current = new Date(start);
      current.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);

      while (current <= endDay) {
        reservationDays.add(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    }

    if (reservationDays.size > MAX_CONCURRENT_RESERVATIONS) {
      violations.push({
        type: 'MAX_RESERVATIONS',
        owner,
        description: `${owner} has ${reservationDays.size} reservations (limit: ${MAX_CONCURRENT_RESERVATIONS})`,
        event_id: null
      });
    }

    // Check 90-day advance booking
    const advanceBookingViolations = [];
    for (const event of ownerEvents) {
      const startDt = event.start?.dateTime || event.start?.date;
      if (!startDt) continue;

      const start = new Date(startDt);
      if (start < today) continue;

      const duration = calculateDurationDays(event);
      const daysAdvance = Math.floor((start - today) / (24 * 60 * 60 * 1000));

      if (duration < EXTENDED_TRIP_MIN_DAYS && daysAdvance > MAX_ADVANCE_DAYS) {
        advanceBookingViolations.push({
          event,
          start,
          daysAdvance,
          recurringEventId: event.recurringEventId
        });
      }
    }

    // Group advance booking violations by recurring event
    const recurringGroups = {};
    const standaloneViolations = [];

    for (const violation of advanceBookingViolations) {
      if (violation.recurringEventId) {
        if (!recurringGroups[violation.recurringEventId]) {
          recurringGroups[violation.recurringEventId] = [];
        }
        recurringGroups[violation.recurringEventId].push(violation);
      } else {
        standaloneViolations.push(violation);
      }
    }

    // Add grouped recurring violations
    for (const [rid, group] of Object.entries(recurringGroups)) {
      const dates = group.map(v => v.start);
      const startDate = new Date(Math.min(...dates)).toISOString().split('T')[0];
      const endDate = new Date(Math.max(...dates)).toISOString().split('T')[0];
      const minDays = Math.min(...group.map(v => v.daysAdvance));
      const maxDays = Math.max(...group.map(v => v.daysAdvance));

      violations.push({
        type: 'ADVANCE_BOOKING',
        owner,
        description: `${owner}'s '${group[0].event.summary}' - ${group.length} instances exceed 90-day limit (${startDate} to ${endDate}, ${minDays}-${maxDays} days in advance)`,
        event_id: rid
      });
    }

    // Add standalone violations
    for (const violation of standaloneViolations) {
      violations.push({
        type: 'ADVANCE_BOOKING',
        owner,
        description: `${owner}'s '${violation.event.summary}' on ${violation.start.toISOString().split('T')[0]} is ${violation.daysAdvance} days in advance (limit: ${MAX_ADVANCE_DAYS})`,
        event_id: violation.event.id
      });
    }

    // Check extended trip quota
    const yearEvents = ownerEvents.filter(e => {
      const startDt = e.start?.dateTime || e.start?.date;
      if (!startDt) return false;
      const start = new Date(startDt);
      return start >= yearStart && start < yearEnd;
    });

    const extendedTrips = yearEvents.filter(e => {
      const duration = calculateDurationDays(e);
      return duration >= EXTENDED_TRIP_MIN_DAYS && duration <= EXTENDED_TRIP_MAX_DAYS;
    });

    if (extendedTrips.length > MAX_EXTENDED_TRIPS_PER_YEAR) {
      violations.push({
        type: 'EXTENDED_TRIP_QUOTA',
        owner,
        description: `${owner} has ${extendedTrips.length} extended trips in ${today.getFullYear()} (limit: ${MAX_EXTENDED_TRIPS_PER_YEAR})`,
        event_id: null
      });
    }

    // Check long trips
    for (const event of ownerEvents) {
      const duration = calculateDurationDays(event);
      if (duration > EXTENDED_TRIP_MAX_DAYS) {
        violations.push({
          type: 'LONG_TRIP',
          owner,
          description: `${owner}'s '${event.summary}' is ${duration.toFixed(1)} days (exceeds ${EXTENDED_TRIP_MAX_DAYS}, needs mutual agreement)`,
          event_id: event.id
        });
      }
    }
  }

  return violations;
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { violations: [], lastNotification: null };
  }
}

function saveState(violations, notificationTimestamp = null) {
  const state = {
    violations,
    lastCheck: new Date().toISOString(),
    lastNotification: notificationTimestamp || loadState().lastNotification
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function violationsChanged(current, previous) {
  // Compare violations to see if anything changed
  if (current.length !== previous.length) return true;

  const currentKeys = new Set(current.map(v =>
    `${v.type}|${v.owner}|${v.event_id || v.description}`
  ));
  const previousKeys = new Set(previous.map(v =>
    `${v.type}|${v.owner}|${v.event_id || v.description}`
  ));

  // Check if sets are different
  for (const key of currentKeys) {
    if (!previousKeys.has(key)) return true;
  }
  for (const key of previousKeys) {
    if (!currentKeys.has(key)) return true;
  }

  return false;
}

function sendAlert(currentViolations, previousViolations) {
  const now = new Date().toISOString();

  // Determine what changed
  const currentKeys = new Set(currentViolations.map(v =>
    `${v.type}|${v.owner}|${v.event_id || v.description}`
  ));
  const previousKeys = new Set(previousViolations.map(v =>
    `${v.type}|${v.owner}|${v.event_id || v.description}`
  ));

  const newViolations = currentViolations.filter(v =>
    !previousKeys.has(`${v.type}|${v.owner}|${v.event_id || v.description}`)
  );
  const resolvedViolations = previousViolations.filter(v =>
    !currentKeys.has(`${v.type}|${v.owner}|${v.event_id || v.description}`)
  );

  // Build comprehensive message in natural prose
  let message = '';

  // Opening
  if (newViolations.length > 0 && resolvedViolations.length === 0) {
    message += `Hey team, I noticed ${newViolations.length === 1 ? 'a new scheduling issue' : 'some new scheduling issues'} with the Cardinal:\\n\\n`;
  } else if (resolvedViolations.length > 0 && newViolations.length === 0) {
    message += `Good news! `;
    if (currentViolations.length === 0) {
      message += `All scheduling issues have been resolved. The calendar looks good now.\\n`;
    } else {
      message += `Some scheduling issues were resolved:\\n\\n`;
    }
  } else if (newViolations.length > 0 && resolvedViolations.length > 0) {
    message += `Scheduling update: some issues resolved, but there are new ones:\\n\\n`;
  }

  // Current issues
  if (currentViolations.length > 0) {
    const newKeys = new Set(newViolations.map(v =>
      `${v.type}|${v.owner}|${v.event_id || v.description}`
    ));

    for (const v of currentViolations) {
      const key = `${v.type}|${v.owner}|${v.event_id || v.description}`;
      const isNew = newKeys.has(key);

      if (v.type === 'DOUBLE_BOOKING') {
        const match = v.description.match(/'([^']+)' \(([^,]+), ([^)]+)\) overlaps with '([^']+)' \(([^,]+), ([^)]+)\)/);
        if (match) {
          const [_, event1, owner1, date1, event2, owner2, date2] = match;
          message += `• ${owner1}'s "${event1}" and ${owner2}'s "${event2}" overlap ${date1 === date2 ? 'on ' + date1 : 'on ' + date1 + '/' + date2}`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        } else {
          message += `• ${v.description}`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        }
      } else if (v.type === 'MAX_RESERVATIONS') {
        const match = v.description.match(/(\w+) has (\d+) reservations/);
        if (match) {
          const [_, owner, count] = match;
          message += `• ${owner} has ${count} reservations (limit is 5)`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        }
      } else if (v.type === 'ADVANCE_BOOKING') {
        const match = v.description.match(/(\w+)'s '([^']+)' - (\d+) instances exceed 90-day limit/);
        if (match) {
          const [_, owner, eventName, count] = match;
          message += `• ${owner}'s "${eventName}" has ${count} reservations beyond the 90-day booking window`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        } else {
          const match2 = v.description.match(/(\w+)'s '([^']+)' on ([^ ]+) is (\d+) days in advance/);
          if (match2) {
            const [_, owner, eventName, date, days] = match2;
            message += `• ${owner}'s "${eventName}" on ${date} is booked ${days} days in advance (limit is 90)`;
            if (isNew) message += ` _(new)_`;
            message += `\\n`;
          }
        }
      } else if (v.type === 'RECURRING_EVENT') {
        const match = v.description.match(/Open-ended recurring event: '([^']+)' \((\d+) instances from ([^ ]+) to ([^)]+)\)/);
        if (match) {
          const [_, eventName, count, startDate, endDate] = match;
          message += `• "${eventName}" is set up as an open-ended recurring event with ${count} instances (${startDate} to ${endDate})`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        }
      } else if (v.type === 'EXTENDED_TRIP_QUOTA') {
        const match = v.description.match(/(\w+) has (\d+) extended trips/);
        if (match) {
          const [_, owner, count] = match;
          message += `• ${owner} has ${count} extended trips this year (limit is 2)`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        }
      } else if (v.type === 'LONG_TRIP') {
        const match = v.description.match(/(\w+)'s '([^']+)' is (\d+) days/);
        if (match) {
          const [_, owner, eventName, days] = match;
          message += `• ${owner}'s "${eventName}" is ${days} days (over 10 days requires mutual agreement)`;
          if (isNew) message += ` _(new)_`;
          message += `\\n`;
        }
      }
    }
    message += '\\n';
  }

  // Resolved issues
  if (resolvedViolations.length > 0 && currentViolations.length > 0) {
    message += `_Resolved:_\\n`;
    for (const v of resolvedViolations) {
      if (v.type === 'DOUBLE_BOOKING') {
        const match = v.description.match(/'([^']+)' \(([^,]+).*overlaps with '([^']+)'/);
        if (match) {
          const [_, event1, owner1, event2] = match;
          message += `• ${owner1}'s "${event1}" / "${event2}" overlap\\n`;
        }
      } else if (v.type === 'MAX_RESERVATIONS') {
        const match = v.description.match(/(\w+) has/);
        if (match) message += `• ${match[1]}'s reservation count\\n`;
      } else if (v.type === 'ADVANCE_BOOKING') {
        const match = v.description.match(/(\w+)'s '([^']+)'/);
        if (match) message += `• ${match[1]}'s "${match[2]}" advance booking\\n`;
      }
    }
  }

  // Write alert file
  const alertFile = path.join(__dirname, 'cardinal-alert.json');
  const alert = {
    message,
    timestamp: now,
    newCount: newViolations.length,
    resolvedCount: resolvedViolations.length,
    totalCount: currentViolations.length
  };
  fs.writeFileSync(alertFile, JSON.stringify(alert, null, 2));
  console.log('Alert written to cardinal-alert.json');
  console.log('ALERT:', message);

  // Send Slack notification via NanoClaw IPC
  try {
    const slackMessage = message.replace(/\\n/g, '\n');
    fs.mkdirSync(IPC_MESSAGES_DIR, { recursive: true });
    const ipcFile = path.join(IPC_MESSAGES_DIR, `cardinal-notify-${Date.now()}.json`);
    fs.writeFileSync(ipcFile, JSON.stringify({
      type: 'message',
      chatJid: SLACK_CHANNEL_JID,
      text: slackMessage,
      timestamp: now
    }));
    console.log('Notification written to IPC messages dir');
  } catch (err) {
    console.error('Failed to write IPC notification:', err.message);
  }

  return now;
}

async function main() {
  console.log(`[${new Date().toISOString()}] Cardinal N34038 validation starting...`);

  try {
    const events = await fetchCalendarEvents();
    console.log(`Found ${events.length} events`);

    const violations = validateCalendar(events);
    const prevState = loadState();
    const previousViolations = prevState.violations || [];

    // Check if violations changed
    if (violationsChanged(violations, previousViolations)) {
      console.log('Violations changed - sending notification');
      const notificationTimestamp = sendAlert(violations, previousViolations);
      saveState(violations, notificationTimestamp);
    } else {
      console.log('No changes in violations');
      saveState(violations);
    }

    console.log(`Complete. Total violations: ${violations.length}`);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
