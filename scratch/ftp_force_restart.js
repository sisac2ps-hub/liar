const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

async function run() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Connecting to FTP...");
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21,
            secure: false
        });
        
        console.log("Connected.");

        // Create local dummy restart.txt
        const localPath = path.join(__dirname, "..", "public", "restart.txt");
        fs.writeFileSync(localPath, "restart " + Date.now());

        // 1. Upload restart.txt inside /nodejs/tmp/
        console.log("Uploading restart.txt to /nodejs/tmp...");
        await client.cd("/");
        await client.cd("nodejs");
        await client.ensureDir("tmp");
        await client.uploadFrom(localPath, "restart.txt");
        console.log("Uploaded to /nodejs/tmp/restart.txt");

        console.log("=========================================");
        console.log(" Force restart signal sent successfully! ");
        console.log("=========================================");
    } catch (err) {
        console.error("Failed to send restart signal:", err);
    } finally {
        client.close();
    }
}

run();
