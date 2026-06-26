const ftp = require("basic-ftp");
const path = require("path");

async function upload() {
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
        await client.cd(".builds/last-source");
        
        console.log("Uploading modified index.js...");
        await client.uploadFrom(path.join(__dirname, "..", "index.js"), "index.js");
        console.log("Uploaded successfully.");
        
    } catch (err) {
        console.error(err);
    } finally {
        client.close();
    }
}

upload();
