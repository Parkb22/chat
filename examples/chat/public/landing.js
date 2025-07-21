document.addEventListener('DOMContentLoaded', function() {
  const chatButton = document.getElementById('chatButton');
  const chatWidget = document.getElementById('chatWidget');
  const closeChat = document.getElementById('closeChat');
  const chatFrame = document.getElementById('chatFrame');
  const notificationBadge = document.getElementById('notificationBadge');

  let isWidgetOpen = false;
  let notificationCount = 0;

  // Function to open chat widget
  function openChatWidget() {
    if (!isWidgetOpen) {
      chatWidget.classList.remove('hidden');
      chatButton.style.display = 'none';
      isWidgetOpen = true;
      
      // Clear notifications when opening
      clearNotifications();
      
      // Add slight delay to ensure iframe loads properly
      setTimeout(() => {
        chatFrame.focus();
      }, 300);
    }
  }

  // Notification functions
  function addNotification() {
    if (!isWidgetOpen) {
      notificationCount++;
      updateNotificationBadge();
    }
  }

  function clearNotifications() {
    notificationCount = 0;
    updateNotificationBadge();
  }

  function updateNotificationBadge() {
    if (notificationCount > 0 && !isWidgetOpen) {
      notificationBadge.textContent = notificationCount > 9 ? '9+' : notificationCount;
      notificationBadge.classList.remove('hidden');
    } else {
      notificationBadge.classList.add('hidden');
    }
  }

  // Function to close chat widget
  function closeChatWidget() {
    if (isWidgetOpen) {
      chatWidget.classList.add('hidden');
      chatButton.style.display = 'flex';
      isWidgetOpen = false;
      
      // Optional: Reload iframe to reset chat state
      // chatFrame.src = chatFrame.src;
    }
  }

  // Event listeners
  chatButton.addEventListener('click', openChatWidget);
  closeChat.addEventListener('click', closeChatWidget);

  // Close widget when clicking outside (optional)
  document.addEventListener('click', function(event) {
    if (isWidgetOpen && 
        !chatWidget.contains(event.target) && 
        !chatButton.contains(event.target)) {
      // Uncomment the line below if you want to close on outside click
      // closeChatWidget();
    }
  });

  // Handle escape key to close widget
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && isWidgetOpen) {
      closeChatWidget();
    }
  });

  // Listen for messages from the iframe
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type) {
      const connectionStatus = document.getElementById('connectionStatus');
      const userCount = document.getElementById('userCount');
      
      switch (event.data.type) {
        case 'connection_status':
          if (connectionStatus) {
            connectionStatus.className = `status-indicator ${event.data.connected ? 'online' : 'offline'}`;
          }
          if (userCount && event.data.userCount !== undefined) {
            const count = event.data.userCount;
            userCount.textContent = `${count} user${count !== 1 ? 's' : ''}`;
          }
          break;
                 case 'user_count_update':
           if (userCount && event.data.userCount !== undefined) {
             const count = event.data.userCount;
             userCount.textContent = `${count} user${count !== 1 ? 's' : ''}`;
           }
           break;
         case 'user_mentioned':
           console.log(`You were mentioned by ${event.data.mentionedBy}`);
           addNotification();
           break;
         case 'chat_opened':
          console.log('Chat widget opened');
          break;
        case 'user_connected':
          console.log('User connected to chat');
          break;
        case 'user_disconnected':
          console.log('User disconnected from chat');
          break;
      }
    }
  });

  // Add visual feedback when chat has new messages (future enhancement)
  function showNotification() {
    chatButton.classList.add('has-notification');
    // Remove after animation
    setTimeout(() => {
      chatButton.classList.remove('has-notification');
    }, 3000);
  }

  // Pulse animation for the chat button (to attract attention)
  function addPulseEffect() {
    const pulse = chatButton.querySelector('.pulse');
    if (pulse) {
      pulse.style.animation = 'pulse-ring 1s infinite';
      setTimeout(() => {
        pulse.style.animation = 'pulse-ring 2s infinite';
      }, 5000);
    }
  }

  // Initialize with a subtle pulse effect
  setTimeout(addPulseEffect, 2000);
}); 