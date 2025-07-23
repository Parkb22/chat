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
  const $usernameInput = $('.chat-username-input');
  const $messages = $('.chat-messages');
  const $inputMessage = $('.chat-input-message');

  // Pages
  const $walletPage = $('.wallet-page');
  const $usernamePage = $('.username-page');
  const $chatPage = $('.chat-page:first'); // Main chat page

  // Wallet elements
  const $connectButtons = $('.chat-connect-wallet');
  const $walletStatus = $('.chat-wallet-status');
  const $connectedWallet = $('.chat-connected-wallet');
  const $walletAddress = $('.chat-wallet-address');
  const $usernameDisplay = $('.chat-username');
  const $disconnectBtn = $('.chat-disconnect-btn');
  const $replyPreview = $('#chatReplyPreview');
  const $cancelReply = $('.chat-cancel-reply');

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
  $walletPage.addClass('chat-active');

  // Debug functions for troubleshooting (accessible via console)
  window.debugChatPage = () => {
    console.log('=== CHAT PAGE DEBUG ===');
    console.log('Wallet Address:', walletAddress);
    console.log('Username:', username);
    console.log('Connected:', connected);
    console.log('Wallet Provider:', wallet);
    console.log('Socket Connected:', socket.connected);
    console.log('Pages Active:', {
      wallet: $walletPage.hasClass('chat-active'),
      username: $usernamePage.hasClass('chat-active'), 
      chat: $chatPage.hasClass('chat-active')
    });
    console.log('Buttons Found:', $('.chat-connect-wallet').length);
    console.log('Available Wallets:', {
      phantom: !!(window.solana || window.phantom?.solana),
      solflare: !!window.solflare,
      backpack: !!window.backpack
    });
    console.log('======================');
  };

  window.resetChatPage = () => {
    console.log('Resetting chat page...');
    wallet = null;
    walletAddress = null; 
    username = null;
    connected = false;
    $walletStatus.text('');
    $walletPage.addClass('chat-active');
    $usernamePage.removeClass('chat-active');
    $chatPage.removeClass('chat-active');
    location.reload();
  };

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

  // Connect wallet function - FIXED: Use simple, reliable connection
  const connectWallet = async (walletType) => {
    try {
      console.log(`[Wallet] Connecting to ${walletType} wallet...`);
      $walletStatus.text('Connecting...');
      
      const provider = getWalletProvider(walletType);
      
      if (!provider) {
        throw new Error(`${walletType} wallet not found. Please install the ${walletType} wallet extension.`);
      }

      const response = await provider.connect();
      wallet = provider;
      walletAddress = response.publicKey.toString();
      
      console.log('[Wallet] Connected successfully:', walletAddress);
      $walletStatus.text('Connected! Checking user...');
      
      // Store wallet info
      window.walletAddress = walletAddress;
      window.walletConnected = true;
      
      // Skip complex signature verification - use simple server check
      // This matches the working widget logic
      socket.emit('simple check user', { walletAddress });
      
    } catch (error) {
      console.error('[Wallet] Connection error:', error);
      $walletStatus.text(`Error: ${error.message}`);
      
      // Reset state
      wallet = null;
      walletAddress = null;
      
      setTimeout(() => {
        $walletStatus.text('');
      }, 3000);
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
      $chatPage.removeClass('chat-active');
      $usernamePage.removeClass('chat-active');
      $walletPage.addClass('chat-active');
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
    // Remove ugly participant text - show count in a cleaner way
    updateUserCount(data.numUsers);
  }

  // Update user count display
  const updateUserCount = (count) => {
    // For the full chat page, we can add it to the user info or just skip for now
    // since the full page layout is different from the widget
    console.log(`Active users: ${count}`);
  }

  // Sets the client's username
  const setUsername = () => {
    const inputUsername = cleanInput($usernameInput.val().trim());

    if (inputUsername && walletAddress) {
      username = inputUsername;
      $usernamePage.removeClass('chat-active');
      $chatPage.addClass('chat-active');
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
    $walletPage.removeClass('chat-active');
    $usernamePage.addClass('chat-active');
    $currentInput = $usernameInput.focus();
  }

  // Sends a chat message
  const sendMessage = () => {
    let message = $inputMessage.val();
    message = cleanInput(message);
    if (message && connected) {
      $inputMessage.val('');
      
      // Prepare message data
      const messageData = {
        username, 
        message, 
        walletAddress,
        replyTo: replyingTo
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
    
    $('.chat-reply-username').text(messageData.username);
    $replyPreview.removeClass('hidden');
    $inputMessage.focus();
  };

  // Log a message
  const log = (message, options = {}) => {
    const $el = $('<li>').addClass('chat-log').text(message);
    addMessageElement($el, options);
  }

  // Adds the visual chat message to the message list
  const addChatMessage = (data, options = {}) => {
    const $typingMessages = getTypingMessages(data);
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    // Create clickable username that links to Solscan
    const $usernameDiv = $('<span class="chat-message-username"/>')
      .text(data.username)
      .css('color', getUsernameColor(data.username));

    // Add admin star if user is admin
    if (data.isAdmin) {
      const $adminStar = $('<span class="chat-admin-star">★</span>');
      $usernameDiv.append($adminStar);
    }
    
    // Make username clickable if wallet address is available
    if (data.walletAddress && !data.typing) {
      $usernameDiv.addClass('chat-clickable-username')
        .attr('title', `View ${data.walletAddress} on Solscan`)
        .on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.open(`https://solscan.io/account/${data.walletAddress}`, '_blank');
        });
    }

    // Process message for @mentions
    const processedMessage = processMessage(data.message);
    const $messageBodyDiv = $('<span class="chat-message-body">')
      .html(processedMessage);

    const typingClass = data.typing ? 'typing' : '';
    const replyClass = data.replyTo ? 'reply' : '';
    const mentionedClass = !data.typing && isUserMentioned(data.message, username) ? 'mentioned' : '';
    
    const $messageDiv = $('<li class="chat-message"/>')
      .data('username', data.username)
      .data('walletAddress', data.walletAddress)
      .data('message', data.message)
      .data('messageId', data.messageId || Date.now())
      .attr('data-message-id', data.messageId || Date.now())
      .addClass(`${typingClass} ${replyClass} ${mentionedClass}`.trim());

    // Add reply context if this is a reply
    if (data.replyTo) {
      const $replyContext = $('<div class="chat-reply-context">')
        .text(`↳ ${data.replyTo.username}: ${data.replyTo.message}`);
      $messageDiv.append($replyContext);
    }

    $messageDiv.append($usernameDiv, $messageBodyDiv);

    // Add admin controls if current user is admin and this isn't a typing message
    if (!data.typing && window.isCurrentUserAdmin && data.messageId) {
      const $adminControls = $('<span class="chat-admin-controls">');
      
      const $deleteBtn = $('<button class="chat-admin-btn chat-delete-btn">🗑️</button>')
        .on('click', function(e) {
          e.stopPropagation();
          if (confirm('Delete this message?')) {
            socket.emit('delete message', data.messageId);
          }
        });
      
      const $muteBtn = $('<button class="chat-admin-btn chat-mute-btn">🔇</button>')
        .on('click', function(e) {
          e.stopPropagation();
          if (confirm(`Mute user ${data.username}?`)) {
            socket.emit('mute user', data.walletAddress);
          }
        });
      
      $adminControls.append($deleteBtn, $muteBtn);
      $messageDiv.append($adminControls);
      
      // Show controls on hover
      $messageDiv.hover(
        function() { $adminControls.css('opacity', '1'); },
        function() { $adminControls.css('opacity', '0'); }
      );
    }

    // Click handler for replies (except admin buttons)
    if (!data.typing) {
      $messageDiv.on('click', function(e) {
        if (!$(e.target).hasClass('chat-admin-btn')) {
          setReplyTo(data);
        }
      });
    }

    addMessageElement($messageDiv, options);
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
    return $('.chat-message.typing').filter(function (i) {
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

  // Process message to add @mention highlighting
  const processMessage = (message) => {
    return message.replace(/@(\w+)/g, '<span class="chat-mention">@$1</span>');
  };

  // Check if user is mentioned in message
  const isUserMentioned = (message, currentUsername) => {
    if (!currentUsername) return false;
    const mentionRegex = new RegExp(`@${currentUsername}\\b`, 'i');
    return mentionRegex.test(message);
  };

  // Keyboard events
  $window.keydown(event => {
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
      } else {
        setUsername();
      }
    }
  });

  // Hide mention autocomplete when clicking outside
  $(document).on('click', (e) => {
    if (!$(e.target).closest('.chat-input-section').length) {
      hideMentionAutocomplete();
    }
  });

  $inputMessage.on('input', () => {
    updateTyping();
    checkForMentionTrigger();
  });

  // Mention autocomplete functions
  const createAutocompleteDropdown = () => {
    const $dropdown = $('<div class="chat-mention-autocomplete">');
    $('.chat-input-section').append($dropdown);
    return $dropdown;
  };

  const showMentionAutocomplete = (query, cursorPos) => {
    const $dropdown = $('.chat-mention-autocomplete').length ? 
      $('.chat-mention-autocomplete') : createAutocompleteDropdown();

    // Filter users based on query with smart matching
    const filteredUsers = Array.from(activeUsers.entries())
      .filter(([userName, walletAddr]) => 
        userName.toLowerCase().includes(query.toLowerCase()) && 
        userName !== username // Don't show current user
      )
      .sort(([userA], [userB]) => {
        // Prioritize exact starts with matches
        const aStartsWith = userA.toLowerCase().startsWith(query.toLowerCase());
        const bStartsWith = userB.toLowerCase().startsWith(query.toLowerCase());
        if (aStartsWith && !bStartsWith) return -1;
        if (bStartsWith && !aStartsWith) return 1;
        // Then sort alphabetically
        return userA.localeCompare(userB);
      })
      .slice(0, 5); // Limit to 5 results max

    if (filteredUsers.length === 0) {
      hideMentionAutocomplete();
      return;
    }

    mentionAutocomplete.filteredUsers = filteredUsers;
    mentionAutocomplete.selectedIndex = 0;
    mentionAutocomplete.visible = true;
    mentionAutocomplete.query = query;

    // Clear and populate dropdown
    $dropdown.empty();
    
    filteredUsers.forEach(([userName, walletAddr], index) => {
      // Check if user is admin
      const isUserAdmin = Object.values(window.activeSockets || {}).some(socket => 
        socket.walletAddress === walletAddr && socket.isAdmin
      );

      const $item = $('<div class="chat-mention-item">')
        .attr('data-index', index)
        .attr('data-username', userName)
        .html(`
          <span class="chat-mention-username">${userName}${isUserAdmin ? '<span class="chat-mention-admin-star">★</span>' : ''}</span>
          <span class="chat-mention-wallet">${walletAddr.slice(0, 8)}...${walletAddr.slice(-4)}</span>
        `)
        .on('click', function() {
          selectMentionUser(userName);
        })
        .on('mouseenter', function() {
          $('.chat-mention-item').removeClass('selected');
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
    $('.chat-mention-autocomplete').removeClass('visible');
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
    $('.chat-mention-item').removeClass('selected');
    $(`.chat-mention-item[data-index="${mentionAutocomplete.selectedIndex}"]`).addClass('selected');
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

  // Socket events - FIXED: Added debug logging
  socket.on('user exists', (data) => {
    username = data.username;
    console.log('[Socket] Existing user found:', username);
    $walletStatus.text('User found! Joining chat...');
    
    // Clear wallet page and show chat
    $walletPage.removeClass('chat-active');
    $usernamePage.removeClass('chat-active');
    $chatPage.addClass('chat-active');
    $currentInput = $inputMessage.focus();
    
    // Update display
    $walletAddress.text(walletAddress.substring(0, 8) + '...' + walletAddress.substring(walletAddress.length - 8));
    $usernameDisplay.text(`(${username})`);
    
    // Join chat
    console.log('[Socket] Joining chat with existing user');
    socket.emit('add user', { walletAddress, username });
  });

  socket.on('user new', () => {
    console.log('[Socket] New user detected, showing username page');
    $walletStatus.text('New user! Please set username...');
    showUsernamePage();
  });

  socket.on('error', (error) => {
    console.error('[Socket] Server error:', error);
    $walletStatus.text(`Server error: ${error}`);
    
    // Reset after showing error
    setTimeout(() => {
      $walletStatus.text('');
    }, 5000);
  });

  // Debug: Log all socket events
  socket.onAny((eventName, ...args) => {
    console.log('[Socket Event]', eventName, args);
  });

  socket.on('login', (data) => {
    connected = true;
    window.isCurrentUserAdmin = data.isAdmin || false;
    
    if (data.isAdmin) {
      log('★ You have admin privileges');
    }
    
    updateUserCount(data.numUsers);
  });

  socket.on('new message', (data) => {
    addChatMessage(data);
  });

  socket.on('user joined', (data) => {
    const adminText = data.isAdmin ? ' ★' : '';
    log(`${data.username}${adminText} joined`);
    updateUserCount(data.numUsers);
    
    if (data.walletAddress) {
      activeUsers.set(data.username, data.walletAddress);
    }
    
    if (!window.activeSockets) window.activeSockets = {};
    window.activeSockets[data.username] = { 
      walletAddress: data.walletAddress, 
      isAdmin: data.isAdmin 
    };
  });

  socket.on('user left', (data) => {
    log(`${data.username} left`);
    updateUserCount(data.numUsers);
    removeChatTyping(data);
    
    activeUsers.delete(data.username);
    if (window.activeSockets) {
      delete window.activeSockets[data.username];
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
  });

  socket.on('message deleted', (data) => {
    $(`.chat-message[data-message-id="${data.messageId}"]`).addClass('deleted');
  });

  socket.on('user muted', (data) => {
    if (data.walletAddress === walletAddress) {
      alert('You have been muted by an administrator.');
      disconnectWallet();
    } else {
      log(`User was muted by admin`);
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
    alert(`Error: ${error}`);
    
    if (error.includes('Authentication')) {
      disconnectWallet();
    }
  });
}); 