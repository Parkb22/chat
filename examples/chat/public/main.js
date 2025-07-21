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
  $walletPage.show();

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
      
      const walletProvider = getWalletProvider(walletType);
      
      if (!walletProvider) {
        $walletStatus.text(`${walletType} wallet not found. Please install the extension.`);
        return;
      }

      const response = await walletProvider.connect();
      wallet = walletProvider;
      walletAddress = response.publicKey.toString();
      
      $walletStatus.text('Verifying ownership...');
      
      // Create a message to sign for authentication
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with Socket.IO Chat\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;
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
      $chatPage.hide();
      $usernamePage.hide();
      $walletPage.show();
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

  // Sets the client's username
  const setUsername = () => {
    const inputUsername = cleanInput($usernameInput.val().trim());

    if (inputUsername && walletAddress) {
      username = inputUsername;
      $usernamePage.fadeOut();
      $chatPage.show();
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
    $walletPage.fadeOut();
    $usernamePage.show();
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
    const $dropdown = $('.mention-autocomplete').length ? 
      $('.mention-autocomplete') : createAutocompleteDropdown();

    // Filter users based on query
    const filteredUsers = Array.from(activeUsers.entries())
      .filter(([userName, walletAddr]) => 
        userName.toLowerCase().includes(query.toLowerCase()) && 
        userName !== username // Don't show current user
      )
      .slice(0, 5); // Limit to 5 results

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
      const isUserAdmin = Object.values(activeSockets || {}).some(socket => 
        socket.walletAddress === walletAddr && socket.isAdmin
      );

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

  // Adds the visual chat message to the message list
  const addChatMessage = (data, options = {}) => {
    const $typingMessages = getTypingMessages(data);
    if ($typingMessages.length !== 0) {
      options.fade = false;
      $typingMessages.remove();
    }

    // Create clickable username that links to Solscan
    const $usernameDiv = $('<span class="username"/>')
      .text(data.username)
      .css('color', getUsernameColor(data.username));

    // Add admin star if user is admin
    if (data.isAdmin) {
      const $adminStar = $('<span class="admin-star">★</span>');
      $usernameDiv.append($adminStar);
    }
    
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

    // Process message for @mentions
    const processedMessage = processMessage(data.message);
    const $messageBodyDiv = $('<span class="messageBody">')
      .html(processedMessage);

    const typingClass = data.typing ? 'typing' : '';
    const replyClass = data.replyTo ? 'reply' : '';
    const mentionedClass = !data.typing && isUserMentioned(data.message, username) ? 'mentioned' : '';
    
    const $messageDiv = $('<li class="message"/>')
      .data('username', data.username)
      .data('walletAddress', data.walletAddress)
      .data('message', data.message)
      .data('messageId', data.messageId || Date.now())
      .addClass(`${typingClass} ${replyClass} ${mentionedClass}`.trim());

    // Add reply context if this is a reply
    if (data.replyTo && !data.typing) {
      const $replyContext = $('<div class="reply-context">')
        .text(`↳ Replying to ${data.replyTo.username}: ${data.replyTo.message}`);
      $messageDiv.append($replyContext);
    }

    $messageDiv.append($usernameDiv, $messageBodyDiv);

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
    $walletPage.hide();
    $usernamePage.hide();
    $chatPage.show();
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
  });

  socket.on('new message', (data) => {
    addChatMessage(data);
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
    if (username && walletAddress) {
      // On reconnect, we need to re-authenticate
      log('Reconnecting... please reconnect your wallet');
      disconnectWallet();
    }
  });

  socket.io.on('reconnect_error', () => {
    log('attempt to reconnect has failed');
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

  // Hide mention autocomplete when clicking outside
  $(document).on('click', (e) => {
    if (!$(e.target).closest('.input-section').length) {
      hideMentionAutocomplete();
    }
  });

});
