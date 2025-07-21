$(function() {
  const FADE_TIME = 150; // ms
  const TYPING_TIMER_LENGTH = 400; // ms
  const COLORS = [
    '#e21400', '#91580f', '#f8a700', '#f78b00',
    '#58dc00', '#287b00', '#a8f07a', '#4ae8c4',
    '#3b88eb', '#3824aa', '#a700ff', '#d300e7'
  ];

  // Initialize variables
  const $window = $(window);
  const $usernameInput = $('.usernameInput');
  const $messages = $('.messages');
  const $inputMessage = $('.inputMessage');
  
  // UI enhancement variables
  let soundEnabled = true;
  let connectionState = 'disconnected'; // connected, connecting, disconnected
  
  // Unread message tracking
  let lastSeenMessageId = null;
  let unreadCount = 0;
  let isScrolledToBottom = true;
  let messageIdCounter = 0;
  
  // Initialize activeSockets to prevent errors
  window.activeSockets = {};

  // Pages
  const $walletPage = $('.wallet.page');
  const $usernamePage = $('.username.page');
  const $chatPage = $('.chat.page');

  // Wallet elements
  const $connectButtons = $('.connectWallet');
  const $walletStatus = $('.walletStatus');
  const $connectedWallet = $('.connectedWallet');
  const $walletAddress = $('.walletAddress');
  const $usernameDisplay = $('.username');
  const $disconnectBtn = $('.disconnectBtn');
  const $replyPreview = $('#replyPreview');
  const $cancelReply = $('.cancel-reply');

  const socket = io();

  // State variables
  let wallet = null;
  let walletAddress = null;
  let username = null;
  let connected = false;
  let typing = false;
  let lastTypingTime;
  let $currentInput = $usernameInput;
  let replyingTo = null;
  let activeUsers = new Map(); // Store active users for tagging
  window.isCurrentUserAdmin = false;
  
  // Mention autocomplete state
  let mentionAutocomplete = {
    visible: false,
    selectedIndex: 0,
    filteredUsers: [],
    startPos: 0,
    query: ''
  };

  // Show wallet page initially
  $walletPage.addClass('active');

  // Wallet connection functionality
  const getWalletProvider = (walletType) => {
    switch(walletType) {
      case 'phantom':
        return window.solana || window.phantom?.solana;
      case 'solflare':
        return window.solflare;
      case 'backpack':
        return window.backpack;
      default:
        return null;
    }
  };

  const connectWallet = async (walletType) => {
    try {
      $walletStatus.text('Connecting...');
      updateConnectionStatus('connecting');
      
      const walletProvider = getWalletProvider(walletType);
      
      if (!walletProvider) {
        $walletStatus.text(`${walletType} wallet not found. Please install the extension.`);
        updateConnectionStatus('disconnected');
        return;
      }

      const response = await walletProvider.connect();
      wallet = walletProvider;
      walletAddress = response.publicKey.toString();
      
      $walletStatus.text('Verifying ownership...');
      
      // Create a message to sign for authentication
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with DegenChat\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
      const encodedMessage = new TextEncoder().encode(message);
      
      // Request signature
      const signedMessage = await walletProvider.signMessage(encodedMessage, 'utf8');
      
      $walletStatus.text('Connected and verified!');
      $connectedWallet.text(walletAddress.substring(0, 4) + '...' + walletAddress.substring(walletAddress.length - 4));
      
      // Check if user already has a username for this wallet
      socket.emit('check user', { 
        walletAddress, 
        signature: Array.from(signedMessage.signature),
        message: message,
        timestamp: timestamp
      });
      
    } catch (error) {
      console.error('Wallet connection failed:', error);
      if (error.message?.includes('User rejected')) {
        $walletStatus.text('Authentication cancelled by user.');
      } else {
        $walletStatus.text('Connection failed. Please try again.');
      }
    }
  };

  // Disconnect functionality
  const disconnectWallet = async () => {
    try {
      if (wallet && wallet.disconnect) {
        await wallet.disconnect();
      }
      
      // Reset all state
      wallet = null;
      walletAddress = null;
      username = null;
      connected = false;
      
      // Reset UI
      $chatPage.removeClass('active');
      $usernamePage.removeClass('active');
      $walletPage.addClass('active');
      $walletStatus.text('');
      $connectedWallet.text('');
      $walletAddress.text('');
      $usernameDisplay.text('');
      $usernameInput.val('');
      $currentInput = $usernameInput;
      
      // Disconnect from socket
      socket.emit('disconnect user');
      
      console.log('Successfully disconnected');
    } catch (error) {
      console.error('Disconnect error:', error);
    }
  };

  // Wallet button event listeners
  $connectButtons.on('click', function() {
    const walletType = $(this).attr('id');
    connectWallet(walletType);
  });

  // Disconnect button event listener
  $disconnectBtn.on('click', () => {
    disconnectWallet();
  });

  // Cancel reply button
  $cancelReply.on('click', () => {
    clearReply();
  });

  const addParticipantsMessage = (data) => {
    let message = '';
    if (data.numUsers === 1) {
      message += `there's 1 participant`;
    } else {
      message += `there are ${data.numUsers} participants`;
    }
    log(message);
  }

  // Username validation
  const validateUsername = (username) => {
    if (!username) return { valid: false, error: "Username is required" };
    if (username.length < 4) return { valid: false, error: "Username must be at least 4 characters" };
    if (username.length > 10) return { valid: false, error: "Username must be 10 characters or less" };
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) return { valid: false, error: "Username can only contain letters, numbers, _ and -" };
    return { valid: true };
  }

  // Sets the client's username
  const setUsername = () => {
    const inputUsername = cleanInput($usernameInput.val().trim());
    const validation = validateUsername(inputUsername);

    if (!validation.valid) {
      $('.usernameNote small').text(validation.error).css('color', '#ff6b6b');
      return;
    }

    if (inputUsername && walletAddress) {
      username = inputUsername;
      $usernamePage.removeClass('active');
      $chatPage.addClass('active');
      $usernamePage.off('click');
      $currentInput = $inputMessage.focus();

      // Display wallet and username info
      $walletAddress.text(walletAddress.substring(0, 8) + '...' + walletAddress.substring(walletAddress.length - 8));
      $usernameDisplay.text(`(${username})`);

      // Tell the server about the wallet-username combination
      socket.emit('add user', { walletAddress, username });
    }
  }

  const showUsernamePage = () => {
    $walletPage.removeClass('active');
    $usernamePage.addClass('active');
    $currentInput = $usernameInput.focus();
  }

  // Check if message is an admin command
  const isAdminCommand = (message) => {
    return message.startsWith('/') && window.isCurrentUserAdmin;
  }

  // Show admin action confirmation modal
  const showAdminActionModal = (action, targetUser) => {
    // Clean the target user (remove @ symbol, trim)
    const cleanTargetUser = targetUser.replace(/^@/, '').trim();
    
    // Check if user exists (case-insensitive)
    const userEntry = Array.from(activeUsers.entries()).find(([userName]) => 
      userName.toLowerCase() === cleanTargetUser.toLowerCase()
    );

    // For unmute/unban, we allow users not in current session
    if (!userEntry && (action === 'mute' || action === 'ban')) {
      log(`User "${cleanTargetUser}" not found in current session.`);
      return;
    }
    
    // Use the exact username and get wallet address if user exists
    const actualUsername = userEntry ? userEntry[0] : cleanTargetUser;
    const walletAddress = userEntry ? userEntry[1] : null;

    const actionText = {
      'mute': 'mute',
      'unmute': 'unmute', 
      'ban': 'ban',
      'unban': 'unban'
    }[action];

    const $modal = $(`
      <div class="admin-modal-overlay">
        <div class="admin-modal">
          <div class="admin-modal-header">
            <h3>Admin Action: ${actionText.toUpperCase()}</h3>
          </div>
          <div class="admin-modal-body">
            <p>Are you sure you want to <strong>${actionText}</strong> user <strong>${actualUsername}</strong>?</p>
            ${action === 'mute' || action === 'ban' ? `
              <div class="admin-modal-options">
                <label>Reason (optional):</label>
                <input type="text" class="admin-reason-input" placeholder="Enter reason for ${action}" maxlength="100">
              </div>
            ` : ''}
          </div>
          <div class="admin-modal-actions">
            <button class="admin-confirm-btn">${actionText.toUpperCase()}</button>
            <button class="admin-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>
    `);

    // Add event handlers
    $modal.find('.admin-confirm-btn').on('click', () => {
      const reason = $modal.find('.admin-reason-input').val() || '';
      executeAdminAction(action, actualUsername, walletAddress, reason);
      $modal.remove();
    });

    $modal.find('.admin-cancel-btn, .admin-modal-overlay').on('click', (e) => {
      if (e.target === e.currentTarget) {
        $modal.remove();
      }
    });

    // Prevent input events from bubbling to the main chat
    $modal.find('.admin-reason-input').on('keydown keyup input', (e) => {
      e.stopPropagation();
      
      // Allow Enter to confirm the action
      if (e.type === 'keydown' && e.which === 13) {
        e.preventDefault();
        $modal.find('.admin-confirm-btn').click();
      }
      
      // Allow Escape to cancel
      if (e.type === 'keydown' && e.which === 27) {
        e.preventDefault();
        $modal.remove();
      }
    });

    // Add to page and focus the reason input
    $('body').append($modal);
    
    // Focus the reason input if it exists
    setTimeout(() => {
      $modal.find('.admin-reason-input').focus();
    }, 100);
  }

  // Execute the actual admin action
  const executeAdminAction = (action, targetUsername, targetWalletAddress, reason = '') => {
    const reasonText = reason ? ` (Reason: ${reason})` : '';
    
    // Send the correct socket events that the server expects
    switch (action) {
      case 'mute':
        if (targetWalletAddress) {
          socket.emit('mute user', targetWalletAddress);
          log(`✅ Muted user ${targetUsername}${reasonText}`);
        } else {
          log(`❌ Cannot mute ${targetUsername}: wallet address not found`);
        }
        break;
        
      case 'unmute':
        if (targetWalletAddress) {
          socket.emit('unmute user', targetWalletAddress);
          log(`✅ Unmuted user ${targetUsername}${reasonText}`);
        } else {
          log(`❌ Cannot unmute ${targetUsername}: wallet address not found`);
        }
        break;
        
      case 'ban':
        // Note: Server doesn't have ban functionality yet, using mute as fallback
        if (targetWalletAddress) {
          socket.emit('mute user', targetWalletAddress);
          log(`✅ Banned (muted) user ${targetUsername}${reasonText}`);
        } else {
          log(`❌ Cannot ban ${targetUsername}: wallet address not found`);
        }
        break;
        
      case 'unban':
        // Note: Server doesn't have unban functionality yet, using unmute as fallback
        if (targetWalletAddress) {
          socket.emit('unmute user', targetWalletAddress);
          log(`✅ Unbanned (unmuted) user ${targetUsername}${reasonText}`);
        } else {
          log(`❌ Cannot unban ${targetUsername}: wallet address not found`);
        }
        break;
        
      default:
        log(`❌ Unknown admin action: ${action}`);
    }
  }

  // Parse and execute admin commands
  const executeAdminCommand = (message) => {
    const parts = message.split(' ');
    const command = parts[0].toLowerCase();
    const target = parts[1];

    switch (command) {
      case '/mute':
        if (target) {
          showAdminActionModal('mute', target);
        } else {
          log('Usage: /mute <username> or /mute @username');
        }
        break;
      case '/unmute':
        if (target) {
          showAdminActionModal('unmute', target);
        } else {
          log('Usage: /unmute <username> or /unmute @username');
        }
        break;
      case '/unban':
        if (target) {
          showAdminActionModal('unban', target);
        } else {
          log('Usage: /unban <username> or /unban @username');
        }
        break;
      case '/ban':
        if (target) {
          showAdminActionModal('ban', target);
        } else {
          log('Usage: /ban <username> or /ban @username');
        }
        break;
      case '/help':
        log('Admin commands: /mute <user>, /unmute <user>, /ban <user>, /unban <user>. You can use @ or just username.');
        break;
      default:
        log(`Unknown command: ${command}. Type /help for available commands.`);
    }
  }

  // Sends a chat message
  const sendMessage = () => {
    let message = $inputMessage.val();
    message = cleanInput(message);
    if (message && connected) {
      $inputMessage.val('');
      
      // Debug command to check admin status
      if (message === '/debug') {
        console.log('=== ADMIN DEBUG INFO ===');
        console.log('Current user:', username);
        console.log('Current user is admin:', window.isCurrentUserAdmin);
        console.log('activeSockets:', window.activeSockets);
        console.log('activeUsers:', Array.from(activeUsers.entries()));
        return;
      }
      
      // Force test admin message
      if (message === '/testadmin') {
        console.log('Creating forced admin message for testing...');
        addChatMessage({
          username: username + '_ADMIN_TEST',
          message: 'This is a forced admin message test!',
          walletAddress: walletAddress,
          isAdmin: true,
          messageId: Date.now()
        });
        return;
      }
      
      // Check if it's an admin command
      if (isAdminCommand(message)) {
        executeAdminCommand(message);
        return;
      }
      
      // Prepare message data
      const messageData = {
        username, 
        message, 
        walletAddress,
        replyTo: replyingTo,
        isAdmin: window.isCurrentUserAdmin  // Add current user's admin status
      };
      
      addChatMessage(messageData);
      socket.emit('new message', {
        message: message,
        replyTo: replyingTo
      });
      
      // Clear reply
      clearReply();
    }
  }

  // Clear reply functionality
  const clearReply = () => {
    replyingTo = null;
    $replyPreview.addClass('hidden');
  };

  // Set reply target
  const setReplyTo = (messageData) => {
    replyingTo = {
      username: messageData.username,
      message: messageData.message.substring(0, 50) + (messageData.message.length > 50 ? '...' : ''),
      walletAddress: messageData.walletAddress
    };
    
    $('.reply-username').text(messageData.username);
    $replyPreview.removeClass('hidden');
    $inputMessage.focus();
  };

  // Detect and highlight @mentions
  const processMessage = (message) => {
    return message.replace(/@(\w+)/g, (match, mentionedUser) => {
      return `<span class="mention">${match}</span>`;
    });
  };

  // Check if current user is mentioned
  const isUserMentioned = (message, currentUsername) => {
    const mentionRegex = new RegExp(`@${currentUsername}\\b`, 'i');
    return mentionRegex.test(message);
  };

  // Admin functions
  const deleteMessage = (messageId) => {
    if (window.isCurrentUserAdmin) {
      socket.emit('delete message', messageId);
    }
  };

  const muteUser = (targetWalletAddress, targetUsername) => {
    if (window.isCurrentUserAdmin && confirm(`Are you sure you want to mute ${targetUsername}?`)) {
      socket.emit('mute user', targetWalletAddress);
    }
  };

  // Mention autocomplete functions
  const createAutocompleteDropdown = () => {
    const $dropdown = $('<div class="mention-autocomplete">');
    $('.input-section').append($dropdown);
    return $dropdown;
  };

  const showMentionAutocomplete = (query, cursorPos) => {
    // Show autocomplete even for empty queries (when @ is typed)
    if (activeUsers.size === 0) {
      hideMentionAutocomplete();
      return;
    }

    const $dropdown = $('.mention-autocomplete').length ? 
      $('.mention-autocomplete') : createAutocompleteDropdown();

    // Enhanced filtering with progressive narrowing
    const queryLower = query.toLowerCase();
    let filteredUsers = Array.from(activeUsers.entries())
      .filter(([userName, walletAddr]) => userName !== username) // Don't show current user
      .map(([userName, walletAddr]) => {
        const userLower = userName.toLowerCase();
        let score = 0;
        
        // For empty query, show all users
        if (query.length === 0) {
          score = 100 + (10 - userName.length);
        }
        // Exact starts with = highest priority
        else if (userLower.startsWith(queryLower)) {
          score = 1000 + (10 - userName.length); // Shorter names get slightly higher score
        }
        // Contains query = medium priority 
        else if (userLower.includes(queryLower)) {
          score = 500 + (10 - userName.length);
        }
        
        return { userName, walletAddr, score };
      })
      .filter(user => user.score > 0) // Only include matches
      .sort((a, b) => b.score - a.score) // Sort by score (highest first)
      .slice(0, query.length <= 1 ? 4 : 5) // Show fewer results for single chars or empty
      .map(user => [user.userName, user.walletAddr]); // Convert back to tuple format

    if (filteredUsers.length === 0) {
      hideMentionAutocomplete();
      return;
    }

    mentionAutocomplete.filteredUsers = filteredUsers;
    mentionAutocomplete.selectedIndex = 0;
    mentionAutocomplete.visible = true;
    mentionAutocomplete.query = query;

    // Clear and populate dropdown
    $dropdown.empty().addClass('visible');
    
    filteredUsers.forEach(([userName, walletAddr], index) => {
      // Check if user is admin (with safe access)
      const isUserAdmin = window.activeSockets && window.activeSockets[userName] && window.activeSockets[userName].isAdmin;
      


      const $item = $('<div class="mention-item">')
        .attr('data-index', index)
        .attr('data-username', userName)
        .html(`
          <span class="mention-username">${userName}${isUserAdmin ? '<span class="mention-admin-star">★</span>' : ''}</span>
          <span class="mention-wallet">${walletAddr.slice(0, 8)}...${walletAddr.slice(-4)}</span>
        `)
        .on('click', function() {
          selectMentionUser(userName);
        })
        .on('mouseenter', function() {
          $('.mention-item').removeClass('selected');
          $(this).addClass('selected');
          mentionAutocomplete.selectedIndex = index;
        });

      if (index === 0) {
        $item.addClass('selected');
      }

      $dropdown.append($item);
    });
    
    $dropdown.addClass('visible');
  };

  const hideMentionAutocomplete = () => {
    $('.mention-autocomplete').removeClass('visible');
    mentionAutocomplete.visible = false;
    mentionAutocomplete.selectedIndex = 0;
    mentionAutocomplete.filteredUsers = [];
  };

  const selectMentionUser = (userName) => {
    const currentValue = $inputMessage.val();
    const cursorPos = $inputMessage[0].selectionStart;
    
    // Find the @ symbol before cursor
    let atPos = cursorPos - 1;
    while (atPos >= 0 && currentValue[atPos] !== '@') {
      atPos--;
    }

    if (atPos >= 0) {
      // Replace from @ to current cursor position with @username
      const beforeAt = currentValue.substring(0, atPos);
      const afterCursor = currentValue.substring(cursorPos);
      const newValue = beforeAt + `@${userName} ` + afterCursor;
      
      $inputMessage.val(newValue);
      
      // Set cursor position after the mention
      const newCursorPos = atPos + userName.length + 2; // @ + username + space
      $inputMessage[0].setSelectionRange(newCursorPos, newCursorPos);
    }

    hideMentionAutocomplete();
    $inputMessage.focus();
  };

  const handleMentionNavigation = (e) => {
    if (!mentionAutocomplete.visible) return false;

    switch(e.keyCode) {
      case 38: // Up arrow
        e.preventDefault();
        mentionAutocomplete.selectedIndex = Math.max(0, mentionAutocomplete.selectedIndex - 1);
        updateMentionSelection();
        return true;
        
      case 40: // Down arrow
        e.preventDefault();
        mentionAutocomplete.selectedIndex = Math.min(
          mentionAutocomplete.filteredUsers.length - 1, 
          mentionAutocomplete.selectedIndex + 1
        );
        updateMentionSelection();
        return true;
        
      case 13: // Enter
        e.preventDefault();
        const selectedUser = mentionAutocomplete.filteredUsers[mentionAutocomplete.selectedIndex];
        if (selectedUser) {
          selectMentionUser(selectedUser[0]);
        }
        return true;
        
      case 27: // Escape
        hideMentionAutocomplete();
        return true;
    }
    
    return false;
  };

  const updateMentionSelection = () => {
    $('.mention-item').removeClass('selected');
    $(`.mention-item[data-index="${mentionAutocomplete.selectedIndex}"]`).addClass('selected');
  };

  const checkForMentionTrigger = () => {
    const currentValue = $inputMessage.val();
    const cursorPos = $inputMessage[0].selectionStart;
    
    // Find @ symbol before cursor
    let atPos = cursorPos - 1;
    let foundAt = false;
    
    // Look backwards from cursor to find @
    while (atPos >= 0) {
      const char = currentValue[atPos];
      if (char === '@') {
        foundAt = true;
        break;
      }
      if (char === ' ' || char === '\n') {
        // Found space before @, stop looking
        break;
      }
      atPos--;
    }

    if (foundAt) {
      // Get the query after @
      const query = currentValue.substring(atPos + 1, cursorPos);
      
      // Only show if we have some context and no spaces in query
      if (query.length >= 0 && !query.includes(' ') && !query.includes('\n')) {
        showMentionAutocomplete(query, cursorPos);
        return;
      }
    }
    
    // Hide autocomplete if conditions not met
    hideMentionAutocomplete();
  };

  // Log a message
  const log = (message, options) => {
    const $el = $('<li>').addClass('log').text(message);
    addMessageElement($el, options);
  }

  // Show welcome message when chat is empty
  const showWelcomeMessage = () => {
    if ($('.message:not(.typing)').length === 0) {
      const $welcome = $(`
        <div class="welcome-message">
          <h3>🌟 Welcome to the community!</h3>
          <p>Connect your wallet to start chatting with verified users</p>
          <p>All messages are authenticated by wallet signatures</p>
          <div class="welcome-tips">
            <span class="tip-badge">💬 Try @mentions</span>
            <span class="tip-badge">↩️ Click to reply</span>
            <span class="tip-badge">⭐ Admin features</span>
          </div>
        </div>
      `);
      $messages.append($welcome);
    }
  }

  // Remove welcome message
  const hideWelcomeMessage = () => {
    $('.welcome-message').remove();
  }

  // Adds the visual chat message to the message list
  const addChatMessage = (data, options = {}) => {
    // Check admin status from multiple sources since server might not send it (DO THIS FIRST!)
    let isMessageFromAdmin = data.isAdmin;
    if (!isMessageFromAdmin && window.activeSockets && window.activeSockets[data.username]) {
      isMessageFromAdmin = window.activeSockets[data.username].isAdmin;
    }
    

    
    const $typingMessages = getTypingMessages(data);
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    // Hide welcome message when first real message arrives
    if (!data.typing) {
      hideWelcomeMessage();
    }

    // Generate avatar
    const avatar = generateAvatar(data.walletAddress, data.username);

    // Create username with admin star
    let usernameText = data.username;
    if (isMessageFromAdmin) {
      usernameText += ' ★';
    }

    const $usernameDiv = $('<span class="username"/>')
      .text(usernameText)
      .css('color', getUsernameColor(data.username));
    
    // Make username clickable if wallet address is available
    if (data.walletAddress && !data.typing) {
      $usernameDiv.addClass('clickable-username')
        .attr('title', `View ${data.walletAddress} on Solscan`)
        .on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.open(`https://solscan.io/account/${data.walletAddress}`, '_blank');
        });
    }

    // Process message for @mentions or typing indicator
    let messageContent;
    if (data.typing) {
      messageContent = `is typing ${createTypingIndicator(data.username)}`;
    } else {
      messageContent = processMessage(data.message);
    }

    const $messageBodyDiv = $('<span class="messageBody">')
      .html(messageContent);

    const typingClass = data.typing ? 'typing' : '';
    const replyClass = data.replyTo ? 'reply' : '';
    const mentionedClass = !data.typing && isUserMentioned(data.message, username) ? 'mentioned' : '';
    const adminClass = isMessageFromAdmin ? 'admin-message' : '';
    
    // Assign unique message ID for unread tracking
    const messageId = data.messageId || (++messageIdCounter);
    
    const $messageDiv = $('<li class="message"/>')
      .data('username', data.username)
      .data('walletAddress', data.walletAddress)
      .data('message', data.message)
      .data('messageId', messageId)
      .attr('data-message-id', messageId)
      .addClass(`${typingClass} ${replyClass} ${mentionedClass} ${adminClass}`.trim());
    
    console.log('Final message classes:', $messageDiv.attr('class'));

    // Add reply context if this is a reply
    if (data.replyTo && !data.typing) {
      const $replyContext = $('<div class="reply-context">')
        .text(`↳ Replying to ${data.replyTo.username}: ${data.replyTo.message}`);
      $messageDiv.append($replyContext);
    }

    // Create message with compact structure
    $messageDiv.html(`
      <div class="message-header">
        ${avatar}
        <span class="username" style="color: ${getUsernameColor(data.username)}">${usernameText}</span>
        <span class="message-status status-sent">✓</span>
      </div>
      <div class="message-content">
        ${messageContent}
      </div>
    `);

    // Add click handler for replies (only if not typing message)
    if (!data.typing) {
      $messageDiv.on('click', function(e) {
        if (!$(e.target).hasClass('clickable-username') && !$(e.target).hasClass('delete-btn')) {
          setReplyTo({
            username: data.username,
            message: data.message,
            walletAddress: data.walletAddress
          });
        }
      });

      // Add admin controls if current user is admin
      if (window.isCurrentUserAdmin) {
        const $adminControls = $('<div class="admin-controls">')
          .css({
            'opacity': '0',
            'transition': 'opacity 0.2s ease',
            'font-size': '0.7rem',
            'margin-left': '8px'
          });

        const $deleteBtn = $('<button class="delete-btn admin-btn">')
          .html('🗑️')
          .attr('title', 'Delete message')
          .on('click', function(e) {
            e.stopPropagation();
            deleteMessage(data.messageId);
          });

        const $muteBtn = $('<button class="mute-btn admin-btn">')
          .html('🔇')
          .attr('title', 'Mute user')
          .on('click', function(e) {
            e.stopPropagation();
            muteUser(data.walletAddress, data.username);
          });

        $adminControls.append($deleteBtn, $muteBtn);
        $messageDiv.append($adminControls);

        // Show admin controls on hover
        $messageDiv.on('mouseenter', function() {
          $adminControls.css('opacity', '1');
        }).on('mouseleave', function() {
          $adminControls.css('opacity', '0');
        });
      }
    }

    addMessageElement($messageDiv, options);
    
    // Track unread messages (only for non-typing, non-own messages)
    if (!data.typing && data.username !== username && data.username) {
      if (!isScrolledToBottom) {
        unreadCount++;
        updateScrollIndicators();
      } else {
        // If at bottom, mark as read immediately
        lastSeenMessageId = messageId;
      }
    }

    // Check for notifications (mentions when widget might be closed)
    if (!data.typing && isUserMentioned(data.message, username) && data.username !== username) {
      // Send notification to parent window
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'user_mentioned',
          mentionedBy: data.username
        }, '*');
      }
    }
  }

  // Adds the visual chat typing message
  const addChatTyping = (data) => {
    data.typing = true;
    data.message = 'is typing';
    addChatMessage(data);
  }

  // Removes the visual chat typing message
  const removeChatTyping = (data) => {
    getTypingMessages(data).fadeOut(function () {
      $(this).remove();
    });
  }

  // Adds a message element to the messages and scrolls to the bottom
  const addMessageElement = (el, options) => {
    const $el = $(el);
    if (!options) {
      options = {};
    }
    if (typeof options.fade === 'undefined') {
      options.fade = true;
    }
    if (typeof options.prepend === 'undefined') {
      options.prepend = false;
    }

    if (options.fade) {
      $el.hide().fadeIn(FADE_TIME);
    }
    if (options.prepend) {
      $messages.prepend($el);
    } else {
      $messages.append($el);
    }

    $messages[0].scrollTop = $messages[0].scrollHeight;
  }

  // Prevents input from having injected markup
  const cleanInput = (input) => {
    return $('<div/>').text(input).html();
  }

  // Updates the typing event
  const updateTyping = () => {
    if (connected) {
      if (!typing) {
        typing = true;
        socket.emit('typing');
      }
      lastTypingTime = (new Date()).getTime();

      setTimeout(() => {
        const typingTimer = (new Date()).getTime();
        const timeDiff = typingTimer - lastTypingTime;
        if (timeDiff >= TYPING_TIMER_LENGTH && typing) {
          socket.emit('stop typing');
          typing = false;
        }
      }, TYPING_TIMER_LENGTH);
    }
  }

  // Gets the 'X is typing' messages of a user
  const getTypingMessages = (data) => {
    return $('.typing.message').filter(function (i) {
      return $(this).data('username') === data.username;
    });
  }

  // Gets the color of a username through our hash function
  const getUsernameColor = (username) => {
    let hash = 7;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + (hash << 5) - hash;
    }
    const index = Math.abs(hash % COLORS.length);
    return COLORS[index];
  }

  // Generate user avatar from wallet address
  const generateAvatar = (walletAddress, username) => {
    if (!walletAddress) return '';
    
    // Create hash from wallet address for consistent colors
    let hash = 0;
    for (let i = 0; i < walletAddress.length; i++) {
      hash = walletAddress.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Generate gradient colors
    const hue1 = Math.abs(hash) % 360;
    const hue2 = (hue1 + 60) % 360;
    const backgroundColor = `linear-gradient(135deg, hsl(${hue1}, 70%, 60%), hsl(${hue2}, 70%, 45%))`;
    
    // Get initials from username
    const initials = username.substring(0, 2).toUpperCase();
    
    return `<div class="user-avatar" style="background: ${backgroundColor}">${initials}</div>`;
  }

  // Enhanced typing indicator
  const createTypingIndicator = (username) => {
    return `
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    `;
  }

  // Play notification sound
  const playNotificationSound = (type = 'message') => {
    if (!soundEnabled) return;
    
    // Create audio context for notification sounds
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      if (type === 'mention') {
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);
      } else {
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
      }
      
      gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      // Fallback for browsers that don't support AudioContext
      console.log('🔊 Notification sound');
    }
  }

  // Check if user is scrolled to bottom of messages
  const checkScrollPosition = () => {
    const $messagesContainer = $('.messages');
    const scrollTop = $messagesContainer.scrollTop();
    const scrollHeight = $messagesContainer[0].scrollHeight;
    const clientHeight = $messagesContainer.height();
    
    // Consider "bottom" if within 50px of actual bottom
    const wasScrolledToBottom = isScrolledToBottom;
    isScrolledToBottom = scrollTop + clientHeight >= scrollHeight - 50;
    
    // If we just scrolled to bottom, mark messages as read
    if (!wasScrolledToBottom && isScrolledToBottom) {
      markMessagesAsRead();
    }
    
    updateScrollIndicators();
  }

  // Mark all visible messages as read
  const markMessagesAsRead = () => {
    const messages = $('.message:not(.typing)');
    if (messages.length > 0) {
      const lastMessage = messages.last();
      const messageId = lastMessage.data('messageId');
      if (messageId) {
        lastSeenMessageId = messageId;
        unreadCount = 0;
        updateScrollIndicators();
      }
    }
  }

  // Update scroll indicators (unread badge and scroll to bottom button)
  const updateScrollIndicators = () => {
    let $unreadIndicator = $('.unread-indicator');
    let $scrollToBottom = $('.scroll-to-bottom');
    
    // Create indicators if they don't exist
    if ($unreadIndicator.length === 0) {
      $unreadIndicator = $(`
        <div class="unread-indicator hidden">
          <span class="unread-count">0</span> new messages
          <button class="jump-to-unread">Jump to unread</button>
        </div>
      `);
      $('.messages').before($unreadIndicator);
    }
    
    if ($scrollToBottom.length === 0) {
      $scrollToBottom = $(`
        <button class="scroll-to-bottom hidden" title="Scroll to bottom">
          ↓
        </button>
      `);
      $('.messages').append($scrollToBottom);
    }
    
    // Update unread indicator
    if (unreadCount > 0 && !isScrolledToBottom) {
      $unreadIndicator.removeClass('hidden');
      $unreadIndicator.find('.unread-count').text(unreadCount);
    } else {
      $unreadIndicator.addClass('hidden');
    }
    
    // Update scroll to bottom button
    if (!isScrolledToBottom) {
      $scrollToBottom.removeClass('hidden');
    } else {
      $scrollToBottom.addClass('hidden');
    }
  }

  // Scroll to bottom of messages
  const scrollToBottom = (smooth = true) => {
    const $messagesContainer = $('.messages');
    if (smooth) {
      $messagesContainer.animate({
        scrollTop: $messagesContainer[0].scrollHeight
      }, 300);
    } else {
      $messagesContainer.scrollTop($messagesContainer[0].scrollHeight);
    }
  }

  // Jump to first unread message
  const jumpToUnread = () => {
    const messages = $('.message:not(.typing)');
    let unreadMessage = null;
    
    for (let i = 0; i < messages.length; i++) {
      const $msg = $(messages[i]);
      const msgId = $msg.data('messageId');
      if (msgId && (!lastSeenMessageId || msgId > lastSeenMessageId)) {
        unreadMessage = $msg;
        break;
      }
    }
    
    if (unreadMessage) {
      const $messagesContainer = $('.messages');
      const scrollTop = unreadMessage.position().top + $messagesContainer.scrollTop() - 50;
      $messagesContainer.animate({ scrollTop: scrollTop }, 300);
    }
  }

  // Update connection status
  const updateConnectionStatus = (status) => {
    connectionState = status;
    let $statusIndicator = $('.connection-status');
    
    if ($statusIndicator.length === 0) {
      $statusIndicator = $(`
        <div class="connection-status">
          <div class="connection-dot"></div>
          <span class="connection-text">Offline</span>
        </div>
      `);
      // Add to userControls before disconnect button (insert before last element)
      $('.userControls').children().last().before($statusIndicator);
    }
    
    const $dot = $statusIndicator.find('.connection-dot');
    const $text = $statusIndicator.find('.connection-text');
    
    $dot.removeClass('connected connecting disconnected').addClass(status);
    
    switch(status) {
      case 'connected':
        $text.text('Online');
        break;
      case 'connecting':
        $text.text('Connecting...');
        break;
      case 'disconnected':
        $text.text('Offline');
        break;
    }
  }

  // Keyboard events
  $window.keydown(event => {
    // Don't interfere if modal is open or if typing in admin modal
    if ($('.admin-modal-overlay').length > 0) {
      return;
    }
    
    // Handle Escape key to collapse expanded widget
    if (event.which === 27 && isExpanded) {
      toggleWidget(false);
      return;
    }
    
    // Handle mention navigation first if autocomplete is visible
    if (mentionAutocomplete.visible && $currentInput === $inputMessage) {
      if (handleMentionNavigation(event)) {
        return;
      }
    }
    
    if (!(event.ctrlKey || event.metaKey || event.altKey)) {
      $currentInput.focus();
    }
    if (event.which === 13) {
      if (username) {
        sendMessage();
        socket.emit('stop typing');
        typing = false;
      } else if (walletAddress) {
        setUsername();
      }
    }
  });

  $inputMessage.on('input', () => {
    updateTyping();
    checkForMentionTrigger();
  });

  // Real-time username validation
  $usernameInput.on('input', () => {
    const inputUsername = cleanInput($usernameInput.val().trim());
    const validation = validateUsername(inputUsername);
    const $note = $('.usernameNote small');
    
    if (inputUsername.length === 0) {
      $note.text('This nickname will be permanently linked to your wallet address').css('color', 'rgba(255, 255, 255, 0.7)');
    } else if (!validation.valid) {
      $note.text(validation.error).css('color', '#ff6b6b');
    } else {
      $note.text('✓ Username is valid').css('color', '#10b981');
    }
  });

  // Handle clicks to position cursor and update mention autocomplete
  $inputMessage.on('click keyup', () => {
    setTimeout(checkForMentionTrigger, 10); // Small delay to ensure cursor position is updated
  });

  // Click events
  $usernamePage.click(() => {
    $currentInput.focus();
  });

  $inputMessage.click(() => {
    $inputMessage.focus();
  });

  // Socket events
  socket.on('user exists', (data) => {
    // User already exists for this wallet, use existing username
    username = data.username;
    console.log('Existing user found:', username);
    
    // Hide all other pages and show chat
    $walletPage.removeClass('active');
    $usernamePage.removeClass('active');
    $chatPage.addClass('active');
    $currentInput = $inputMessage.focus();
    
    // Display user info
    $walletAddress.text(walletAddress.substring(0, 8) + '...' + walletAddress.substring(walletAddress.length - 8));
    $usernameDisplay.text(`(${username})`);
    
    // Join the chat with existing credentials
    socket.emit('add user', { walletAddress, username });
  });

  socket.on('user new', () => {
    // New wallet, show username selection page
    console.log('New user, showing username page');
    showUsernamePage();
  });

  socket.on('login', (data) => {
    connected = true;
    window.isCurrentUserAdmin = data.isAdmin || false;
    updateConnectionStatus('connected');
    
    // Add ourselves to active users
    if (username && walletAddress) {
      activeUsers.set(username, walletAddress);

      
      // IMPORTANT: Add current user to activeSockets for admin detection in autocomplete
      if (!window.activeSockets) window.activeSockets = {};
      window.activeSockets[username] = { 
        walletAddress: walletAddress, 
        isAdmin: data.isAdmin 
      };

    }
    
    if (data.isAdmin) {
      log('★ You have admin privileges');
    }
    
    // Update connection status in parent window (for widget header)
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'connection_status',
        connected: true,
        userCount: data.numUsers
      }, '*');
    }
    
    addParticipantsMessage(data);
    hideWelcomeMessage();
  });

  socket.on('new message', (data) => {
    addChatMessage(data);
    
    // Play notification sounds
    if (isUserMentioned(data.message, username)) {
      playNotificationSound('mention');
    } else {
      playNotificationSound('message');
    }
  });

  socket.on('user joined', (data) => {
    const adminText = data.isAdmin ? ' ★' : '';
    log(`${data.username}${adminText} joined`);
    addParticipantsMessage(data);
    
    // Add to active users for tagging
    if (data.walletAddress) {
      activeUsers.set(data.username, data.walletAddress);

    }
    
    // Store socket info for admin checking in autocomplete
    if (!window.activeSockets) window.activeSockets = {};
    window.activeSockets[data.username] = { 
      walletAddress: data.walletAddress, 
      isAdmin: data.isAdmin 
    };
    

    
    // Update user count in parent window
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'user_count_update',
        userCount: data.numUsers
      }, '*');
    }
  });

  socket.on('user left', (data) => {
    log(`${data.username} left`);
    addParticipantsMessage(data);
    removeChatTyping(data);
    
    // Remove from active users
    activeUsers.delete(data.username);
    if (window.activeSockets) {
      delete window.activeSockets[data.username];
    }
    
    // Update user count in parent window
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'user_count_update',
        userCount: data.numUsers
      }, '*');
    }
  });

  socket.on('typing', (data) => {
    addChatTyping(data);
  });

  socket.on('stop typing', (data) => {
    removeChatTyping(data);
  });

  socket.on('disconnect', () => {
    log('you have been disconnected');
    connected = false;
    
    // Update connection status in parent window
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'connection_status',
        connected: false,
        userCount: 0
      }, '*');
    }
  });

  socket.on('error', (errorMessage) => {
    console.error('Socket error:', errorMessage);
    
    // Handle authentication errors
    if (errorMessage.includes('Authentication') || errorMessage.includes('signature')) {
      $walletStatus.text('Authentication failed: ' + errorMessage);
      // Reset state and show wallet page
      disconnectWallet();
    } else {
      log('Error: ' + errorMessage);
    }
  });

  socket.io.on('reconnect', () => {
    log('you have been reconnected');
    updateConnectionStatus('connected');
    if (username && walletAddress) {
      // On reconnect, we need to re-authenticate
      log('Reconnecting... please reconnect your wallet');
      disconnectWallet();
    }
  });

  socket.io.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
    updateConnectionStatus('disconnected');
  });

  socket.io.on('disconnect', () => {
    updateConnectionStatus('disconnected');
    showWelcomeMessage();
  });

  // Admin event handlers
  socket.on('message deleted', (data) => {
    const $messageToDelete = $(`.message[data-message-id="${data.messageId}"]`);
    if ($messageToDelete.length > 0) {
      $messageToDelete.fadeOut(300, function() {
        $(this).remove();
      });
    }
  });

  socket.on('user muted', (data) => {
    if (data.walletAddress === walletAddress) {
      log('You have been muted by an administrator');
      $inputMessage.prop('disabled', true).attr('placeholder', 'You have been muted');
    } else {
      log(`A user has been muted`);
    }
  });

  socket.on('user unmuted', (data) => {
    if (data.walletAddress === walletAddress) {
      log('You have been unmuted');
      $inputMessage.prop('disabled', false).attr('placeholder', 'Type here...');
    }
  });

  // Handle clicks outside for various features
  $(document).on('click', (e) => {
    // Hide mention autocomplete when clicking outside input
    if (!$(e.target).closest('.input-section').length) {
      hideMentionAutocomplete();
    }
    
    // Handle clicking outside expanded widget
    if (isExpanded) {
      // If click is outside the widget area when expanded, collapse it
      const clickedElement = $(e.target);
      const isInsideWidget = clickedElement.closest('.chat').length > 0 || 
                            clickedElement.closest('.userInfo').length > 0 ||
                            clickedElement.closest('.input-section').length > 0 ||
                            clickedElement.closest('.messages').length > 0;
      
      if (!isInsideWidget) {
        toggleWidget(false);
      }
    }
  });

  // Initialize UI elements (after all functions are defined)
  showWelcomeMessage();
  updateConnectionStatus('disconnected');
  
  // Set up scroll tracking for unread messages
  $('.messages').on('scroll', checkScrollPosition);
  
  // Set up click handlers for scroll indicators (delegated since they're created dynamically)
  $(document).on('click', '.jump-to-unread', jumpToUnread);
  $(document).on('click', '.scroll-to-bottom', () => scrollToBottom(true));
  
  // Initial scroll position check
  setTimeout(checkScrollPosition, 100);
  


  
  // Add expand button first
  let isExpanded = false;
  const $expandButton = $(`
    <div class="expand-button" title="Expand chat">
      ⤢
    </div>
  `);
  
  // Function to properly expand/collapse widget
  const toggleWidget = (expand) => {
    isExpanded = expand;
    
    if (isExpanded) {
      // Expand to full height, stick to right side
      $('body').addClass('widget-expanded');
      $expandButton.text('⤡').attr('title', 'Minimize chat');
      
      // Notify parent window about expansion (if in iframe)
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'widget_expanded',
          expanded: true
        }, '*');
      }
    } else {
      // Return to normal size
      $('body').removeClass('widget-expanded');
      $expandButton.text('⤢').attr('title', 'Expand chat');
      
      // Notify parent window about collapse (if in iframe)
      if (window.parent !== window) {
        window.parent.postMessage({
          type: 'widget_expanded',
          expanded: false
        }, '*');
      }
    }
  };

  $expandButton.on('click', () => {
    toggleWidget(!isExpanded);
  });
  
  // Add sound toggle
  const $soundToggle = $(`
    <div class="sound-toggle" title="Toggle notification sounds">
      🔊
    </div>
  `);
  $soundToggle.on('click', () => {
    soundEnabled = !soundEnabled;
    $soundToggle.text(soundEnabled ? '🔊' : '🔇');
    $soundToggle.toggleClass('muted', !soundEnabled);
  });
  
  // Add to userControls in proper order: expand, sound, connection status will be added by updateConnectionStatus, then disconnect is already in HTML
  $('.userControls').prepend($expandButton);
  $('.userControls').append($soundToggle);

});
