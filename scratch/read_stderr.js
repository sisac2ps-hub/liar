const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

async function check() {
    const client = new ftp.Client();
    try {
        await client.access({
            host: "145.79.30.137",
            user: "u429894651.partygamehub.cc",
            password: "Blan1004!",
            port: 21
        });
        
        console.log("Downloading stderr.log...");
        const localStderr = path.join(__dirname, "remote_stderr.log");
        await client.downloadTo(localStderr, "/nodejs/stderr.log");
        
        console.log("Downloading console.log...");
        const localConsole = path.join(__dirname, "remote_console.log");
        let hasConsole = false;
        try {
            await client.downloadTo(localConsole, "/nodejs/console.log");
            hasConsole = true;
        } catch (e) {
            console.log("No console.log found or failed to download.");
        }
        
        console.log("--- Content of stderr.log (last 150 lines) ---");
        const stderrContent = fs.readFileSync(localStderr, "utf8");
        console.log(stderrContent.split("\n").slice(-150).join("\n"));

        if (hasConsole) {
            console.log("\n--- Content of console.log (last 150 lines) ---");
            const consoleContent = fs.readFileSync(localConsole, "utf8");
            console.log(consoleContent.split("\n").slice(-150).join("\n"));
        }
    } catch (e) {
        console.error(e);
    } finally {
        client.close();
    }
}

check();
