let notifications = [];

function renderNotifications() {
  const listElement = document.getElementById('notificationList');
  listElement.innerHTML = '';

  if (notifications.length === 0) {
    listElement.innerHTML = '<div class="empty-state">No nudges yet.<br>Add a recurring reminder to get started.</div>';
    return;
  }

  notifications.forEach((notification) => {
    const notificationElement = document.createElement('div');
    notificationElement.className = 'notification-item' + (notification.active ? '' : ' inactive');

    const jitterText = notification.jitter > 0 ? ` ±${notification.jitter}` : '';

    notificationElement.innerHTML = `
      <h3>${escapeHtml(notification.text)}</h3>
      <div class="notification-meta">
        <span>Every ${formatInterval(notification.interval)}${jitterText}</span>
        <span>${notification.sound ? 'Sound on' : 'Silent'}</span>
      </div>
      <div class="notification-controls">
        <button class="btn-small btn-secondary edit-btn" data-id="${notification.id}">Edit</button>
        <label class="toggle-label">
          <span>${notification.active ? 'On' : 'Off'}</span>
          <input type="checkbox" class="toggle-btn" data-id="${notification.id}" ${notification.active ? 'checked' : ''}>
        </label>
      </div>
    `;
    listElement.appendChild(notificationElement);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatInterval(interval) {
  if (interval >= 60) {
    const hours = Math.floor(interval / 60);
    const mins = interval % 60;
    if (mins === 0) {
      return `${hours}h`;
    }
    return `${hours}h ${mins}m`;
  } else if (interval >= 1) {
    return `${interval} min`;
  } else {
    const seconds = Math.round(interval * 60);
    return `${seconds}s`;
  }
}

function showForm(notification = null) {
  const form = document.getElementById('notificationForm');
  const settingsForm = document.getElementById('settingsForm');
  const formTitle = document.getElementById('formTitle');
  const addButton = document.getElementById('addNotification');
  const deleteBtn = document.getElementById('deleteFromEdit');

  form.style.display = 'block';
  document.querySelector('.bottom-bar').style.display = 'none';

  if (notification) {
    formTitle.textContent = 'Edit Nudge';
    document.getElementById('notificationId').value = notification.id;
    document.getElementById('notificationText').value = notification.text;
    document.getElementById('notificationInterval').value = notification.interval;
    document.getElementById('notificationJitter').value = notification.jitter || 0;
    document.getElementById('notificationSound').checked = notification.sound;
    deleteBtn.style.display = 'block';
  } else {
    formTitle.textContent = 'New Nudge';
    settingsForm.reset();
    document.getElementById('notificationId').value = '';
    document.getElementById('notificationJitter').value = 0;
    deleteBtn.style.display = 'none';
  }

  document.getElementById('notificationText').focus();
}

function hideForm() {
  document.getElementById('notificationForm').style.display = 'none';
  document.querySelector('.bottom-bar').style.display = 'flex';
}

document.addEventListener('DOMContentLoaded', function() {
  const addButton = document.getElementById('addNotification');
  const settingsForm = document.getElementById('settingsForm');
  const cancelButton = document.getElementById('cancelEdit');

  // Load saved notifications, seed examples for new users
  chrome.storage.sync.get('notifications', function(result) {
    notifications = result.notifications || [];

    if (notifications.length === 0) {
      chrome.storage.local.get('seeded', function(seedResult) {
        if (!seedResult.seeded) {
          notifications = [
            { id: 'seed-1', text: 'Drink water', interval: 30, jitter: 5, sound: false, active: false },
            { id: 'seed-2', text: 'Stand up and stretch', interval: 45, jitter: 10, sound: true, active: false },
            { id: 'seed-3', text: 'Check posture', interval: 20, jitter: 0, sound: false, active: false }
          ];
          chrome.storage.sync.set({ notifications });
          chrome.storage.local.set({ seeded: true });
        }
        renderNotifications();
      });
    } else {
      renderNotifications();
    }
  });

  addButton.addEventListener('click', () => showForm());

  cancelButton.addEventListener('click', hideForm);

  document.getElementById('deleteFromEdit').addEventListener('click', function() {
    const id = document.getElementById('notificationId').value;
    if (!id) return;
    const notification = notifications.find(n => n.id === id);
    const name = notification ? notification.text : 'this nudge';
    if (!confirm(`Delete "${name}"?`)) return;
    notifications = notifications.filter(n => n.id !== id);
    chrome.storage.sync.set({ notifications }, function() {
      renderNotifications();
      hideForm();
      chrome.runtime.sendMessage({ action: 'updateAlarms' });
    });
  });

  settingsForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const id = document.getElementById('notificationId').value || Date.now().toString();
    const text = document.getElementById('notificationText').value;
    const interval = parseFloat(document.getElementById('notificationInterval').value);
    const jitter = parseFloat(document.getElementById('notificationJitter').value) || 0;
    const sound = document.getElementById('notificationSound').checked;

    // Validate jitter isn't larger than interval
    const effectiveJitter = Math.min(jitter, interval * 0.9);

    const notification = { id, text, interval, jitter: effectiveJitter, sound, active: true };

    const index = notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      notification.active = notifications[index].active;
      notifications[index] = notification;
    } else {
      notifications.push(notification);
    }

    chrome.storage.sync.set({ notifications }, function() {
      if (chrome.runtime.lastError) {
        console.error('Failed to save reminder:', chrome.runtime.lastError.message);
        return;
      }
      renderNotifications();
      hideForm();
      chrome.runtime.sendMessage({ action: 'updateAlarms' });
    });
  });

  document.getElementById('notificationList').addEventListener('click', function(e) {
    if (e.target.classList.contains('edit-btn')) {
      const id = e.target.getAttribute('data-id');
      const notification = notifications.find(n => n.id === id);
      showForm(notification);
    }
  });

  document.getElementById('notificationList').addEventListener('change', function(e) {
    if (e.target.classList.contains('toggle-btn')) {
      const id = e.target.getAttribute('data-id');
      const notification = notifications.find(n => n.id === id);
      notification.active = e.target.checked;
      chrome.storage.sync.set({ notifications }, function() {
        if (chrome.runtime.lastError) {
          console.error('Failed to update reminder:', chrome.runtime.lastError.message);
          return;
        }
        renderNotifications();
        chrome.runtime.sendMessage({ action: 'updateAlarms' });
      });
    }
  });

});
