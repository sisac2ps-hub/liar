const fs = require('fs');
const readline = require('readline');
const path = 'C:\\Users\\sisac\\.gemini\\antigravity\\brain\\ab94c7df-cf8c-4452-ac66-70995f2a0c63\\.system_generated\\logs\\transcript.jsonl';

async function processLineByLine() {
  const fileStream = fs.createReadStream(path);

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('"type":"USER_INPUT"')) {
      try {
        const obj = JSON.parse(line);
        console.log(`[Step ${obj.step_index}] ${obj.content}`);
      } catch (e) {}
    }
  }
}

processLineByLine();
