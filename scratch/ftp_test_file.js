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
            user: "u429894651.darkorchid-anteater-429550.hostingersite.com",
            password: "Blan1004!",
            port: 21,
            secure: false
        });
        
        console.log("Connected.");
        const list = await client.list();
        if (list.some(f => f.name === "public_html")) {
            await client.cd("public_html");
        }
        await client.cd("public");
        
        // Create local test.txt if it doesn't exist
        const localPath = path.join(__dirname, "..", "public", "test.txt");
        fs.writeFileSync(localPath, "test hello from ftp upload");
        
        console.log("Uploading test.txt...");
        await client.uploadFrom(localPath, "test.txt");
        console.log("Uploaded successfully.");
        
    } catch (err) {
        console.error(err);
    } finally {
        client.close();
    }
}

run();
