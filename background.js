function log(message) {
  const timestamp = new Date().toISOString();
  const logEntry = `${timestamp}: ${message}`;
  console.log(logEntry);

  chrome.storage.local.get({ logs: [] }, function(result) {
    const logs = result.logs;
    logs.push(logEntry);
    // Keep only the last 100 log entries
    if (logs.length > 100) {
      logs.shift();
    }
    chrome.storage.local.set({ logs: logs });
  });
}

function getRandomizedDelay(interval, jitter) {
  // Calculate a random delay between (interval - jitter) and (interval + jitter)
  // Ensure minimum delay of 0.1 minutes (6 seconds)
  const minDelay = Math.max(0.1, interval - jitter);
  const maxDelay = interval + jitter;
  const randomDelay = minDelay + Math.random() * (maxDelay - minDelay);
  return randomDelay;
}

function scheduleNextAlarm(notification) {
  const delay = getRandomizedDelay(notification.interval, notification.jitter || 0);
  log(`Scheduling next alarm for "${notification.text}" in ${delay.toFixed(2)} minutes (base: ${notification.interval}, jitter: ±${notification.jitter || 0})`);

  chrome.alarms.create(notification.id, {
    delayInMinutes: delay
  });
}

function showNotification(notification) {
  log(`Showing notification: "${notification.text}"`);
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title: 'Reminder',
    message: notification.text,
    silent: !notification.sound,
    priority: 2,
    requireInteraction: true
  }, (notificationId) => {
    if (chrome.runtime.lastError) {
      log(`Error creating notification: ${chrome.runtime.lastError.message}`);
    } else {
      log(`Notification created with ID: ${notificationId}`);
    }
  });
}

function updateAlarms() {
  log('Updating alarms');
  chrome.alarms.clearAll(() => {
    chrome.storage.sync.get('notifications', function(result) {
      const notifications = result.notifications || [];
      log(`Found ${notifications.length} notification(s)`);

      notifications.forEach(notification => {
        if (notification.active) {
          scheduleNextAlarm(notification);
        }
      });
    });
  });
}

chrome.alarms.onAlarm.addListener(function(alarm) {
  log(`Alarm triggered: ${alarm.name}`);
  chrome.storage.sync.get('notifications', function(result) {
    const notifications = result.notifications || [];
    const notification = notifications.find(n => n.id === alarm.name);

    if (notification && notification.active) {
      showNotification(notification);
      // Schedule the next occurrence with randomized delay
      scheduleNextAlarm(notification);
    } else {
      log(`No matching active notification found for alarm: ${alarm.name}`);
    }
  });
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === 'updateAlarms') {
    updateAlarms();
    sendResponse({ success: true });
  }
  return true;
});

// Initialize alarms when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  log('Extension installed or updated');
  updateAlarms();
});

// Re-initialize alarms when service worker starts (in case it was suspended)
chrome.storage.sync.get('notifications', function(result) {
  const notifications = result.notifications || [];
  chrome.alarms.getAll((alarms) => {
    const alarmNames = alarms.map(a => a.name);
    const activeNotificationIds = notifications.filter(n => n.active).map(n => n.id);

    // Check if any active notifications are missing alarms
    const missingAlarms = activeNotificationIds.filter(id => !alarmNames.includes(id));
    if (missingAlarms.length > 0) {
      log(`Restoring ${missingAlarms.length} missing alarm(s)`);
      missingAlarms.forEach(id => {
        const notification = notifications.find(n => n.id === id);
        if (notification) {
          scheduleNextAlarm(notification);
        }
      });
    }
  });
});

chrome.notifications.getPermissionLevel((level) => {
  log(`Notification permission level: ${level}`);
});

chrome.notifications.onClicked.addListener((notificationId) => {
  log(`Notification clicked: ${notificationId}`);
  chrome.notifications.clear(notificationId);
});

