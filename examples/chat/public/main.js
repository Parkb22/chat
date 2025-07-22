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
  
  // Make username globally accessible for hamburger menu
  window.username = null;

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

  // Connect to wallet with DegenPark API integration
  const connectWallet = async () => {
    try {
      if (!window.solana) {
        throw new Error('Solana wallet not found! Please install a Solana wallet extension.');
      }

      console.log('[Wallet] Connecting to wallet...');
      const response = await window.solana.connect();
      const publicKey = response.publicKey.toString();
      console.log('[Wallet] Connected:', publicKey);

      // Store wallet info
      window.walletAddress = publicKey;
      window.walletConnected = true;

      // Try to authenticate with DegenPark API
      let degenParkProfile = null;
      let degenParkStatus = 'Account not found on DegenPark - creating chat-only profile';
      
      try {
        console.log('[DegenPark] Attempting authentication...');
        
        // Get signature function from wallet
        const signMessage = async (message) => {
          console.log('[DegenPark Auth] Signing message:', message);
          console.log('[DegenPark Auth] Message length:', message.length);
          console.log('[DegenPark Auth] Message as bytes:', Array.from(new TextEncoder().encode(message)));
          
          const encodedMessage = new TextEncoder().encode(message);
          
          try {
            // Try the direct message first (matching old script)
            const signedMessage = await window.solana.signMessage(encodedMessage);
            
            console.log('[DegenPark Auth] Wallet signature response:', signedMessage);
            console.log('[DegenPark Auth] Signature type:', typeof signedMessage.signature);
            console.log('[DegenPark Auth] Signature length:', signedMessage.signature.length);
            console.log('[DegenPark Auth] Expected Ed25519 length: 64');
            console.log('[DegenPark Auth] Length matches standard:', signedMessage.signature.length === 64);
            console.log('[DegenPark Auth] bs58 available:', !!window.bs58);
            
            // WALLET RESPONSE ANALYSIS
            console.log('[DegenPark Auth] === DETAILED WALLET RESPONSE ANALYSIS ===');
            console.log('[DegenPark Auth] signedMessage object keys:', Object.keys(signedMessage));
            console.log('[DegenPark Auth] signedMessage.signature constructor:', signedMessage.signature.constructor.name);
            console.log('[DegenPark Auth] Is signature a Uint8Array?', signedMessage.signature instanceof Uint8Array);
            console.log('[DegenPark Auth] Is signature an Array?', Array.isArray(signedMessage.signature));
            
            // Check if there are other properties
            if (signedMessage.publicKey) {
              console.log('[DegenPark Auth] Wallet provided publicKey:', signedMessage.publicKey.toString());
            }
            if (signedMessage.message) {
              console.log('[DegenPark Auth] Wallet echoed message:', signedMessage.message);
            }
            
            // Analyze signature bytes in detail
            console.log('[DegenPark Auth] Signature bytes (hex):', Array.from(signedMessage.signature, byte => byte.toString(16).padStart(2, '0')).join(''));
            
            console.log('[DegenPark Auth] ====================================================');
            
            // DIAGNOSTIC: Check if wallet might be using a different message format
            console.log('[DegenPark Auth] === SIGNATURE DIAGNOSTIC ===');
            console.log('[DegenPark Auth] Raw signature bytes (first 10):', Array.from(signedMessage.signature.slice(0, 10)));
            console.log('[DegenPark Auth] Raw signature bytes (last 10):', Array.from(signedMessage.signature.slice(-10)));
            
            // Check if publicKey from signedMessage matches our expected publicKey
            if (signedMessage.publicKey) {
              const walletPublicKey = signedMessage.publicKey.toString();
              console.log('[DegenPark Auth] Wallet public key from signature:', walletPublicKey);
              console.log('[DegenPark Auth] Our public key:', publicKey);
              console.log('[DegenPark Auth] Public keys match:', walletPublicKey === publicKey);
            }
            
            // Check if wallet is adding any message prefix (some wallets do this)
            console.log('[DegenPark Auth] Message we encoded:', message);
            console.log('[DegenPark Auth] Message bytes:', Array.from(encodedMessage));
            console.log('[DegenPark Auth] ================================');
            
            // Convert signature to base58 format (Solana standard)
            try {
              // Ensure signature is a Uint8Array
              const signature = new Uint8Array(signedMessage.signature);
              console.log('[DegenPark Auth] Signature as Uint8Array:', signature);
              
              let base58Signature;
              
              // Try bs58 library first
              if (window.bs58 && typeof window.bs58.encode === 'function') {
                console.log('[DegenPark Auth] Using bs58 library');
                base58Signature = window.bs58.encode(signature);
              }
              // Manual fallback base58 implementation (simple version)
              else {
                console.warn('[DegenPark Auth] bs58 library not available, using improved manual implementation');
                
                // Improved base58 encoding - using the standard Bitcoin alphabet
                const base58Encode = (buffer) => {
                  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
                  const ALPHABET_MAP = {};
                  for (let i = 0; i < ALPHABET.length; i++) {
                    ALPHABET_MAP[ALPHABET.charAt(i)] = i;
                  }
                  const BASE = 58;
                  
                  if (buffer.length === 0) return '';
                  
                  // Convert bytes to big integer
                  let num = 0n;
                  for (let i = 0; i < buffer.length; i++) {
                    num = num * 256n + BigInt(buffer[i]);
                  }
                  
                  // Convert to base58
                  let encoded = '';
                  while (num > 0) {
                    const remainder = num % BigInt(BASE);
                    num = num / BigInt(BASE);
                    encoded = ALPHABET[Number(remainder)] + encoded;
                  }
                  
                  // Add leading zeros
                  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
                    encoded = ALPHABET[0] + encoded;
                  }
                  
                  return encoded;
                };
                
                try {
                  base58Signature = base58Encode(signature);
                  console.log('[DegenPark Auth] Manual base58 encoding successful');
                } catch (manualError) {
                  console.error('[DegenPark Auth] Manual base58 encoding failed:', manualError);
                  // Last resort - use the old simple implementation
                  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
                  let result = '';
                  let num = BigInt('0x' + Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join(''));
                  
                  while (num > 0) {
                    result = alphabet[num % 58n] + result;
                    num = num / 58n;
                  }
                  
                  // Handle leading zeros
                  for (let i = 0; i < signature.length && signature[i] === 0; i++) {
                    result = alphabet[0] + result;
                  }
                  
                  base58Signature = result;
                  console.log('[DegenPark Auth] Fallback base58 encoding used');
                }
              }
              
              console.log('[DegenPark Auth] Base58 encoded signature:', base58Signature);
              console.log('[DegenPark Auth] Base58 signature length:', base58Signature.length);
              
              // Validate base58 signature
              const base58Regex = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
              if (!base58Regex.test(base58Signature)) {
                console.error('[DegenPark Auth] Invalid base58 signature contains invalid characters');
                console.error('[DegenPark Auth] Signature:', base58Signature);
                throw new Error('Generated signature contains non-base58 characters');
              }
              
              console.log('[DegenPark Auth] Base58 signature validation passed');
              
              // CRITICAL TEST: Verify signature locally before sending to API
              try {
                console.log('[DegenPark Auth] === LOCAL SIGNATURE VERIFICATION ===');
                
                // Import necessary items from Solana web3.js
                if (window.solanaWeb3 && window.solanaWeb3.PublicKey && window.solanaWeb3.ed25519) {
                  const { PublicKey: SolanaPublicKey, ed25519 } = window.solanaWeb3;
                  
                  // Convert our public key string to Solana PublicKey object
                  const pubKeyObj = new SolanaPublicKey(publicKey);
                  console.log('[DegenPark Auth] Public key object:', pubKeyObj.toString());
                  
                  // Verify the signature locally
                  const isValidSignature = ed25519.verify(
                    signature,                    // Our signature bytes
                    encodedMessage,              // Original message bytes  
                    pubKeyObj.toBytes()          // Public key bytes
                  );
                  
                  console.log('[DegenPark Auth] Local signature verification result:', isValidSignature);
                  console.log('[DegenPark Auth] If false, our signature generation is wrong');
                  console.log('[DegenPark Auth] If true, DegenPark expects different format');
                  
                } else {
                  console.warn('[DegenPark Auth] Solana web3.js ed25519 not available for local verification');
                }
                
                console.log('[DegenPark Auth] === COMPARISON WITH WORKING NACL CODE ===');
                console.log('[DegenPark Auth] Working code uses: nacl.sign.detached(messageBytes, keyPair.secretKey)');
                console.log('[DegenPark Auth] Our code uses: window.solana.signMessage(encodedMessage)');
                console.log('[DegenPark Auth] Message bytes (ours):', Array.from(encodedMessage));
                console.log('[DegenPark Auth] Expected message: "Hello, world!"');
                console.log('[DegenPark Auth] Message matches:', message === "Hello, world!");
                console.log('[DegenPark Auth] Signature length (ours):', signature.length);
                console.log('[DegenPark Auth] Expected signature length: 64 bytes');
                console.log('[DegenPark Auth] Signature bytes (first 8):', Array.from(signature.slice(0, 8)));
                console.log('[DegenPark Auth] Signature bytes (last 8):', Array.from(signature.slice(-8)));
                
                // Try to detect if wallet is adding message prefix
                const rawMessage = "Hello, world!";
                const rawBytes = new TextEncoder().encode(rawMessage);
                console.log('[DegenPark Auth] Raw message bytes should be:', Array.from(rawBytes));
                console.log('[DegenPark Auth] Our encoded bytes are:', Array.from(encodedMessage));
                console.log('[DegenPark Auth] Bytes match exactly:', JSON.stringify(Array.from(rawBytes)) === JSON.stringify(Array.from(encodedMessage)));
                
                // TEST: If we had nacl available, what would a proper signature look like?
                if (window.nacl && window.nacl.sign) {
                  console.log('[DegenPark Auth] === NACL SIGNATURE ANALYSIS ===');
                  try {
                    // We can't sign because we don't have the private key, but we can analyze
                    console.log('[DegenPark Auth] nacl.sign available:', true);
                    console.log('[DegenPark Auth] Expected signature length from nacl.sign.detached:', 64);
                    console.log('[DegenPark Auth] Our wallet signature length:', signature.length);
                    console.log('[DegenPark Auth] Length matches nacl expectation:', signature.length === 64);
                    
                    // Check if signature looks like a valid Ed25519 signature
                    const isValidLength = signature.length === 64;
                    const hasValidBytes = signature.every(byte => byte >= 0 && byte <= 255);
                    console.log('[DegenPark Auth] Signature has valid Ed25519 format:', isValidLength && hasValidBytes);
                    
                    // Compare with working signature examples
                    console.log('[DegenPark Auth] Working example signature lengths: 87-88 base58 chars');
                    console.log('[DegenPark Auth] Our base58 signature length:', base58Signature.length);
                    console.log('[DegenPark Auth] Length matches working examples:', base58Signature.length >= 87 && base58Signature.length <= 88);
                    
                  } catch (naclError) {
                    console.warn('[DegenPark Auth] nacl analysis failed:', naclError);
                  }
                } else {
                  console.warn('[DegenPark Auth] nacl library not available for signature analysis');
                }
                
                console.log('[DegenPark Auth] =======================================');
                
              } catch (verifyError) {
                console.warn('[DegenPark Auth] Local signature verification failed:', verifyError);
              }
              
              // Return both signature and the actual public key used for signing
              return {
                signature: base58Signature,
                publicKey: signedMessage.publicKey ? signedMessage.publicKey.toString() : null
              };
              
            } catch (error) {
              console.error('[DegenPark Auth] Signature encoding error:', error);
              throw new Error('Failed to encode signature: ' + error.message);
            }
            
          } catch (walletError) {
            console.error('[DegenPark Auth] Wallet signing failed:', walletError);
            throw new Error('Wallet signing failed: ' + walletError.message);
          }
        };

        // Authenticate with DegenPark
        await getDegenParkAuthTokens(publicKey, signMessage);
        
        // Fetch profile if authentication succeeded
        degenParkProfile = await fetchDegenParkProfile(publicKey);
        
        if (degenParkProfile && degenParkProfile.username) {
          degenParkStatus = `✅ DegenPark account: ${degenParkProfile.username}`;
          window.degenParkProfile = degenParkProfile;
          console.log('[DegenPark] Profile loaded:', degenParkProfile);
        } else {
          degenParkStatus = '⚠️ DegenPark authenticated but no profile found';
        }
      } catch (degenParkError) {
        console.warn('[DegenPark] Authentication failed:', degenParkError.message);
        
        // Provide different error messages based on error type
        if (degenParkError.message.includes('Failed to fetch') || degenParkError.message.includes('ERR_NAME_NOT_RESOLVED')) {
          degenParkStatus = '🔌 DegenPark API unavailable - using chat-only mode';
          console.log('[DegenPark] API connection failed, continuing with chat-only mode');
        } else if (degenParkError.message.includes('404') || degenParkError.message.includes('not found')) {
          degenParkStatus = '⚠️ Account not found on DegenPark - creating chat-only profile';
        } else {
          degenParkStatus = '❌ DegenPark authentication error - using chat-only mode';
        }
      }

      // Update wallet UI
      $('.connectWallet').text('✅ Wallet Connected').prop('disabled', true);
      
      console.log('[Wallet] Updating UI with wallet:', publicKey);
      console.log('[Wallet] DegenPark status:', degenParkStatus);
      
      // Show username page with DegenPark status
      $('.wallet.page').hide();
      $('.username.page').show();
      
      // Display DegenPark status
      const $degenParkStatus = $('.degenpark-status');
      $degenParkStatus.text(degenParkStatus).show();
      
      // Update wallet display immediately
      updateUserDisplay();
      
      // If we have a DegenPark username, pre-fill it
      if (degenParkProfile && degenParkProfile.username) {
        $('.usernameInput').val(degenParkProfile.username);
        $('.usernameInput').prop('readonly', true);
        $('.setUsername').text('Continue with DegenPark Profile');
        console.log('[Wallet] Pre-filled DegenPark username:', degenParkProfile.username);
      } else {
        $('.usernameInput').prop('readonly', false);
        $('.setUsername').text('Set Username');
        console.log('[Wallet] Manual username entry required');
      }

    } catch (error) {
      console.error('[Wallet] Connection error:', error);
      alert('Failed to connect wallet: ' + error.message);
    }
  };



  // DegenPark API integration with JWT authentication
  const DEGENPARK_API_BASE = 'https://api.degenpark.io';
  let degenParkTokens = null; // Store access and refresh tokens

  // Function to get auth tokens using wallet signature
  const getDegenParkAuthTokens = async (publicKey, signMessage) => {
    try {
      console.log('[DegenPark Auth] Starting authentication for:', publicKey);
      
      // Step 1: Sign the standard authentication message
      const message = "Hello, world!"; // Standard message for authentication
      console.log('[DegenPark Auth] Signing message:', message);
      
      // Request signature from wallet
      const signatureResult = await signMessage(message);
      console.log('[DegenPark Auth] Signature obtained');
      
      // IMPORTANT: Extract actual signing key from wallet response
      let actualSigningKey = publicKey; // Default to provided key
      
      // Check if wallet response includes the signing public key
      if (signatureResult && signatureResult.publicKey) {
        actualSigningKey = signatureResult.publicKey;
        console.log('[DegenPark Auth] Using wallet\'s actual signing key:', actualSigningKey);
        console.log('[DegenPark Auth] Original connection key:', publicKey);
        console.log('[DegenPark Auth] Keys match:', actualSigningKey === publicKey);
      }
      
      // Step 2: Send auth request to DegenPark API (now returns both signature and potentially updated key)
      const requestBody = {
        signature: signatureResult.signature || signatureResult, // Handle both object and string returns
        publicKey: actualSigningKey
      };
      
      console.log('[DegenPark Auth] === REQUEST COMPARISON WITH WORKING DEGENPARK EXAMPLES ===');
      console.log('[DegenPark Auth] ✅ Message: "Hello, world!" (standard)');
      console.log('[DegenPark Auth] ✅ API endpoint: /api/v1/auth/login/web3 (matches)');
      console.log('[DegenPark Auth] ✅ Headers: x-network: solana (RESTORED - was missing!)');
      console.log('[DegenPark Auth] ✅ Request body format: {signature, publicKey} (matches)');
      
      console.log('[DegenPark Auth] === FINAL COMPARISON ===');
      console.log('[DegenPark Auth] Working example 1: {"signature":"Fo5Prm7PEx8mpQfPoxfRhXULqziZ675VZjPtEZahi7RYpSHGwxvJfnwk4MjyDDdcSNPWsCtSLZQJ3AWTzR26qAj","publicKey":"3CnbCgThb6faA7CGWCPQyRd7S1wfnYnrNUWzBZBkobvC"}');
      console.log('[DegenPark Auth] Working example 2: {"signature":"3YoheiG3ViaUtroRbFyA5t96xbprbXUPvGvFXbrZbcyGzKxeeHv2HRktehhtD3RYKKvdvCmbZoKwrpPPEw9Vs6DH","publicKey":"EssGUXS3SdjYq2wmAUcCo5AJVd2ZmGcCJG3QUWzBZBkobvC"}');
      console.log('[DegenPark Auth] Our request body:', JSON.stringify(requestBody));
      
      // CRITICAL DEBUG: Try to understand the exact difference
      console.log('[DegenPark Auth] === CRITICAL SIGNATURE ANALYSIS ===');
      
      // Test: Try to decode working signature and compare
      if (window.bs58 && window.bs58.decode) {
        try {
          const workingSignature1 = 'Fo5Prm7PEx8mpQfPoxfRhXULqziZ675VZjPtEZahi7RYpSHGwxvJfnwk4MjyDDdcSNPWsCtSLZQJ3AWTzR26qAj';
          const workingBytes1 = window.bs58.decode(workingSignature1);
          console.log('[DegenPark Auth] Working signature 1 decoded length:', workingBytes1.length);
          console.log('[DegenPark Auth] Working signature 1 first 8 bytes:', Array.from(workingBytes1.slice(0, 8)));
          
          console.log('[DegenPark Auth] Our signature decoded length:', signature.length);
          console.log('[DegenPark Auth] Our signature first 8 bytes:', Array.from(signature.slice(0, 8)));
          
          console.log('[DegenPark Auth] Signature lengths match:', workingBytes1.length === signature.length);
        } catch (decodeError) {
          console.warn('[DegenPark Auth] Failed to decode working signature for comparison:', decodeError);
        }
      }
      
      // Test: Try different signature formats
      console.log('[DegenPark Auth] === TESTING ALTERNATIVE SIGNATURE FORMATS ===');
      
      // Maybe the wallet returns signature + recovery info?
      if (signedMessage.signature.length === 65) {
        console.log('[DegenPark Auth] Signature is 65 bytes - might include recovery byte');
        const altSignature = signedMessage.signature.slice(0, 64); // Remove recovery byte
        const altBase58 = window.bs58 ? window.bs58.encode(altSignature) : base58Encode(altSignature);
        console.log('[DegenPark Auth] Alternative signature (64 bytes):', altBase58);
        console.log('[DegenPark Auth] Alternative signature length:', altBase58.length);
        
        // Try using the 64-byte version
        if (altBase58.length >= 87 && altBase58.length <= 88) {
          console.log('[DegenPark Auth] Using 64-byte signature variant');
          base58Signature = altBase58;
        }
      }
      
      console.log('[DegenPark Auth] === KEY DIFFERENCES ANALYSIS ===');
      console.log('[DegenPark Auth] Our public key length:', actualSigningKey.length);
      console.log('[DegenPark Auth] Working example lengths: 44 chars (base58 pubkey)');
      console.log('[DegenPark Auth] Public key format matches:', actualSigningKey.length === 44);
      console.log('[DegenPark Auth] Our signature length:', requestBody.signature.length);
      console.log('[DegenPark Auth] Working signature lengths: 87-88 chars');
      console.log('[DegenPark Auth] Signature length matches:', requestBody.signature.length >= 87 && requestBody.signature.length <= 88);
      
      console.log('[DegenPark Auth] Message signed: "Hello, world!"');
      
      // Step 3: Send auth request to DegenPark API
      console.log('[DegenPark Auth] === SENDING REQUEST ===');
      console.log('[DegenPark Auth] URL:', `${DEGENPARK_API_BASE}/api/v1/auth/login/web3`);
      console.log('[DegenPark Auth] Method: POST');
      console.log('[DegenPark Auth] Headers:', {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-network': 'solana'
      });
      console.log('[DegenPark Auth] Body (string):', JSON.stringify(requestBody));
      console.log('[DegenPark Auth] Body (pretty):', JSON.stringify(requestBody, null, 2));
      console.log('[DegenPark Auth] Body length:', JSON.stringify(requestBody).length);
      console.log('[DegenPark Auth] ============================');
      
      const response = await fetch(`${DEGENPARK_API_BASE}/api/v1/auth/login/web3`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-network': 'solana'  // REQUIRED: Working DegenPark website includes this header
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await response.json();
      console.log('[DegenPark Auth] Response status:', response.status);
      
      if (response.ok && data.data && data.data.accessToken) {
        console.log('[DegenPark Auth] Successfully authenticated');
        degenParkTokens = {
          accessToken: data.data.accessToken,
          refreshToken: data.data.refreshToken
        };
        return degenParkTokens;
      } else {
        throw new Error('Authentication failed: ' + (data.message || 'Unknown error'));
      }
    } catch (error) {
      console.error('[DegenPark Auth Error]', error.message);
      
      // If we get "Invalid signature" error, try alternative approaches
      if (error.message.includes('Invalid signature') && !error.retried) {
        console.log('[DegenPark Auth] === TESTING ALTERNATIVE SIGNATURE APPROACHES ===');
        
        try {
          error.retried = true; // Prevent infinite recursion
          
          // Test 1: Try with common Solana wallet message prefix
          console.log('[DegenPark Auth] Test 1: Trying with Solana message prefix');
          const altSignMessage1 = async (message) => {
            // Some wallets add this prefix before signing
            const prefixedMessage = `Solana Signed Message:\n${message}`;
            console.log('[DegenPark Auth] Trying prefixed message:', prefixedMessage);
            return signMessage(prefixedMessage);
          };
          
          const result1 = await getDegenParkAuthTokens(publicKey, altSignMessage1);
          console.log('[DegenPark Auth] SUCCESS with Solana prefix!');
          return result1;
          
        } catch (prefixError) {
          console.log('[DegenPark Auth] Prefix approach failed:', prefixError.message);
          
          try {
            // Test 2: Try with exact message as bytes (no string encoding)
            console.log('[DegenPark Auth] Test 2: Trying raw message bytes approach');
            const altSignMessage2 = async (message) => {
              // Try signing just the raw UTF-8 bytes without any wrapper
              const messageBytes = new TextEncoder().encode(message);
              console.log('[DegenPark Auth] Raw message bytes:', Array.from(messageBytes));
              
              // Call wallet signMessage directly with bytes
              const walletResponse = await window.solana.signMessage(messageBytes);
              console.log('[DegenPark Auth] Raw approach wallet response:', walletResponse);
              
              // Get the signature and try different processing
              const rawSignature = new Uint8Array(walletResponse.signature);
              console.log('[DegenPark Auth] Raw signature length:', rawSignature.length);
              
              // Try different signature lengths
              let processedSignature;
              if (rawSignature.length === 65) {
                // Remove potential recovery byte
                processedSignature = rawSignature.slice(0, 64);
                console.log('[DegenPark Auth] Using 64-byte signature (removed recovery byte)');
              } else if (rawSignature.length === 64) {
                processedSignature = rawSignature;
                console.log('[DegenPark Auth] Using 64-byte signature as-is');
              } else {
                processedSignature = rawSignature;
                console.log('[DegenPark Auth] Using signature as-is, length:', rawSignature.length);
              }
              
              // Encode with best available method
              let encodedSig;
              if (window.bs58 && window.bs58.encode) {
                encodedSig = window.bs58.encode(processedSignature);
                console.log('[DegenPark Auth] Encoded with bs58 library');
              } else {
                // Use our improved manual encoding
                const base58Encode = (buffer) => {
                  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
                  if (buffer.length === 0) return '';
                  let num = 0n;
                  for (let i = 0; i < buffer.length; i++) {
                    num = num * 256n + BigInt(buffer[i]);
                  }
                  let encoded = '';
                  while (num > 0) {
                    const remainder = num % 58n;
                    num = num / 58n;
                    encoded = ALPHABET[Number(remainder)] + encoded;
                  }
                  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
                    encoded = ALPHABET[0] + encoded;
                  }
                  return encoded;
                };
                encodedSig = base58Encode(processedSignature);
                console.log('[DegenPark Auth] Encoded with manual implementation');
              }
              
              console.log('[DegenPark Auth] Final processed signature:', encodedSig);
              console.log('[DegenPark Auth] Final signature length:', encodedSig.length);
              
              return {
                signature: encodedSig,
                publicKey: walletResponse.publicKey ? walletResponse.publicKey.toString() : null
              };
            };
            
            const result2 = await getDegenParkAuthTokens(publicKey, altSignMessage2);
            console.log('[DegenPark Auth] SUCCESS with raw message bytes approach!');
            return result2;
            
          } catch (rawError) {
            console.log('[DegenPark Auth] Raw message bytes approach failed:', rawError.message);
            console.log('[DegenPark Auth] All signature approaches failed - authentication not possible');
          }
        }
      }
      
      throw error;
    }
  };

  // Function to fetch user profile using JWT token
  const fetchDegenParkProfile = async (publicKey) => {
    try {
      if (!degenParkTokens || !degenParkTokens.accessToken) {
        throw new Error('No valid authentication token');
      }

      console.log('[DegenPark Profile] Fetching profile for:', publicKey);
      const response = await fetch(`${DEGENPARK_API_BASE}/api/v1/users/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${degenParkTokens.accessToken}`,
          'Accept': 'application/json',
          'x-network': 'solana'  // REQUIRED: Matching the working DegenPark website format
        }
      });

      const data = await response.json();
      console.log('[DegenPark Profile] Response status:', response.status);

      if (response.ok && data.data) {
        console.log('[DegenPark Profile] Profile fetched successfully');
        return {
          username: data.data.username || null,
          avatar: data.data.avatar || data.data.profilePicture || null,
          isDegenPark: true,
          ...data.data
        };
      } else if (response.status === 404) {
        console.log('[DegenPark Profile] User not found');
        return null;
      } else {
        throw new Error('Profile fetch failed: ' + (data.message || response.statusText));
      }
    } catch (error) {
      console.error('[DegenPark Profile Error]', error.message);
      return null;
    }
  };

  // Display user info with DegenPark integration
  const updateUserDisplay = () => {
    console.log('[UpdateUserDisplay] Wallet:', window.walletAddress, 'Username:', username);
    console.log('[UpdateUserDisplay] $walletAddress element found:', $walletAddress.length);
    console.log('[UpdateUserDisplay] $usernameDisplay element found:', $usernameDisplay.length);
    
    if (window.walletAddress) {
      const shortWallet = window.walletAddress.substring(0, 8) + '...' + window.walletAddress.substring(window.walletAddress.length - 8);
      console.log('[UpdateUserDisplay] Setting wallet display to:', shortWallet);
      
      if ($walletAddress.length > 0) {
        $walletAddress.text(shortWallet);
        console.log('[UpdateUserDisplay] Wallet address set successfully');
      } else {
        console.error('[UpdateUserDisplay] .walletAddress element not found in DOM');
      }
    } else {
      console.log('[UpdateUserDisplay] No wallet address found');
    }
    
    if (username) {
      // Add DegenPark badge if user is from DegenPark
      if (window.degenParkProfile) {
        $usernameDisplay.html(`(${username}) <span class="degenpark-badge" title="DegenPark Verified">DP</span>`);
      } else {
        $usernameDisplay.text(`(${username})`);
      }
      console.log('[UpdateUserDisplay] Username display updated:', username);
    } else {
      console.log('[UpdateUserDisplay] No username found');
    }
  };

  // Disconnect functionality
  const disconnectWallet = async () => {
    try {
      if (window.solana && window.walletConnected) {
        await window.solana.disconnect();
      }
      
      // Reset all state
      window.walletAddress = null;
      window.walletConnected = false;
      window.degenParkProfile = null;
      degenParkTokens = null;
      username = null;
      window.username = null;
      
      // Clear UI
      $walletAddress.text('');
      $usernameDisplay.text('');
      $usernameInput.val('');
      $currentInput = $usernameInput;
      
      // Reset pages
      $('.chat.page').hide();
      $('.username.page').hide();
      $('.wallet.page').show();
      
      // Reset button
      $('.connectWallet').text('Connect Wallet').prop('disabled', false);
      $('.usernameInput').prop('readonly', false);
      $('.setUsername').text('Set Username');
      
      console.log('[Wallet] Disconnected successfully');
      
      // Disconnect from chat
      if (socket) {
        socket.disconnect();
        socket.connect();
      }
      
    } catch (error) {
      console.error('[Wallet] Error disconnecting:', error);
    }
  };

  // Username button event handler
  $(document).on('click', '.setUsername', function() {
    setUsername();
  });

  // Username input Enter key handler
  $usernameInput.on('keypress', function(e) {
    if (e.which === 13) { // Enter key
      e.preventDefault();
      setUsername();
    }
  });

  // Wallet connection handlers
  $(document).on('click', '.connectWallet', function() {
    connectWallet();
  });

  // Disconnect wallet
  $(document).on('click', '.disconnectWallet', function() {
    disconnectWallet();
  });

  // Cancel reply button
  $cancelReply.on('click', () => {
    clearReply();
  });

  const addParticipantsMessage = (data) => {
    let message = '';
    if (data.numUsers === 1) {
      message = "Welcome! You're the only one here.";
    } else {
      message = `Welcome! There ${data.numUsers === 2 ? 'is' : 'are'} ${data.numUsers} participants.`;
    }
    
    addChatMessage({
      username: 'System',
      message: message,
      isAdmin: true
    });
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
    
    if (inputUsername && window.walletAddress) {
      console.log('[Username] Setting username:', inputUsername);
      
      // Store username
      username = inputUsername;
      window.username = username;
      
      // Prepare user data with DegenPark integration
      const userData = {
        walletAddress: window.walletAddress,
        username: username,
        timestamp: Date.now()
      };

      // Add DegenPark profile data if available
      if (window.degenParkProfile) {
        userData.degenParkProfile = window.degenParkProfile;
        userData.isDegenPark = true;
        userData.avatar = window.degenParkProfile.avatar;
        console.log('[Username] Using DegenPark profile data');
      }

      // Add auth tokens if available
      if (degenParkTokens) {
        userData.degenParkTokens = degenParkTokens;
        console.log('[Username] Including DegenPark auth tokens');
      }

      // Emit to server with all user data
      socket.emit('add user', userData);

      // Update UI
      $('.username.page').hide();
      $('.chat.page').show();
      
      // Focus the message input
      $currentInput = $messageInput.focus();
      
      console.log('[Username] User setup complete');
    } else {
      alert('Please enter a valid username.');
    }
  };

  const showUsernamePage = () => {
    $walletPage.removeClass('active');
    $usernamePage.addClass('active');
    $currentInput = $usernameInput.focus();
    
    // Display connected wallet info
    const displayWallet = window.pendingAuth ? window.pendingAuth.walletAddress : walletAddress;
    if (displayWallet) {
      $connectedWallet.text(displayWallet.substring(0, 8) + '...' + displayWallet.substring(displayWallet.length - 8));
    }
    
    // Show DegenPark status if user came from DegenPark flow
    if (window.pendingAuth) {
      $('.degenpark-status').show();
    }
  };

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
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Different sounds for different notification types
      switch(type) {
        case 'mention':
          // Higher pitch for mentions
          oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3);
          break;
        case 'dm':
          // Special sound for direct messages
          oscillator.frequency.setValueAtTime(700, audioContext.currentTime);
          oscillator.frequency.setValueAtTime(500, audioContext.currentTime + 0.08);
          oscillator.frequency.setValueAtTime(650, audioContext.currentTime + 0.16);
          gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.4);
          break;
        case 'click':
          // Soft click sound
          oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.1);
          break;
        default:
          // Default message sound
          oscillator.frequency.setValueAtTime(520, audioContext.currentTime);
          gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.2);
      }
    } catch (error) {
      console.log('Sound notification failed:', error);
    }
  };

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

  // Update user count display
  const updateUserCount = (count) => {
    totalUsers = count;
    
    // Update user count in status bar
    const $userCount = $('.user-count-number');
    if ($userCount.length) {
      $userCount.text(count);
    } else {
      // Create user count if it doesn't exist
      const userCountHtml = `
        <div class="user-count">
          <span class="user-count-icon">👥</span>
          <span class="user-count-number">${count}</span>
        </div>
      `;
      $('.userControls').html(userCountHtml);
    }
    
    console.log('[UserCount] Updated to:', count);
  };

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
    // Don't interfere if any modal is open
    if ($('.admin-modal-overlay').length > 0 || $('#dm-search-modal').length > 0 || $('#dm-modal').length > 0) {
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
      } else if (window.walletAddress) {
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
    window.username = username;
    console.log('Existing user found:', username);
    
    // Hide all other pages and show chat
    $walletPage.removeClass('active');
    $usernamePage.removeClass('active');
    $chatPage.addClass('active');
    $currentInput = $inputMessage.focus();
    
    // Display user info with DegenPark integration
    updateUserDisplay();

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
    totalUsers = data.numUsers;
    
    // Store user info
    window.isAdmin = data.isAdmin;
    window.isDegenPark = data.isDegenPark;
    
    // Add current user to known users list
    knownUsers.set(username, {
      walletAddress: window.walletAddress,
      isAdmin: data.isAdmin,
      isDegenPark: data.isDegenPark,
      avatar: window.degenParkProfile?.avatar || null,
      lastSeen: Date.now(),
      isOnline: true
    });
    
    console.log('[Login] Successfully logged in. Admin:', data.isAdmin, 'DegenPark:', data.isDegenPark);
    
    // Update UI with user info
    updateUserDisplay();
    updateUserCount(totalUsers);
    
    // Update admin indicator if admin
    if (data.isAdmin) {
      $chatContainer.addClass('admin-chat');
      console.log('[Login] Admin privileges activated');
    }
    
    // Show DegenPark status if applicable
    if (data.isDegenPark && data.degenParkProfile) {
      console.log('[Login] DegenPark profile active:', data.degenParkProfile.username);
    }
    
    // Notify user of successful connection
    addParticipantsMessage(data);
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
    console.log(`User ${data.username} joined`);
    
    // Add to active sockets (online users)
    if (!window.activeSockets) window.activeSockets = {};
    window.activeSockets[data.username] = {
      walletAddress: data.walletAddress,
      isAdmin: data.isAdmin,
      isDegenPark: data.isDegenPark,
      avatar: data.avatar
    };
    
    // Also add to known users for offline messaging
    knownUsers.set(data.username, {
      walletAddress: data.walletAddress,
      isAdmin: data.isAdmin,
      isDegenPark: data.isDegenPark,
      avatar: data.avatar,
      lastSeen: Date.now(),
      isOnline: true
    });
    
    console.log('[UserTracker] Added online user:', data.username, '| Total known users:', knownUsers.size);
    
    totalUsers = data.numUsers;
    updateUserCount(totalUsers);
    
    addChatMessage({
      username: 'System',
      message: `${data.username} joined the chat`,
      isAdmin: true
    });
    
    playNotificationSound('join');
  });

  socket.on('user left', (data) => {
    console.log(`User ${data.username} left`);
    
    // Remove from active sockets (online users)
    if (window.activeSockets && window.activeSockets[data.username]) {
      delete window.activeSockets[data.username];
    }
    
    // Mark as offline in known users (don't remove completely)
    if (knownUsers.has(data.username)) {
      const userData = knownUsers.get(data.username);
      userData.isOnline = false;
      userData.lastSeen = Date.now();
      knownUsers.set(data.username, userData);
      console.log('[UserTracker] Marked offline:', data.username, '| Total known users:', knownUsers.size);
    }
    
    totalUsers = data.numUsers;
    updateUserCount(totalUsers);
    
    addChatMessage({
      username: 'System', 
      message: `${data.username} left the chat`,
      isAdmin: true
    });
    
    playNotificationSound('leave');
  });

  socket.on('typing', (data) => {
    addChatTyping(data);
  });

  socket.on('stop typing', (data) => {
    removeChatTyping(data);
  });

  // Direct message events
  socket.on('direct message', (data) => {
    console.log('Received DM:', data);
    
    const senderUsername = data.senderUsername;
    const message = data.message;
    const timestamp = data.timestamp;
    
    // Add to local conversation
    if (!directMessages.has(senderUsername)) {
      directMessages.set(senderUsername, []);
    }
    
    const dmData = {
      message: message,
      fromSelf: false,
      timestamp: timestamp,
      senderUsername: senderUsername,
      senderWallet: data.senderWallet
    };
    
    directMessages.get(senderUsername).push(dmData);
    
    // Update unread count if not currently viewing this conversation
    const currentDmModal = document.getElementById('dm-modal');
    const isViewingThisConversation = currentDmModal && 
      currentDmModal.querySelector('.dm-modal-header h3').textContent.includes(senderUsername);
    
    if (!isViewingThisConversation) {
      const currentUnread = unreadDMs.get(senderUsername) || 0;
      unreadDMs.set(senderUsername, currentUnread + 1);
      
      // Update DM count if menu is open
      if (menuOpen) {
        updateDMCount();
      }
      
      // Show notification
      showDMNotification(senderUsername, message);
    } else {
      // If viewing conversation, add message to UI
      const $dmMessages = $('#dm-messages');
      if ($dmMessages.length > 0) {
        const $msgDiv = $(`
          <div class="dm-message other">
            <span class="dm-timestamp">${new Date(timestamp).toLocaleTimeString()}</span>
            <span class="dm-content">${message}</span>
          </div>
        `);
        $dmMessages.append($msgDiv);
        $dmMessages.scrollTop($dmMessages[0].scrollHeight);
      }
    }
  });

  socket.on('dm notification', (data) => {
    console.log('DM notification for offline messages:', data);
    
    // Handle offline messages notification
    data.messages.forEach(msg => {
      const senderUsername = msg.senderUsername;
      
      if (!directMessages.has(senderUsername)) {
        directMessages.set(senderUsername, []);
      }
      
      directMessages.get(senderUsername).push({
        message: msg.message,
        fromSelf: false,
        timestamp: msg.timestamp,
        senderUsername: senderUsername,
        senderWallet: msg.senderWallet
      });
      
      // Update unread count
      const currentUnread = unreadDMs.get(senderUsername) || 0;
      unreadDMs.set(senderUsername, currentUnread + 1);
    });
    
    // Show notification for offline messages
    if (data.messages.length > 0) {
      showDMNotification('System', `You have ${data.messages.length} new direct message(s)`);
    }
  });

  // Show DM notification
  const showDMNotification = (sender, message) => {
    // Visual notification in chat
    if (sender !== 'System') {
      log(`💬 DM from ${sender}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);
    } else {
      log(message);
    }
    
    // Play notification sound
    playNotificationSound('dm');
    
    // Browser notification if supported and permitted
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`Direct Message from ${sender}`, {
        body: message.substring(0, 100),
        icon: '/favicon.ico'
      });
    }
  };

  // Request notification permission on load
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

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
  
  // Sound toggle moved to hamburger menu
  
  // Add to userControls in proper order: expand button, then user count and connection status
  $('.userControls').prepend($expandButton);

  // Hamburger menu elements
  const $hamburgerButton = $('.hamburger-button');
  const $menuDropdown = $('.menu-dropdown');
  const $menuSoundToggle = $('.menu-item.sound-toggle');
  const $disconnectMenuBtn = $('.disconnect-menu-btn');
  const $dmHeaderBtn = $('#direct-messages-header');
  const $dmCount = $('.dm-count');

  // Menu state
  let menuOpen = false;
  let directMessages = new Map(); // Store DM conversations
  let unreadDMs = new Map(); // Track unread DM counts per user
  let knownUsers = new Map(); // Track all users we've seen (online + offline)

  // Initialize hamburger menu functionality
  const initializeMenu = () => {
    // Toggle menu on hamburger click
    $hamburgerButton.on('click', (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    // Close menu when clicking outside
    $(document).on('click', (e) => {
      if (menuOpen && !$(e.target).closest('.hamburger-menu').length) {
        closeMenu();
      }
    });

    // Sound toggle functionality in menu
    $menuSoundToggle.on('click', () => {
      soundEnabled = !soundEnabled;
      updateSoundIndicator();
      playNotificationSound('click'); // Test sound
    });

    // Direct message search trigger
    $dmHeaderBtn.on('click', () => {
      closeMenu();
      openDMSearchModal();
    });

    // Disconnect from menu
    $disconnectMenuBtn.on('click', () => {
      closeMenu();
      disconnectWallet();
    });

    // Prevent menu from closing when clicking inside dropdown
    $menuDropdown.on('click', (e) => {
      e.stopPropagation();
    });
  };

  const toggleMenu = () => {
    if (menuOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  };

  const openMenu = () => {
    menuOpen = true;
    $hamburgerButton.addClass('active');
    $menuDropdown.addClass('visible');
    updateDMCount(); // Update DM count display
  };

  const closeMenu = () => {
    menuOpen = false;
    $hamburgerButton.removeClass('active');
    $menuDropdown.removeClass('visible');
  };

  const updateSoundIndicator = () => {
    const $soundIcon = $('.sound-toggle .menu-item-icon');
    const $soundStatus = $('.sound-status');
    const $soundIndicator = $('.sound-indicator');
    
    if (soundEnabled) {
      $soundIcon.text('🔊');
      $soundStatus.text('On');
      $soundIndicator.removeClass('muted');
    } else {
      $soundIcon.text('🔇');
      $soundStatus.text('Off');
      $soundIndicator.addClass('muted');
    }
  };

  // Update DM count display
  const updateDMCount = () => {
    const totalUnread = Array.from(unreadDMs.values()).reduce((sum, count) => sum + count, 0);
    if (totalUnread > 0) {
      $dmCount.text(totalUnread).removeClass('hidden');
    } else {
      $dmCount.addClass('hidden');
    }
  };

  // Direct Message functionality  
  const openDMSearchModal = () => {
    const modalHtml = `
      <div class="dm-search-modal-overlay" id="dm-search-modal">
        <div class="dm-search-modal">
          <div class="dm-search-modal-header">
            <h3>Send Direct Message</h3>
            <button class="dm-search-modal-close">×</button>
          </div>
          <div class="dm-search-modal-content">
            <input type="text" id="dm-search-input" placeholder="Type username to find..." />
            <div class="dm-search-results" id="dm-search-results">
              <div class="dm-search-hint">Type to search for users</div>
            </div>
          </div>
        </div>
      </div>
    `;
    $('body').append(modalHtml);

    // IMPORTANT: Prevent all events from bubbling to main chat
    const $searchInput = $('#dm-search-input');
    const $searchModal = $('#dm-search-modal');
    
    // Block ALL keyboard events from reaching main chat
    $searchInput.on('keydown keyup keypress input', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    
    // Block click events on modal from bubbling
    $searchModal.on('click', function(e) {
      e.stopPropagation();
    });

    // Handle search input specifically
    $searchInput.on('input', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      
      const query = $(this).val().toLowerCase().trim();
      const $results = $('#dm-search-results');
      $results.empty();

      if (query.length === 0) {
        $results.append('<div class="dm-search-hint">Type to search for users</div>');
        return;
      }

      let found = false;
      const usersToShow = new Map();
      
      // First, add all online users
      if (window.activeSockets) {
        Object.entries(window.activeSockets).forEach(([userName, userData]) => {
          // Skip current user
          if (userName === window.username) return;
          
          if (userName.toLowerCase().includes(query)) {
            usersToShow.set(userName, {
              ...userData,
              isOnline: true,
              status: 'online'
            });
          }
        });
      }
      
      // Then, add offline users from known users
      knownUsers.forEach((userData, userName) => {
        // Skip current user and users already added (online users)
        if (userName === window.username || usersToShow.has(userName)) return;
        
        if (userName.toLowerCase().includes(query)) {
          usersToShow.set(userName, {
            ...userData,
            isOnline: false,
            status: 'offline'
          });
        }
      });
      
      // Display all matching users
      usersToShow.forEach((userData, userName) => {
        found = true;
        const isDegenPark = userData.isDegenPark || false;
        const avatar = userData.avatar || null;
        const isOnline = userData.isOnline;
        
        let avatarHtml;
        if (avatar) {
          avatarHtml = `<img src="${avatar}" alt="${userName}" class="dm-search-avatar" />`;
        } else {
          avatarHtml = `<div class="dm-search-avatar-text">${userName.charAt(0).toUpperCase()}</div>`;
        }
        
        // Add status indicator
        const statusIcon = isOnline ? '🟢' : '⚫';
        const statusText = isOnline ? 'Online' : 'Offline';
        const offlineNote = isOnline ? '' : ' <span style="color:#9ca3af;font-size:0.7rem;">(messages will be delivered when online)</span>';
        
        const $item = $(`
          <div class="dm-search-item ${isOnline ? 'online' : 'offline'}" data-username="${userName}" data-wallet="${userData.walletAddress}">
            <div class="dm-search-avatar-container">${avatarHtml}</div>
            <div class="dm-search-user-info">
              <div class="dm-search-username">
                ${statusIcon} ${userName}${userData.isAdmin ? ' ★' : ''}
                ${isDegenPark ? ' <span style="color:#8b5cf6;font-size:0.7rem;">DP</span>' : ''}
              </div>
              <div class="dm-search-wallet">${userData.walletAddress.substring(0, 8)}... • ${statusText}${offlineNote}</div>
            </div>
          </div>
        `);
        
        $item.on('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          $('#dm-search-modal').remove();
          openDirectMessage(userName, userData.walletAddress, isOnline);
        });
        
        $results.append($item);
      });
      
      // Show "no users found" if nothing matches
      if (!found) {
        $results.append('<div class="dm-search-hint">No users found</div>');
      }
    });

    // Close modal handlers with proper cleanup
    const closeDMSearchModal = () => {
      $('#dm-search-modal').remove();
      // Return focus to main chat input if connected
      if (connected && $messageInput.length) {
        setTimeout(() => {
          $messageInput.focus();
        }, 100);
      }
    };
    
    $('.dm-search-modal-close').on('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeDMSearchModal();
    });
    
    $('.dm-search-modal-overlay').on('click', function(e) {
      if (e.target === this) {
        e.preventDefault();
        e.stopPropagation();
        closeDMSearchModal();
      }
    });
    
    // Handle Escape key to close modal
    $searchModal.on('keydown', function(e) {
      if (e.which === 27) { // Escape key
        e.preventDefault();
        e.stopPropagation();
        closeDMSearchModal();
      }
    });

    // Focus the search input and prevent main chat from receiving focus
    setTimeout(() => {
      $searchInput.focus();
      $searchInput[0].select();
    }, 100);
  };

  // Open direct message conversation
  const openDirectMessage = (targetUsername, targetWallet, isOnline) => {
    console.log(`Opening DM with ${targetUsername} (${targetWallet})`);
    
    // Mark messages as read
    unreadDMs.delete(targetUsername);
    updateDMCount();
    
    const conversation = directMessages.get(targetUsername) || [];
    console.log('DM Conversation:', conversation);
    
    showDirectMessageModal(targetUsername, targetWallet, isOnline);
  };

  // Show the direct message modal
  const showDirectMessageModal = (targetUsername, targetWallet, isOnline) => {
    // Remove any existing DM modal
    $('#dm-modal').remove();
    
    const modalHtml = `
      <div class="dm-modal-overlay" id="dm-modal">
        <div class="dm-modal">
          <div class="dm-modal-header">
            <h3>${isOnline ? '🟢' : '⚫'} Direct Message - ${targetUsername} <span style="font-size:0.8rem;color:#9ca3af;">(${isOnline ? 'Online' : 'Offline'})</span></h3>
            <button class="dm-modal-close">×</button>
          </div>
          ${!isOnline ? '<div class="dm-offline-notice">📬 This user is offline. Your messages will be delivered when they come online.</div>' : ''}
          <div class="dm-modal-messages" id="dm-messages">
            <!-- Messages will go here -->
          </div>
          <div class="dm-modal-input">
            <input type="text" placeholder="${isOnline ? 'Type a direct message...' : 'Type a message (will be delivered when online)...'}" id="dm-input" />
            <button id="dm-send">Send</button>
          </div>
        </div>
      </div>
    `;
    
    $('body').append(modalHtml);
    
    // IMPORTANT: Block events from reaching main chat
    const $dmModal = $('#dm-modal');
    const $dmInput = $('#dm-input');
    
    // Block ALL keyboard and click events from bubbling
    $dmModal.on('click keydown keyup keypress input', function(e) {
      e.stopPropagation();
    });
    
    $dmInput.on('keydown keyup keypress input', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    
    // Load existing messages
    const conversation = directMessages.get(targetUsername) || [];
    const $dmMessages = $('#dm-messages');
    
    conversation.forEach(msg => {
      const $msgDiv = $(`
        <div class="dm-message ${msg.fromSelf ? 'self' : 'other'}">
          <span class="dm-timestamp">${new Date(msg.timestamp).toLocaleTimeString()}</span>
          <span class="dm-content">${msg.message}</span>
        </div>
      `);
      $dmMessages.append($msgDiv);
    });
    
    // Scroll to bottom
    $dmMessages.scrollTop($dmMessages[0].scrollHeight);
    
    // Handle sending messages - FIXED: Prevent event bubbling
    const sendDMMessageHandler = () => {
      const message = $('#dm-input').val().trim();
      if (message) {
        console.log('[DM] Sending message:', message, 'to:', targetUsername);
        sendDirectMessage(targetUsername, targetWallet, message);
        $('#dm-input').val('');
      }
    };
    
    $('#dm-send').on('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      sendDMMessageHandler();
    });
    
    $('#dm-input').on('keypress', function(e) {
      e.stopPropagation(); // Prevent main chat input from receiving this
      e.stopImmediatePropagation();
      console.log('[DM] Keypress detected:', e.which);
      if (e.which === 13) { // Enter key
        e.preventDefault();
        console.log('[DM] Enter key pressed, sending message');
        sendDMMessageHandler();
      }
    });

    // Prevent any input events from bubbling to main chat
    $('#dm-input').on('keydown keyup input', function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
    });
    
    // Close modal handlers with cleanup
    const closeDMModal = () => {
      $('#dm-modal').remove();
      // Return focus to main chat if connected
      if (connected && $messageInput.length) {
        setTimeout(() => {
          $messageInput.focus();
        }, 100);
      }
    };
    
    $('.dm-modal-close').on('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      closeDMModal();
    });
    
    $('.dm-modal-overlay').on('click', function(e) {
      if (e.target === this) {
        e.preventDefault();
        e.stopPropagation();
        closeDMModal();
      }
    });
    
    // Handle Escape key to close modal
    $dmModal.on('keydown', function(e) {
      if (e.which === 27) { // Escape key
        e.preventDefault();
        e.stopPropagation();
        closeDMModal();
      }
    });
    
    // Focus input
    setTimeout(() => {
      $dmInput.focus();
    }, 100);
  };

  // Send direct message
  const sendDirectMessage = (targetUsername, targetWallet, message) => {
    console.log(`[DM] Sending DM to ${targetUsername}: ${message}`);
    
    // Check if user is online or offline
    const isOnline = window.activeSockets && window.activeSockets[targetUsername];
    console.log(`[DM] Target user ${targetUsername} is ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
    
    // Add to local conversation
    if (!directMessages.has(targetUsername)) {
      directMessages.set(targetUsername, []);
    }
    
    const dmData = {
      message: message,
      fromSelf: true,
      timestamp: Date.now(),
      targetUsername: targetUsername,
      targetWallet: targetWallet
    };
    
    directMessages.get(targetUsername).push(dmData);
    
    // Add to UI
    const $dmMessages = $('#dm-messages');
    const $msgDiv = $(`
      <div class="dm-message self">
        <span class="dm-timestamp">${new Date().toLocaleTimeString()}</span>
        <span class="dm-content">${message}</span>
        ${!isOnline ? '<span class="dm-offline-indicator">📬 Will deliver when online</span>' : ''}
      </div>
    `);
    $dmMessages.append($msgDiv);
    $dmMessages.scrollTop($dmMessages[0].scrollHeight);
    
    // Emit to server
    socket.emit('direct message', {
      targetUsername: targetUsername,
      targetWallet: targetWallet,
      message: message,
      timestamp: Date.now()
    });
  };

  // Initialize menu when page loads
  initializeMenu();

});

// Initialize when page loads
$(document).ready(function() {
  console.log('[Init] Chat widget loaded');
  console.log('[Init] jQuery version:', $.fn.jquery);
  console.log('[Init] bs58 library available:', !!window.bs58);
  console.log('[Init] nacl library available:', !!window.nacl);
  console.log('[Init] Solana wallet API available:', !!window.solana);
  console.log('[Init] Socket.IO available:', !!window.io);
  
  // Fallback library loading if initial CDN failed
  if (!window.bs58) {
    console.log('[Init] Attempting to load bs58 from alternative CDN...');
    const script = document.createElement('script');
    script.src = 'https://cdn.skypack.dev/bs58@5.0.0';
    script.onload = () => {
      console.log('[Init] bs58 loaded from alternative CDN');
      if (window.bs58) {
        const testArray = new Uint8Array([1, 2, 3, 4, 5]);
        const testResult = window.bs58.encode(testArray);
        console.log('[Init] bs58 alternative test successful:', testResult);
      }
    };
    script.onerror = () => {
      console.warn('[Init] Failed to load bs58 from alternative CDN');
    };
    document.head.appendChild(script);
  }
  
  // Test bs58 if available
  if (window.bs58) {
    try {
      const testArray = new Uint8Array([1, 2, 3, 4, 5]);
      const testResult = window.bs58.encode(testArray);
      console.log('[Init] bs58 test successful:', testResult);
    } catch (error) {
      console.error('[Init] bs58 test failed:', error);
    }
  }
  
  // Test nacl if available
  if (window.nacl) {
    try {
      console.log('[Init] nacl.sign available:', !!window.nacl.sign);
      console.log('[Init] nacl.sign.detached available:', !!window.nacl.sign.detached);
    } catch (error) {
      console.error('[Init] nacl test failed:', error);
    }
  }
  
  // Initialize menu functionality inline to avoid scope issues
  if (typeof initializeMenu === 'function') {
    initializeMenu();
  } else {
    console.warn('[Init] initializeMenu function not available - skipping menu initialization');
  }
});
