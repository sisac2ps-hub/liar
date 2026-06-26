const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Port to run test server on
const TEST_PORT = 4040;
const BASE_URL = `http://localhost:${TEST_PORT}`;

// Helper to make POST requests
function postJSON(urlPath, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request(
      {
        hostname: 'localhost',
        port: TEST_PORT,
        path: urlPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => body += chunk);
        res.on('end', () => {
          try {
            resolve({
              statusCode: res.statusCode,
              data: body ? JSON.parse(body) : null
            });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Helper to make GET requests
function getJSON(urlPath) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE_URL}${urlPath}`, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch (e) {
          resolve({ statusCode: res.statusCode, raw: body });
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log('--- Starting Local Server Integration Tests ---');
  
  // Start server
  const serverProc = spawn('node', ['index.js'], {
    env: { ...process.env, PORT: TEST_PORT },
    stdio: 'pipe'
  });

  // Handle server output
  serverProc.stdout.on('data', (data) => {
    console.log(`[Server stdout] ${data.toString().trim()}`);
  });
  serverProc.stderr.on('data', (data) => {
    console.error(`[Server stderr] ${data.toString().trim()}`);
  });

  // Wait for server to boot up
  await new Promise((r) => setTimeout(r, 2000));

  let testsPassed = 0;
  let testsFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ SUCCESS: ${message}`);
      testsPassed++;
    } else {
      console.error(`❌ FAILURE: ${message}`);
      testsFailed++;
    }
  }

  try {
    // 1. Verify index.html is served
    const rootRes = await getJSON('/');
    assert(rootRes.statusCode === 200, 'Root path is accessible (status 200)');
    
    // 2. Verify debug-path endpoint
    const debugRes = await getJSON('/api/debug-path');
    assert(debugRes.statusCode === 200, 'Debug path API works');
    assert(debugRes.data.cwd !== undefined, 'Debug API returns cwd');

    // 3. Test Admin Login with correct password
    const loginRes = await postJSON('/api/admin/login', { password: 'admin' });
    assert(loginRes.statusCode === 200, 'Admin login succeeds with correct password');
    assert(loginRes.data.success === true, 'Admin login returns success status');
    assert(loginRes.data.token === 'secret_admin_token', 'Admin login returns correct token');

    // 4. Test Admin Login with incorrect password
    const loginFailRes = await postJSON('/api/admin/login', { password: 'wrongpassword' });
    assert(loginFailRes.statusCode === 401, 'Admin login fails with wrong password');
    assert(loginFailRes.data.success === false, 'Wrong password login returns success=false');

    // 5. Submit a Feedback entry
    const mockFeedback = {
      nickname: '테스트유저',
      content: '기능 점검 자동 테스트 피드백 항목입니다.'
    };
    const feedbackPostRes = await postJSON('/api/feedback', mockFeedback);
    assert(feedbackPostRes.statusCode === 200, 'Feedback submission works');
    assert(feedbackPostRes.data.success === true, 'Feedback submission returns success=true');

    // 6. View feedback list using admin token
    const viewFeedbackRes = await postJSON('/api/admin/feedback', { token: 'secret_admin_token' });
    assert(viewFeedbackRes.statusCode === 200, 'Admin view feedback list succeeds');
    assert(Array.isArray(viewFeedbackRes.data.feedback), 'Feedback list is an array');
    
    const createdItem = viewFeedbackRes.data.feedback.find(item => item.nickname === '테스트유저' && item.content === mockFeedback.content);
    assert(createdItem !== undefined, 'Mock feedback item was successfully stored and retrieved');

    // 7. Delete feedback item using admin token
    if (createdItem) {
      const deleteRes = await postJSON('/api/admin/feedback/delete', {
        id: createdItem.id,
        token: 'secret_admin_token'
      });
      assert(deleteRes.statusCode === 200, 'Feedback deletion works');
      assert(deleteRes.data.success === true, 'Feedback deletion returns success=true');

      // Verify it was actually deleted
      const reViewFeedbackRes = await postJSON('/api/admin/feedback', { token: 'secret_admin_token' });
      const foundAgain = reViewFeedbackRes.data.feedback.find(item => item.id === createdItem.id);
      assert(foundAgain === undefined, 'Feedback item was successfully removed from JSON file');
    }

  } catch (err) {
    console.error('Test run failed with error:', err);
    testsFailed++;
  } finally {
    // Kill local server
    console.log('Shutting down local test server...');
    serverProc.kill();
    
    console.log('\n--- Test Execution Summary ---');
    console.log(`Passed: ${testsPassed}`);
    console.log(`Failed: ${testsFailed}`);

    if (testsFailed > 0) {
      process.exit(1);
    } else {
      console.log('🎉 All backend API verification tests passed successfully!');
      process.exit(0);
    }
  }
}

runTests();
