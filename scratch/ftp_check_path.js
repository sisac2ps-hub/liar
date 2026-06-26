const ftp = require("basic-ftp");
const fs = require("fs");

async function checkFile(client, pathStr) {
  try {
    const list = await client.list(pathStr);
    for (const item of list) {
      if (item.name === 'index.html') {
        console.log(`Found index.html in ${pathStr}`);
        const stream = fs.createWriteStream("scratch/temp_index.html");
        await client.downloadTo(stream, pathStr + "/index.html");
        const content = fs.readFileSync("scratch/temp_index.html", "utf8");
        const match = content.match(/<script type="module" crossorigin src="\/assets\/index-([^"]+)\.js"><\/script>/);
        const cssMatch = content.match(/<link rel="stylesheet" crossorigin href="\/assets\/index-([^"]+)\.css">/);
        console.log("JS Hash:", match ? match[1] : "NONE");
        console.log("CSS Hash:", cssMatch ? cssMatch[1] : "NONE");
        console.log("---");
      }
    }
  } catch(e) {}
}

async function run() {
    const client = new ftp.Client();
    try {
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.darkorchid-anteater-429550.hostingersite.com",
            password: "Blan1004!",
            port: 21
        });
        
        await checkFile(client, "/");
        await checkFile(client, "/public");
        await checkFile(client, "/public_html");
        await checkFile(client, "/public_html/public");
        await checkFile(client, "/.builds/last-source/public");

    } finally {
        client.close();
    }
}

run();
