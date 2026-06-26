const fs = require('fs');
const readline = require('readline');
const path = 'C:\\Users\\sisac\\.gemini\\antigravity\\brain\\ab94c7df-cf8c-4452-ac66-70995f2a0c63\\.system_generated\\logs\\transcript.jsonl';

const fileStream = fs.createReadStream(path);
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT') {
      console.log(`[USER] ${data.content}`);
    }
  } catch (e) {
    // ignore
  }
});
