const ftp = require("basic-ftp");
const path = require("path");

async function run() {
    const client = new ftp.Client();
    try {
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21
        });
        
        console.log("Uploading backend files to /nodejs...");
        await client.cd("/nodejs");
        
        // Upload index.js and package.json
        await client.uploadFrom("index.js", "index.js");
        await client.uploadFrom("package.json", "package.json");
        
        // Ensure server directory exists and upload data
        await client.ensureDir("server");
        await client.ensureDir("data");
        
        // Upload config.json and words.json if they exist locally
        const fs = require('fs');
        if (fs.existsSync(path.join(__dirname, "..", "server", "data", "words.json"))) {
            await client.uploadFrom(path.join(__dirname, "..", "server", "data", "words.json"), "words.json");
        }
        if (fs.existsSync(path.join(__dirname, "..", "server", "data", "config.json"))) {
            await client.uploadFrom(path.join(__dirname, "..", "server", "data", "config.json"), "config.json");
        }
        
        console.log("Backend files uploaded successfully.");
    } catch(e) {
        console.error(e);
    } finally {
        client.close();
    }
}

run();
