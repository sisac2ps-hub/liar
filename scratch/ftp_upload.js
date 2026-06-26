const ftp = require("basic-ftp");
const path = require("path");
const fs = require("fs");

async function uploadToDir(client, targetDir, localPublicDir) {
    console.log(`\n--- Deploying to remote directory: ${targetDir} ---`);
    
    // Go to absolute root of FTP first
    await client.cd("/");
    
    // Ensure dir structure exists and enter it
    const parts = targetDir.split("/").filter(p => p.length > 0);
    for (const part of parts) {
        await client.ensureDir(part);
    }
    
    // Upload main public files
    console.log("Uploading main public files (index.html, favicon, icons, ads.txt, robots.txt, sitemap.xml)...");
    await client.uploadFrom(path.join(localPublicDir, "index.html"), "index.html");
    await client.uploadFrom(path.join(localPublicDir, "favicon.svg"), "favicon.svg");
    await client.uploadFrom(path.join(localPublicDir, "icons.svg"), "icons.svg");
    if (fs.existsSync(path.join(localPublicDir, "ads.txt"))) {
        await client.uploadFrom(path.join(localPublicDir, "ads.txt"), "ads.txt");
    }
    if (fs.existsSync(path.join(localPublicDir, "robots.txt"))) {
        await client.uploadFrom(path.join(localPublicDir, "robots.txt"), "robots.txt");
    }
    if (fs.existsSync(path.join(localPublicDir, "sitemap.xml"))) {
        await client.uploadFrom(path.join(localPublicDir, "sitemap.xml"), "sitemap.xml");
    }

    // Ensure assets dir exists
    await client.ensureDir("assets");
    
    // Clean old assets
    console.log("Cleaning old assets on remote...");
    await client.clearWorkingDir();

    // Upload new assets
    const localAssetsDir = path.join(localPublicDir, "assets");
    const files = fs.readdirSync(localAssetsDir);
    for (const file of files) {
        const localPath = path.join(localAssetsDir, file);
        console.log(`Uploading asset: ${file}...`);
        await client.uploadFrom(localPath, file);
    }
}

async function upload() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Connecting to Hostinger FTP...");
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21,
            secure: false
        });
        
        console.log("FTP Connected successfully.");
        const localPublicDir = path.join(__dirname, "..", "public");

        // 1. Deploy to `/nodejs/public` (The ACTUAL Node.js web root)
        await uploadToDir(client, "/nodejs/public", localPublicDir);

        console.log("\n=========================================");
        console.log(" FTP Double Deployment Successful! ");
        console.log("=========================================");
    } catch (err) {
        console.error("FTP Deployment Failed:", err);
    } finally {
        client.close();
    }
}

upload();
