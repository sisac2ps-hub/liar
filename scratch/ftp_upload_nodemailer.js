const ftp = require("basic-ftp");
const path = require("path");
const fs = require("fs");

async function run() {
    const client = new ftp.Client();
    client.ftp.verbose = true;
    try {
        console.log("Connecting to FTP...");
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21
        });
        
        console.log("Connected.");
        await client.cd("/nodejs");
        
        const localPath = path.join(__dirname, "..", "node_modules", "nodemailer");
        if (!fs.existsSync(localPath)) {
            throw new Error(`Local nodemailer directory not found at: ${localPath}`);
        }
        
        console.log("Uploading node_modules/nodemailer recursively...");
        await client.cd("/nodejs");
        await client.uploadFromDir(localPath, "node_modules/nodemailer");
        
        console.log("Nodemailer uploaded successfully!");
    } catch (e) {
        console.error(e);
    } finally {
        client.close();
    }
}

run();
