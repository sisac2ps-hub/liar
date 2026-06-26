const ftp = require("basic-ftp");

async function cleanup() {
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
        console.log("Removing nested /nodejs/node_modules/node_modules directory...");
        await client.removeDir("/nodejs/node_modules/node_modules");
        console.log("Cleanup completed successfully!");
    } catch (e) {
        console.error("Cleanup failed or folder already removed:", e);
    } finally {
        client.close();
    }
}

cleanup();
