const ftp = require("basic-ftp");

async function run() {
    const client = new ftp.Client();
    try {
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21
        });
        
        console.log("Listing /nodejs...");
        const list = await client.list("/nodejs");
        list.forEach(f => console.log(f.name, f.type));
        
        console.log("Downloading /public_html/.builds/config/preload-timestamp.js...");
        const fs = require("fs");
        const path = require("path");
        const localPath = path.join(__dirname, "temp_preload.txt");
        await client.downloadTo(localPath, "/public_html/.builds/config/preload-timestamp.js");
        console.log("--- Content of preload-timestamp.js ---");
        console.log(fs.readFileSync(localPath, "utf8"));
    } catch(e) {
        console.error(e);
    } finally {
        client.close();
    }
}

run();
